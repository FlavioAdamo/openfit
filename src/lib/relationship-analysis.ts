import type { ActivityItem, DashboardData, TrendPoint } from '@/types'

export interface RelationshipVariable {
  key: string
  label: string
  unit: string
  kind: 'metric' | 'habit' | 'derived-habit'
}

export interface ModelContribution {
  variable: RelationshipVariable
  coefficient: number
  influencePercent: number
  direction: 'positive' | 'negative'
}

export interface OutcomeModelPoint {
  date: string
  actual: number
  predicted: number
}

export interface OutcomeModelResult {
  outcome: RelationshipVariable
  predictors: RelationshipVariable[]
  sampleCount: number
  explainedVariance: number
  intercept: number
  contributions: ModelContribution[]
  points: OutcomeModelPoint[]
}

type ActivitySummary = {
  sessionCount: number
  workoutMinutes: number
  workoutCalories: number
  workoutStrain: number
  lowZoneMinutes: number
  highZoneMinutes: number
  workoutHeartRate: number | null
  sportMinutes: Map<string, number>
}

type HistoricalContext = {
  previousTrend: TrendPoint | null
  previousActivity: ActivitySummary
  sleepMinutes7dAvg: number | null
  sleepEfficiency7dAvg: number | null
  sleepScore7dAvg: number | null
  sleepMinutes7dSd: number | null
  sleepEfficiency7dSd: number | null
  workoutMinutes7dAvg: number | null
  workoutStrain7dAvg: number | null
  highZoneMinutes7dAvg: number | null
  workoutHeartRate7dAvg: number | null
  workoutCount7dTotal: number | null
  workoutMinutes7dSd: number | null
}

type DriverDefinition = RelationshipVariable & {
  accessor: (point: TrendPoint, activity: ActivitySummary, sportKeys: string[], context: HistoricalContext) => number | null
  isBinary?: boolean
}

type OutcomeDefinition = RelationshipVariable & {
  accessor: (point: TrendPoint) => number | null
}

export const recoveryOutcome: RelationshipVariable = {
  key: 'recoveryScore',
  label: 'Recovery',
  unit: '%',
  kind: 'metric',
}

export const modelOutcomes: OutcomeDefinition[] = [
  { ...recoveryOutcome, accessor: (point) => point.recoveryScore },
  { key: 'hrvMs', label: 'HRV', unit: 'ms', kind: 'metric', accessor: (point) => point.hrvMs },
  { key: 'restingHeartRate', label: 'Resting heart rate', unit: 'bpm', kind: 'metric', accessor: (point) => point.restingHeartRate },
  { key: 'breathingRate', label: 'Breathing rate', unit: 'rpm', kind: 'metric', accessor: (point) => point.breathingRate },
  { key: 'spo2', label: 'SpO2', unit: '%', kind: 'metric', accessor: (point) => point.spo2 },
  { key: 'strain', label: 'Strain', unit: '', kind: 'metric', accessor: (point) => point.strain },
]

