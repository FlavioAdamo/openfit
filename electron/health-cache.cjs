'use strict'

const CACHE_VERSION = 3

// Daily summary fields shared by the history archive and the renderer's TrendPoint.
const HISTORY_FIELDS = [
  'steps',
  'calories',
  'distanceKm',
  'floors',
  'activeMinutes',
  'zoneMinutes',
  'sedentaryMinutes',
  'restingHeartRate',
  'hrvMs',
  'breathingRate',
  'spo2',
  'skinTemperature',
  'coreTemperature',
  'cardioScore',
  'sleepMinutes',
  'sleepScore',
  'sleepEfficiency',
  'weight',
  'bodyFat',
  'waterMl',
  'caloriesIn',
]

function emptyArchive() {
  return { version: CACHE_VERSION, lastDate: null, days: {}, history: null }
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function validIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day, 12))
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function cleanHistoryDay(value) {
  const day = {}
  for (const field of HISTORY_FIELDS) day[field] = finiteOrNull(value?.[field])
  return day
}

function hasMeasurement(day) {
  return HISTORY_FIELDS.some((field) => day[field] !== null)
}

function normalizeHistory(value) {
  if (!value || typeof value !== 'object' || !value.days || typeof value.days !== 'object') return null
  const days = {}
  for (const [date, day] of Object.entries(value.days)) {
    if (!validIsoDate(date)) continue
    const cleaned = cleanHistoryDay(day)
    if (hasMeasurement(cleaned)) days[date] = cleaned
  }
  return {
    source: typeof value.source === 'string' ? value.source : 'google-health',
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : null,
    days,
    lastRun: value.lastRun && typeof value.lastRun === 'object' ? { ...value.lastRun } : null,
  }
}

function normalizeArchive(value) {
  if ((value?.version === CACHE_VERSION || value?.version === 2) && value.days && typeof value.days === 'object') {
    return {
      version: CACHE_VERSION,
      lastDate: typeof value.lastDate === 'string' ? value.lastDate : null,
      days: { ...value.days },
      // Version 2 stored per-day payloads only; history arrives with version 3.
      history: value.version === CACHE_VERSION ? normalizeHistory(value.history) : null,
    }
  }

  // Version 1 stored one raw payload directly in the encrypted cache file.
  if (value && typeof value === 'object' && typeof value.date === 'string') {
    return { version: CACHE_VERSION, lastDate: value.date, days: { [value.date]: value }, history: null }
  }

  return emptyArchive()
}

function cachedDay(value, date) {
  return normalizeArchive(value).days[date] || null
}

function latestDay(value) {
  const archive = normalizeArchive(value)
  if (archive.lastDate && archive.days[archive.lastDate]) return archive.days[archive.lastDate]
  const dates = Object.keys(archive.days).sort()
  return dates.length ? archive.days[dates.at(-1)] : null
}

function storeDay(value, payload) {
  const archive = normalizeArchive(value)
  return {
    ...archive,
    lastDate: payload.date,
    days: { ...archive.days, [payload.date]: payload },
  }
}

// Merges a history chunk into the archive. Incoming numbers replace stored
// ones; incoming nulls keep whatever the archive already has, so a partial
// chunk never erases earlier measurements.
function storeHistory(value, chunk) {
  const archive = normalizeArchive(value)
  const previous = archive.history || { source: 'google-health', generatedAt: null, days: {}, lastRun: null }
  const days = { ...previous.days }

  for (const [date, incoming] of Object.entries(chunk?.days || {})) {
    if (!validIsoDate(date)) continue
    const existing = days[date] || {}
    const merged = {}
    for (const field of HISTORY_FIELDS) {
      const next = finiteOrNull(incoming?.[field])
      merged[field] = next === null ? finiteOrNull(existing[field]) : next
    }
    if (hasMeasurement(merged)) days[date] = merged
  }

  return {
    ...archive,
    history: {
      source: typeof chunk?.source === 'string' ? chunk.source : previous.source,
      generatedAt: typeof chunk?.generatedAt === 'string' ? chunk.generatedAt : previous.generatedAt,
      days,
      lastRun: chunk?.lastRun === undefined ? previous.lastRun : chunk.lastRun,
    },
  }
}

function historyCoverage(value) {
  const history = normalizeArchive(value).history
  if (!history) return null
  const dates = Object.keys(history.days).sort()
  if (!dates.length) return null
  return { start: dates[0], end: dates.at(-1), dayCount: dates.length, generatedAt: history.generatedAt }
}

module.exports = {
  CACHE_VERSION,
  HISTORY_FIELDS,
  normalizeArchive,
  cachedDay,
  latestDay,
  storeDay,
  storeHistory,
  historyCoverage,
}
