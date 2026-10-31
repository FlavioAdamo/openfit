'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { HISTORY_FIELDS } = require('./health-cache.cjs')

// Translates the Fitbit part of an extracted Google Takeout export into daily
// history summaries. Two layouts are in circulation and an export may carry
// both: the older Fitbit one (`Global Export Data/*.json` plus per-type CSV
// folders) and the Google Health one (`*_GoogleData/*.csv` with ISO
// timestamps and a `data source` column). Files are classified by name before
// they are read, so intraday heart rate and other large families are never
// loaded.

const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_FILES = 200_000
// Raw sensor and classifier output, not health data, and most of an export's bytes.
const NEVER_READ = /usersensorcompressiontoken|useractivityprobabilities|__macosx/i

// When both layouts report the same field for the same day, the Google Health
// CSV wins: its timestamps are explicit UTC instants.
const LEGACY = 1
const GOOGLE = 2

const POUNDS_TO_KG = 0.45359237
const FLUID_OUNCE_ML = 29.5735

const dateFormatters = new Map()

function systemTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function zonedDate(instant, timeZone) {
  if (!dateFormatters.has(timeZone)) {
    dateFormatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }))
  }
  return dateFormatters.get(timeZone).format(instant)
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

// `06/10/26 16:39:00` or `06/10/26`: the legacy JSON stamp, month first, two-digit year.
function usStamp(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/.exec(String(value ?? '').trim())
  if (!match) return null
  const [, month, day, year, hour = '00', minute = '00', second = '00'] = match
  return { date: `20${year}-${month}-${day}`, iso: `20${year}-${month}-${day}T${hour}:${minute}:${second}Z` }
}

// The calendar day a daily aggregate is for. Fitbit stamps these at midnight
// UTC as a label, so the date is read as written and never shifted.
function labelDate(value) {
  const text = String(value ?? '').trim()
  const legacy = usStamp(text)
  const date = legacy ? legacy.date : text.slice(0, 10)
  return validDate(date) ? date : null
}

// The local day of a measured instant: an intraday sample, a weigh-in, a wake
// time. Offset-less ISO values are local wall time already; legacy JSON stamps are UTC.
function instantDate(value, timeZone) {
  const text = String(value ?? '').trim()
  const legacy = usStamp(text)
  if (!legacy && !/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) return labelDate(text)
  const instant = new Date(legacy ? legacy.iso : text)
  return Number.isNaN(instant.getTime()) ? null : zonedDate(instant, timeZone)
}

function numberOrNull(value) {
  if (value === null || value === undefined) return null
  const text = typeof value === 'string' ? value.trim() : value
  if (text === '' || (typeof text === 'string' && text.toLowerCase() === 'nan')) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function positiveOrNull(value) {
  const parsed = numberOrNull(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

function round(value, digits = 0) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function splitCsvLine(line) {
  const cells = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        current += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells.map((cell) => cell.trim())
}

// Rows keyed by lower-case header. Header-only files and the literal
// `no data` placeholder yield no rows.
function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const header = splitCsvLine(lines[0]).map((name) => name.toLowerCase())
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? '']))
  })
}

function parseJsonArray(text) {
  const value = JSON.parse(text.replace(/^﻿/, ''))
  return Array.isArray(value) ? value : []
}

function column(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== '') return row[name]
  }
  return undefined
}

function sourceOf(row) {
  return String(row['data source'] ?? row.data_source ?? '').trim()
}

function createAccumulator(timeZone) {
  // date -> field -> { value, priority }
  const values = new Map()
  // `${field}|${date}|${priority}` -> Map(source -> total)
  const sums = new Map()
  const legacySleep = []
  const legacySleepScores = []
  const googleSleep = []
  const googleSleepScores = new Map()

  function set(date, field, value, priority) {
    if (!validDate(date) || value === null || !Number.isFinite(value)) return
    const day = values.get(date) || new Map()
    const current = day.get(field)
    if (!current || current.priority <= priority) day.set(field, { value, priority })
    values.set(date, day)
  }

  // Additive values are summed per source; the day keeps the busiest source so
  // a phone and a watch counting the same steps are not added together.
  function add(date, field, value, priority, source = '') {
    if (!validDate(date) || value === null || !Number.isFinite(value)) return
    const key = `${field}|${date}|${priority}`
    const bySource = sums.get(key) || new Map()
    bySource.set(source, (bySource.get(source) || 0) + value)
    sums.set(key, bySource)
  }

  return { timeZone, set, add, sums, values, legacySleep, legacySleepScores, googleSleep, googleSleepScores }
}

