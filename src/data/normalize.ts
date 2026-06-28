import { createDemoData } from './demo'
import type {
  ActivityItem,
  DashboardData,
  HeartZoneMinutes,
  RawFitbitPayload,
  SleepStageCounts,
  SleepStageKey,
  SleepStageSegment,
  SleepStage,
  TimePoint,
  TrendPoint,
} from '../types'

type Json = Record<string, any>

const asObject = (value: unknown): Json => (value && typeof value === 'object' ? value as Json : {})
const asArray = <T = any>(value: unknown): T[] => Array.isArray(value) ? value : []
const numeric = (value: unknown): number | null => {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = numeric(value)
    if (parsed !== null) return parsed
  }
  return null
}

function shortDay(date: string) {
  const parsed = new Date(`${date}T12:00:00`)
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(parsed).replace('.', '')
}

function readIntraday(input: unknown, key: string): TimePoint[] {
  return asArray(asObject(asObject(input)[key]).dataset)
    .map((point) => ({ time: String(point.time ?? '').slice(0, 5), value: Number(point.value) }))
    .filter((point) => point.time && Number.isFinite(point.value))
}

function compactIntraday(points: TimePoint[], maxPoints = 288): TimePoint[] {
  const minutes = new Map<string, { total: number; count: number }>()

  for (const point of points) {
    const aggregate = minutes.get(point.time) ?? { total: 0, count: 0 }
    aggregate.total += point.value
    aggregate.count += 1
    minutes.set(point.time, aggregate)
  }

  const minutePoints = [...minutes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([time, aggregate]) => ({
      time,
      value: Math.round(aggregate.total / aggregate.count),
    }))

  if (minutePoints.length <= maxPoints) return minutePoints

  const bucketSize = Math.ceil(minutePoints.length / maxPoints)
  const compacted: TimePoint[] = []
  for (let index = 0; index < minutePoints.length; index += bucketSize) {
    const bucket = minutePoints.slice(index, index + bucketSize)
    compacted.push({
      time: bucket.at(-1)?.time ?? bucket[0].time,
      value: Math.round(bucket.reduce((sum, point) => sum + point.value, 0) / bucket.length),
    })
  }
  return compacted
}

function readTrend(input: unknown, key: string) {
  return new Map(
    asArray(asObject(input)[key]).map((point) => [String(point.dateTime), numeric(point.value)]),
  )
}

function mainSleep(input: unknown) {
  const records = asArray(asObject(input).sleep)
  return records.find((item) => item.isMainSleep) ?? records[0] ?? null
}

function sleepStages(record: Json | null): SleepStage[] {
  const summary = asObject(asObject(record?.levels).summary)
  const config = [
    ['Deep', 'deep', '#555b64'],
    ['Light', 'light', '#858c95'],
    ['REM', 'rem', '#bcc1c7'],
    ['Awake', 'wake', '#363a40'],
  ] as const
  return config.map(([name, key, color]) => ({
    name,
    key,
    minutes: Number(asObject(summary[key]).minutes ?? 0),
    color,
  }))
}

function sleepStageKey(value: unknown): SleepStageKey | null {
  const stage = String(value ?? '').toLowerCase()
  if (stage === 'awake' || stage === 'restless') return 'wake'
  if (stage === 'asleep') return 'light'
  return ['deep', 'light', 'rem', 'wake'].includes(stage) ? stage as SleepStageKey : null
}

function sleepStageTimeline(record: Json | null): SleepStageSegment[] {
  const levels = asObject(record?.levels)
  const source = asArray(record?.stageTimeline).length ? asArray(record?.stageTimeline) : asArray(levels.data)

  return source.map((segment) => {
    const type = sleepStageKey(segment.type ?? segment.level)
    const startTime = String(segment.startTime ?? segment.dateTime ?? '')
    let endTime = String(segment.endTime ?? '')
    const seconds = numeric(segment.seconds)
    if (!endTime && startTime && seconds !== null) {
      const start = new Date(startTime)
      if (Number.isFinite(start.getTime())) endTime = new Date(start.getTime() + seconds * 1000).toISOString()
    }
    return type && startTime && endTime ? { startTime, endTime, type } : null
  }).filter((segment): segment is SleepStageSegment => segment !== null)
}

