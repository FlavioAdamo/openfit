import { describe, expect, it } from 'vitest'
import type { TrendPoint } from '@/types'
import { availableWindows, shiftIsoDate, weeklyBuckets, windowPoints } from './trend-window'

function point(date: string, steps: number | null = null): TrendPoint {
  return {
    date,
    label: date,
    steps,
    calories: null,
    distanceKm: null,
    floors: null,
    activeMinutes: null,
    zoneMinutes: null,
    sedentaryMinutes: null,
    restingHeartRate: null,
    hrvMs: null,
    breathingRate: null,
    spo2: null,
    skinTemperature: null,
    coreTemperature: null,
    cardioScore: null,
    sleepMinutes: null,
    sleepScore: null,
    sleepEfficiency: null,
    weight: null,
    bodyFat: null,
    waterMl: null,
    caloriesIn: null,
  }
}

describe('trend windows', () => {
  it('shifts ISO dates across month and year boundaries', () => {
    expect(shiftIsoDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftIsoDate('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftIsoDate('2026-06-22', -13)).toBe('2026-06-09')
  })

  it('keeps only the points inside the window ending on the selected date', () => {
    const history = [point('2026-05-01'), point('2026-06-09'), point('2026-06-22'), point('2026-06-23')]
    expect(windowPoints(history, '2026-06-22', 14).map((item) => item.date)).toEqual(['2026-06-09', '2026-06-22'])
    expect(windowPoints(history, '2026-06-22', 90).map((item) => item.date)).toEqual(['2026-05-01', '2026-06-09', '2026-06-22'])
  })

  it('offers a longer window only when the archive reaches past the shorter one', () => {
    expect(availableWindows([point('2026-06-22')], '2026-06-22')).toEqual([14])
    expect(availableWindows([point('2026-06-01'), point('2026-06-22')], '2026-06-22')).toEqual([14, 30])
    expect(availableWindows([point('2025-09-01'), point('2026-06-22')], '2026-06-22')).toEqual([14, 30, 90, 365])
    expect(availableWindows([point('2026-06-23')], '2026-06-22')).toEqual([14])
  })

  it('averages finite values per week and keeps empty weeks as null', () => {
    const buckets = weeklyBuckets([
      point('2026-06-15', 1000), // Monday
      point('2026-06-17', 3000),
      point('2026-06-21', null),
      point('2026-06-22', 5000), // next Monday
      point('2026-06-30', null),
    ], (item) => item.steps)
    expect(buckets).toEqual([
      { date: '2026-06-15', label: 'Week of Jun 15', value: 2000 },
      { date: '2026-06-22', label: 'Week of Jun 22', value: 5000 },
      { date: '2026-06-29', label: 'Week of Jun 29', value: null },
    ])
  })
})
