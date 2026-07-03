import { describe, expect, it } from 'vitest'
import { normalizeFitbitData } from './normalize'
import type { RawFitbitPayload } from '../types'

describe('normalizeFitbitData', () => {
  it('normalizes legacy Fitbit responses without inventing missing metrics', () => {
    const payload: RawFitbitPayload = {
      source: 'fitbit',
      date: '2026-06-22',
      generatedAt: '2026-06-22T12:00:00.000Z',
      endpoints: {
        profile: { user: { displayName: 'Ada', timezone: 'Europe/Rome' } },
        devices: [{ id: 'air', type: 'TRACKER', deviceVersion: 'Google Fitbit Air', batteryLevel: 76 }],
        activity: { summary: { steps: 8123, caloriesOut: 2050, distances: [{ activity: 'total', distance: 6.4 }] } },
        activityGoals: { goals: { steps: 10_000 } },
        heartIntraday: {
          'activities-heart': [{ value: { restingHeartRate: 61 } }],
          'activities-heart-intraday': { dataset: [{ time: '12:00:00', value: 72 }] },
        },
        sleep: { sleep: [] },
      },
      errors: [],
      rateLimit: { limit: 150, remaining: 120, resetSeconds: 1200 },
    }

    const result = normalizeFitbitData(payload)

    expect(result.profile.displayName).toBe('Ada')
    expect(result.device?.name).toBe('Google Fitbit Air')
    expect(result.activity.steps).toBe(8123)
    expect(result.health.currentHeartRate).toBe(72)
    expect(result.health.spo2).toBeNull()
    expect(result.health.spo2Min).toBeNull()
    expect(result.health.hrvDeepSleepRmssdMs).toBeNull()
    expect(result.health.skinNightlyTemperatureCelsius).toBeNull()
    expect(result.activity.lightActiveMinutes).toBeNull()
    expect(result.sleep.stageTimeline).toEqual([])
    expect(result.sleep.stageTransitions).toEqual({ deep: null, light: null, rem: null, wake: null })
    expect(result.source).toBe('fitbit')
  })

  it('preserves the detailed Google health, sleep, and exercise metrics', () => {
    const payload: RawFitbitPayload = {
      source: 'google-health',
      date: '2026-06-22',
      generatedAt: '2026-06-22T12:00:00.000Z',
      endpoints: {
        activity: { summary: {
          lightlyActiveMinutes: 41,
          fairlyActiveMinutes: 12,
          veryActiveMinutes: 22,
        } },
        hrv: { hrv: [{ value: { dailyRmssd: 47, deepRmssd: 52.4, entropy: 4.8, nonRemHeartRate: 57 } }] },
        spo2: { value: { avg: 97.1, min: 95.8, max: 98.5 } },
        skinTemperature: { tempSkin: [{ value: {
          nightlyRelative: 0.2,
          nightlyTemperatureCelsius: 33.2,
          baselineTemperatureCelsius: 33,
          relativeNightlyStddev30dCelsius: 0.18,
        } }] },
        sleep: { sleep: [{
          isMainSleep: true,
          minutesAsleep: 420,
          minutesAwake: 35,
          minutesToFallAsleep: 4,
          minutesAfterWakeUp: 7,
          timeInBed: 455,
          levels: {
            summary: { deep: { minutes: 90, count: 1 }, light: { minutes: 210, count: 1 } },
            data: [
              { dateTime: '2026-06-21T21:00:00Z', level: 'light', seconds: 3600 },
              { dateTime: '2026-06-21T22:00:00Z', level: 'deep', seconds: 3600 },
              { dateTime: '2026-06-21T23:00:00Z', level: 'wake', seconds: 300 },
            ],
          },
        }] },
        activities: { activities: [{
          logId: 'walk-1',
          activityName: 'Walk',
          startTime: '2026-06-22T08:00:00Z',
          duration: 3_600_000,
          calories: 322,
          steps: 2760,
          averagePaceSecondsPerMeter: 1.523,
          heartZoneMinutes: { light: 51, moderate: 7, vigorous: 2, peak: 0 },
        }, {
          logId: 'legacy-run',
          activityName: 'Run',
          heartRateZones: [
            { name: 'Fat Burn', minutes: 8 },
            { name: 'Cardio', minutes: 12 },
            { name: 'Peak', minutes: 3 },
          ],
        }] },
      },
      errors: [],
      rateLimit: { limit: null, remaining: null, resetSeconds: null },
    }

    const result = normalizeFitbitData(payload)

    expect(result.activity).toMatchObject({
      activeMinutes: 34,
      lightActiveMinutes: 41,
      moderateActiveMinutes: 12,
      vigorousActiveMinutes: 22,
    })
    expect(result.health).toMatchObject({
      hrvMs: 47,
      hrvDeepSleepRmssdMs: 52.4,
      hrvEntropy: 4.8,
      nonRemHeartRate: 57,
      spo2: 97.1,
      spo2Min: 95.8,
      spo2Max: 98.5,
      skinTemperature: 0.2,
      skinNightlyTemperatureCelsius: 33.2,
      skinBaselineTemperatureCelsius: 33,
      skinTemperatureStddev30dCelsius: 0.18,
    })
    expect(result.sleep).toMatchObject({
      minutesToFallAsleep: 4,
      minutesAfterWakeUp: 7,
      timeInBed: 455,
      minutesAwake: 35,
      stageTransitions: { deep: 1, light: 1, rem: null, wake: 1 },
    })
    expect(result.sleep.stageTimeline).toEqual([
      { startTime: '2026-06-21T21:00:00Z', endTime: '2026-06-21T22:00:00.000Z', type: 'light' },
      { startTime: '2026-06-21T22:00:00Z', endTime: '2026-06-21T23:00:00.000Z', type: 'deep' },
      { startTime: '2026-06-21T23:00:00Z', endTime: '2026-06-21T23:05:00.000Z', type: 'wake' },
    ])
    expect(result.activities[0]).toMatchObject({
      calories: 322,
      steps: 2760,
      averagePaceSecondsPerMeter: 1.523,
      heartZoneMinutes: { light: 51, moderate: 7, vigorous: 2, peak: 0 },
    })
    expect(result.activities[1].heartZoneMinutes).toEqual({ light: null, moderate: 8, vigorous: 12, peak: 3 })
  })

  it('compacts dense heart samples while preserving the raw summary values', () => {
    const dataset = Array.from({ length: 31_060 }, (_, index) => ({
      time: `${String(Math.floor(index / 3600) % 24).padStart(2, '0')}:${String(Math.floor(index / 60) % 60).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}`,
      value: index === 0 ? 41 : index === 31_059 ? 173 : 70 + (index % 12),
    }))
    const payload: RawFitbitPayload = {
      source: 'google-health',
      date: '2026-06-22',
      generatedAt: '2026-06-22T12:00:00.000Z',
      endpoints: {
        heartIntraday: {
          'activities-heart': [{ value: { restingHeartRate: 58 } }],
          'activities-heart-intraday': { dataset },
        },
      },
      errors: [],
      rateLimit: { limit: null, remaining: null, resetSeconds: null },
    }

    const result = normalizeFitbitData(payload)

    expect(result.health.heartRateIntraday.length).toBeLessThanOrEqual(288)
    expect(result.health.currentHeartRate).toBe(173)
    expect(result.health.heartRateMin).toBe(41)
    expect(result.health.heartRateMax).toBe(173)
  })

  it('derives the daily step total from intervals when a rollup is unavailable', () => {
    const payload: RawFitbitPayload = {
      source: 'google-health',
      date: '2026-06-22',
      generatedAt: '2026-06-22T12:00:00.000Z',
      endpoints: {
        activity: { summary: { steps: null } },
        stepsIntraday: {
          'activities-steps-intraday': {
            dataset: [
              { time: '08:00', value: 120 },
              { time: '08:05', value: 85 },
            ],
          },
        },
      },
      errors: [],
      rateLimit: { limit: null, remaining: null, resetSeconds: null },
    }

    expect(normalizeFitbitData(payload).activity.steps).toBe(205)
  })

  it('keeps sleep efficiency separate from a missing sleep score', () => {
    const payload: RawFitbitPayload = {
      source: 'google-health',
      date: '2026-06-22',
      generatedAt: '2026-06-22T12:00:00.000Z',
      endpoints: {
        sleep: {
          sleep: [{ isMainSleep: true, minutesAsleep: 410, efficiency: 93 }],
        },
        sleepTrend: {
          sleep: [{ dateOfSleep: '2026-06-22', isMainSleep: true, minutesAsleep: 410, efficiency: 93 }],
        },
      },
      errors: [],
      rateLimit: { limit: null, remaining: null, resetSeconds: null },
    }

    const result = normalizeFitbitData(payload)

    expect(result.sleep.efficiency).toBe(93)
    expect(result.sleep.score).toBeNull()
    expect(result.trends[0]?.sleepScore).toBeNull()
  })

  it('preserves multi-day health metric context for personal baselines', () => {
    const payload: RawFitbitPayload = {
      source: 'google-health',
      date: '2026-06-22',
      generatedAt: '2026-06-22T12:00:00.000Z',
      endpoints: {
        metricTrends: {
          values: [
            { dateTime: '2026-06-21', hrvMs: 44, spo2: 96.8, breathingRate: 14.4, skinTemperature: -0.1 },
            { dateTime: '2026-06-22', hrvMs: 48, spo2: 97.2, breathingRate: 14.8, skinTemperature: 0.2 },
          ],
        },
      },
      errors: [],
      rateLimit: { limit: null, remaining: null, resetSeconds: null },
    }

    const result = normalizeFitbitData(payload)

    expect(result.trends).toHaveLength(2)
    expect(result.trends[0]).toMatchObject({ hrvMs: 44, spo2: 96.8, breathingRate: 14.4, skinTemperature: -0.1 })
    expect(result.trends[1]).toMatchObject({ hrvMs: 48, spo2: 97.2, breathingRate: 14.8, skinTemperature: 0.2 })
  })

  it('normalizes WHOOP API data into canonical OpenFit fields', () => {
    const payload: RawFitbitPayload = {
      source: 'whoop',
      date: '2026-06-22',
      generatedAt: '2026-06-22T12:00:00.000Z',
      endpoints: {
        profile: { user: { displayName: 'Ada Whoop' } },
        devices: [{ id: 'whoop-1', type: 'WHOOP_ACCOUNT', deviceVersion: 'WHOOP', features: ['RECOVERY', 'STRAIN'] }],
        activity: { summary: { caloriesOut: 2400, activeZoneMinutes: { totalMinutes: 47 } } },
        heartIntraday: { 'activities-heart': [{ value: { restingHeartRate: 61 } }], 'activities-heart-intraday': { dataset: [] } },
        hrv: { hrv: [{ value: { dailyRmssd: 42.5 } }] },
        spo2: { value: { avg: 96.8 } },
        breathing: { br: [{ value: { breathingRate: 15.2 } }] },
        skinTemperature: { tempSkin: [{ value: { nightlyTemperatureCelsius: 33.7 } }] },
        sleep: {
          sleep: [{
            logId: 'sleep-1',
            dateOfSleep: '2026-06-22',
            isMainSleep: true,
            sleepPerformance: 88,
            minutesAsleep: 421,
            minutesAwake: 34,
            timeInBed: 455,
            efficiency: 92,
            levels: {
              summary: {
                deep: { minutes: 72 },
                light: { minutes: 246 },
                rem: { minutes: 103 },
                wake: { minutes: 34, count: 9 },
              },
              data: [],
            },
          }],
        },
        sleepTrend: { sleep: [{ dateOfSleep: '2026-06-22', isMainSleep: true, minutesAsleep: 421, efficiency: 92 }] },
        activities: { activities: [{ logId: 'workout-1', activityName: 'running', startTime: '2026-06-22T18:00:00Z', duration: 2_400_000, calories: 375, averageHeartRate: 141, strain: 11.6 }] },
        metricTrends: {
          values: [
            { dateTime: '2026-06-21', hrvMs: 39, spo2: 96.1, recoveryScore: 64, strain: 9.2, sleepPerformance: 81 },
            { dateTime: '2026-06-22', hrvMs: 42.5, spo2: 96.8, breathingRate: 15.2, recoveryScore: 72, strain: 12.4, sleepPerformance: 88 },
          ],
        },
      },
      errors: [],
      rateLimit: { limit: 100, remaining: 98, resetSeconds: 3 },
    }

    const result = normalizeFitbitData(payload)

    expect(result.source).toBe('whoop')
    expect(result.profile.displayName).toBe('Ada Whoop')
    expect(result.health.restingHeartRate).toBe(61)
    expect(result.health.hrvMs).toBe(42.5)
    expect(result.health.spo2).toBe(96.8)
    expect(result.health.breathingRate).toBe(15.2)
    expect(result.health.skinNightlyTemperatureCelsius).toBe(33.7)
    expect(result.health.recoveryScore).toBe(72)
    expect(result.health.strain).toBe(12.4)
    expect(result.sleep.performance).toBe(88)
    expect(result.sleep.efficiency).toBe(92)
    expect(result.sleep.stages.map((stage) => [stage.key, stage.minutes])).toEqual([
      ['deep', 72],
      ['light', 246],
      ['rem', 103],
      ['wake', 34],
    ])
    expect(result.trends.at(-1)).toMatchObject({ recoveryScore: 72, strain: 12.4, sleepPerformance: 88, hrvMs: 42.5, spo2: 96.8 })
    expect(result.activities[0]).toMatchObject({ id: 'workout-1', name: 'running', calories: 375, averageHeartRate: 141, strain: 11.6 })
  })
})
