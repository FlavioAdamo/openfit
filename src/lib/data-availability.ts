import type { DashboardData, PageId } from '@/types'

const hasNumber = (value: number | null) => value !== null && Number.isFinite(value)
const hasMultipleValues = (values: Array<number | null>) => values.filter(hasNumber).length > 1

export function hasActivityData(data: DashboardData) {
  const activity = data.activity
  return [
    activity.steps,
    activity.calories,
    activity.distanceKm,
    activity.floors,
    activity.activeMinutes,
    activity.zoneMinutes,
    activity.sedentaryMinutes,
  ].some(hasNumber) || activity.stepsIntraday.length > 0 || data.activities.length > 0
}

export function hasHealthData(data: DashboardData) {
  const health = data.health
  return [
    health.currentHeartRate,
    health.restingHeartRate,
    health.hrvMs,
    health.breathingRate,
    health.spo2,
    health.skinTemperature,
    health.coreTemperature,
    health.cardioScore,
    health.bloodGlucoseMgDl,
    health.irregularRhythmAlerts,
  ].some(hasNumber) || Boolean(health.vo2Max || health.ecgClassification) || health.heartRateIntraday.length > 0
}

export function hasSleepData(data: DashboardData) {
  const sleep = data.sleep
  return hasNumber(data.sleep.totalMinutes)
    || hasNumber(data.sleep.score)
    || hasNumber(sleep.efficiency)
    || data.sleep.stages.some((stage) => stage.minutes > 0)
    || sleep.stageTimeline.length > 0
    || hasMultipleValues(data.trends.map((point) => point.sleepMinutes))
    || hasMultipleValues(data.trends.map((point) => point.sleepEfficiency))
}

export function hasBodyData(data: DashboardData) {
  return [
    data.body.weightKg,
    data.body.bmi,
    data.body.bodyFat,
    data.body.waterMl,
    data.body.caloriesIn,
  ].some(hasNumber)
}

export function availablePages(data: DashboardData): PageId[] {
  const pages: PageId[] = ['today']
  if (hasActivityData(data)) pages.push('activity')
  if (hasHealthData(data)) pages.push('health')
  if (hasSleepData(data)) pages.push('sleep')
  if (hasBodyData(data)) pages.push('body')
  pages.push('devices')
  return pages
}

export function availableMetricCount(data: DashboardData) {
  return [
    data.activity.steps,
    data.activity.calories,
    data.activity.distanceKm,
    data.activity.floors,
    data.activity.activeMinutes,
    data.activity.zoneMinutes,
    data.activity.sedentaryMinutes,
    data.health.currentHeartRate,
    data.health.restingHeartRate,
    data.health.hrvMs,
    data.health.breathingRate,
    data.health.spo2,
    data.health.skinTemperature,
    data.health.coreTemperature,
    data.health.cardioScore,
    data.health.bloodGlucoseMgDl,
    data.sleep.totalMinutes,
    data.sleep.score,
    data.sleep.efficiency,
    data.body.weightKg,
    data.body.bmi,
    data.body.bodyFat,
    data.body.waterMl,
    data.body.caloriesIn,
  ].filter(hasNumber).length
}
