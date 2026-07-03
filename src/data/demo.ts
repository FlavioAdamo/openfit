import type { ActivityItem, DashboardData, SleepStage, SleepStageKey, SleepStageSegment, TimePoint, TrendPoint } from '../types'

const dayMs = 86_400_000

function localIso(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function dateFromIso(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function seeded(index: number, salt: number) {
  return Math.sin(index * 12.9898 + salt * 78.233) * 0.5 + 0.5
}

function makeTrends(selectedDate: string): TrendPoint[] {
  const end = dateFromIso(selectedDate)
  const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(end.getTime() - (13 - index) * dayMs)
    const activityWave = Math.sin(index * 0.9) * 1_350
    const steps = Math.round(7_200 + activityWave + seeded(index, 2) * 3_100)
    const sleepMinutes = Math.round(390 + seeded(index, 4) * 85)
    const activeMinutes = Math.round(38 + seeded(index, 5) * 48)
    return {
      date: localIso(date),
      label: formatter.format(date).replace('.', ''),
      steps,
      calories: Math.round(1_750 + steps * 0.055),
      distanceKm: Number((steps * 0.00079).toFixed(2)),
      floors: Math.round(5 + seeded(index, 9) * 11),
      activeMinutes,
      zoneMinutes: Math.round(activeMinutes * (0.72 + seeded(index, 10) * 0.45)),
      sedentaryMinutes: Math.round(480 + seeded(index, 11) * 130),
      restingHeartRate: Math.round(59 + seeded(index, 6) * 7),
      hrvMs: Math.round(42 + seeded(index, 12) * 14),
      breathingRate: Number((14.1 + seeded(index, 13) * 1.5).toFixed(1)),
      spo2: Number((96.2 + seeded(index, 14) * 1.6).toFixed(1)),
      skinTemperature: Number((-0.35 + seeded(index, 15) * 0.7).toFixed(1)),
      coreTemperature: null,
      cardioScore: Math.round(49 + seeded(index, 16) * 5),
      strain: null,
      recoveryScore: null,
      sleepPerformance: null,
      sleepMinutes,
      sleepScore: null,
      sleepEfficiency: Math.round(86 + seeded(index, 17) * 9),
      weight: Number((72.8 - index * 0.045 + seeded(index, 3) * 0.28).toFixed(1)),
      bodyFat: Number((16.9 - index * 0.012 + seeded(index, 18) * 0.4).toFixed(1)),
      waterMl: Math.round(1_650 + seeded(index, 19) * 850),
      caloriesIn: Math.round(1_720 + seeded(index, 20) * 520),
    }
  })
}

function makeHeartSeries(): TimePoint[] {
  return Array.from({ length: 48 }, (_, index) => {
    const hours = Math.floor(index / 2)
    const minutes = index % 2 ? '30' : '00'
    const base = hours < 7 ? 58 : hours < 17 ? 74 : 69
    const training = hours === 18 || hours === 19 ? 55 * Math.sin(((index - 35) / 8) * Math.PI) : 0
    return {
      time: `${String(hours).padStart(2, '0')}:${minutes}`,
      value: Math.round(base + Math.sin(index * 0.7) * 5 + Math.max(0, training)),
    }
  })
}

function makeStepsSeries(): TimePoint[] {
  const values = [0, 0, 0, 0, 0, 0, 45, 420, 510, 180, 230, 340, 680, 320, 210, 460, 290, 370, 1720, 1420, 610, 280, 90, 18]
  return values.map((value, index) => ({
    time: `${String(index).padStart(2, '0')}:00`,
    value,
  }))
}

const stages: SleepStage[] = [
  { name: 'Deep', key: 'deep', minutes: 81, color: '#555b64' },
  { name: 'Light', key: 'light', minutes: 218, color: '#858c95' },
  { name: 'REM', key: 'rem', minutes: 96, color: '#bcc1c7' },
  { name: 'Awake', key: 'wake', minutes: 38, color: '#363a40' },
]