function sleepStageTransitions(record: Json | null, timeline: SleepStageSegment[]): SleepStageCounts {
  const summary = asObject(asObject(record?.levels).summary)
  const timelineCounts = timeline.reduce<Record<SleepStageKey, number>>((counts, segment) => {
    counts[segment.type] += 1
    return counts
  }, { deep: 0, light: 0, rem: 0, wake: 0 })
  const countFor = (key: SleepStageKey) => {
    const direct = numeric(asObject(summary[key]).count)
    if (direct !== null) return direct
    return timelineCounts[key] > 0 ? timelineCounts[key] : null
  }
  return {
    deep: countFor('deep'),
    light: countFor('light'),
    rem: countFor('rem'),
    wake: countFor('wake'),
  }
}

function activityHeartZoneMinutes(item: Json): HeartZoneMinutes | null {
  const direct = asObject(item.heartZoneMinutes)
  const legacy = new Map(asArray(item.heartRateZones).map((zone) => [String(zone.name ?? '').toLowerCase(), numeric(zone.minutes)]))
  const values: HeartZoneMinutes = {
    light: firstNumber(direct.light, legacy.get('light'), legacy.get('out of range')),
    moderate: firstNumber(direct.moderate, legacy.get('moderate'), legacy.get('fat burn')),
    vigorous: firstNumber(direct.vigorous, legacy.get('vigorous'), legacy.get('cardio')),
    peak: firstNumber(direct.peak, legacy.get('peak')),
  }
  return Object.values(values).some((value) => value !== null) ? values : null
}

function parseActivities(input: unknown): ActivityItem[] {
  return asArray(asObject(input).activities).map((item, index) => ({
    id: String(item.logId ?? `activity-${index}`),
    name: String(item.activityName ?? item.name ?? 'Activity'),
    date: String(item.startTime ?? item.originalStartTime ?? '').slice(0, 10),
    time: String(item.startTime ?? item.originalStartTime ?? '').slice(11, 16),
    durationMinutes: Math.round(Number(item.duration ?? item.activeDuration ?? 0) / 60_000),
    calories: numeric(item.calories),
    distanceKm: numeric(item.distance),
    averageHeartRate: numeric(item.averageHeartRate),
    zoneMinutes: firstNumber(item.activeZoneMinutes?.totalMinutes, item.activeZoneMinutes),
    steps: numeric(item.steps),
    averagePaceSecondsPerMeter: numeric(item.averagePaceSecondsPerMeter),
    heartZoneMinutes: activityHeartZoneMinutes(item),
  }))
}

