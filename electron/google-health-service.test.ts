import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { __test } = require('./google-health-service.cjs') as {
  __test: { translateGoogleHealth: (raw: Record<string, any>, date: string) => Record<string, any> }
}

const civil = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return { date: { year, month, day }, time: {} }
}

const daily = (date: string, value: Record<string, unknown>) => ({ civilStartTime: civil(date), civilEndTime: civil(date), ...value })

describe('Google Health adapter', () => {
  it('translates Google Health v4 payloads into the shared dashboard contract', () => {
    const endpoints = __test.translateGoogleHealth({
      userInfo: { name: 'Ada', picture: 'https://example.test/avatar.png' },
      profileRaw: { membershipStartDate: { year: 2024, month: 1, day: 2 } },
      settingsRaw: { timeZone: 'Europe/Rome' },
      devicesRaw: { pairedDevices: [{ name: 'users/me/pairedDevices/air', deviceType: 'TRACKER', deviceVersion: 'Google Fitbit Air', batteryLevel: 88 }] },
      stepsDaily: { rollupDataPoints: [daily('2026-06-22', { steps: { countSum: '8450' } })] },
      caloriesDaily: { rollupDataPoints: [daily('2026-06-22', { totalCalories: { kcalSum: 2200 } })] },
      distanceDaily: { rollupDataPoints: [daily('2026-06-22', { distance: { millimetersSum: '6500000' } })] },
      floorsDaily: { rollupDataPoints: [daily('2026-06-22', { floors: { countSum: '9' } })] },
      activeMinutesDaily: { rollupDataPoints: [daily('2026-06-22', { activeMinutes: { activeMinutesRollupByActivityLevel: [
        { activityLevel: 'LIGHT', activeMinutesSum: '41' },
        { activityLevel: 'MODERATE', activeMinutesSum: '12' },
        { activityLevel: 'VIGOROUS', activeMinutesSum: '22' },
      ] } })] },
      zoneMinutesDaily: { rollupDataPoints: [daily('2026-06-22', { activeZoneMinutes: { sumInCardioHeartZone: '12', sumInFatBurnHeartZone: '18' } })] },
      weightDaily: { rollupDataPoints: [daily('2026-06-22', { weight: { weightGramsAvg: 72500 } })] },
      restingHeartRaw: { dataPoints: [{ dailyRestingHeartRate: { date: { year: 2026, month: 6, day: 22 }, beatsPerMinute: '60' } }] },
      hrvRaw: { dataPoints: [{ dailyHeartRateVariability: {
        date: { year: 2026, month: 6, day: 22 },
        averageHeartRateVariabilityMilliseconds: 47,
        deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 52.4,
        entropy: 4.8,
        nonRemHeartRateBeatsPerMinute: '57',
      } }] },
      spo2Raw: { dataPoints: [{ dailyOxygenSaturation: {
        date: { year: 2026, month: 6, day: 22 },
        averagePercentage: 97.1,
        lowerBoundPercentage: 95.8,
        upperBoundPercentage: 98.5,
      } }] },
      breathingRaw: { dataPoints: [{ dailyRespiratoryRate: { date: { year: 2026, month: 6, day: 22 }, breathsPerMinute: 14.7 } }] },
      skinTemperatureRaw: { dataPoints: [{ dailySleepTemperatureDerivations: {
        date: { year: 2026, month: 6, day: 22 },
        nightlyTemperatureCelsius: 33.2,
        baselineTemperatureCelsius: 33,
        relativeNightlyStddev30dCelsius: 0.18,
      } }] },
      cardioRaw: { dataPoints: [] },
      sleepRaw: { dataPoints: [{ dataPointName: 'sleep-1', sleep: {
        interval: { civilEndTime: civil('2026-06-22'), startTime: '2026-06-21T21:00:00Z', endTime: '2026-06-22T05:00:00Z' },
        metadata: { nap: false },
        summary: {
          minutesAsleep: '420',
          minutesAwake: '35',
          minutesInSleepPeriod: '455',
          minutesToFallAsleep: '4',
          minutesAfterWakeUp: '7',
          stagesSummary: [
            { type: 'ASLEEP', minutes: '420', count: '1' },
            { type: 'AWAKE', minutes: '35', count: '3' },
            { type: 'LIGHT', minutes: '210', count: '12' },
            { type: 'LIGHT', minutes: '210', count: '12' },
            { type: 'DEEP', minutes: '90', count: '5' },
            { type: 'DEEP', minutes: '90', count: '5' },
            { type: 'REM', minutes: '120', count: '6' },
            { type: 'REM', minutes: '120', count: '6' },
          ],
        },
        stages: [
          { type: 'LIGHT', startTime: '2026-06-21T21:00:00Z', endTime: '2026-06-21T22:00:00Z' },
          { type: 'DEEP', startTime: '2026-06-21T22:00:00Z', endTime: '2026-06-21T23:00:00Z' },
        ],
      } }] },
      activitiesRaw: { dataPoints: [{ dataPointName: 'walk-1', exercise: {
        displayName: 'Walk',
        interval: { startTime: '2026-06-22T08:00:00Z', endTime: '2026-06-22T09:00:00Z' },
        activeDuration: '3600s',
        metricsSummary: {
          caloriesKcal: 322,
          distanceMillimeters: 2_011_500,
          steps: '2760',
          averagePaceSecondsPerMeter: 1.523,
          averageHeartRateBeatsPerMinute: '104',
          heartRateZoneDurations: { lightTime: '3060s', moderateTime: '420s', vigorousTime: '120s', peakTime: '0s' },
        },
      } }] },
      stepsIntradayRaw: { dataPoints: [] },
      heartIntradayRaw: { dataPoints: [] },
      ecgRaw: { dataPoints: [
        { electrocardiogram: { interval: { startTime: '2026-06-22T10:00:00Z' }, resultClassification: 'NORMAL_SINUS_RHYTHM' } },
        { electrocardiogram: { interval: { startTime: '2026-06-23T10:00:00Z' }, resultClassification: 'INCONCLUSIVE' } },
      ] },
    }, '2026-06-22')

    expect(endpoints.profile.user.displayName).toBe('Ada')
    expect(endpoints.devices[0].deviceVersion).toBe('Google Fitbit Air')
    expect(endpoints.activity.summary.steps).toBe(8450)
    expect(endpoints.activity.summary.distances[0].distance).toBe(6.5)
    expect(endpoints.activity.summary).toMatchObject({ lightlyActiveMinutes: 41, fairlyActiveMinutes: 12, veryActiveMinutes: 22 })
    expect(endpoints.activity.summary.activeZoneMinutes.totalMinutes).toBe(30)
    expect(endpoints.bodyWeight.weight[0].weight).toBe(72.5)
    expect(endpoints.sleep.sleep[0].isMainSleep).toBe(true)
    expect(endpoints.sleep.sleep[0].logId).toBe('sleep-1')
    expect(endpoints.sleep.sleep[0].levels.summary.wake.minutes).toBe(35)
    expect(endpoints.sleep.sleep[0].levels.summary.wake.count).toBe(3)
    expect(endpoints.sleep.sleep[0].levels.summary.light.minutes).toBe(210)
    expect(endpoints.sleep.sleep[0].levels.data).toEqual([
      { dateTime: '2026-06-21T21:00:00Z', endTime: '2026-06-21T22:00:00Z', level: 'light', seconds: 3600 },
      { dateTime: '2026-06-21T22:00:00Z', endTime: '2026-06-21T23:00:00Z', level: 'deep', seconds: 3600 },
    ])
    expect(endpoints.sleep.sleep[0]).toMatchObject({ minutesToFallAsleep: 4, minutesAfterWakeUp: 7, timeInBed: 455, minutesAwake: 35 })
    expect(endpoints.hrv.hrv[0].value).toEqual({ dailyRmssd: 47, deepRmssd: 52.4, entropy: 4.8, nonRemHeartRate: 57 })
    expect(endpoints.spo2.value).toEqual({ avg: 97.1, min: 95.8, max: 98.5 })
    expect(endpoints.skinTemperature.tempSkin[0].value).toEqual({
      nightlyRelative: 0.2,
      nightlyTemperatureCelsius: 33.2,
      baselineTemperatureCelsius: 33,
      relativeNightlyStddev30dCelsius: 0.18,
    })
    expect(endpoints.activities.activities[0]).toMatchObject({
      calories: 322,
      steps: 2760,
      averagePaceSecondsPerMeter: 1.523,
      heartZoneMinutes: { light: 51, moderate: 7, vigorous: 2, peak: 0 },
    })
    expect(endpoints.ecg.ecgReadings).toHaveLength(1)
    expect(endpoints.metricTrends.values[0]).toMatchObject({
      dateTime: '2026-06-22',
      activeMinutes: 34,
      zoneMinutes: 30,
      hrvMs: 47,
      breathingRate: 14.7,
      spo2: 97.1,
      skinTemperature: 0.2,
    })
  })

  it('keeps missing rollups distinct from genuine zero values', () => {
    const endpoints = __test.translateGoogleHealth({
      stepsDaily: { rollupDataPoints: [
        daily('2026-06-21', { steps: {} }),
        daily('2026-06-22', { steps: { countSum: '0' } }),
      ] },
      activeMinutesDaily: { rollupDataPoints: [daily('2026-06-22', {})] },
    }, '2026-06-22')

    expect(endpoints.stepsTrend['activities-steps'][0].value).toBeNull()
    expect(endpoints.activity.summary.steps).toBe(0)
    expect(endpoints.activity.summary.fairlyActiveMinutes).toBeNull()
    expect(endpoints.activity.summary.veryActiveMinutes).toBeNull()
  })

  it('keeps only overnight HRV and SpO2 samples for the night ending on the selected date', () => {
    const sample = (physicalTime: string, date: string, hours: number, minutes: number) => ({
      physicalTime,
      civilTime: { date: civil(date).date, time: { hours, minutes } },
    })
    const endpoints = __test.translateGoogleHealth({
      hrvIntradayRaw: { dataPoints: [
        { heartRateVariability: { sampleTime: sample('2026-06-22T01:00:00Z', '2026-06-22', 3, 0), rootMeanSquareOfSuccessiveDifferencesMilliseconds: 41.2 } },
        { heartRateVariability: { sampleTime: sample('2026-06-21T21:30:00Z', '2026-06-21', 23, 30), rootMeanSquareOfSuccessiveDifferencesMilliseconds: 37.1 } },
        // The night before the selected one: outside the window.
        { heartRateVariability: { sampleTime: sample('2026-06-21T01:00:00Z', '2026-06-21', 3, 0), rootMeanSquareOfSuccessiveDifferencesMilliseconds: 50 } },
      ] },
      spo2IntradayRaw: { dataPoints: [
        { oxygenSaturation: { sampleTime: sample('2026-06-22T02:00:00Z', '2026-06-22', 4, 0), percentage: 94.8 } },
      ] },
    }, '2026-06-22')

    expect(endpoints.hrvIntraday.dataset).toEqual([
      { time: '23:30', dateTime: '2026-06-21T23:30', value: 37.1 },
      { time: '03:00', dateTime: '2026-06-22T03:00', value: 41.2 },
    ])
    expect(endpoints.spo2Intraday.dataset).toEqual([{ time: '04:00', dateTime: '2026-06-22T04:00', value: 94.8 }])
  })
})
