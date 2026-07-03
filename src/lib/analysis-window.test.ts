import { describe, expect, it } from 'vitest'
import type { AnalysisRange, DashboardData, TrendPoint } from '@/types'
import { buildPhysiologicalAgeEstimate, clampAnalysisRange, defaultAnalysisRange, filterDashboardDataByRange } from './analysis-window'

function trend(date: string, overrides: Partial<TrendPoint>): TrendPoint {
  return {
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
  }
}

function dashboard(trends: TrendPoint[]): DashboardData {
  return {
    source: 'demo',
    selectedDate: trends.at(-1)?.date ?? '2026-06-01',
    generatedAt: '2026-06-29T00:00:00Z',
    profile: { displayName: 'Ada', avatar: null, memberSince: null, timezone: null },
    device: null,
    activity: {
      steps: null, stepsGoal: null, calories: null, caloriesGoal: null, distanceKm: null, distanceGoalKm: null,
      floors: null, floorsGoal: null, activeMinutes: null, lightActiveMinutes: null, moderateActiveMinutes: null,
      vigorousActiveMinutes: null, activeMinutesGoal: null, zoneMinutes: null, sedentaryMinutes: null, stepsIntraday: [], caloriesIntraday: [],
    },
    health: {
      currentHeartRate: null, restingHeartRate: null, heartRateMin: null, heartRateMax: null, heartRateIntraday: [],
      hrvMs: null, hrvDeepSleepRmssdMs: null, hrvEntropy: null, nonRemHeartRate: null, breathingRate: null, spo2: null,
      spo2Min: null, spo2Max: null, skinTemperature: null, skinNightlyTemperatureCelsius: null, skinBaselineTemperatureCelsius: null,
      skinTemperatureStddev30dCelsius: null, coreTemperature: null, vo2Max: null, cardioScore: null, strain: null,
      recoveryScore: null, ecgClassification: null, bloodGlucoseMgDl: null, irregularRhythmAlerts: null,
    },
    sleep: {
      totalMinutes: null, goalMinutes: null, score: null, performance: null, efficiency: null, startTime: null, endTime: null,
      stages: [], stageTimeline: [], stageTransitions: { deep: null, light: null, rem: null, wake: null }, minutesToFallAsleep: null,
      minutesAfterWakeUp: null, timeInBed: null, minutesAwake: null,
    },
    body: { weightKg: null, weightGoalKg: null, bmi: null, bodyFat: null, waterMl: null, waterGoalMl: null, caloriesIn: null },
    trends,
    activities: [
      {
        id: 'run-1',
        name: 'Run',
        date: '2026-06-10',
        time: '08:00',
        durationMinutes: 35,
        calories: 320,
        distanceKm: 5.4,
        averageHeartRate: 146,
        strain: 10.2,
        zoneMinutes: 26,
        steps: null,
        averagePaceSecondsPerMeter: null,
        heartZoneMinutes: { light: 4, moderate: 11, vigorous: 9, peak: 2 },
      },
    ],
    insights: [],
    sync: { endpointCount: 0, successCount: 0, errors: [], rateLimitRemaining: null },
  }
}

describe('analysis window', () => {
  it('defaults to the latest 8 weeks and falls back to the full span when shorter', () => {
    const trends = [
      trend('2026-05-01', { hrvMs: 70 }),
      trend('2026-06-29', { hrvMs: 80 }),
    ]
    expect(defaultAnalysisRange(trends, '2026-06-29')).toEqual({
      startDate: '2026-05-05',
      endDate: '2026-06-29',
    })

    expect(defaultAnalysisRange([trend('2026-06-20', { hrvMs: 70 })], '2026-06-20')).toEqual({
      startDate: '2026-06-20',
      endDate: '2026-06-20',
    })
  })

  it('clamps and corrects invalid ranges', () => {
    const trends = [
      trend('2026-06-01', { hrvMs: 65 }),
      trend('2026-06-20', { hrvMs: 75 }),
    ]
    const range: AnalysisRange = { startDate: '2026-06-25', endDate: '2026-05-01' }
    expect(clampAnalysisRange(range, trends, '2026-06-20')).toEqual({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    })
  })

  it('filters trends and activities inclusively', () => {
    const data = dashboard([
      trend('2026-06-08', { hrvMs: 70 }),
      trend('2026-06-10', { hrvMs: 74 }),
      trend('2026-06-12', { hrvMs: 76 }),
    ])
    const filtered = filterDashboardDataByRange(data, { startDate: '2026-06-10', endDate: '2026-06-12' })
    expect(filtered.trends.map((point) => point.date)).toEqual(['2026-06-10', '2026-06-12'])
    expect(filtered.activities.map((activity) => activity.date)).toEqual(['2026-06-10'])
  })
})

describe('physiological age estimate', () => {
  it('stays hidden with fewer than 7 valid days', () => {
    const trends = Array.from({ length: 6 }, (_, index) => trend(`2026-06-0${index + 1}`, {
      restingHeartRate: 58,
      hrvMs: 72,
      breathingRate: 15,
      sleepMinutes: 430,
      sleepEfficiency: 88,
    }))
    const estimate = buildPhysiologicalAgeEstimate(trends)
    expect(estimate.value).toBeNull()
    expect(estimate.readiness).toBe('insufficient')
    expect(estimate.series).toHaveLength(0)
  })

  it('ramps from stabilizing to ready and uses the latest 14-day window', () => {
    const trends = Array.from({ length: 16 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      return trend(`2026-06-${day}`, {
        restingHeartRate: 62 - index * 0.4,
        hrvMs: 52 + index * 2,
        breathingRate: 16.2 - index * 0.05,
        sleepMinutes: 395 + index * 6,
        sleepEfficiency: 82 + index * 0.6,
        sleepScore: 72 + index,
        cardioScore: 38 + index * 0.5,
      })
    })
    const estimate = buildPhysiologicalAgeEstimate(trends)
    expect(estimate.series[0].sampleCount).toBe(7)
    expect(estimate.series[0].readiness).toBe('stabilizing')
    expect(estimate.readiness).toBe('ready')
    expect(estimate.sampleCount).toBe(14)
    expect(estimate.windowStart).toBe('2026-06-03')
    expect(estimate.windowEnd).toBe('2026-06-16')
    expect(estimate.value).not.toBeNull()
  })

  it('degrades gracefully when optional whoop-only metrics are absent', () => {
    const trends = Array.from({ length: 14 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      return trend(`2026-06-${day}`, {
        restingHeartRate: 57,
        hrvMs: 78,
        breathingRate: 14.8,
        sleepMinutes: 445,
        sleepEfficiency: 90,
        recoveryScore: null,
        strain: null,
      })
    })
    const estimate = buildPhysiologicalAgeEstimate(trends)
    expect(estimate.readiness).toBe('ready')
    expect(estimate.value).not.toBeNull()
  })
})
