import { describe, expect, it } from 'vitest'
import { createDemoData } from '@/data/demo'
import type { DashboardData } from '@/types'
import { availableMetricCount, availablePages, hasSleepData } from './data-availability'

function emptyDashboard(): DashboardData {
  const data = createDemoData('2026-06-22')
  return {
    ...data,
    device: null,
    activity: {
      ...data.activity,
      steps: null,
      stepsGoal: null,
      calories: null,
      caloriesGoal: null,
      distanceKm: null,
      distanceGoalKm: null,
      floors: null,
      floorsGoal: null,
      activeMinutes: null,
      lightActiveMinutes: null,
      moderateActiveMinutes: null,
      vigorousActiveMinutes: null,
      activeMinutesGoal: null,
      zoneMinutes: null,
      sedentaryMinutes: null,
      stepsIntraday: [],
      caloriesIntraday: [],
    },
    health: {
      currentHeartRate: null,
      restingHeartRate: null,
      heartRateMin: null,
      heartRateMax: null,
      heartRateIntraday: [],
      hrvMs: null,
      hrvDeepSleepRmssdMs: null,
      hrvEntropy: null,
      nonRemHeartRate: null,
      breathingRate: null,
      spo2: null,
      spo2Min: null,
      spo2Max: null,
      skinTemperature: null,
      skinNightlyTemperatureCelsius: null,
      skinBaselineTemperatureCelsius: null,
      skinTemperatureStddev30dCelsius: null,
      coreTemperature: null,
      vo2Max: null,
      cardioScore: null,
      ecgClassification: null,
      bloodGlucoseMgDl: null,
      irregularRhythmAlerts: null,
    },
    sleep: {
      totalMinutes: null,
      goalMinutes: null,
      score: null,
      efficiency: null,
      startTime: null,
      endTime: null,
      stages: data.sleep.stages.map((stage) => ({ ...stage, minutes: 0 })),
      stageTimeline: [],
      stageTransitions: { deep: null, light: null, rem: null, wake: null },
      minutesToFallAsleep: null,
      minutesAfterWakeUp: null,
      timeInBed: null,
      minutesAwake: null,
    },
    body: {
      weightKg: null,
      weightGoalKg: null,
      bmi: null,
      bodyFat: null,
      waterMl: null,
      waterGoalMl: null,
      caloriesIn: null,
    },
    trends: [],
    activities: [],
    insights: [],
  }
}

describe('data availability', () => {
  it('keeps only Today and Data visible when real measurements are absent', () => {
    expect(availablePages(emptyDashboard())).toEqual(['today', 'devices'])
  })

  it('marks sleep available when the page has renderable sleep details', () => {
    const data = emptyDashboard()
    data.sleep.efficiency = 91

    expect(hasSleepData(data)).toBe(true)
    expect(availablePages(data)).toEqual(['today', 'sleep', 'devices'])
    expect(availableMetricCount(data)).toBe(1)
  })

  it('marks sleep available for timeline-only and trend-only sleep data', () => {
    const timelineOnly = emptyDashboard()
    timelineOnly.sleep.stageTimeline = [
      { startTime: '2026-06-21T22:00:00Z', endTime: '2026-06-21T22:30:00Z', type: 'light' },
    ]

    const trendOnly = emptyDashboard()
    trendOnly.trends = [
      { ...createDemoData('2026-06-21').trends[0], date: '2026-06-21', sleepMinutes: 410, sleepEfficiency: null },
      { ...createDemoData('2026-06-22').trends[0], date: '2026-06-22', sleepMinutes: 395, sleepEfficiency: null },
    ]

    expect(hasSleepData(timelineOnly)).toBe(true)
    expect(hasSleepData(trendOnly)).toBe(true)
  })

  it('does not mark orphan sleep details available without a renderable sleep section', () => {
    const data = emptyDashboard()
    data.sleep.minutesAwake = 12
    data.sleep.stageTransitions.wake = 2

    expect(hasSleepData(data)).toBe(false)
    expect(availablePages(data)).toEqual(['today', 'devices'])
  })
})
