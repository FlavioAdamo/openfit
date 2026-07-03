import { describe, expect, it } from 'vitest'
import type { ActivityItem, TrendPoint } from '@/types'
import { groupActivitiesBySport, monthlyAggregates, periodAggregates, sportDetails, weeklyAggregates } from './weekly-analysis'

const trend = (date: string, overrides: Partial<TrendPoint>): TrendPoint => ({
  date,
  label: date,
  steps: null,
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
  strain: null,
  recoveryScore: null,
  sleepPerformance: null,
  sleepMinutes: null,
  sleepScore: null,
  sleepEfficiency: null,
  weight: null,
  bodyFat: null,
  waterMl: null,
  caloriesIn: null,
  ...overrides,
})

describe('weeklyAggregates', () => {
  it('groups trend points Monday to Sunday and marks partial edge weeks', () => {
    const aggregates = weeklyAggregates([
      trend('2026-06-03', { hrvMs: 40 }),
      trend('2026-06-04', { hrvMs: 44 }),
      trend('2026-06-09', { hrvMs: 48 }),
      trend('2026-06-10', { hrvMs: 52 }),
    ], 'hrvMs')

    expect(aggregates).toHaveLength(2)
    expect(aggregates[0]).toMatchObject({
      weekStart: '2026-06-01',
      weekEnd: '2026-06-07',
      isPartial: true,
      sampleCount: 2,
      mean: 42,
    })
    expect(aggregates[1]).toMatchObject({
      weekStart: '2026-06-08',
      weekEnd: '2026-06-14',
      isPartial: true,
      sampleCount: 2,
      mean: 50,
    })
  })

  it('computes standard deviation and classifies out-of-band points', () => {
    const [aggregate] = weeklyAggregates([
      trend('2026-06-08', { spo2: 96 }),
      trend('2026-06-09', { spo2: 96 }),
      trend('2026-06-10', { spo2: 96 }),
      trend('2026-06-11', { spo2: 100 }),
    ], 'spo2')

    expect(aggregate.mean).toBe(97)
    expect(aggregate.sd).toBeGreaterThan(1.7)
    expect(aggregate.points.find((point) => point.value === 100)?.withinSd).toBe(false)
    expect(aggregate.points.find((point) => point.value === 96)?.withinSd).toBe(true)
  })

  it('skips missing metric values', () => {
    const [aggregate] = weeklyAggregates([
      trend('2026-06-08', { sleepEfficiency: null }),
      trend('2026-06-09', { sleepEfficiency: 92 }),
      trend('2026-06-10', { sleepEfficiency: 94 }),
    ], 'sleepEfficiency')

    expect(aggregate.sampleCount).toBe(2)
    expect(aggregate.mean).toBe(93)
  })
})

describe('monthlyAggregates', () => {
  it('groups trend points by month and marks partial edge months', () => {
    const aggregates = monthlyAggregates([
      trend('2026-05-29', { hrvMs: 40 }),
      trend('2026-05-30', { hrvMs: 44 }),
      trend('2026-06-09', { hrvMs: 48 }),
      trend('2026-06-10', { hrvMs: 52 }),
    ], 'hrvMs')

    expect(aggregates).toHaveLength(2)
    expect(aggregates[0]).toMatchObject({
      weekStart: '2026-05-01',
      weekEnd: '2026-05-31',
      isPartial: true,
      sampleCount: 2,
      mean: 42,
      shortLabel: 'May',
    })
    expect(aggregates[1]).toMatchObject({
      weekStart: '2026-06-01',
      weekEnd: '2026-06-30',
      isPartial: true,
      sampleCount: 2,
      mean: 50,
      shortLabel: 'Jun',
    })
  })

  it('supports the generic period helper for monthly series', () => {
    const aggregates = periodAggregates([
      trend('2026-06-08', { sleepEfficiency: 92 }),
      trend('2026-06-10', { sleepEfficiency: 94 }),
      trend('2026-07-01', { sleepEfficiency: 90 }),
    ], 'sleepEfficiency', 'monthly')

    expect(aggregates).toHaveLength(2)
    expect(aggregates[0].mean).toBe(93)
    expect(aggregates[1].mean).toBe(90)
  })
})

