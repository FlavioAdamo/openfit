import type { ActivityItem, DistributionBin, SportDetailSummary, SportGroupSummary, TrendPoint, WeeklyAggregate } from '@/types'

export type AggregatePeriod = 'weekly' | 'monthly'

export type TrendMetricKey = keyof Pick<
  TrendPoint,
  | 'steps'
  | 'calories'
  | 'distanceKm'
  | 'floors'
  | 'activeMinutes'
  | 'zoneMinutes'
  | 'sedentaryMinutes'
  | 'restingHeartRate'
  | 'hrvMs'
  | 'breathingRate'
  | 'spo2'
  | 'skinTemperature'
  | 'coreTemperature'
  | 'cardioScore'
  | 'strain'
  | 'recoveryScore'
  | 'sleepPerformance'
  | 'sleepMinutes'
  | 'sleepScore'
  | 'sleepEfficiency'
  | 'weight'
  | 'bodyFat'
  | 'waterMl'
  | 'caloriesIn'
>

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

function startOfWeekMonday(value: string) {
  const date = parseLocalDate(value)
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  return addDays(date, offset)
}

function endOfWeekMonday(value: string) {
  return addDays(startOfWeekMonday(value), 6)
}

function startOfMonth(value: string) {
  const date = parseLocalDate(value)
  return new Date(date.getFullYear(), date.getMonth(), 1, 12)
}

function endOfMonth(value: string) {
  const date = parseLocalDate(value)
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: number[], average: number) {
  if (values.length <= 1) return 0
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length
  return Math.sqrt(variance)
}

function weekLabel(weekStart: string, weekEnd: string, isPartial: boolean) {
  const start = parseLocalDate(weekStart)
  const end = parseLocalDate(weekEnd)
  const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  const long = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  const base = `${long.format(start)} - ${long.format(end)}`
  return {
    short: short.format(start),
    long: isPartial ? `${base} (partial)` : base,
  }
}

function monthLabel(monthStart: string, monthEnd: string, isPartial: boolean) {
  const start = parseLocalDate(monthStart)
  const end = parseLocalDate(monthEnd)
  const short = new Intl.DateTimeFormat('en-US', { month: 'short' })
  const long = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
  const base = `${long.format(start)}`
  return {
    short: short.format(start),
    long: isPartial ? `${base} (partial)` : base,
    end,
  }
}

function startOfPeriod(value: string, period: AggregatePeriod) {
  return period === 'weekly' ? startOfWeekMonday(value) : startOfMonth(value)
}

function endOfPeriod(value: string, period: AggregatePeriod) {
  return period === 'weekly' ? endOfWeekMonday(value) : endOfMonth(value)
}

function periodLabels(periodStart: string, periodEnd: string, isPartial: boolean, period: AggregatePeriod) {
  return period === 'weekly'
    ? weekLabel(periodStart, periodEnd, isPartial)
    : monthLabel(periodStart, periodEnd, isPartial)
}

export function weeklyAggregates(trends: TrendPoint[], metric: TrendMetricKey): WeeklyAggregate[] {
  return periodAggregates(trends, metric, 'weekly')
}

export function monthlyAggregates(trends: TrendPoint[], metric: TrendMetricKey): WeeklyAggregate[] {
  return periodAggregates(trends, metric, 'monthly')
}

export function periodAggregates(trends: TrendPoint[], metric: TrendMetricKey, period: AggregatePeriod): WeeklyAggregate[] {
  const dated = trends
    .map((point) => ({ date: point.date, value: point[metric] }))
    .filter((point): point is { date: string; value: number } => point.value !== null && Number.isFinite(point.value))

  if (!dated.length) return []

  const firstDate = dated[0].date
  const lastDate = dated[dated.length - 1].date
  const firstPeriodStart = isoDate(startOfPeriod(firstDate, period))
  const lastPeriodEnd = isoDate(endOfPeriod(lastDate, period))
  const buckets = new Map<string, Array<{ date: string; value: number }>>()

  for (const point of dated) {
    const periodStart = isoDate(startOfPeriod(point.date, period))
    const bucket = buckets.get(periodStart) ?? []
    bucket.push(point)
    buckets.set(periodStart, bucket)
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([periodStart, points]) => {
      const periodEnd = isoDate(endOfPeriod(periodStart, period))
      const values = points.map((point) => point.value)
      const average = mean(values)
      const sd = standardDeviation(values, average)
      const isPartial = periodStart === firstPeriodStart || periodEnd === lastPeriodEnd
      const { short, long } = periodLabels(periodStart, periodEnd, isPartial, period)
      return {
        key: `${metric}-${periodStart}`,
        weekStart: periodStart,
        weekEnd: periodEnd,
        label: long,
        shortLabel: short,
        isPartial,
        sampleCount: values.length,
        mean: average,
        sd,
        min: Math.min(...values),
        max: Math.max(...values),
        points: points.map((point) => ({
          date: point.date,
          label: point.date,
          value: point.value,
          withinSd: sd === 0 ? true : Math.abs(point.value - average) <= sd,
        })),
      }
    })
}

function averageOf(items: Array<number | null>) {
  const values = items.filter((value): value is number => value !== null && Number.isFinite(value))
  return values.length ? mean(values) : null
}