function makeSleepTimeline(selectedDate: string): SleepStageSegment[] {
  const endDate = dateFromIso(selectedDate)
  const start = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 1, 23, 42)
  const sequence: Array<[SleepStageKey, number]> = [
    ['light', 25], ['deep', 35], ['light', 42], ['rem', 18], ['wake', 5],
    ['light', 35], ['deep', 30], ['light', 40], ['rem', 28], ['wake', 8],
    ['light', 36], ['deep', 16], ['light', 40], ['rem', 25], ['wake', 10],
    ['rem', 25], ['wake', 15],
  ]
  let cursor = start.getTime()
  return sequence.map(([type, minutes]) => {
    const startTime = new Date(cursor).toISOString()
    cursor += minutes * 60_000
    return { type, startTime, endTime: new Date(cursor).toISOString() }
  })
}

function makeActivities(selectedDate: string): ActivityItem[] {
  return [
    {
      id: 'run-demo',
      name: 'Outdoor run',
      date: selectedDate,
      time: '18:24',
      durationMinutes: 38,
      calories: 438,
      distanceKm: 6.24,
      averageHeartRate: 148,
      strain: 12.4,
      zoneMinutes: 52,
      steps: 7_842,
      averagePaceSecondsPerMeter: 38 * 60 / 6_240,
      heartZoneMinutes: { light: 6, moderate: 10, vigorous: 15, peak: 7 },
    },
    {
      id: 'walk-demo',
      name: 'Walk',
      date: selectedDate,
      time: '12:46',
      durationMinutes: 24,
      calories: 116,
      distanceKm: 1.72,
      averageHeartRate: 101,
      strain: 4.2,
      zoneMinutes: 8,
      steps: 2_236,
      averagePaceSecondsPerMeter: 24 * 60 / 1_720,
      heartZoneMinutes: { light: 16, moderate: 8, vigorous: 0, peak: 0 },
    },
    {
      id: 'strength-demo',
      name: 'Functional training',
      date: localIso(new Date(dateFromIso(selectedDate).getTime() - dayMs)),
      time: '19:08',
      durationMinutes: 46,
      calories: 326,
      distanceKm: null,
      averageHeartRate: 126,
      strain: 9.6,
      zoneMinutes: 34,
      steps: null,
      averagePaceSecondsPerMeter: null,
      heartZoneMinutes: { light: 10, moderate: 15, vigorous: 18, peak: 3 },
    },
  ]
}

