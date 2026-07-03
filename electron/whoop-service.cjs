'use strict'

const crypto = require('node:crypto')

const API_BASE = 'https://api.prod.whoop.com'
const TOKEN_URL = `${API_BASE}/oauth/oauth2/token`
const AUTHORIZE_URL = `${API_BASE}/oauth/oauth2/auth`
const SCOPES = [
  'offline',
  'read:profile',
  'read:body_measurement',
  'read:cycles',
  'read:recovery',
  'read:sleep',
  'read:workout',
]

let latestRateLimit = { limit: null, remaining: null, resetSeconds: null }

function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
}

function base64Url(buffer) {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function createPkce() {
  const verifier = base64Url(crypto.randomBytes(48))
  return {
    verifier,
    challenge: base64Url(crypto.createHash('sha256').update(verifier).digest()),
  }
}

function createAuthorizationUrl(config, state) {
  const url = new URL(AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
  }).toString()
  return url.toString()
}

async function tokenRequest(parameters) {
  const response = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(parameters),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `WHOOP OAuth responded ${response.status}.`)
  }
  return {
    ...payload,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  }
}

function exchangeAuthorizationCode(config, code) {
  return tokenRequest({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  })
}

async function refreshAccessToken(config, token) {
  if (!token.refresh_token) throw new Error('The WHOOP refresh token is unavailable: reconnect the account.')
  const refreshed = await tokenRequest({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token',
    scope: 'offline',
  })
  return { ...token, ...refreshed }
}

async function revokeToken(token) {
  if (!token?.access_token) return
  const response = await fetchWithTimeout(`${API_BASE}/developer/v2/user/access`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json' },
  })
  if (!response.ok && response.status !== 404) throw new Error(`WHOOP did not confirm token revocation (${response.status}).`)
}

function numberHeader(value) {
  if (value === null) return null
  const first = String(value).match(/\d+/)?.[0]
  const parsed = Number(first)
  return Number.isFinite(parsed) ? parsed : null
}

function rememberRateLimit(headers) {
  latestRateLimit = {
    limit: numberHeader(headers.get('x-ratelimit-limit')),
    remaining: numberHeader(headers.get('x-ratelimit-remaining')),
    resetSeconds: numberHeader(headers.get('x-ratelimit-reset')),
  }
}

