import type { DashboardData, PageId } from '@/types'

const hasNumber = (value: number | null) => value !== null && Number.isFinite(value)

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
    health.strain,
    health.recoveryScore,
    health.bloodGlucoseMgDl,
    health.irregularRhythmAlerts,
  ].some(hasNumber) || Boolean(health.vo2Max || health.ecgClassification) || health.heartRateIntraday.length > 0
}

export function hasSleepData(data: DashboardData) {
  return hasNumber(data.sleep.totalMinutes)
    || hasNumber(data.sleep.score)
    || hasNumber(data.sleep.performance)
    || data.sleep.stages.some((stage) => stage.minutes > 0)
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
    data.health.strain,
    data.health.recoveryScore,
    data.health.bloodGlucoseMgDl,
    data.sleep.totalMinutes,
    data.sleep.score,
    data.sleep.performance,
    data.body.weightKg,
    data.body.bmi,
    data.body.bodyFat,
    data.body.waterMl,
    data.body.caloriesIn,
  ].filter(hasNumber).length
}