const SUM_DIGITS = { steps: 0, calories: 0, floors: 0, distanceKm: 3, activeMinutes: 0, zoneMinutes: 0, sedentaryMinutes: 0, waterMl: 0, caloriesIn: 0 }

function finishSums(acc) {
  for (const [key, bySource] of acc.sums) {
    const [field, date, priority] = key.split('|')
    const total = Math.max(...bySource.values())
    acc.set(date, field, round(total, SUM_DIGITS[field] ?? 1), Number(priority))
  }
}

function finishSleep(acc) {
  const legacyDates = new Map()
  for (const log of acc.legacySleep) {
    const list = legacyDates.get(log.date) || []
    list.push(log)
    legacyDates.set(log.date, list)
  }
  for (const [date, logs] of legacyDates) {
    const main = logs.find((log) => log.mainSleep) || [...logs].sort((a, b) => b.minutesAsleep - a.minutesAsleep)[0]
    acc.set(date, 'sleepMinutes', logs.reduce((sum, log) => sum + log.minutesAsleep, 0), LEGACY)
    if (main.efficiency !== null) acc.set(date, 'sleepEfficiency', main.efficiency, LEGACY)
  }
  const legacyLogDates = new Map(acc.legacySleep.filter((log) => log.logId).map((log) => [log.logId, log.date]))
  for (const score of acc.legacySleepScores) {
    acc.set(legacyLogDates.get(score.logId) || score.date, 'sleepScore', score.score, LEGACY)
  }

  // Google Health exports score each night once per sleep algorithm, so only
  // the newest algorithm's sessions count toward a day.
  const googleDates = new Map()
  for (const session of acc.googleSleep) {
    const list = googleDates.get(session.date) || []
    list.push(session)
    googleDates.set(session.date, list)
  }
  for (const [date, all] of googleDates) {
    const newest = all.reduce((latest, session) => (session.algorithm > latest ? session.algorithm : latest), '')
    const sessions = all.filter((session) => session.algorithm === newest)
    const main = [...sessions].sort((a, b) => b.minutesAsleep - a.minutesAsleep)[0]
    acc.set(date, 'sleepMinutes', sessions.reduce((sum, session) => sum + session.minutesAsleep, 0), GOOGLE)
    if (main.periodMinutes) acc.set(date, 'sleepEfficiency', round(main.minutesAsleep / main.periodMinutes * 100), GOOGLE)
    const score = acc.googleSleepScores.get(main.sleepId)
    if (score !== undefined) acc.set(date, 'sleepScore', score, GOOGLE)
  }
}

// ---- legacy Fitbit layout: Global Export Data JSON ----

// Per-minute series stamped in UTC, summed into local days.
const LEGACY_INTRADAY = {
  steps: { field: 'steps', scale: 1 },
  calories: { field: 'calories', scale: 1 },
  distance: { field: 'distanceKm', scale: 1 / 100_000 }, // centimetres
  altitude: { field: 'floors', scale: 1 / 10 }, // feet climbed, 10 ft per floor
}

// One entry per day, stamped at midnight as a day label.
const LEGACY_DAILY = {
  moderately_active_minutes: 'activeMinutes',
  very_active_minutes: 'activeMinutes',
  sedentary_minutes: 'sedentaryMinutes',
}

function legacyIntraday(family) {
  const { field, scale } = LEGACY_INTRADAY[family]
  return (text, acc) => {
    for (const entry of parseJsonArray(text)) {
      const value = numberOrNull(entry?.value)
      if (value !== null) acc.add(instantDate(entry.dateTime, acc.timeZone), field, value * scale, LEGACY)
    }
  }
}