export function createDemoData(selectedDate = localIso()): DashboardData {
  const trends = makeTrends(selectedDate)
  const latest = trends.at(-1)!
  const latestSteps = latest.steps ?? 0
  const latestSleepMinutes = latest.sleepMinutes ?? 0
  const stepsIntraday = makeStepsSeries()
  const heartRateIntraday = makeHeartSeries()

  return {
    source: 'demo',
    selectedDate,
    generatedAt: new Date().toISOString(),
    profile: {
      displayName: 'Flavio',
      avatar: null,
      memberSince: '2021-03-12',
      timezone: 'Europe/Rome',
    },
    device: {
      id: 'demo-tracker',
      name: 'Google Fitbit Air',
      type: 'SCREENLESS FITNESS TRACKER',
      battery: 'High',
      batteryLevel: 82,
      lastSyncTime: new Date(Date.now() - 6 * 60_000).toISOString(),
      firmware: '20001.194.91',
      features: ['STEPS', 'HEART_RATE', 'SLEEP', 'SPO2', 'SKIN_TEMPERATURE', 'ACTIVE_ZONE_MINUTES'],
    },
    activity: {
      steps: latest.steps,
      stepsGoal: 10_000,
      calories: latest.calories,
      caloriesGoal: 2_450,
      distanceKm: latest.distanceKm,
      distanceGoalKm: 8,
      floors: latest.floors,
      floorsGoal: 10,
      activeMinutes: latest.activeMinutes,
      lightActiveMinutes: 245,
      moderateActiveMinutes: Math.max(0, (latest.activeMinutes ?? 0) - 22),
      vigorousActiveMinutes: 22,
      activeMinutesGoal: 60,
      zoneMinutes: latest.zoneMinutes,
      sedentaryMinutes: latest.sedentaryMinutes,
      stepsIntraday,
      caloriesIntraday: stepsIntraday.map((point, index) => ({
        time: point.time,
        value: Math.round(62 + point.value * 0.055 + Math.sin(index) * 5),
      })),
    },
    health: {
      currentHeartRate: 72,
      restingHeartRate: latest.restingHeartRate,
      heartRateMin: 53,
      heartRateMax: 171,
      heartRateIntraday,
      hrvMs: latest.hrvMs,
      hrvDeepSleepRmssdMs: (latest.hrvMs ?? 0) + 7,
      hrvEntropy: 3.61,
      nonRemHeartRate: 57,
      breathingRate: latest.breathingRate,
      spo2: latest.spo2,
      spo2Min: (latest.spo2 ?? 97) - 1.8,
      spo2Max: Math.min(100, (latest.spo2 ?? 97) + 1.1),
      skinTemperature: latest.skinTemperature,
      skinNightlyTemperatureCelsius: 33.63,
      skinBaselineTemperatureCelsius: 33.55,
      skinTemperatureStddev30dCelsius: 0.13,
      coreTemperature: null,
      vo2Max: '49–53',
      cardioScore: latest.cardioScore,
      strain: latest.strain,
      recoveryScore: latest.recoveryScore,
      ecgClassification: 'Ritmo sinusale',
      bloodGlucoseMgDl: null,
      irregularRhythmAlerts: 0,
    },
    sleep: {
      totalMinutes: latest.sleepMinutes,
      goalMinutes: 480,
      score: latest.sleepScore,
      performance: latest.sleepPerformance,
      efficiency: latest.sleepEfficiency,
      startTime: `${localIso(new Date(dateFromIso(selectedDate).getTime() - dayMs))}T23:42:00`,
      endTime: `${selectedDate}T06:55:00`,
      stages,
      stageTimeline: makeSleepTimeline(selectedDate),
      stageTransitions: { deep: 3, light: 6, rem: 4, wake: 4 },
      minutesToFallAsleep: 0,
      minutesAfterWakeUp: 0,
      timeInBed: 433,
      minutesAwake: 38,
    },
    body: {
      weightKg: latest.weight,
      weightGoalKg: 71.5,
      bmi: 22.6,
      bodyFat: latest.bodyFat,
      waterMl: latest.waterMl,
      waterGoalMl: 2_500,
      caloriesIn: latest.caloriesIn,
    },
    trends,
    activities: makeActivities(selectedDate),
    insights: [
      {
        id: 'activity',
        tone: 'mint',
        title: latestSteps >= 10_000 ? 'Step goal reached' : 'Movement recorded',
        body: latestSteps >= 10_000
          ? 'You exceeded your personal goal of 10,000 steps.'
          : `You are ${(10_000 - latestSteps).toLocaleString('en-US')} steps away from your personal goal.`,
      },
      {
        id: 'sleep',
        tone: 'violet',
        title: 'Sleep duration',
        body: `${latestSleepMinutes < 480 ? `${480 - latestSleepMinutes} minutes short` : 'Goal reached'} compared with your personal goal.`,
      },
      {
        id: 'heart',
        tone: 'blue',
        title: 'Resting heart rate detected',
        body: `${latest.restingHeartRate} bpm: compare it with your personal trend, not with a single day.`,
      },
    ],
    sync: {
      endpointCount: 25,
      successCount: 25,
      errors: [],
      rateLimitRemaining: 126,
    },
  }
}

export { localIso }