export const recoveryDrivers: RelationshipVariable[] = [
  { key: 'steps', label: 'Steps', unit: 'steps', kind: 'metric' },
  { key: 'calories', label: 'Calories burned', unit: 'kcal', kind: 'metric' },
  { key: 'distanceKm', label: 'Distance', unit: 'km', kind: 'metric' },
  { key: 'activeMinutes', label: 'Active minutes', unit: 'min', kind: 'metric' },
  { key: 'zoneMinutes', label: 'Zone minutes', unit: 'min', kind: 'metric' },
  { key: 'sedentaryMinutes', label: 'Sedentary time', unit: 'min', kind: 'metric' },
  { key: 'sleepMinutes', label: 'Sleep duration', unit: 'min', kind: 'metric' },
  { key: 'sleepEfficiency', label: 'Sleep efficiency', unit: '%', kind: 'metric' },
  { key: 'sleepPerformance', label: 'Sleep score', unit: '%', kind: 'metric' },
  { key: 'workoutMinutes', label: 'Workout minutes', unit: 'min', kind: 'metric' },
  { key: 'workoutCalories', label: 'Workout calories', unit: 'kcal', kind: 'metric' },
  { key: 'lowZoneMinutes', label: 'Low-zone activity', unit: 'min', kind: 'metric' },
  { key: 'highZoneMinutes', label: 'High-zone activity', unit: 'min', kind: 'metric' },
  { key: 'workoutStrain', label: 'Workout strain', unit: '', kind: 'metric' },
  { key: 'previousSleepMinutes', label: 'Previous-night sleep', unit: 'min', kind: 'metric' },
  { key: 'previousSleepEfficiency', label: 'Previous-night sleep efficiency', unit: '%', kind: 'metric' },
  { key: 'sleepMinutes7dAvg', label: '7d sleep duration', unit: 'min', kind: 'metric' },
  { key: 'sleepEfficiency7dAvg', label: '7d sleep efficiency', unit: '%', kind: 'metric' },
  { key: 'sleepMinutes7dSd', label: 'Sleep duration variability', unit: 'min', kind: 'metric' },
  { key: 'previousWorkoutStrain', label: 'Previous-day workout strain', unit: '', kind: 'metric' },
  { key: 'highZoneMinutes7dAvg', label: '7d high-zone activity', unit: 'min', kind: 'metric' },
  { key: 'workoutCount7dTotal', label: '7d workout count', unit: '', kind: 'metric' },
]