describe('groupActivitiesBySport', () => {
  it('groups activities by sport and calculates weekly summary metrics', () => {
    const activities: ActivityItem[] = [
      {
        id: '1',
        name: 'Run',
        date: '2026-06-08',
        time: '08:00',
        durationMinutes: 30,
        calories: 300,
        distanceKm: 5,
        averageHeartRate: 145,
        strain: 10.5,
        zoneMinutes: 25,
        steps: null,
        averagePaceSecondsPerMeter: null,
        heartZoneMinutes: null,
      },
      {
        id: '2',
        name: 'Run',
        date: '2026-06-10',
        time: '08:00',
        durationMinutes: 40,
        calories: 360,
        distanceKm: 6,
        averageHeartRate: 150,
        strain: 12,
        zoneMinutes: 30,
        steps: null,
        averagePaceSecondsPerMeter: null,
        heartZoneMinutes: null,
      },
      {
        id: '3',
        name: 'Ride',
        date: '2026-06-16',
        time: '09:00',
        durationMinutes: 70,
        calories: 620,
        distanceKm: 22,
        averageHeartRate: null,
        strain: null,
        zoneMinutes: 45,
        steps: null,
        averagePaceSecondsPerMeter: null,
        heartZoneMinutes: null,
      },
    ]

    const summaries = groupActivitiesBySport(activities)
    expect(summaries).toHaveLength(2)
    expect(summaries[1]).toMatchObject({
      sport: 'Run',
      activityCount: 2,
      weeksActive: 1,
      averageSessionsPerWeek: 2,
      averageDurationMinutes: 35,
      averageHeartRate: 147.5,
      averageCalories: 330,
      averageStrain: 11.25,
    })
  })
})

describe('sportDetails', () => {
  it('builds selected-sport detail summaries with weekly averages and zone percentages', () => {
    const details = sportDetails([
      {
        id: '1',
        name: 'Run',
        date: '2026-06-08',
        time: '08:00',
        durationMinutes: 30,
        calories: 300,
        distanceKm: 5,
        averageHeartRate: 145,
        strain: 10.5,
        zoneMinutes: 25,
        steps: null,
        averagePaceSecondsPerMeter: null,
        heartZoneMinutes: { light: 5, moderate: 10, vigorous: 15, peak: 0 },
      },
      {
        id: '2',
        name: 'Run',
        date: '2026-06-15',
        time: '08:00',
        durationMinutes: 45,
        calories: 410,
        distanceKm: 7,
        averageHeartRate: 152,
        strain: 12.2,
        zoneMinutes: 31,
        steps: null,
        averagePaceSecondsPerMeter: null,
        heartZoneMinutes: { light: 3, moderate: 12, vigorous: 18, peak: 2 },
      },
    ])

    expect(details).toHaveLength(1)
    expect(details[0].weeklyDuration).toHaveLength(2)
    expect(details[0].weeklyHeartRate).toHaveLength(2)
    expect(details[0].durationDistribution.length).toBeGreaterThan(0)
    expect(details[0].heartRateDistribution.length).toBeGreaterThan(0)
    expect(details[0].sessions[0].date).toBe('2026-06-15')
    expect(details[0].zonePercentages.map((zone) => zone.label)).toEqual(['Light', 'Moderate', 'Vigorous', 'Peak'])
    expect(Math.round(details[0].zonePercentages.reduce((sum, zone) => sum + zone.percentage, 0))).toBe(100)
  })

  it('builds selected-sport detail summaries with monthly averages when requested', () => {
    const details = sportDetails([
      {
        id: '1',
        name: 'Run',
        date: '2026-06-08',
        time: '08:00',
        durationMinutes: 30,
        calories: 300,
        distanceKm: 5,
        averageHeartRate: 145,
        strain: 10.5,
        zoneMinutes: 25,
        steps: null,
        averagePaceSecondsPerMeter: null,
        heartZoneMinutes: { light: 5, moderate: 10, vigorous: 15, peak: 0 },
      },
      {
        id: '2',
        name: 'Run',
        date: '2026-07-15',
        time: '08:00',
        durationMinutes: 45,
        calories: 410,
        distanceKm: 7,
        averageHeartRate: 152,
        strain: 12.2,
        zoneMinutes: 31,
        steps: null,
        averagePaceSecondsPerMeter: null,
        heartZoneMinutes: { light: 3, moderate: 12, vigorous: 18, peak: 2 },
      },
    ], 'monthly')

    expect(details).toHaveLength(1)
    expect(details[0].weeklyDuration).toHaveLength(2)
    expect(details[0].weeklyDuration[0].shortLabel).toBe('Jun')
    expect(details[0].weeklyHeartRate[1].shortLabel).toBe('Jul')
  })
})
