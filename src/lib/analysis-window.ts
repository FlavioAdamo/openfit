import type {
  AnalysisRange,
  DashboardData,
  PhysiologicalAgeEstimate,
  PhysiologicalAgePoint,
  TrendPoint,
} from '@/types'

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, 12)
}

function isoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function scoreRange(value: number, good: number, poor: number) {
  if (good === poor) return 0.5
  if (good > poor) return clamp((value - poor) / (good - poor), 0, 1)
  return clamp((poor - value) / (poor - good), 0, 1)
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function validValues(values: Array<number | null | undefined>) {
  return values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
}

function metricAverage(points: TrendPoint[], accessor: (point: TrendPoint) => number | null) {
  const values = validValues(points.map(accessor))
  return values.length >= 4 ? mean(values) : null
}

function readinessForSampleCount(sampleCount: number) {
  if (sampleCount >= 14) return 'ready' as const
  if (sampleCount >= 7) return 'stabilizing' as const
  return 'insufficient' as const
}

function physiologicalAgeFromWindow(windowPoints: TrendPoint[]) {
  const sampleCount = windowPoints.length
  if (sampleCount < 7) return null

  const averages = {
    restingHeartRate: metricAverage(windowPoints, (point) => point.restingHeartRate),
    hrvMs: metricAverage(windowPoints, (point) => point.hrvMs),
    breathingRate: metricAverage(windowPoints, (point) => point.breathingRate),
    sleepMinutes: metricAverage(windowPoints, (point) => point.sleepMinutes),
    sleepEfficiency: metricAverage(windowPoints, (point) => point.sleepEfficiency),
    sleepScore: metricAverage(windowPoints, (point) => point.sleepScore ?? point.sleepPerformance),
    cardioScore: metricAverage(windowPoints, (point) => point.cardioScore),
    recoveryScore: metricAverage(windowPoints, (point) => point.recoveryScore),
  }

  const weighted = [
    averages.restingHeartRate === null ? null : { weight: 0.24, score: scoreRange(averages.restingHeartRate, 50, 74) },
    averages.hrvMs === null ? null : { weight: 0.24, score: scoreRange(averages.hrvMs, 95, 28) },
    averages.breathingRate === null ? null : { weight: 0.14, score: scoreRange(averages.breathingRate, 12.5, 18.5) },
    averages.sleepMinutes === null ? null : { weight: 0.14, score: scoreRange(averages.sleepMinutes, 480, 330) },
    averages.sleepEfficiency === null ? null : { weight: 0.12, score: scoreRange(averages.sleepEfficiency, 94, 75) },
    averages.sleepScore === null ? null : { weight: 0.08, score: scoreRange(averages.sleepScore, 92, 60) },
    averages.cardioScore === null ? null : { weight: 0.14, score: scoreRange(averages.cardioScore, 55, 30) },
    averages.recoveryScore === null ? null : { weight: 0.06, score: scoreRange(averages.recoveryScore, 85, 40) },
  ].filter((value): value is { weight: number; score: number } => value !== null)

  const coreAvailability = [
    averages.restingHeartRate,
    averages.hrvMs,
    averages.breathingRate,
    averages.sleepMinutes,
    averages.sleepEfficiency,
  ].filter((value) => value !== null).length

  if (coreAvailability < 3 || weighted.length < 4) return null

  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0)
  const healthScore = weighted.reduce((sum, item) => sum + item.weight * item.score, 0) / totalWeight
  const physiologicalAge = clamp(20 + (1 - healthScore) * 45, 20, 65)
  return Number(physiologicalAge.toFixed(1))
}

export function availableTrendBounds(trends: TrendPoint[], fallbackDate: string) {
  if (!trends.length) return { firstDate: fallbackDate, lastDate: fallbackDate }
  const sorted = [...trends].sort((left, right) => left.date.localeCompare(right.date))
  return {
    firstDate: sorted[0].date,
    lastDate: sorted[sorted.length - 1].date,
  }
}

export function defaultAnalysisRange(trends: TrendPoint[], fallbackDate: string): AnalysisRange {
  const { firstDate, lastDate } = availableTrendBounds(trends, fallbackDate)
  const latest = parseLocalDate(lastDate)
  const start = isoDate(addDays(latest, -55))
  return {
    startDate: start < firstDate ? firstDate : start,
    endDate: lastDate,
  }
}

export function clampAnalysisRange(range: AnalysisRange, trends: TrendPoint[], fallbackDate: string): AnalysisRange {
  const { firstDate, lastDate } = availableTrendBounds(trends, fallbackDate)
  const startDate = range.startDate < firstDate ? firstDate : range.startDate > lastDate ? lastDate : range.startDate
  const endDate = range.endDate > lastDate ? lastDate : range.endDate < firstDate ? firstDate : range.endDate
  return startDate <= endDate
    ? { startDate, endDate }
    : { startDate: endDate, endDate: endDate }
}

export function filterDashboardDataByRange(data: DashboardData, range: AnalysisRange): DashboardData {
  const trends = data.trends.filter((point) => point.date >= range.startDate && point.date <= range.endDate)
  const activities = data.activities.filter((item) => item.date >= range.startDate && item.date <= range.endDate)
  return {
    ...data,
    trends,
    activities,
  }
}

export function buildPhysiologicalAgeEstimate(trends: TrendPoint[]): PhysiologicalAgeEstimate {
  const sorted = [...trends].sort((left, right) => left.date.localeCompare(right.date))
  const series: PhysiologicalAgePoint[] = []

  for (let index = 0; index < sorted.length; index += 1) {
    const windowPoints = sorted.slice(Math.max(0, index - 13), index + 1)
    const value = physiologicalAgeFromWindow(windowPoints)
    if (value === null) continue
    series.push({
      date: sorted[index].date,
      value,
      sampleCount: windowPoints.length,
      windowStart: windowPoints[0].date,
      windowEnd: windowPoints[windowPoints.length - 1].date,
      readiness: readinessForSampleCount(windowPoints.length),
    })
  }

  const latest = series.at(-1)
  return latest
    ? {
      value: latest.value,
      sampleCount: latest.sampleCount,
      windowStart: latest.windowStart,
      windowEnd: latest.windowEnd,
      readiness: latest.readiness,
      series,
    }
    : {
      value: null,
      sampleCount: 0,
      windowStart: null,
      windowEnd: null,
      readiness: 'insufficient',
      series,
    }
}