function legacyDaily(family) {
  const field = LEGACY_DAILY[family]
  return (text, acc) => {
    for (const entry of parseJsonArray(text)) {
      acc.add(labelDate(entry?.dateTime), field, numberOrNull(entry?.value), LEGACY)
    }
  }
}

function legacyRestingHeartRate(text, acc) {
  for (const entry of parseJsonArray(text)) {
    // Days without a reading carry a placeholder value of 0.
    const value = positiveOrNull(entry?.value?.value)
    acc.set(labelDate(entry?.value?.date ?? entry?.dateTime), 'restingHeartRate', value === null ? null : round(value, 1), LEGACY)
  }
}

function legacySleep(text, acc) {
  for (const log of parseJsonArray(text)) {
    const date = labelDate(log?.dateOfSleep)
    const minutesAsleep = numberOrNull(log?.minutesAsleep)
    if (!date || minutesAsleep === null) continue
    acc.legacySleep.push({
      logId: log.logId === undefined ? null : String(log.logId),
      date,
      minutesAsleep,
      efficiency: numberOrNull(log.efficiency),
      mainSleep: log.mainSleep === true,
    })
  }
}

// Legacy weight logs are in pounds whatever the account's unit setting.
function legacyWeight(text, acc) {
  for (const entry of parseJsonArray(text)) {
    const date = labelDate(entry?.date)
    const pounds = positiveOrNull(entry?.weight)
    acc.set(date, 'weight', pounds === null ? null : round(pounds * POUNDS_TO_KG, 2), LEGACY)
    const fat = positiveOrNull(entry?.fat)
    acc.set(date, 'bodyFat', fat === null ? null : round(fat, 1), LEGACY)
  }
}

function logDate(entry) {
  return labelDate(entry?.logDate ?? entry?.date ?? entry?.dateTime)
}

function legacyFood(text, acc) {
  for (const entry of parseJsonArray(text)) {
    const calories = numberOrNull(entry?.nutritionalValues?.calories ?? entry?.loggedFood?.calories)
    acc.add(logDate(entry), 'caloriesIn', calories, LEGACY)
  }
}

function legacyWater(text, acc) {
  for (const entry of parseJsonArray(text)) {
    const amount = numberOrNull(entry?.amount ?? entry?.waterAmount ?? entry?.value)
    const ounces = /oz|ounce/i.test(String(entry?.unit ?? entry?.unitName ?? ''))
    acc.add(logDate(entry), 'waterMl', amount === null ? null : ounces ? amount * FLUID_OUNCE_ML : amount, LEGACY)
  }
}

// ---- legacy Fitbit layout: per-type CSV folders ----

function legacySleepScore(text, acc) {
  for (const row of parseCsv(text)) {
    const score = positiveOrNull(row.overall_score)
    if (score === null) continue
    acc.legacySleepScores.push({
      logId: row.sleep_log_entry_id || null,
      date: instantDate(row.timestamp, acc.timeZone),
      score: round(score),
    })
  }
}

function legacyDailyCsv(field, columns, digits) {
  return (text, acc) => {
    for (const row of parseCsv(text)) {
      const value = positiveOrNull(column(row, ...columns))
      acc.set(labelDate(row.timestamp), field, value === null ? null : round(value, digits), LEGACY)
    }
  }
}

// Nightly deviation from the tracker's own baseline, in °C.
function legacyComputedTemperature(text, acc) {
  for (const row of parseCsv(text)) {
    const sum = numberOrNull(row.baseline_relative_sample_sum)
    const samples = positiveOrNull(row.temperature_samples)
    if (sum === null || samples === null) continue
    acc.set(instantDate(row.sleep_end, acc.timeZone), 'skinTemperature', round(sum / samples, 2), LEGACY)
  }
}

// ---- Google Health layout: *_GoogleData CSV ----

function googleIntraday(field, valueColumn, scale) {
  return (text, acc) => {
    for (const row of parseCsv(text)) {
      const value = numberOrNull(row[valueColumn])
      if (value !== null) acc.add(instantDate(row.timestamp, acc.timeZone), field, value * scale, GOOGLE, sourceOf(row))
    }
  }
}