export function normalizeFitbitData(payload: RawFitbitPayload): DashboardData {
  const e = payload.endpoints as Record<string, Json>
  const profile = asObject(e.profile).user ?? asObject(e.profile)
  const devices = asArray(e.devices)
  const device = devices.find((item) => item.type === 'TRACKER') ?? devices[0] ?? null
  const activity = asObject(asObject(e.activity).summary)
  const stepsIntraday = readIntraday(e.stepsIntraday, 'activities-steps-intraday')
  const goals = asObject(asObject(e.activityGoals).goals)
  const heartSummary = asArray(asObject(e.heartIntraday)['activities-heart'])[0]?.value ?? {}
  const rawHeartPoints = readIntraday(e.heartIntraday, 'activities-heart-intraday')
  const heartPoints = compactIntraday(rawHeartPoints)
  const sleepRecord = mainSleep(e.sleep)
  const sleepGoal = asObject(asObject(e.sleepGoal).goal)
  const latestWeight = asArray(asObject(e.bodyWeight).weight).at(-1) ?? null
  const latestFat = asArray(asObject(e.bodyFat).fat).at(-1) ?? null
  const weightGoal = asObject(asObject(e.weightGoal).goal)
  const waterSummary = asObject(asObject(e.water).summary)
  const waterGoal = asObject(asObject(e.waterGoal).goal)
  const foodSummary = asObject(asObject(e.food).summary)
  const breathing = asArray(asObject(e.breathing).br).at(-1)
  const hrv = asArray(asObject(e.hrv).hrv).at(-1)
  const hrvValue = asObject(hrv?.value)
  const skinTemp = asArray(asObject(e.skinTemperature).tempSkin).at(-1)
  const skinTempValue = asObject(skinTemp?.value)
  const coreTemp = asArray(asObject(e.coreTemperature).tempCore).at(-1)
  const cardio = asArray(asObject(e.cardio).cardioScore).at(-1)
  const ecg = asArray(asObject(e.ecg).ecgReadings).at(0)
  const glucoseRoot = asObject(e.bloodGlucose)
  const glucosePoint = asArray(glucoseRoot.dataPoints).at(0) ?? asArray(glucoseRoot.values).at(-1)
  const irregularRoot = asObject(e.irregularRhythm)
  const irregularLegacy = asObject(e.irregularRhythmAlerts)
  const irregularAvailable = e.irregularRhythm !== undefined || e.irregularRhythmAlerts !== undefined
  const irregularAlerts = asArray(asObject(irregularRoot.alerts).dataPoints).length
    || asArray(irregularRoot.alerts).length
    || asArray(irregularLegacy.alerts).length
  const spo2Root = asObject(e.spo2)
  const spo2Value = Object.keys(asObject(spo2Root.value)).length
    ? asObject(spo2Root.value)
    : asObject(asArray(spo2Root.spo2).at(-1)?.value)
  const stageTimeline = sleepStageTimeline(sleepRecord)
  const stepsTrend = readTrend(e.stepsTrend, 'activities-steps')
  const caloriesTrend = readTrend(e.caloriesTrend, 'activities-calories')
  const heartTrendRaw = asArray(asObject(e.heartTrend)['activities-heart'])
  const heartTrend = new Map(heartTrendRaw.map((point) => [
    String(point.dateTime),
    numeric(asObject(point.value).restingHeartRate),
  ]))
  const sleepTrendRecords = asArray(asObject(e.sleepTrend).sleep)
  const sleepTrend = new Map(sleepTrendRecords.filter((item) => item.isMainSleep !== false).map((item) => [
    String(item.dateOfSleep),
    { minutes: numeric(item.minutesAsleep), score: numeric(item.sleepScore), efficiency: numeric(item.efficiency) },
  ]))
  const metricTrend = new Map(asArray(asObject(e.metricTrends).values).map((item) => [String(item.dateTime), item]))
  const selectedMetric = asObject(metricTrend.get(payload.date))
  const weightTrendRecords = asArray(asObject(e.bodyWeight).weight)
  const weightTrend = new Map(weightTrendRecords.map((item) => [String(item.date), numeric(item.weight)]))
  const allDates = new Set([
    ...stepsTrend.keys(),
    ...heartTrend.keys(),
    ...sleepTrend.keys(),
    ...weightTrend.keys(),
    ...metricTrend.keys(),
  ])
  const trends: TrendPoint[] = [...allDates].sort().map((date) => {
    const metric = asObject(metricTrend.get(date))
    return {
      date,
      label: shortDay(date),
      steps: stepsTrend.get(date) ?? null,
      calories: caloriesTrend.get(date) ?? null,
      distanceKm: numeric(metric.distanceKm),
      floors: numeric(metric.floors),
      activeMinutes: numeric(metric.activeMinutes),
      zoneMinutes: numeric(metric.zoneMinutes),
      sedentaryMinutes: numeric(metric.sedentaryMinutes),
      restingHeartRate: heartTrend.get(date) ?? null,
      hrvMs: numeric(metric.hrvMs),
      breathingRate: numeric(metric.breathingRate),
      spo2: numeric(metric.spo2),
      skinTemperature: numeric(metric.skinTemperature),
      coreTemperature: numeric(metric.coreTemperature),
      cardioScore: numeric(metric.cardioScore),
      strain: numeric(metric.strain),
      recoveryScore: numeric(metric.recoveryScore),
      sleepPerformance: numeric(metric.sleepPerformance),
      sleepMinutes: sleepTrend.get(date)?.minutes ?? null,
      sleepScore: sleepTrend.get(date)?.score ?? null,
      sleepEfficiency: sleepTrend.get(date)?.efficiency ?? numeric(metric.sleepEfficiency),
      weight: weightTrend.get(date) ?? null,
      bodyFat: numeric(metric.bodyFat),
      waterMl: numeric(metric.waterMl),
      caloriesIn: numeric(metric.caloriesIn),
    }
  })
  const lightActiveMinutes = numeric(activity?.lightlyActiveMinutes)
  const moderateActiveMinutes = numeric(activity?.fairlyActiveMinutes)
  const vigorousActiveMinutes = numeric(activity?.veryActiveMinutes)
  const activeMinuteParts = [moderateActiveMinutes, vigorousActiveMinutes]
  const activeMinutes = activeMinuteParts.some((value) => value !== null)
    ? activeMinuteParts.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null
  const currentHeartRate = rawHeartPoints.at(-1)?.value ?? null
  const heartValues = rawHeartPoints.map((point) => point.value)
  const zoneMinutes = asObject(activity?.activeZoneMinutes).totalMinutes ?? activity?.activeZoneMinutes
  const cardioValue = asObject(cardio?.value)
  const vo2Max = cardioValue.vo2Max ? String(cardioValue.vo2Max) : null
  const cardioScore = vo2Max ? numeric(vo2Max.split('-').at(-1)?.trim()) : null

  return {
    source: payload.source === 'google-health' ? 'google-health' : payload.source === 'whoop' ? 'whoop' : 'fitbit',
    selectedDate: payload.date,
    generatedAt: payload.generatedAt,
    profile: {
      displayName: String(profile.displayName ?? profile.fullName ?? 'Atleta'),
      avatar: profile.avatar640 ?? profile.avatar150 ?? profile.avatar ?? null,
      memberSince: profile.memberSince ?? null,
      timezone: profile.timezone ?? null,
    },
    device: device ? {
      id: device.id ? String(device.id) : null,
      name: String(device.deviceVersion ?? device.type ?? 'Fitbit'),
      type: device.type ?? null,
      battery: device.battery ?? null,
      batteryLevel: numeric(device.batteryLevel),
      lastSyncTime: device.lastSyncTime ?? null,
      firmware: device.firmwareVersion ?? null,
      features: asArray<string>(device.features),
    } : null,
    activity: {
      steps: numeric(activity?.steps) ?? (stepsIntraday.length
        ? stepsIntraday.reduce((sum, point) => sum + point.value, 0)
        : null),
      stepsGoal: numeric(goals?.steps),
      calories: numeric(activity?.caloriesOut),
      caloriesGoal: numeric(goals?.caloriesOut),
      distanceKm: numeric(asArray(activity?.distances).find((item) => item.activity === 'total')?.distance),
      distanceGoalKm: numeric(goals?.distance),
      floors: numeric(activity?.floors),
      floorsGoal: numeric(goals?.floors),
      activeMinutes,
      lightActiveMinutes,
      moderateActiveMinutes,
      vigorousActiveMinutes,
      activeMinutesGoal: numeric(goals?.activeMinutes),
      zoneMinutes: numeric(zoneMinutes),
      sedentaryMinutes: numeric(activity?.sedentaryMinutes),
      stepsIntraday,
      caloriesIntraday: readIntraday(e.caloriesIntraday, 'activities-calories-intraday'),
    },
    health: {
      currentHeartRate,
      restingHeartRate: numeric(heartSummary.restingHeartRate),
      heartRateMin: heartValues.length ? Math.min(...heartValues) : null,
      heartRateMax: heartValues.length ? Math.max(...heartValues) : null,
      heartRateIntraday: heartPoints,
      hrvMs: firstNumber(hrvValue.dailyRmssd, hrvValue.deepRmssd),
      hrvDeepSleepRmssdMs: numeric(hrvValue.deepRmssd),
      hrvEntropy: numeric(hrvValue.entropy),
      nonRemHeartRate: numeric(hrvValue.nonRemHeartRate),
      breathingRate: numeric(breathing?.value?.breathingRate),
      spo2: numeric(spo2Value.avg),
      spo2Min: firstNumber(spo2Value.min, spo2Value.lowerBound),
      spo2Max: firstNumber(spo2Value.max, spo2Value.upperBound),
      skinTemperature: firstNumber(skinTemp?.value?.nightlyRelative, skinTemp?.value),
      skinNightlyTemperatureCelsius: numeric(skinTempValue.nightlyTemperatureCelsius),
      skinBaselineTemperatureCelsius: numeric(skinTempValue.baselineTemperatureCelsius),
      skinTemperatureStddev30dCelsius: firstNumber(
        skinTempValue.relativeNightlyStddev30dCelsius,
        skinTempValue.stddev30dCelsius,
      ),
      coreTemperature: firstNumber(coreTemp?.value?.coreTemperature, coreTemp?.value),
      vo2Max,
      cardioScore,
      strain: numeric(selectedMetric.strain),
      recoveryScore: numeric(selectedMetric.recoveryScore),
      ecgClassification: ecg?.resultClassification ? String(ecg.resultClassification).replaceAll('_', ' ') : null,
      bloodGlucoseMgDl: firstNumber(
        glucosePoint?.bloodGlucose?.bloodGlucoseMilligramsPerDeciliter,
        glucosePoint?.bloodGlucose?.milligramsPerDeciliter,
        glucosePoint?.value,
        glucoseRoot.value,
      ),
      irregularRhythmAlerts: irregularAvailable ? irregularAlerts : null,
    },
    sleep: {
      totalMinutes: numeric(sleepRecord?.minutesAsleep),
      goalMinutes: numeric(sleepGoal.minDuration),
      score: numeric(sleepRecord?.sleepScore),
      performance: firstNumber(sleepRecord?.sleepPerformance, selectedMetric.sleepPerformance),
      efficiency: numeric(sleepRecord?.efficiency),
      startTime: sleepRecord?.startTime ?? null,
      endTime: sleepRecord?.endTime ?? null,
      stages: sleepStages(sleepRecord),
      stageTimeline,
      stageTransitions: sleepStageTransitions(sleepRecord, stageTimeline),
      minutesToFallAsleep: numeric(sleepRecord?.minutesToFallAsleep),
      minutesAfterWakeUp: numeric(sleepRecord?.minutesAfterWakeUp),
      timeInBed: numeric(sleepRecord?.timeInBed),
      minutesAwake: numeric(sleepRecord?.minutesAwake),
    },
    body: {
      weightKg: numeric(latestWeight?.weight),
      weightGoalKg: numeric(weightGoal.weight),
      bmi: numeric(latestWeight?.bmi ?? profile.bmi),
      bodyFat: numeric(latestFat?.fat ?? profile.bodyFat),
      waterMl: numeric(waterSummary.water),
      waterGoalMl: numeric(waterGoal.goal),
      caloriesIn: numeric(foodSummary.calories),
    },
    trends,
    activities: parseActivities(e.activities),
    insights: buildInsights(activity, heartSummary, sleepRecord, goals),
    sync: {
      endpointCount: payload.requestStats?.total ?? Object.keys(e).length + payload.errors.length,
      successCount: payload.requestStats?.succeeded ?? Object.keys(e).length,
      errors: payload.errors.map(({ key, message }) => ({ key, message })),
      rateLimitRemaining: payload.rateLimit.remaining,
    },
  }
}

