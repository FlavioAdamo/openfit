import type { HistoryDay, TrendPoint } from '@/types'
import { formatDate } from '@/lib/format'

export type TrendWindow = 14 | 30 | 90 | 365

export const TREND_WINDOWS: readonly TrendWindow[] = [14, 30, 90, 365]

// Column charts switch from one column per day to one per week above this window.
export const WEEKLY_BUCKET_THRESHOLD = 60

export const TREND_METRIC_KEYS: ReadonlyArray<keyof HistoryDay> = [
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

export interface BucketPoint {
  date: string
  label: string
  value: number | null
}

function utcNoon(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12))
}

export function shiftIsoDate(value: string, days: number) {
  const date = utcNoon(value)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function windowStart(selectedDate: string, window: TrendWindow) {
  return shiftIsoDate(selectedDate, -(window - 1))
}

export function windowPoints(history: TrendPoint[], selectedDate: string, window: TrendWindow) {
  const start = windowStart(selectedDate, window)
  return history.filter((point) => point.date >= start && point.date <= selectedDate)
}

// A longer window is offered only when the archive reaches past the shorter one.
export function availableWindows(history: TrendPoint[], selectedDate: string): TrendWindow[] {
  return TREND_WINDOWS.filter((window, index) => {
    if (index === 0) return true
    const previousStart = windowStart(selectedDate, TREND_WINDOWS[index - 1])
    return history.some((point) => point.date < previousStart && point.date <= selectedDate)
  })
}

function mondayOf(value: string) {
  const date = utcNoon(value)
  const offset = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}

// Mean of the finite values per calendar week, keyed by the week's Monday.
export function weeklyBuckets(points: TrendPoint[], select: (point: TrendPoint) => number | null): BucketPoint[] {
  const buckets = new Map<string, { total: number; count: number }>()
  for (const point of points) {
    const week = mondayOf(point.date)
    const bucket = buckets.get(week) ?? { total: 0, count: 0 }
    const value = select(point)
    if (value !== null && Number.isFinite(value)) {
      bucket.total += value
      bucket.count += 1
    }
    buckets.set(week, bucket)
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, bucket]) => ({
      date,
      label: `Week of ${formatDate(date, { day: 'numeric', month: 'short' })}`,
      value: bucket.count ? bucket.total / bucket.count : null,
    }))
}