function googleActiveMinutes(text, acc) {
  for (const row of parseCsv(text)) {
    const moderate = numberOrNull(row.moderate)
    const very = numberOrNull(row.very)
    if (moderate === null && very === null) continue
    acc.add(instantDate(row.timestamp, acc.timeZone), 'activeMinutes', (moderate || 0) + (very || 0), GOOGLE, sourceOf(row))
  }
}

function googleDaily(field, columns, digits) {
  return (text, acc) => {
    for (const row of parseCsv(text)) {
      const value = positiveOrNull(column(row, ...columns))
      acc.set(labelDate(row.timestamp), field, value === null ? null : round(value, digits), GOOGLE)
    }
  }
}

function googleSkinTemperature(text, acc) {
  for (const row of parseCsv(text)) {
    const nightly = numberOrNull(row['nightly temperature celsius'])
    const baseline = numberOrNull(row['baseline temperature celsius'])
    if (nightly === null || baseline === null) continue
    acc.set(labelDate(row.timestamp), 'skinTemperature', round(nightly - baseline, 2), GOOGLE)
  }
}

function googleBody(field, columns, scale, digits) {
  return (text, acc) => {
    for (const row of parseCsv(text)) {
      const value = positiveOrNull(column(row, ...columns))
      acc.set(instantDate(row.timestamp, acc.timeZone), field, value === null ? null : round(value * scale, digits), GOOGLE)
    }
  }
}

function googleSleep(text, acc) {
  for (const row of parseCsv(text)) {
    const date = instantDate(row.sleep_end, acc.timeZone)
    const minutesAsleep = numberOrNull(row.minutes_asleep)
    if (!date || minutesAsleep === null) continue
    acc.googleSleep.push({
      sleepId: row.sleep_id,
      date,
      minutesAsleep,
      periodMinutes: positiveOrNull(row.minutes_in_sleep_period),
      algorithm: row.algorithm_version || '',
    })
  }
}

function googleSleepScores(text, acc) {
  for (const row of parseCsv(text)) {
    const score = positiveOrNull(row.overall_score)
    if (row.sleep_id && score !== null) acc.googleSleepScores.set(row.sleep_id, round(score))
  }
}

const GOOGLE_FAMILIES = {
  steps: googleIntraday('steps', 'steps', 1),
  distance: googleIntraday('distanceKm', 'distance', 1 / 1000), // metres
  active_minutes: googleActiveMinutes,
  active_zone_minutes: googleIntraday('zoneMinutes', 'total minutes', 1),
  daily_resting_heart_rate: googleDaily('restingHeartRate', ['beats per minute'], 1),
  daily_heart_rate_variability: googleDaily('hrvMs', ['average heart rate variability milliseconds'], 1),
  daily_oxygen_saturation: googleDaily('spo2', ['average percentage'], 1),
  daily_respiratory_rate: googleDaily('breathingRate', ['breaths per minute'], 1),
  daily_sleep_temperature_derivations: googleSkinTemperature,
  weight: googleBody('weight', ['weight grams'], 1 / 1000, 2),
  body_fat: googleBody('bodyFat', ['body fat percentage', 'fat percentage'], 1, 1),
  usersleeps: googleSleep,
  usersleepscores: googleSleepScores,
}

function googleStem(value) {
  return value
    .toLowerCase()
    .replace(/\.csv$/, '')
    .replace(/[-_ ]\d{4}[-_]\d{2}([-_]\d{2})?$/, '')
    .replace(/[\s-]+/g, '_')
}