function buildInsights(activity: Json, heart: Json, sleep: Json | null, goals: Json): DashboardData['insights'] {
  const insights: DashboardData['insights'] = []
  const steps = numeric(activity.steps)
  const stepsGoal = numeric(goals.steps)
  if (steps !== null) {
    insights.push({
      id: 'steps',
      tone: 'mint',
      title: stepsGoal !== null && steps >= stepsGoal ? 'Step goal reached' : 'Movement recorded',
      body: stepsGoal === null
        ? `You recorded ${steps.toLocaleString('en-US')} steps on the selected day.`
        : steps >= stepsGoal
          ? `You exceeded your personal goal of ${stepsGoal.toLocaleString('en-US')} steps.`
          : `You are ${Math.max(0, stepsGoal - steps).toLocaleString('en-US')} steps away from your personal goal.`,
    })
  }
  const sleepEfficiency = numeric(sleep?.efficiency)
  if (sleep && sleepEfficiency !== null) {
    insights.push({
      id: 'sleep',
      tone: 'violet',
      title: 'Sleep efficiency recorded',
      body: `The recorded night has ${sleepEfficiency}% efficiency. Compare it with your trend, not with a single night.`,
    })
  }
  if (numeric(heart.restingHeartRate) !== null) {
    insights.push({
      id: 'heart',
      tone: 'blue',
      title: 'Resting heart rate detected',
      body: `${heart.restingHeartRate} bpm: compare it with your trend, not with a single day.`,
    })
  }
  return insights
}

export function dataForDate(data: DashboardData, date: string) {
  if (data.source === 'demo') return createDemoData(date)
  return { ...data, selectedDate: date }
}