const baseDrivers: DriverDefinition[] = [
  { key: 'steps', label: 'Steps', unit: 'steps', kind: 'metric', accessor: (point) => point.steps },
  { key: 'calories', label: 'Calories burned', unit: 'kcal', kind: 'metric', accessor: (point) => point.calories },
  { key: 'distanceKm', label: 'Distance', unit: 'km', kind: 'metric', accessor: (point) => point.distanceKm },
  { key: 'activeMinutes', label: 'Active minutes', unit: 'min', kind: 'metric', accessor: (point) => point.activeMinutes },
  { key: 'zoneMinutes', label: 'Zone minutes', unit: 'min', kind: 'metric', accessor: (point) => point.zoneMinutes },
  { key: 'sedentaryMinutes', label: 'Sedentary time', unit: 'min', kind: 'metric', accessor: (point) => point.sedentaryMinutes },
  { key: 'sleepMinutes', label: 'Sleep duration', unit: 'min', kind: 'metric', accessor: (point) => point.sleepMinutes },
  { key: 'sleepEfficiency', label: 'Sleep efficiency', unit: '%', kind: 'metric', accessor: (point) => point.sleepEfficiency },
  { key: 'sleepPerformance', label: 'Sleep score', unit: '%', kind: 'metric', accessor: (point) => point.sleepScore ?? point.sleepPerformance },
  { key: 'workoutMinutes', label: 'Workout minutes', unit: 'min', kind: 'metric', accessor: (_point, activity) => activity.workoutMinutes },
  { key: 'workoutCalories', label: 'Workout calories', unit: 'kcal', kind: 'metric', accessor: (_point, activity) => activity.workoutCalories },
  { key: 'workoutStrain', label: 'Workout strain', unit: '', kind: 'metric', accessor: (_point, activity) => activity.workoutStrain },
  { key: 'sessionCount', label: 'Workout count', unit: '', kind: 'metric', accessor: (_point, activity) => activity.sessionCount },
  { key: 'lowZoneMinutes', label: 'Low-zone activity', unit: 'min', kind: 'metric', accessor: (_point, activity) => activity.lowZoneMinutes },
  { key: 'highZoneMinutes', label: 'High-zone activity', unit: 'min', kind: 'metric', accessor: (_point, activity) => activity.highZoneMinutes },
  { key: 'workoutHeartRate', label: 'Workout heart rate', unit: 'bpm', kind: 'metric', accessor: (_point, activity) => activity.workoutHeartRate },
  { key: 'trained60Minutes', label: 'Trained at least 60 min', unit: '', kind: 'derived-habit', isBinary: true, accessor: (_point, activity) => activity.workoutMinutes >= 60 ? 1 : 0 },
  { key: 'highZone20Minutes', label: 'Zone 4-5 at least 20 min', unit: '', kind: 'derived-habit', isBinary: true, accessor: (_point, activity) => activity.highZoneMinutes >= 20 ? 1 : 0 },
  { key: 'trainedToday', label: 'Any workout today', unit: '', kind: 'derived-habit', isBinary: true, accessor: (_point, activity) => activity.sessionCount > 0 ? 1 : 0 },
  { key: 'previousSleepMinutes', label: 'Previous-night sleep', unit: 'min', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.previousTrend?.sleepMinutes ?? null },
  { key: 'previousSleepEfficiency', label: 'Previous-night sleep efficiency', unit: '%', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.previousTrend?.sleepEfficiency ?? null },
  { key: 'previousSleepScore', label: 'Previous-night sleep score', unit: '%', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.previousTrend?.sleepScore ?? context.previousTrend?.sleepPerformance ?? null },
  { key: 'sleepMinutes7dAvg', label: '7d sleep duration', unit: 'min', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.sleepMinutes7dAvg },
  { key: 'sleepEfficiency7dAvg', label: '7d sleep efficiency', unit: '%', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.sleepEfficiency7dAvg },
  { key: 'sleepScore7dAvg', label: '7d sleep score', unit: '%', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.sleepScore7dAvg },
  { key: 'sleepMinutes7dSd', label: 'Sleep duration variability', unit: 'min', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.sleepMinutes7dSd },
  { key: 'sleepEfficiency7dSd', label: 'Sleep efficiency variability', unit: '%', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.sleepEfficiency7dSd },
  { key: 'previousWorkoutMinutes', label: 'Previous-day workout minutes', unit: 'min', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.previousActivity.workoutMinutes },
  { key: 'previousWorkoutStrain', label: 'Previous-day workout strain', unit: '', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.previousActivity.workoutStrain },
  { key: 'previousHighZoneMinutes', label: 'Previous-day high-zone activity', unit: 'min', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.previousActivity.highZoneMinutes },
  { key: 'workoutMinutes7dAvg', label: '7d workout minutes', unit: 'min', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.workoutMinutes7dAvg },
  { key: 'workoutStrain7dAvg', label: '7d workout strain', unit: '', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.workoutStrain7dAvg },
  { key: 'highZoneMinutes7dAvg', label: '7d high-zone activity', unit: 'min', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.highZoneMinutes7dAvg },
  { key: 'workoutHeartRate7dAvg', label: '7d workout heart rate', unit: 'bpm', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.workoutHeartRate7dAvg },
  { key: 'workoutCount7dTotal', label: '7d workout count', unit: '', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.workoutCount7dTotal },
  { key: 'workoutMinutes7dSd', label: 'Training variability', unit: 'min', kind: 'metric', accessor: (_point, _activity, _sportKeys, context) => context.workoutMinutes7dSd },
]

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sd(values: number[], average: number) {
  if (values.length < 2) return 0
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length)
}

function averageOrNull(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
  return valid.length ? mean(valid) : null
}

function sdOrNull(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
  if (valid.length < 2) return null
  return sd(valid, mean(valid))
}

