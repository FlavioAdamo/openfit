import { describe, expect, it } from 'vitest'
import type { ActivityItem, DashboardData, TrendPoint } from '@/types'
import { buildOutcomeModels, buildRecoveryModel, modelOutcomes, recoveryDrivers } from './relationship-analysis'

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

function activity(date: string, name: string, durationMinutes: number, heartRate: number, zones: { light: number; moderate: number; vigorous: number; peak: number }): ActivityItem {
  return {
    id: `${name}-${date}`,
    name,
    date,
    time: '08:00',
    durationMinutes,
    calories: durationMinutes * 10,
    distanceKm: null,
    averageHeartRate: heartRate,
    strain: durationMinutes / 10,
    zoneMinutes: zones.light + zones.moderate + zones.vigorous + zones.peak,
    steps: null,
    averagePaceSecondsPerMeter: null,
    heartZoneMinutes: zones,
  }
}

function data(trends: TrendPoint[], activities: ActivityItem[] = []): DashboardData {
  return {
    source: 'demo',
    selectedDate: trends.at(-1)?.date ?? '2026-06-01',
    generatedAt: '2026-06-28T00:00:00Z',
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
    activities,
    insights: [],
    sync: { endpointCount: 0, successCount: 0, errors: [], rateLimitRemaining: null },
  }
}

