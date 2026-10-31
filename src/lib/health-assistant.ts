import type { DashboardData, PageId, TrendPoint } from '@/types'

export interface AssistantNavigation {
  page?: PageId
  date?: string
}

const navigationPattern = /\s*<!--\s*openfit:navigate\s+(\{[\s\S]*?\})\s*-->\s*/g
const validPages = new Set<PageId>(['today', 'activity', 'health', 'sleep', 'body', 'devices'])

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day, 12))
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutNulls).filter((item) => item !== null && item !== undefined)
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== null && item !== undefined && item !== '')
      .map(([key, item]) => [key, withoutNulls(item)]),
  )
}

function compactTrend(point: TrendPoint) {
  return withoutNulls({
    date: point.date,
    steps: point.steps,
    caloriesOut: point.calories,
    distanceKm: point.distanceKm,
    floors: point.floors,
    activeMinutes: point.activeMinutes,
    zoneMinutes: point.zoneMinutes,
    sedentaryMinutes: point.sedentaryMinutes,
    restingHeartRateBpm: point.restingHeartRate,
    hrvMs: point.hrvMs,
    breathingRatePerMinute: point.breathingRate,
    spo2Percent: point.spo2,
    skinTemperatureDeltaC: point.skinTemperature,
    coreTemperatureC: point.coreTemperature,
    cardioScore: point.cardioScore,
    sleepMinutes: point.sleepMinutes,
    sleepScore: point.sleepScore,
    sleepEfficiencyPercent: point.sleepEfficiency,
    weightKg: point.weight,
    bodyFatPercent: point.bodyFat,
    waterMl: point.waterMl,
    caloriesIn: point.caloriesIn,
  })
}

function compactDay(data: DashboardData) {
  return withoutNulls({
    date: data.selectedDate,
    activity: {
      steps: data.activity.steps,
      stepsGoal: data.activity.stepsGoal,
      caloriesOut: data.activity.calories,
      caloriesGoal: data.activity.caloriesGoal,
      distanceKm: data.activity.distanceKm,
      distanceGoalKm: data.activity.distanceGoalKm,
      floors: data.activity.floors,
      floorsGoal: data.activity.floorsGoal,
      activeMinutes: data.activity.activeMinutes,
      lightActiveMinutes: data.activity.lightActiveMinutes,
      moderateActiveMinutes: data.activity.moderateActiveMinutes,
      vigorousActiveMinutes: data.activity.vigorousActiveMinutes,
      activeMinutesGoal: data.activity.activeMinutesGoal,
      zoneMinutes: data.activity.zoneMinutes,
      sedentaryMinutes: data.activity.sedentaryMinutes,
    },
    health: {
      currentHeartRateBpm: data.health.currentHeartRate,
      restingHeartRateBpm: data.health.restingHeartRate,
      heartRateMinBpm: data.health.heartRateMin,
      heartRateMaxBpm: data.health.heartRateMax,
      hrvMs: data.health.hrvMs,
      hrvDeepSleepRmssdMs: data.health.hrvDeepSleepRmssdMs,
      hrvEntropy: data.health.hrvEntropy,
      nonRemHeartRateBpm: data.health.nonRemHeartRate,
      breathingRatePerMinute: data.health.breathingRate,
      spo2Percent: data.health.spo2,
      spo2MinPercent: data.health.spo2Min,
      spo2MaxPercent: data.health.spo2Max,
      skinTemperatureDeltaC: data.health.skinTemperature,
      skinNightlyTemperatureC: data.health.skinNightlyTemperatureCelsius,
      skinBaselineTemperatureC: data.health.skinBaselineTemperatureCelsius,
      skinTemperatureStddev30dC: data.health.skinTemperatureStddev30dCelsius,
      coreTemperatureC: data.health.coreTemperature,
      vo2Max: data.health.vo2Max,
      cardioScore: data.health.cardioScore,
      ecgClassification: data.health.ecgClassification,
      bloodGlucoseMgDl: data.health.bloodGlucoseMgDl,
      irregularRhythmAlerts: data.health.irregularRhythmAlerts,
    },
    sleep: {
      totalMinutes: data.sleep.totalMinutes,
      goalMinutes: data.sleep.goalMinutes,
      score: data.sleep.score,
      efficiencyPercent: data.sleep.efficiency,
      startTime: data.sleep.startTime,
      endTime: data.sleep.endTime,
      stagesMinutes: Object.fromEntries(data.sleep.stages.map((stage) => [stage.key, stage.minutes])),
      stageTransitions: data.sleep.stageTransitions,
      minutesToFallAsleep: data.sleep.minutesToFallAsleep,
      minutesAfterWakeUp: data.sleep.minutesAfterWakeUp,
      timeInBedMinutes: data.sleep.timeInBed,
      minutesAwake: data.sleep.minutesAwake,
    },
    body: {
      weightKg: data.body.weightKg,
      weightGoalKg: data.body.weightGoalKg,
      bmi: data.body.bmi,
      bodyFatPercent: data.body.bodyFat,
      waterMl: data.body.waterMl,
      waterGoalMl: data.body.waterGoalMl,
      caloriesIn: data.body.caloriesIn,
    },
    activities: data.activities
      .filter((activity) => activity.date === data.selectedDate)
      .map((activity) => withoutNulls({
        name: activity.name,
        time: activity.time,
        durationMinutes: activity.durationMinutes,
        calories: activity.calories,
        distanceKm: activity.distanceKm,
        averageHeartRateBpm: activity.averageHeartRate,
        zoneMinutes: activity.zoneMinutes,
        steps: activity.steps,
        averagePaceSecondsPerMeter: activity.averagePaceSecondsPerMeter,
        heartZoneMinutes: activity.heartZoneMinutes,
      })),
  })
}