function pearson(x: number[], y: number[]) {
  if (x.length < 3 || y.length < 3 || x.length !== y.length) return null
  const meanX = mean(x)
  const meanY = mean(y)
  let covariance = 0
  let varianceX = 0
  let varianceY = 0
  for (let index = 0; index < x.length; index += 1) {
    const dx = x[index] - meanX
    const dy = y[index] - meanY
    covariance += dx * dy
    varianceX += dx * dx
    varianceY += dy * dy
  }
  if (varianceX === 0 || varianceY === 0) return null
  return covariance / Math.sqrt(varianceX * varianceY)
}

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const size = vector.length
  const augmented = matrix.map((row, index) => [...row, vector[index]])
  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) maxRow = row
    }
    if (Math.abs(augmented[maxRow][pivot]) < 1e-9) return null
    ;[augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]]
    const pivotValue = augmented[pivot][pivot]
    for (let column = pivot; column <= size; column += 1) augmented[pivot][column] /= pivotValue
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue
      const factor = augmented[row][pivot]
      for (let column = pivot; column <= size; column += 1) augmented[row][column] -= factor * augmented[pivot][column]
    }
  }
  return augmented.map((row) => row[size])
}

function summarizeActivities(activities: ActivityItem[]) {
  const byDate = new Map<string, ActivitySummary>()
  const sportTotals = new Map<string, number>()

  for (const item of activities) {
    const summary = byDate.get(item.date) ?? {
      sessionCount: 0,
      workoutMinutes: 0,
      workoutCalories: 0,
      workoutStrain: 0,
      lowZoneMinutes: 0,
      highZoneMinutes: 0,
      workoutHeartRate: null,
      sportMinutes: new Map<string, number>(),
    }

    const sport = item.name.trim() || 'Activity'
    const lowZone = (item.heartZoneMinutes?.light ?? 0) + (item.heartZoneMinutes?.moderate ?? 0)
    const highZone = (item.heartZoneMinutes?.vigorous ?? 0) + (item.heartZoneMinutes?.peak ?? 0)
    const nextHeartRate = item.averageHeartRate === null
      ? summary.workoutHeartRate
      : summary.workoutHeartRate === null
        ? item.averageHeartRate
        : ((summary.workoutHeartRate * summary.sessionCount) + item.averageHeartRate) / (summary.sessionCount + 1)

    summary.sessionCount += 1
    summary.workoutMinutes += item.durationMinutes || 0
    summary.workoutCalories += item.calories ?? 0
    summary.workoutStrain += item.strain ?? 0
    summary.lowZoneMinutes += lowZone
    summary.highZoneMinutes += highZone
    summary.workoutHeartRate = nextHeartRate
    summary.sportMinutes.set(sport, (summary.sportMinutes.get(sport) ?? 0) + (item.durationMinutes || 0))
    byDate.set(item.date, summary)

    sportTotals.set(sport, (sportTotals.get(sport) ?? 0) + (item.durationMinutes || 0))
  }

  const topSports = [...sportTotals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([sport]) => sport)

  const sportDrivers = topSports.map<DriverDefinition>((sport, index) => ({
    key: `sport-${index + 1}`,
    label: `${sport} minutes`,
    unit: 'min',
    kind: 'metric',
    accessor: (_point, activity, sportKeys) => activity.sportMinutes.get(sportKeys[index] || '') ?? 0,
  }))

  return { byDate, topSports, sportDrivers }
}

function zeroActivitySummary(): ActivitySummary {
  return {
    sessionCount: 0,
    workoutMinutes: 0,
    workoutCalories: 0,
    workoutStrain: 0,
    lowZoneMinutes: 0,
    highZoneMinutes: 0,
    workoutHeartRate: null,
    sportMinutes: new Map<string, number>(),
  }
}