describe('relationship analysis', () => {
  it('returns null when recovery is unavailable', () => {
    expect(buildRecoveryModel(data([
      trend('2026-06-01', { steps: 3000 }),
      trend('2026-06-02', { steps: 4000 }),
    ]))).toBeNull()
  })

  it('fits a multivariable recovery model and ranks contributors', () => {
    const dashboard = data([
      trend('2026-06-01', { steps: 2000, sleepMinutes: 390, sleepEfficiency: 82, recoveryScore: 51, restingHeartRate: 61, hrvMs: 41 }),
      trend('2026-06-02', { steps: 3500, sleepMinutes: 410, sleepEfficiency: 84, recoveryScore: 57, restingHeartRate: 59, hrvMs: 46 }),
      trend('2026-06-03', { steps: 4000, sleepMinutes: 430, sleepEfficiency: 86, recoveryScore: 62, restingHeartRate: 57, hrvMs: 49 }),
      trend('2026-06-04', { steps: 5200, sleepMinutes: 450, sleepEfficiency: 89, recoveryScore: 68, restingHeartRate: 56, hrvMs: 55 }),
      trend('2026-06-05', { steps: 6100, sleepMinutes: 465, sleepEfficiency: 91, recoveryScore: 74, restingHeartRate: 54, hrvMs: 58 }),
      trend('2026-06-06', { steps: 7200, sleepMinutes: 475, sleepEfficiency: 93, recoveryScore: 79, restingHeartRate: 52, hrvMs: 63 }),
      trend('2026-06-07', { steps: 7600, sleepMinutes: 485, sleepEfficiency: 94, recoveryScore: 84, restingHeartRate: 51, hrvMs: 66 }),
      trend('2026-06-08', { steps: 6900, sleepMinutes: 460, sleepEfficiency: 90, recoveryScore: 76, restingHeartRate: 53, hrvMs: 60 }),
      trend('2026-06-09', { steps: 8100, sleepMinutes: 490, sleepEfficiency: 95, recoveryScore: 86, restingHeartRate: 50, hrvMs: 68 }),
      trend('2026-06-10', { steps: 7800, sleepMinutes: 480, sleepEfficiency: 93, recoveryScore: 82, restingHeartRate: 51, hrvMs: 64 }),
    ], [
      activity('2026-06-01', 'Run', 20, 135, { light: 5, moderate: 10, vigorous: 5, peak: 0 }),
      activity('2026-06-02', 'Run', 25, 138, { light: 5, moderate: 12, vigorous: 8, peak: 0 }),
      activity('2026-06-03', 'Ride', 30, 142, { light: 6, moderate: 14, vigorous: 10, peak: 0 }),
      activity('2026-06-04', 'Ride', 35, 145, { light: 4, moderate: 15, vigorous: 12, peak: 4 }),
      activity('2026-06-05', 'Lift', 40, 148, { light: 3, moderate: 12, vigorous: 14, peak: 6 }),
      activity('2026-06-06', 'Lift', 45, 150, { light: 2, moderate: 10, vigorous: 16, peak: 8 }),
      activity('2026-06-07', 'Run', 48, 152, { light: 2, moderate: 10, vigorous: 18, peak: 10 }),
      activity('2026-06-08', 'Walk', 32, 128, { light: 10, moderate: 10, vigorous: 4, peak: 0 }),
      activity('2026-06-09', 'Run', 50, 154, { light: 2, moderate: 11, vigorous: 20, peak: 11 }),
      activity('2026-06-10', 'Lift', 38, 146, { light: 4, moderate: 12, vigorous: 12, peak: 5 }),
    ])

    const result = buildRecoveryModel(dashboard)
    expect(result).not.toBeNull()
    expect(result?.sampleCount).toBeGreaterThanOrEqual(7)
    expect(result?.explainedVariance).toBeGreaterThan(0.65)
    expect(result?.contributions.length).toBeGreaterThanOrEqual(4)
    expect(result?.points.length).toBe(result?.sampleCount)
    expect(result?.predictors.some((predictor) => recoveryDrivers.some((candidate) => candidate.key === predictor.key))).toBe(true)
  })

  it('builds models for multiple outcomes with activity-derived predictors', () => {
    const trends = Array.from({ length: 10 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      const hardMinutes = 5 + index * 4
      return trend(`2026-06-${day}`, {
        hrvMs: 50 + hardMinutes * 0.9,
        restingHeartRate: 65 - hardMinutes * 0.3,
        recoveryScore: 55 + hardMinutes * 0.7,
        sleepEfficiency: 80 + index,
      })
    })
    const activities = Array.from({ length: 10 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      return activity(`2026-06-${day}`, index % 2 === 0 ? 'Run' : 'Lift', 25 + index * 3, 135 + index, {
        light: 5,
        moderate: 10,
        vigorous: 6 + index * 2,
        peak: 2 + index * 2,
      })
    })

    const models = buildOutcomeModels(data(trends, activities))
    expect(models.some((model) => model.outcome.key === 'recoveryScore')).toBe(true)
    expect(models.some((model) => model.outcome.key === 'hrvMs')).toBe(true)
    expect(models.some((model) => model.outcome.key === 'restingHeartRate')).toBe(true)
    expect(models.flatMap((model) => model.predictors).some((predictor) => predictor.key === 'highZoneMinutes')).toBe(true)
  })

  it('does not reuse modeled physiology outcomes as predictors', () => {
    const outcomeKeys = new Set(modelOutcomes.map((outcome) => outcome.key))
    const trends = Array.from({ length: 10 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      return trend(`2026-06-${day}`, {
        steps: 3000 + index * 600,
        calories: 1800 + index * 70,
        activeMinutes: 35 + index * 4,
        zoneMinutes: 20 + index * 3,
        sedentaryMinutes: 620 - index * 9,
        sleepMinutes: 380 + index * 11,
        sleepEfficiency: 79 + index,
        sleepScore: 72 + index * 2,
        hrvMs: 44 + index * 1.8,
        restingHeartRate: 63 - index * 0.8,
        breathingRate: 15.8 - index * 0.05,
        spo2: 95 + index * 0.1,
        strain: 8 + index * 0.5,
        recoveryScore: 52 + index * 2.7,
      })
    })
    const activities = Array.from({ length: 10 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      return activity(`2026-06-${day}`, index % 2 === 0 ? 'Run' : 'Lift', 30 + index * 4, 136 + index, {
        light: 6,
        moderate: 10 + index,
        vigorous: 5 + index * 2,
        peak: 1 + index,
      })
    })

    const models = buildOutcomeModels(data(trends, activities))
    expect(models.length).toBeGreaterThan(0)
    models.forEach((model) => {
      model.predictors.forEach((predictor) => {
        expect(outcomeKeys.has(predictor.key)).toBe(false)
      })
    })
  })

  it('can surface lagged and rolling drivers for delayed adaptation signals', () => {
    const trends = Array.from({ length: 12 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      const previousSleep = index === 0 ? 390 : 390 + (index - 1) * 12
      const rollingSleep = index < 2 ? null : 390 + (index - 2) * 10
      return trend(`2026-06-${day}`, {
        sleepMinutes: 390 + index * 12,
        sleepEfficiency: 80 + index,
        recoveryScore: 45 + previousSleep * 0.08 + (rollingSleep ?? 0) * 0.01,
      })
    })

    const model = buildRecoveryModel(data(trends))
    expect(model).not.toBeNull()
    expect(model?.predictors.some((predictor) => predictor.key === 'previousSleepMinutes' || predictor.key === 'sleepMinutes7dAvg')).toBe(true)
  })
})