function distribution(values: number[], formatter: (value: number) => string, binCount = 5): DistributionBin[] {
  if (!values.length) return []
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  if (minimum === maximum) {
    return [{ label: formatter(minimum), percentage: 100, count: values.length }]
  }

  const step = (maximum - minimum) / binCount
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: minimum + step * index,
    end: index === binCount - 1 ? maximum : minimum + step * (index + 1),
    count: 0,
  }))

  values.forEach((value) => {
    const binIndex = Math.min(binCount - 1, Math.max(0, Math.floor((value - minimum) / step)))
    bins[binIndex].count += 1
  })

  return bins
    .filter((bin) => bin.count > 0)
    .map((bin) => ({
      label: `${formatter(bin.start)}-${formatter(bin.end)}`,
      percentage: (bin.count / values.length) * 100,
      count: bin.count,
    }))
}

export function groupActivitiesBySport(activities: ActivityItem[]): SportGroupSummary[] {
  const grouped = new Map<string, ActivityItem[]>()
  for (const item of activities) {
    const key = item.name.trim() || 'Activity'
    const group = grouped.get(key) ?? []
    group.push(item)
    grouped.set(key, group)
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sport, items]) => {
      const weeks = new Set(items.map((item) => isoDate(startOfWeekMonday(item.date))))
      return {
        sport,
        activityCount: items.length,
        weeksActive: weeks.size,
        averageSessionsPerWeek: items.length / Math.max(weeks.size, 1),
        averageDurationMinutes: averageOf(items.map((item) => item.durationMinutes)),
        averageHeartRate: averageOf(items.map((item) => item.averageHeartRate)),
        averageCalories: averageOf(items.map((item) => item.calories)),
        averageStrain: averageOf(items.map((item) => item.strain)),
      }
    })
}

export function seriesAggregates(points: Array<{ date: string; value: number | null }>, key: string, period: AggregatePeriod): WeeklyAggregate[] {
  const dated = points.filter((point): point is { date: string; value: number } => point.value !== null && Number.isFinite(point.value))
  if (!dated.length) return []
  const firstDate = dated[0].date
  const lastDate = dated[dated.length - 1].date
  const firstPeriodStart = isoDate(startOfPeriod(firstDate, period))
  const lastPeriodEnd = isoDate(endOfPeriod(lastDate, period))
  const buckets = new Map<string, Array<{ date: string; value: number }>>()
  for (const point of dated) {
    const periodStart = isoDate(startOfPeriod(point.date, period))
    const bucket = buckets.get(periodStart) ?? []
    bucket.push(point)
    buckets.set(periodStart, bucket)
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([periodStart, periodPoints]) => {
      const periodEnd = isoDate(endOfPeriod(periodStart, period))
      const values = periodPoints.map((point) => point.value)
      const average = mean(values)
      const sd = standardDeviation(values, average)
      const isPartial = periodStart === firstPeriodStart || periodEnd === lastPeriodEnd
      const { short, long } = periodLabels(periodStart, periodEnd, isPartial, period)
      return {
        key: `${key}-${periodStart}`,
        weekStart: periodStart,
        weekEnd: periodEnd,
        label: long,
        shortLabel: short,
        isPartial,
        sampleCount: values.length,
        mean: average,
        sd,
        min: Math.min(...values),
        max: Math.max(...values),
        points: periodPoints.map((point) => ({
          date: point.date,
          label: point.date,
          value: point.value,
          withinSd: sd === 0 ? true : Math.abs(point.value - average) <= sd,
        })),
      }
    })
}

export function sportDetails(activities: ActivityItem[], period: AggregatePeriod = 'weekly'): SportDetailSummary[] {
  const groups = groupActivitiesBySport(activities)
  return groups.map((group) => {
    const sessions = activities
      .filter((item) => (item.name.trim() || 'Activity') === group.sport)
      .slice()
      .sort((left, right) => `${right.date}T${right.time || '00:00'}`.localeCompare(`${left.date}T${left.time || '00:00'}`))

    const weeklyDuration = seriesAggregates(
      sessions.map((session) => ({ date: session.date, value: session.durationMinutes || null })),
      `${group.sport}-duration`,
      period,
    )
    const weeklyHeartRate = seriesAggregates(
      sessions.map((session) => ({ date: session.date, value: session.averageHeartRate })),
      `${group.sport}-hr`,
      period,
    )
    const durationDistribution = distribution(
      sessions.map((session) => session.durationMinutes).filter((value) => Number.isFinite(value) && value > 0),
      (value) => String(Math.round(value)),
    )
    const heartRateDistribution = distribution(
      sessions.map((session) => session.averageHeartRate).filter((value): value is number => value !== null && Number.isFinite(value) && value > 0),
      (value) => String(Math.round(value)),
    )

    const zoneTotals = sessions.reduce((totals, session) => {
      totals.light += session.heartZoneMinutes?.light ?? 0
      totals.moderate += session.heartZoneMinutes?.moderate ?? 0
      totals.vigorous += session.heartZoneMinutes?.vigorous ?? 0
      totals.peak += session.heartZoneMinutes?.peak ?? 0
      return totals
    }, { light: 0, moderate: 0, vigorous: 0, peak: 0 })
    const totalZoneMinutes = zoneTotals.light + zoneTotals.moderate + zoneTotals.vigorous + zoneTotals.peak
    const percentage = (value: number) => totalZoneMinutes > 0 ? (value / totalZoneMinutes) * 100 : 0

    return {
      ...group,
      sessions,
      weeklyDuration,
      weeklyHeartRate,
      durationDistribution,
      heartRateDistribution,
      zonePercentages: [
        { label: 'Light', percentage: percentage(zoneTotals.light) },
        { label: 'Moderate', percentage: percentage(zoneTotals.moderate) },
        { label: 'Vigorous', percentage: percentage(zoneTotals.vigorous) },
        { label: 'Peak', percentage: percentage(zoneTotals.peak) },
      ],
    }
  })
}