async function request(path, accessToken, retryCount = 0) {
  const response = await fetchWithTimeout(path.startsWith('http') ? path : `${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  })
  rememberRateLimit(response.headers)
  if (response.status === 429 && retryCount < 2) {
    const delay = Math.min(30_000, Math.max(1, latestRateLimit.resetSeconds || 1) * 1000)
    await new Promise((resolve) => setTimeout(resolve, delay))
    return request(path, accessToken, retryCount + 1)
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.message || payload.error_description || payload.error || `WHOOP responded ${response.status}.`)
    error.status = response.status
    throw error
  }
  return payload
}

async function collection(path, accessToken, parameters = {}) {
  const records = []
  let nextToken = ''
  let pageCount = 0
  do {
    const params = new URLSearchParams({ limit: '25', ...parameters })
    if (nextToken) params.set('nextToken', nextToken)
    const page = await request(`${path}?${params}`, accessToken)
    if (Array.isArray(page.records)) records.push(...page.records)
    nextToken = page.next_token || page.nextToken || ''
    pageCount += 1
    if (pageCount >= 200 && nextToken) throw new Error(`WHOOP returned too many pages for ${path}.`)
  } while (nextToken)
  return { records }
}

const WHOOP_EARLIEST_SYNC_DATE = '2000-01-01'

function shiftIso(value, days) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10)
}

function intervalForDate(date) {
  return {
    start: `${WHOOP_EARLIEST_SYNC_DATE}T00:00:00.000Z`,
    end: `${shiftIso(date, 1)}T00:00:00.000Z`,
  }
}

async function syncWhoopData(accessToken, selectedDate, onProgress = () => {}) {
  const { start, end } = intervalForDate(selectedDate)
  const jobs = [
    ['profile', () => request('/developer/v2/user/profile/basic', accessToken)],
    ['body', () => request('/developer/v2/user/measurement/body', accessToken)],
    ['cycles', () => collection('/developer/v2/cycle', accessToken, { start, end })],
    ['recoveries', () => collection('/developer/v2/recovery', accessToken, { start, end })],
    ['sleeps', () => collection('/developer/v2/activity/sleep', accessToken, { start, end })],
    ['workouts', () => collection('/developer/v2/activity/workout', accessToken, { start, end })],
  ]
  const endpoints = {}
  const errors = []
  let completed = 0

  await Promise.all(jobs.map(async ([key, run], index) => {
    await new Promise((resolve) => setTimeout(resolve, index * 75))
    try {
      endpoints[key] = await run()
    } catch (error) {
      errors.push({ key, message: error.message || 'Source unavailable', status: error.status })
    } finally {
      completed += 1
      onProgress({ completed, total: jobs.length, key })
    }
  }))

  if (errors.some((error) => error.status === 401)) {
    throw new Error('The WHOOP authorization is no longer valid. Reconnect the account.')
  }

  return {
    source: 'whoop',
    date: selectedDate,
    generatedAt: new Date().toISOString(),
    endpoints: translateWhoop(endpoints, selectedDate),
    errors,
    rateLimit: latestRateLimit,
    requestStats: { total: jobs.length, succeeded: Object.keys(endpoints).length, successfulKeys: Object.keys(endpoints) },
  }
}

function numeric(value, transform = (number) => number) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? transform(parsed) : null
}

function millisToMinutes(value) {
  return numeric(value, (number) => number / 60_000)
}

function kjToKcal(value) {
  return numeric(value, (number) => number / 4.184)
}

function offsetMinutes(value) {
  const text = String(value || 'Z')
  if (text === 'Z') return 0
  const match = text.match(/^([+-])(\d{2}):(\d{2})$/)
  if (!match) return 0
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3]))
}

function localDate(value, offset = 'Z') {
  const parsed = Date.parse(value || '')
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed + offsetMinutes(offset) * 60_000).toISOString().slice(0, 10)
}

function localTime(value, offset = 'Z') {
  const parsed = Date.parse(value || '')
  if (!Number.isFinite(parsed)) return ''
  return new Date(parsed + offsetMinutes(offset) * 60_000).toISOString().slice(11, 16)
}

function byDate(records, getDate) {
  const map = new Map()
  for (const record of records) {
    const date = getDate(record)
    if (!date) continue
    map.set(date, record)
  }
  return map
}

function stageMinutes(summary = {}) {
  const light = millisToMinutes(summary.total_light_sleep_time_milli) ?? 0
  const deep = millisToMinutes(summary.total_slow_wave_sleep_time_milli) ?? 0
  const rem = millisToMinutes(summary.total_rem_sleep_time_milli) ?? 0
  const wake = millisToMinutes(summary.total_awake_time_milli) ?? 0
  return { light, deep, rem, wake }
}

function toLegacySleep(record) {
  const score = record?.score || {}
  const stages = stageMinutes(score.stage_summary || {})
  const minutesAsleep = stages.light + stages.deep + stages.rem
  const dateOfSleep = localDate(record?.end || record?.start, record?.timezone_offset)
  return {
    logId: record?.id,
    dateOfSleep,
    isMainSleep: record?.nap !== true,
    sleepPerformance: numeric(score.sleep_performance_percentage),
    breathingRate: numeric(score.respiratory_rate),
    minutesAsleep: minutesAsleep || null,
    minutesAwake: stages.wake || null,
    timeInBed: millisToMinutes(score.stage_summary?.total_in_bed_time_milli),
    efficiency: numeric(score.sleep_efficiency_percentage),
    startTime: record?.start || null,
    endTime: record?.end || null,
    levels: {
      summary: {
        deep: { minutes: stages.deep, count: null },
        light: { minutes: stages.light, count: null },
        rem: { minutes: stages.rem, count: null },
        wake: { minutes: stages.wake, count: numeric(score.stage_summary?.disturbance_count) },
      },
      data: [],
    },
  }
}

function toLegacyWorkout(record) {
  const score = record?.score || {}
  const start = record?.start || ''
  const end = record?.end || ''
  const duration = Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end))
    ? Math.max(0, Date.parse(end) - Date.parse(start))
    : 0
  const zones = score.zone_durations || {}
  const zoneMinutes = (value) => millisToMinutes(value)
  return {
    logId: record?.id,
    activityName: record?.sport_name || 'Workout',
    startTime: start,
    duration,
    calories: kjToKcal(score.kilojoule),
    distance: numeric(score.distance_meter, (value) => value / 1000),
    averageHeartRate: numeric(score.average_heart_rate),
    steps: null,
    heartZoneMinutes: {
      light: (zoneMinutes(zones.zone_zero_milli) || 0) + (zoneMinutes(zones.zone_one_milli) || 0),
      moderate: zoneMinutes(zones.zone_two_milli),
      vigorous: zoneMinutes(zones.zone_three_milli),
      peak: (zoneMinutes(zones.zone_four_milli) || 0) + (zoneMinutes(zones.zone_five_milli) || 0),
    },
    activeZoneMinutes: { totalMinutes: ['zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli'].reduce((sum, key) => sum + (zoneMinutes(zones[key]) || 0), 0) },
    strain: numeric(score.strain),
  }
}

function translateWhoop(raw, selectedDate) {
  const cycles = Array.isArray(raw.cycles?.records) ? raw.cycles.records : []
  const recoveries = Array.isArray(raw.recoveries?.records) ? raw.recoveries.records : []
  const sleeps = Array.isArray(raw.sleeps?.records) ? raw.sleeps.records : []
  const workouts = Array.isArray(raw.workouts?.records) ? raw.workouts.records : []
  const cycleDates = new Map(cycles.map((cycle) => [String(cycle.id), localDate(cycle.end || cycle.start, cycle.timezone_offset)]))
  const cycleByDate = byDate(cycles, (cycle) => cycleDates.get(String(cycle.id)))
  const recoveryByDate = byDate(recoveries, (recovery) => cycleDates.get(String(recovery.cycle_id)))
  const sleepRecords = sleeps.map(toLegacySleep)
  const sleepByDate = byDate(sleepRecords, (sleep) => sleep.dateOfSleep)
  const workoutRecords = workouts.map(toLegacyWorkout)
  const workoutByDate = new Map()
  for (const workout of workouts) {
    const date = localDate(workout.start, workout.timezone_offset)
    if (!date) continue
    const previous = workoutByDate.get(date) || []
    previous.push(workout)
    workoutByDate.set(date, previous)
  }
  const dates = [...new Set([
    ...cycleByDate.keys(),
    ...recoveryByDate.keys(),
    ...sleepByDate.keys(),
    ...workoutByDate.keys(),
    selectedDate,
  ])].sort()
  const selectedCycle = cycleByDate.get(selectedDate) || null
  const selectedRecovery = recoveryByDate.get(selectedDate) || null
  const selectedRecoveryScore = selectedRecovery?.score || {}
  const selectedSleep = sleepByDate.get(selectedDate) || null
  const selectedBody = raw.body || {}
  const profile = raw.profile || {}
  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email || 'WHOOP member'

  return {
    profile: { user: { displayName, memberSince: null, timezone: selectedCycle?.timezone_offset || null } },
    devices: [{
      id: profile.user_id ? `whoop-${profile.user_id}` : 'whoop',
      type: 'WHOOP_ACCOUNT',
      deviceVersion: 'WHOOP',
      battery: null,
      batteryLevel: null,
      lastSyncTime: new Date().toISOString(),
      features: ['RECOVERY', 'STRAIN', 'SLEEP', 'HRV', 'SPO2', 'WORKOUTS'],
    }],
    activity: { summary: {
      steps: null,
      caloriesOut: kjToKcal(selectedCycle?.score?.kilojoule),
      distances: [{ activity: 'total', distance: null }],
      activeZoneMinutes: { totalMinutes: workoutByDate.get(selectedDate)?.reduce((sum, workout) => sum + (toLegacyWorkout(workout).activeZoneMinutes.totalMinutes || 0), 0) ?? null },
    } },
    activityGoals: { goals: {} },
    stepsIntraday: { 'activities-steps-intraday': { dataset: [] } },
    caloriesIntraday: { 'activities-calories-intraday': { dataset: [] } },
    heartIntraday: {
      'activities-heart': [{ dateTime: selectedDate, value: { restingHeartRate: numeric(selectedRecoveryScore.resting_heart_rate) } }],
      'activities-heart-intraday': { dataset: [] },
    },
    sleep: { sleep: selectedSleep ? [selectedSleep] : [] },
    sleepTrend: { sleep: sleepRecords },
    sleepGoal: { goal: { minDuration: millisToMinutes(selectedSleep?.score?.sleep_needed?.baseline_milli) } },
    stepsTrend: { 'activities-steps': dates.map((date) => ({ dateTime: date, value: null })) },
    caloriesTrend: { 'activities-calories': dates.map((date) => ({ dateTime: date, value: kjToKcal(cycleByDate.get(date)?.score?.kilojoule) })) },
    heartTrend: { 'activities-heart': dates.map((date) => ({ dateTime: date, value: { restingHeartRate: recoveryByDate.get(date)?.score?.resting_heart_rate } })) },
    metricTrends: { values: dates.map((date) => {
      const cycle = cycleByDate.get(date)
      const recovery = recoveryByDate.get(date)
      const sleep = sleepByDate.get(date)
      const sleepScore = sleep?.sleepPerformance
      return {
        dateTime: date,
        hrvMs: numeric(recovery?.score?.hrv_rmssd_milli),
        breathingRate: numeric(sleep?.breathingRate),
        spo2: numeric(recovery?.score?.spo2_percentage),
        skinTemperature: numeric(recovery?.score?.skin_temp_celsius),
        strain: numeric(cycle?.score?.strain),
        recoveryScore: numeric(recovery?.score?.recovery_score),
        sleepPerformance: sleepScore,
        sleepEfficiency: numeric(sleep?.efficiency),
      }
    }) },
    bodyWeight: { weight: numeric(selectedBody.weight_kilogram) === null ? [] : [{ date: selectedDate, weight: numeric(selectedBody.weight_kilogram), bmi: null }] },
    bodyFat: { fat: [] },
    weightGoal: { goal: {} },
    water: { summary: {} },
    waterGoal: { goal: {} },
    food: { summary: {} },
    breathing: { br: numeric(selectedSleep?.breathingRate) === null ? [] : [{ dateTime: selectedDate, value: { breathingRate: numeric(selectedSleep?.breathingRate) } }] },
    hrv: { hrv: numeric(selectedRecoveryScore.hrv_rmssd_milli) === null ? [] : [{ dateTime: selectedDate, value: { dailyRmssd: numeric(selectedRecoveryScore.hrv_rmssd_milli) } }] },
    spo2: numeric(selectedRecoveryScore.spo2_percentage) === null ? {} : { dateTime: selectedDate, value: { avg: numeric(selectedRecoveryScore.spo2_percentage) } },
    skinTemperature: { tempSkin: numeric(selectedRecoveryScore.skin_temp_celsius) === null ? [] : [{ dateTime: selectedDate, value: { nightlyTemperatureCelsius: numeric(selectedRecoveryScore.skin_temp_celsius) } }] },
    coreTemperature: { tempCore: [] },
    cardio: { cardioScore: [] },
    ecg: { ecgReadings: [] },
    activities: { activities: workoutRecords },
    identity: { userId: profile.user_id, email: profile.email },
  }
}

module.exports = {
  provider: 'whoop',
  scopes: SCOPES,
  createPkce,
  createAuthorizationUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  revokeToken,
  syncData: syncWhoopData,
  __test: { translateWhoop, localDate, kjToKcal, millisToMinutes },
}
