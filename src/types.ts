export type PageId = 'today' | 'activity' | 'health' | 'sleep' | 'body' | 'devices'

export type DataSource = 'demo' | 'fitbit' | 'google-health' | 'whoop' | 'cache'

export type HealthProvider = 'google-health' | 'fitbit-legacy' | 'whoop'

export interface TimePoint {
  time: string
  value: number
}

export interface TrendPoint {
  date: string
  label: string
  steps: number | null
  calories: number | null
  distanceKm: number | null
  floors: number | null
  activeMinutes: number | null
  zoneMinutes: number | null
  sedentaryMinutes: number | null
  restingHeartRate: number | null
  hrvMs: number | null
  breathingRate: number | null
  spo2: number | null
  skinTemperature: number | null
  coreTemperature: number | null
  cardioScore: number | null
  strain: number | null
  recoveryScore: number | null
  sleepPerformance: number | null
  sleepMinutes: number | null
  sleepScore: number | null
  sleepEfficiency: number | null
  weight: number | null
  bodyFat: number | null
  waterMl: number | null
  caloriesIn: number | null
}

export interface ActivityItem {
  id: string
  name: string
  date: string
  time: string
  durationMinutes: number
  calories: number | null
  distanceKm: number | null
  averageHeartRate: number | null
  zoneMinutes: number | null
  steps: number | null
  averagePaceSecondsPerMeter: number | null
  heartZoneMinutes: HeartZoneMinutes | null
}

export type SleepStageKey = 'deep' | 'light' | 'rem' | 'wake'

export interface HeartZoneMinutes {
  light: number | null
  moderate: number | null
  vigorous: number | null
  peak: number | null
}

export interface SleepStage {
  name: 'Deep' | 'Light' | 'REM' | 'Awake'
  key: SleepStageKey
  minutes: number
  color: string
}

export interface SleepStageSegment {
  startTime: string
  endTime: string
  type: SleepStageKey
}

export interface SleepStageCounts {
  deep: number | null
  light: number | null
  rem: number | null
  wake: number | null
}

export interface DashboardData {
  source: DataSource
  selectedDate: string
  generatedAt: string
  profile: {
    displayName: string
    avatar: string | null
    memberSince: string | null
    timezone: string | null
  }
  device: {
    id: string | null
    name: string
    type: string | null
    battery: string | null
    batteryLevel: number | null
    lastSyncTime: string | null
    firmware: string | null
    features: string[]
  } | null
  activity: {
    steps: number | null
    stepsGoal: number | null
    calories: number | null
    caloriesGoal: number | null
    distanceKm: number | null
    distanceGoalKm: number | null
    floors: number | null
    floorsGoal: number | null
    activeMinutes: number | null
    lightActiveMinutes: number | null
    moderateActiveMinutes: number | null
    vigorousActiveMinutes: number | null
    activeMinutesGoal: number | null
    zoneMinutes: number | null
    sedentaryMinutes: number | null
    stepsIntraday: TimePoint[]
    caloriesIntraday: TimePoint[]
  }
  health: {
    currentHeartRate: number | null
    restingHeartRate: number | null
    heartRateMin: number | null
    heartRateMax: number | null
    heartRateIntraday: TimePoint[]
    hrvMs: number | null
    hrvDeepSleepRmssdMs: number | null
    hrvEntropy: number | null
    nonRemHeartRate: number | null
    breathingRate: number | null
    spo2: number | null
    spo2Min: number | null
    spo2Max: number | null
    skinTemperature: number | null
    skinNightlyTemperatureCelsius: number | null
    skinBaselineTemperatureCelsius: number | null
    skinTemperatureStddev30dCelsius: number | null
    coreTemperature: number | null
    vo2Max: string | null
    cardioScore: number | null
    strain: number | null
    recoveryScore: number | null
    ecgClassification: string | null
    bloodGlucoseMgDl: number | null
    irregularRhythmAlerts: number | null
  }
  sleep: {
    totalMinutes: number | null
    goalMinutes: number | null
    score: number | null
    performance: number | null
    efficiency: number | null
    startTime: string | null
    endTime: string | null
    stages: SleepStage[]
    stageTimeline: SleepStageSegment[]
    stageTransitions: SleepStageCounts
    minutesToFallAsleep: number | null
    minutesAfterWakeUp: number | null
    timeInBed: number | null
    minutesAwake: number | null
  }
  body: {
    weightKg: number | null
    weightGoalKg: number | null
    bmi: number | null
    bodyFat: number | null
    waterMl: number | null
    waterGoalMl: number | null
    caloriesIn: number | null
  }
  trends: TrendPoint[]
  activities: ActivityItem[]
  insights: Array<{
    id: string
    tone: 'mint' | 'blue' | 'amber' | 'violet'
    title: string
    body: string
  }>
  sync: {
    endpointCount: number
    successCount: number
    errors: Array<{ key: string; message: string }>
    rateLimitRemaining: number | null
  }
}

export interface RawFitbitPayload {
  source: 'fitbit' | 'google-health' | 'whoop'
  date: string
  generatedAt: string
  cacheHit?: boolean
  endpoints: Record<string, unknown>
  errors: Array<{ key: string; message: string; status?: number }>
  rateLimit: {
    limit: number | null
    remaining: number | null
    resetSeconds: number | null
  }
  requestStats?: {
    total: number
    succeeded: number
    successfulKeys?: string[]
  }
}

export interface RawHealthArchive {
  version: number
  lastDate: string | null
  days: Record<string, RawFitbitPayload>
}

export interface FitbitAuthStatus {
  isElectron: boolean
  configured: boolean
  connected: boolean
  clientId: string
  redirectUri: string
  hasClientSecret: boolean
  storageEncrypted: boolean
  lastSyncAt: string | null
  provider: HealthProvider
}

export interface FitbitConfigInput {
  provider: HealthProvider
  clientId: string
  clientSecret?: string
  redirectUri: string
}

export interface FitbitBridge {
  getStatus: () => Promise<FitbitAuthStatus>
  saveConfig: (config: FitbitConfigInput) => Promise<FitbitAuthStatus>
  connect: () => Promise<{ ok: boolean; message?: string }>
  disconnect: () => Promise<FitbitAuthStatus>
  sync: (date: string) => Promise<RawFitbitPayload>
  getCachedData: () => Promise<RawFitbitPayload | null>
  getCachedArchive: () => Promise<RawHealthArchive>
  exportData: () => Promise<{ canceled: boolean; path?: string }>
  openExternal: (url: string) => Promise<void>
  onAuthComplete: (callback: (result: { ok: boolean; error?: string }) => void) => () => void
  onSyncProgress: (callback: (progress: { completed: number; total: number; key: string; date?: string }) => void) => () => void
}

export interface HealthAssistantStatus {
  available: boolean
  connected: boolean
  authenticated: boolean
  version: string | null
  error?: string
}

export type HealthAssistantEvent =
  | { requestId: string; type: 'delta'; delta: string }
  | { requestId: string; type: 'complete'; text?: string }
  | { requestId: string; type: 'error'; message: string }
  | { requestId: string; type: 'cancelled' }

export interface HealthAssistantBridge {
  getStatus: () => Promise<HealthAssistantStatus>
  startTurn: (input: {
    requestId: string
    message: string
    healthContext: string
  }) => Promise<{ requestId: string }>
  cancel: (requestId: string) => Promise<void>
  reset: () => Promise<void>
  onEvent: (callback: (event: HealthAssistantEvent) => void) => () => void
}