function buildHistoricalContexts(trends: TrendPoint[], byDate: Map<string, ActivitySummary>) {
  const sorted = [...trends].sort((left, right) => left.date.localeCompare(right.date))
  const contexts = new Map<string, HistoricalContext>()

  sorted.forEach((point, index) => {
    const previousTrend = index > 0 ? sorted[index - 1] : null
    const previousActivity = previousTrend ? byDate.get(previousTrend.date) ?? zeroActivitySummary() : zeroActivitySummary()
    const history = sorted.slice(Math.max(0, index - 7), index)
    const activityHistory = history.map((item) => byDate.get(item.date) ?? zeroActivitySummary())

    contexts.set(point.date, {
      previousTrend,
      previousActivity,
      sleepMinutes7dAvg: averageOrNull(history.map((item) => item.sleepMinutes)),
      sleepEfficiency7dAvg: averageOrNull(history.map((item) => item.sleepEfficiency)),
      sleepScore7dAvg: averageOrNull(history.map((item) => item.sleepScore ?? item.sleepPerformance)),
      sleepMinutes7dSd: sdOrNull(history.map((item) => item.sleepMinutes)),
      sleepEfficiency7dSd: sdOrNull(history.map((item) => item.sleepEfficiency)),
      workoutMinutes7dAvg: averageOrNull(activityHistory.map((item) => item.workoutMinutes)),
      workoutStrain7dAvg: averageOrNull(activityHistory.map((item) => item.workoutStrain)),
      highZoneMinutes7dAvg: averageOrNull(activityHistory.map((item) => item.highZoneMinutes)),
      workoutHeartRate7dAvg: averageOrNull(activityHistory.map((item) => item.workoutHeartRate)),
      workoutCount7dTotal: history.length ? activityHistory.reduce((sum, item) => sum + item.sessionCount, 0) : null,
      workoutMinutes7dSd: sdOrNull(activityHistory.map((item) => item.workoutMinutes)),
    })
  })

  return contexts
}

function buildEmptyContext(): HistoricalContext {
  return {
    previousTrend: null,
    previousActivity: zeroActivitySummary(),
    sleepMinutes7dAvg: null,
    sleepEfficiency7dAvg: null,
    sleepScore7dAvg: null,
    sleepMinutes7dSd: null,
    sleepEfficiency7dSd: null,
    workoutMinutes7dAvg: null,
    workoutStrain7dAvg: null,
    highZoneMinutes7dAvg: null,
    workoutHeartRate7dAvg: null,
    workoutCount7dTotal: null,
    workoutMinutes7dSd: null,
  }
}