// Returns the parser for a file, or null when the importer does not use it.
// `relativePath` uses forward slashes.
function classifyTakeoutFile(relativePath) {
  if (NEVER_READ.test(relativePath)) return null
  const parts = relativePath.split('/')
  const name = parts.at(-1).toLowerCase()
  const folder = (parts.at(-2) || '').toLowerCase()

  if (name.endsWith('.json')) {
    const family = /^([a-z_]+)-\d+(?:-\d{2}-\d{2})?\.json$/.exec(name)?.[1]
    if (!family) return null
    if (LEGACY_INTRADAY[family]) return legacyIntraday(family)
    if (LEGACY_DAILY[family]) return legacyDaily(family)
    if (family === 'resting_heart_rate') return legacyRestingHeartRate
    if (family === 'sleep') return legacySleep
    if (family === 'weight') return legacyWeight
    if (family === 'food_logs') return legacyFood
    if (family === 'water_logs') return legacyWater
    return null
  }

  if (!name.endsWith('.csv')) return null
  if (name === 'sleep_score.csv') return legacySleepScore
  if (name.startsWith('daily heart rate variability summary')) return legacyDailyCsv('hrvMs', ['rmssd'], 1)
  if (name.startsWith('daily spo2')) return legacyDailyCsv('spo2', ['average_value'], 1)
  if (name.startsWith('daily respiratory rate summary')) return legacyDailyCsv('breathingRate', ['daily_respiratory_rate', 'full_sleep_breathing_rate'], 1)
  if (name.startsWith('computed temperature')) return legacyComputedTemperature
  // Google Health files are named after their type, sometimes inside a folder of the same name.
  return GOOGLE_FAMILIES[googleStem(name)] || GOOGLE_FAMILIES[googleStem(folder)] || null
}

// Keeps a day only when something was worn or logged. Exports pad monthly
// files with placeholder days that hold only resting calories and a full day
// of sedentary minutes.
function hasSignal(fields) {
  for (const [field, { value }] of fields) {
    if (field === 'calories' || field === 'sedentaryMinutes') continue
    if (value > 0) return true
  }
  const sedentary = fields.get('sedentaryMinutes')?.value
  return sedentary > 0 && sedentary < 1440
}

function finishDays(acc, today) {
  finishSums(acc)
  finishSleep(acc)
  const days = {}
  for (const date of [...acc.values.keys()].sort()) {
    const fields = acc.values.get(date)
    if (date > today || !hasSignal(fields)) continue
    days[date] = Object.fromEntries(HISTORY_FIELDS.map((field) => [field, fields.get(field)?.value ?? null]))
  }
  return days
}

function createImport(options) {
  const timeZone = options.timeZone || systemTimeZone()
  const today = options.today || zonedDate(new Date(), timeZone)
  const acc = createAccumulator(timeZone)
  let readFiles = 0
  let skippedFiles = 0
  return {
    async take(relativePath, readText) {
      const parse = classifyTakeoutFile(relativePath)
      if (!parse) {
        skippedFiles += 1
        return
      }
      try {
        parse(await readText(), acc)
        readFiles += 1
      } catch {
        skippedFiles += 1
      }
    },
    finish: () => ({ days: finishDays(acc, today), readFiles, skippedFiles }),
  }
}

// Translation of in-memory files, [{ path, text }], for tests and callers
// that already hold the contents.
async function translateTakeoutFiles(files, options = {}) {
  const run = createImport(options)
  for (const file of files) await run.take(file.path, () => file.text)
  return run.finish()
}

async function listFiles(root) {
  const files = []
  const pending = ['']
  while (pending.length) {
    const relative = pending.pop()
    const entries = await fs.promises.readdir(path.join(root, relative), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const child = relative ? `${relative}/${entry.name}` : entry.name
      if (NEVER_READ.test(child)) continue
      if (entry.isDirectory()) pending.push(child)
      else if (entry.isFile() && /\.(csv|json)$/i.test(entry.name)) files.push(child)
      if (files.length > MAX_FILES) throw new Error('That folder holds too many files to be a Takeout export.')
    }
  }
  return files.sort()
}

// Reads an extracted Takeout folder (or any folder above or inside its
// Fitbit / Google Health directory) one file at a time.
async function importTakeoutFolder(root, options = {}) {
  const run = createImport(options)
  for (const relative of await listFiles(root)) {
    await run.take(relative, async () => {
      const file = path.join(root, relative)
      if ((await fs.promises.stat(file)).size > MAX_FILE_BYTES) throw new Error('File too large.')
      return fs.promises.readFile(file, 'utf8')
    })
  }
  const result = run.finish()
  if (!result.readFiles) throw new Error('No Fitbit data found in that folder. Choose the extracted Takeout folder.')
  return result
}

module.exports = {
  classifyTakeoutFile,
  translateTakeoutFiles,
  importTakeoutFolder,
}