export function buildHealthAssistantContext(
  current: DashboardData,
  archiveDays: DashboardData[],
  page: PageId,
) {
  const days = new Map<string, unknown>()

  for (const point of current.history) days.set(point.date, compactTrend(point))
  for (const trend of current.trends) days.set(trend.date, compactTrend(trend))
  for (const day of archiveDays) days.set(day.selectedDate, compactDay(day))
  days.set(current.selectedDate, compactDay(current))

  const sortedDays = [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value)

  const selectedDetail = withoutNulls({
    summary: compactDay(current),
    intraday: {
      steps: current.activity.stepsIntraday,
      calories: current.activity.caloriesIntraday,
      heartRate: current.health.heartRateIntraday,
    },
    sleepStageTimeline: current.sleep.stageTimeline,
    insights: current.insights,
    device: current.device,
    syncCoverage: current.sync,
  })

  return JSON.stringify(withoutNulls({
    schema: 'openfit-health-context/v1',
    generatedAt: new Date().toISOString(),
    source: current.source,
    app: {
      currentPage: page,
      selectedDate: current.selectedDate,
      navigablePages: ['today', 'activity', 'health', 'sleep', 'body', 'devices'],
    },
    profile: {
      displayName: current.profile.displayName,
      memberSince: current.profile.memberSince,
      timezone: current.profile.timezone,
    },
    units: {
      heartRate: 'bpm',
      hrv: 'ms',
      breathingRate: 'breaths/min',
      spo2: '%',
      temperature: '°C',
      weight: 'kg',
      distance: 'km',
      glucose: 'mg/dL',
      energy: 'kcal',
    },
    archive: {
      dayCount: sortedDays.length,
      firstDate: sortedDays.length ? [...days.keys()].sort()[0] : null,
      lastDate: sortedDays.length ? [...days.keys()].sort().at(-1) : null,
      daily: sortedDays,
    },
    selectedDayDetail: selectedDetail,
  }))
}

export function parseAssistantNavigation(text: string): AssistantNavigation | null {
  navigationPattern.lastIndex = 0
  const match = navigationPattern.exec(text)
  if (!match) return null
  try {
    const value = JSON.parse(match[1]) as AssistantNavigation
    const page = value.page && validPages.has(value.page) ? value.page : undefined
    const date = value.date && validIsoDate(value.date) ? value.date : undefined
    return page || date ? { page, date } : null
  } catch {
    return null
  }
}

export function stripAssistantNavigation(text: string) {
  navigationPattern.lastIndex = 0
  return text.replace(navigationPattern, '').trim()
}

export function visibleAssistantText(text: string) {
  const marker = text.indexOf('<!--')
  return (marker >= 0 ? text.slice(0, marker) : text).trimEnd()
}