function buildOutcomeModel(data: DashboardData, outcome: OutcomeDefinition): OutcomeModelResult | null {
  const { byDate, topSports, sportDrivers } = summarizeActivities(data.activities)
  const contexts = buildHistoricalContexts(data.trends, byDate)
  const outcomeKeys = new Set(modelOutcomes.map((item) => item.key))
  const drivers = [...baseDrivers, ...sportDrivers].filter((driver) => !outcomeKeys.has(driver.key))
  const emptyContext = buildEmptyContext()

  const candidates = drivers.flatMap((variable) => {
    const paired = data.trends.flatMap((point) => {
      const driver = variable.accessor(
        point,
        byDate.get(point.date) ?? zeroActivitySummary(),
        topSports,
        contexts.get(point.date) ?? emptyContext,
      )
      const result = outcome.accessor(point)
      return driver !== null && Number.isFinite(driver) && result !== null && Number.isFinite(result)
        ? [{ driver, outcome: result }]
        : []
    })
    if (paired.length < 5) return []
    const values = paired.map((item) => item.driver)
    const correlation = pearson(paired.map((item) => item.driver), paired.map((item) => item.outcome))
    if (correlation === null) return []
    return [{ variable, correlation, sampleCount: paired.length }]
  })
  if (!candidates.length) return null

  const predictors = candidates
    .sort((left, right) => Math.abs(right.correlation) - Math.abs(left.correlation))
    .slice(0, 4)
    .map((item) => item.variable)

  const rows = data.trends.flatMap((point) => {
    const activity = byDate.get(point.date) ?? zeroActivitySummary()
    const context = contexts.get(point.date) ?? emptyContext
    const result = outcome.accessor(point)
    if (result === null || !Number.isFinite(result)) return []
    const values = predictors.map((predictor) => predictor.accessor(point, activity, topSports, context))
    return values.every((value) => value !== null && Number.isFinite(value))
      ? [{ date: point.date, outcome: result, predictors: values as number[] }]
      : []
  })

  if (rows.length < Math.max(6, predictors.length + 2)) return null

  const predictorMeans = predictors.map((_, index) => mean(rows.map((row) => row.predictors[index])))
  const predictorSds = predictors.map((_, index) => sd(rows.map((row) => row.predictors[index]), predictorMeans[index]))
  if (predictorSds.some((value) => value === 0)) return null

  const outcomeMean = mean(rows.map((row) => row.outcome))
  const outcomeSd = sd(rows.map((row) => row.outcome), outcomeMean)
  if (outcomeSd === 0) return null

  const standardizedX = rows.map((row) => row.predictors.map((value, index) => (value - predictorMeans[index]) / predictorSds[index]))
  const standardizedY = rows.map((row) => (row.outcome - outcomeMean) / outcomeSd)
  const featureCount = predictors.length + 1
  const xtx = Array.from({ length: featureCount }, () => Array.from({ length: featureCount }, () => 0))
  const xty = Array.from({ length: featureCount }, () => 0)

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const features = [1, ...standardizedX[rowIndex]]
    for (let i = 0; i < featureCount; i += 1) {
      xty[i] += features[i] * standardizedY[rowIndex]
      for (let j = 0; j < featureCount; j += 1) xtx[i][j] += features[i] * features[j]
    }
  }

  for (let index = 1; index < featureCount; index += 1) xtx[index][index] += 1e-6

  const coefficients = solveLinearSystem(xtx, xty)
  if (!coefficients) return null

  const standardizedIntercept = coefficients[0]
  const standardizedCoefficients = coefficients.slice(1)
  const points = rows.map((row, index) => {
    const standardizedPrediction = standardizedIntercept + standardizedX[index].reduce((sum, value, valueIndex) => sum + value * standardizedCoefficients[valueIndex], 0)
    return {
      date: row.date,
      actual: row.outcome,
      predicted: outcomeMean + standardizedPrediction * outcomeSd,
    }
  })

  const actual = points.map((point) => point.actual)
  const predicted = points.map((point) => point.predicted)
  const actualMean = mean(actual)
  const ssTotal = actual.reduce((sum, value) => sum + ((value - actualMean) ** 2), 0)
  const ssResidual = actual.reduce((sum, value, index) => sum + ((value - predicted[index]) ** 2), 0)
  const explainedVariance = ssTotal === 0 ? 0 : Math.max(0, 1 - (ssResidual / ssTotal))
  const totalInfluence = standardizedCoefficients.reduce((sum, value) => sum + Math.abs(value), 0) || 1
  const contributions = predictors.map((variable, index) => ({
    variable,
    coefficient: standardizedCoefficients[index],
    influencePercent: Math.abs(standardizedCoefficients[index]) / totalInfluence,
    direction: standardizedCoefficients[index] >= 0 ? 'positive' as const : 'negative' as const,
  })).sort((left, right) => Math.abs(right.coefficient) - Math.abs(left.coefficient))

  const intercept = outcomeMean - predictors.reduce((sum, _variable, index) => sum + ((predictorMeans[index] / predictorSds[index]) * standardizedCoefficients[index] * outcomeSd), 0)

  return {
    outcome,
    predictors: predictors.map(({ key, label, unit, kind }) => ({ key, label, unit, kind })),
    sampleCount: rows.length,
    explainedVariance,
    intercept,
    contributions,
    points,
  }
}

export function buildRecoveryModel(data: DashboardData) {
  return buildOutcomeModel(data, modelOutcomes[0])
}

export function buildOutcomeModels(data: DashboardData) {
  return modelOutcomes
    .map((outcome) => buildOutcomeModel(data, outcome))
    .filter((result): result is OutcomeModelResult => result !== null)
    .sort((left, right) => right.explainedVariance - left.explainedVariance)
}
