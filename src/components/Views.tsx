import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { ActivityItem, DashboardData, FitbitAuthStatus, PageId, TimePoint } from '@/types'
import { BulletChart, ColumnChart, LineChart, RadialProgress, SleepStageBar, SleepStageTimeline } from './Charts'
import { DuoIcon, EmptyValue, MetricTile, Panel, PanelHeader } from './Shared'
import type { AppIcon } from './icons'
import {
  ActiveIcon,
  ActivityIcon,
  BatteryIcon,
  BodyIcon,
  BreathingIcon,
  CaloriesIcon,
  CheckIcon,
  ChevronRightIcon,
  CloudIcon,
  DeviceIcon,
  DistanceIcon,
  DurationIcon,
  FloorsIcon,
  GaugeIcon,
  HeartIcon,
  InfoIcon,
  NutritionIcon,
  ShieldIcon,
  SignalIcon,
  SleepIcon,
  SparkleIcon,
  StepsIcon,
  TrendIcon,
  WaterIcon,
} from './icons'
import {
  compactMinutes,
  formatDate,
  formatDecimal,
  formatMinutes,
  formatNumber,
  formatTime,
  relativeTime,
} from '@/lib/format'
import { availableMetricCount, hasActivityData, hasBodyData, hasHealthData, hasSleepData } from '@/lib/data-availability'
import { analyzeHome } from '@/lib/home-analysis'
import type { BaselineComparison } from '@/lib/home-analysis'

interface ViewProps {
  data: DashboardData
  status: FitbitAuthStatus
  navigate: (page: PageId) => void
}

interface Signal {
  label: string
  value: string
  unit?: string
  note: string
  icon: AppIcon
}

interface SupportingMetric {
  label: string
  value: string
  unit?: string
  icon: AppIcon
}

function hasValue(value: number | null | undefined): value is number {
  return value !== null && Number.isFinite(value)
}

function SectionTitle({ title, copy, action }: { title: string; copy?: string; action?: ReactNode }) {
  return (
    <div className="section-title">
      <div><h2>{title}</h2>{copy && <p>{copy}</p>}</div>
      {action}
    </div>
  )
}

function TinyStat({ label, value, unit = '' }: { label: string; value: string | number; unit?: string }) {
  return <div className="tiny-stat"><span>{label}</span><strong>{value}{unit}</strong></div>
}

function SignalRow({ signal }: { signal: Signal }) {
  const Icon = signal.icon
  return (
    <div className="signal-row">
      <DuoIcon icon={Icon} className="signal-icon" />
      <div className="signal-copy"><strong>{signal.label}</strong><span>{signal.note}</span></div>
      <div className="signal-value"><strong>{signal.value}</strong>{signal.unit && <span>{signal.unit}</span>}</div>
    </div>
  )
}

function SupportingMetrics({ items }: { items: SupportingMetric[] }) {
  if (!items.length) return null
  return (
    <Panel className="supporting-metrics" category="activity">
      {items.map(({ label, value, unit, icon: Icon }, index) => (
        <div className="supporting-metric" key={label}>
          {index > 0 && <Separator orientation="vertical" />}
          <DuoIcon icon={Icon} className="supporting-icon" />
          <div><span>{label}</span><strong>{value}{unit && <small>{unit}</small>}</strong></div>
        </div>
      ))}
    </Panel>
  )
}

function presentSignals(signals: Array<Signal | null>): Signal[] {
  return signals.filter((signal): signal is Signal => signal !== null)
}

function overnightSignals(data: DashboardData): Signal[] {
  const hrvDetails = [
    hasValue(data.health.hrvDeepSleepRmssdMs) ? `deep ${formatDecimal(data.health.hrvDeepSleepRmssdMs)} ms` : null,
    hasValue(data.health.nonRemHeartRate) ? `non-REM ${formatNumber(data.health.nonRemHeartRate)} bpm` : null,
    hasValue(data.health.hrvEntropy) ? `entropy ${formatDecimal(data.health.hrvEntropy, 2)}` : null,
  ].filter(Boolean).join(' · ')
  const spo2Details = hasValue(data.health.spo2Min) && hasValue(data.health.spo2Max)
    ? `Range ${formatDecimal(data.health.spo2Min)}–${formatDecimal(data.health.spo2Max)}%`
    : 'Average saturation'
  const temperatureDetails = [
    hasValue(data.health.skinNightlyTemperatureCelsius) ? `night ${formatDecimal(data.health.skinNightlyTemperatureCelsius)}°` : null,
    hasValue(data.health.skinBaselineTemperatureCelsius) ? `baseline ${formatDecimal(data.health.skinBaselineTemperatureCelsius)}°` : null,
    hasValue(data.health.skinTemperatureStddev30dCelsius) ? `30d σ ${formatDecimal(data.health.skinTemperatureStddev30dCelsius, 2)}°` : null,
  ].filter(Boolean).join(' · ')
  return presentSignals([
    hasValue(data.health.hrvMs) ? { label: 'HRV', value: formatDecimal(data.health.hrvMs), unit: 'ms', note: hrvDetails || 'Average heart rate variability', icon: SignalIcon } : null,
    hasValue(data.health.spo2) ? { label: 'Oxygen', value: formatDecimal(data.health.spo2), unit: '%', note: spo2Details, icon: CloudIcon } : null,
    hasValue(data.health.breathingRate) ? { label: 'Breathing', value: formatDecimal(data.health.breathingRate), unit: 'rpm', note: 'Nightly rate', icon: BreathingIcon } : null,
    hasValue(data.health.skinTemperature) ? {
      label: 'Temperature',
      value: `${data.health.skinTemperature > 0 ? '+' : ''}${formatDecimal(data.health.skinTemperature)}`,
      unit: '°C',
      note: temperatureDetails || 'Skin temperature variation',
      icon: GaugeIcon,
    } : null,
    hasValue(data.health.coreTemperature) ? { label: 'Body temperature', value: formatDecimal(data.health.coreTemperature), unit: '°C', note: 'Latest reading', icon: GaugeIcon } : null,
  ])
}

function formatPace(secondsPerMeter: number | null | undefined) {
  if (!hasValue(secondsPerMeter) || secondsPerMeter <= 0) return null
  const secondsPerKm = Math.round(secondsPerMeter * 1000)
  return `${Math.floor(secondsPerKm / 60)}:${String(secondsPerKm % 60).padStart(2, '0')} min/km`
}

function CompactActivity({ item, detailed = false }: { item: ActivityItem; detailed?: boolean }) {
  const pace = formatPace(item.averagePaceSecondsPerMeter)
  const zoneDetails = [
    hasValue(item.heartZoneMinutes?.light) && item.heartZoneMinutes.light > 0 ? `Light ${formatNumber(item.heartZoneMinutes.light)} min` : null,
    hasValue(item.heartZoneMinutes?.moderate) && item.heartZoneMinutes.moderate > 0 ? `Moderate ${formatNumber(item.heartZoneMinutes.moderate)} min` : null,
    hasValue(item.heartZoneMinutes?.vigorous) && item.heartZoneMinutes.vigorous > 0 ? `Vigorous ${formatNumber(item.heartZoneMinutes.vigorous)} min` : null,
    hasValue(item.heartZoneMinutes?.peak) && item.heartZoneMinutes.peak > 0 ? `Peak ${formatNumber(item.heartZoneMinutes.peak)} min` : null,
  ].filter((value): value is string => Boolean(value))
  return (
    <div className={`activity-row ${detailed ? 'is-detailed' : ''}`}>
      <DuoIcon icon={ActivityIcon} className="activity-icon" />
      <div className="activity-copy">
        <strong>{item.name}</strong>
        <span>{formatDate(item.date, { day: 'numeric', month: 'short' })}{item.time ? ` · ${item.time}` : ''}</span>
      </div>
      <div className="activity-meta">
        {item.durationMinutes > 0 && <span>{item.durationMinutes} min</span>}
        {hasValue(item.distanceKm) && <span>{formatDecimal(item.distanceKm)} km</span>}
        {hasValue(item.averageHeartRate) && <span>{formatNumber(item.averageHeartRate)} bpm</span>}
        {detailed && hasValue(item.calories) && <span>{formatNumber(item.calories)} kcal</span>}
      </div>
      {detailed && (hasValue(item.steps) || pace || zoneDetails.length > 0) && (
        <div className="activity-detail-row">
          {hasValue(item.steps) && <span><strong>{formatNumber(item.steps)}</strong> steps</span>}
          {pace && <span><strong>{pace}</strong> average pace</span>}
          {zoneDetails.map((detail) => <span key={detail}>{detail}</span>)}
        </div>
      )}
    </div>
  )
}

function trendLabels(data: DashboardData) {
  return data.trends.map((point) => formatDate(point.date, { day: 'numeric', month: 'short' }))
}

function trendXValues(data: DashboardData) {
  return data.trends.map((point, index) => {
    const value = new Date(`${point.date}T12:00:00`).getTime()
    return Number.isFinite(value) ? value : index
  })
}

function timeXValues(labels: string[]) {
  return labels.map((label, index) => {
    const match = label.match(/(\d{1,2}):(\d{2})/)
    return match ? Number(match[1]) * 60 + Number(match[2]) : index
  })
}

function hourlyBuckets(points: TimePoint[]) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, value: 0, seen: false }))
  points.forEach((point) => {
    const match = point.time.match(/(\d{1,2}):(\d{2})/)
    if (!match) return
    const hour = Number(match[1])
    if (hour < 0 || hour > 23) return
    buckets[hour].value += point.value
    buckets[hour].seen = true
  })
  return {
    values: buckets.map((bucket) => bucket.seen ? bucket.value : null),
    labels: buckets.map((bucket) => `${String(bucket.hour).padStart(2, '0')}:00`),
    xValues: buckets.map((bucket) => bucket.hour),
  }
}

function sleepScoreCategory(value: number) {
  if (value >= 90) return 'Excellent'
  if (value >= 80) return 'Good'
  if (value >= 60) return 'Fair'
  return 'Poor'
}

type HomeCategory = 'activity' | 'heart' | 'sleep' | 'recovery' | 'body'

const trendColors: Record<HomeCategory, string> = {
  activity: 'var(--category-activity)',
  heart: 'var(--category-heart)',
  sleep: 'var(--category-sleep)',
  recovery: 'var(--category-recovery)',
  body: 'var(--category-body)',
}

function MetricTrendPanel({
  data,
  category,
  icon,
  title,
  values,
  formatter,
  target = null,
}: {
  data: DashboardData
  category: HomeCategory
  icon: AppIcon
  title: string
  values: Array<number | null>
  formatter: (value: number) => string
  target?: number | null
}) {
  const count = values.filter(hasValue).length
  if (count < 2) return null
  const latest = [...values].reverse().find(hasValue) ?? null
  return (
    <Panel className="metric-trend-card" category={category}>
      <PanelHeader
        eyebrow={`${count} days with data`}
        title={title}
        icon={icon}
        action={latest === null ? null : <Badge variant="secondary">{formatter(latest)}</Badge>}
      />
      <LineChart
        values={values}
        labels={trendLabels(data)}
        xValues={trendXValues(data)}
        target={target}
        color={trendColors[category]}
        height={156}
        compact
        showRangeLabels
        variant="area"
        formatter={formatter}
        ariaLabel={`${title} during the synced period`}
      />
    </Panel>
  )
}

function signedNumber(value: number, digits = 0) {
  const formatted = formatNumber(Math.abs(value), { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatted}`
}

function baselineNote(comparison: BaselineComparison, unit: string, digits = 0) {
  if (comparison.difference === null || comparison.sampleCount < 3) return 'Building baseline'
  return `${signedNumber(comparison.difference, digits)} ${unit} · ${comparison.sampleCount} days`
}

function DetailAction({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="panel-detail-action" onClick={onClick} aria-label={label}><ChevronRightIcon aria-hidden="true" /></button>
}

function HomeSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const titleId = `home-section-${id}`
  return (
    <section className="home-section" aria-labelledby={titleId}>
      <div className="home-section-title"><h2 id={titleId}>{title}</h2></div>
      {children}
    </section>
  )
}

function DailySummaryMetric({
  category,
  icon: Icon,
  label,
  value,
  note,
  onClick,
}: {
  category: HomeCategory
  icon: AppIcon
  label: string
  value: string
  note: string
  onClick: () => void
}) {
  return (
    <Panel className="daily-summary-metric" category={category} onClick={onClick} ariaLabel={`${label}: ${value}, ${note}`}>
      <DuoIcon icon={Icon} className="daily-summary-icon" />
      <span className="daily-summary-copy"><small>{label}</small><strong>{value}</strong><span>{note}</span></span>
    </Panel>
  )
}

function TrendStats({
  current,
  average,
  difference,
  sampleCount,
}: {
  current: string
  average: string
  difference: string
  sampleCount: number
}) {
  return (
    <div className="mini-trend-stats">
      <div><span>Today</span><strong>{current}</strong></div>
      <div><span>{sampleCount ? `${sampleCount}-day average` : 'Recent average'}</span><strong>{average}</strong></div>
      <div><span>vs average</span><strong>{difference}</strong></div>
    </div>
  )
}

function VitalSnapshot({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="vital-snapshot">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function TodayView({ data, navigate }: ViewProps) {
  const analysis = analyzeHome(data)
  const stepsByHour = hourlyBuckets(data.activity.stepsIntraday)
  const steps = hasValue(data.activity.steps) ? data.activity.steps : null
  const hasSteps = steps !== null
  const hasHeart = hasValue(data.health.restingHeartRate) || data.health.heartRateIntraday.length > 0
  const hasSleep = hasSleepData(data)
  const stepsTrend = data.trends.map((point) => point.steps)
  const sleepTrend = data.trends.map((point) => point.sleepMinutes)
  const restingHeartTrend = data.trends.map((point) => point.restingHeartRate)
  const stepsTrendCount = stepsTrend.filter(hasValue).length
  const sleepTrendCount = sleepTrend.filter(hasValue).length
  const restingHeartTrendCount = restingHeartTrend.filter(hasValue).length
  const labels = trendLabels(data)
  const xValues = trendXValues(data)
  const sleepGoalNote = data.sleep.totalMinutes === null ? 'Duration unavailable' : analysis.sleepGoalDifference === null
    ? baselineNote(analysis.sleep, 'min')
    : `${formatMinutes(analysis.sleepGoalDifference)} · goal`
  const activityNote = analysis.stepsGoalProgress === null
    ? baselineNote(analysis.steps, 'steps')
    : `${Math.round(analysis.stepsGoalProgress * 100)}% of goal`
  const sleepPrimaryValue = hasValue(data.sleep.totalMinutes)
    ? compactMinutes(data.sleep.totalMinutes)
    : hasValue(data.sleep.score)
      ? `Score ${formatNumber(data.sleep.score)}`
      : hasValue(data.sleep.performance)
        ? `Performance ${formatNumber(data.sleep.performance)}%`
      : data.sleep.stages.some((stage) => stage.minutes > 0) ? 'Stages recorded' : 'Partial data'
  const sleepNote = sleepGoalNote
  const heartNote = baselineNote(analysis.restingHeartRate, 'bpm')
  const vitalSnapshots = [
    hasValue(data.health.recoveryScore) ? {
      id: 'recovery', label: 'Recovery', value: `${formatNumber(data.health.recoveryScore)}%`,
    } : null,
    hasValue(data.health.strain) ? {
      id: 'strain', label: 'Strain', value: formatDecimal(data.health.strain),
    } : null,
    hasValue(data.health.hrvMs) ? {
      id: 'hrv', label: 'HRV', value: `${formatNumber(data.health.hrvMs)} ms`,
    } : null,
    hasValue(data.health.spo2) ? {
      id: 'spo2', label: 'SpO₂', value: `${formatDecimal(data.health.spo2)}%`,
    } : null,
    hasValue(data.health.breathingRate) ? {
      id: 'breathing', label: 'Breathing', value: `${formatDecimal(data.health.breathingRate)} rpm`,
    } : null,
    hasValue(data.health.skinTemperature) ? {
      id: 'temperature', label: 'Temperature', value: `${data.health.skinTemperature > 0 ? '+' : ''}${formatDecimal(data.health.skinTemperature)} °C`,
    } : null,
    hasValue(data.health.coreTemperature) ? {
      id: 'core-temperature', label: 'Body temperature', value: `${formatDecimal(data.health.coreTemperature)} °C`,
    } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null)
  const bodySnapshots = [
    hasValue(data.body.weightKg) ? { label: 'Weight', value: `${formatDecimal(data.body.weightKg)} kg`, note: data.body.weightGoalKg === null ? 'Latest measurement' : `${data.body.weightKg >= data.body.weightGoalKg ? '+' : '−'}${formatDecimal(Math.abs(data.body.weightKg - data.body.weightGoalKg))} kg · goal` } : null,
    hasValue(data.body.bodyFat) ? { label: 'Body fat', value: `${formatDecimal(data.body.bodyFat)}%`, note: 'Estimate' } : null,
    hasValue(data.body.waterMl) ? { label: 'Water', value: `${formatNumber(data.body.waterMl)} ml`, note: data.body.waterGoalMl === null || data.body.waterGoalMl <= 0 ? 'Log' : `${Math.round(data.body.waterMl / data.body.waterGoalMl * 100)}% of goal` } : null,
    hasValue(data.body.caloriesIn) ? { label: 'Calories', value: `${formatNumber(data.body.caloriesIn)} kcal`, note: 'Log' } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null)

  return (
    <div className="page-stack today-page">
      {!hasSteps && !hasHeart && !hasSleep && !hasHealthData(data) && !hasBodyData(data) && data.activities.length === 0 && (
        <Panel className="first-sync-state">
          <CloudIcon aria-hidden="true" />
          <h2>No measurements for this day</h2>
          <p>The connection is working. Try another date or refresh your data.</p>
        </Panel>
      )}

      {(hasSteps || hasHeart || hasSleep || vitalSnapshots.length > 0 || bodySnapshots.length > 0 || data.activities.length > 0) && (
        <div className="home-dashboard">
          <HomeSection id="overview" title="Overview">
            <div className="daily-summary-grid">
              <DailySummaryMetric category="activity" icon={StepsIcon} label="Movement" value={hasSteps ? formatNumber(steps) : '—'} note={hasSteps ? activityNote : 'Unavailable'} onClick={() => navigate('activity')} />
              <DailySummaryMetric category="sleep" icon={SleepIcon} label="Sleep" value={hasSleep ? sleepPrimaryValue : '—'} note={hasSleep ? sleepNote : 'Unavailable'} onClick={() => navigate('sleep')} />
              <DailySummaryMetric category="heart" icon={HeartIcon} label="Resting heart rate" value={hasValue(data.health.restingHeartRate) ? `${formatNumber(data.health.restingHeartRate)} bpm` : '—'} note={hasValue(data.health.restingHeartRate) ? heartNote : 'Unavailable'} onClick={() => navigate('health')} />
            </div>
          </HomeSection>

          <HomeSection id="activity-recovery" title="Activity and recovery">
            <div className="home-core-grid">
            {hasSteps && (
              <Panel className="home-movement-card" category="activity" onClick={() => navigate('activity')} ariaLabel="Open Activity">
                <PanelHeader title="Movement" icon={StepsIcon} action={<ChevronRightIcon aria-hidden="true" />} />
                <div className="home-card-lead">
                  <div><strong>{formatNumber(steps)}</strong><span>steps</span></div>
                  {data.activity.stepsGoal !== null && data.activity.stepsGoal > 0 && <RadialProgress value={steps} max={data.activity.stepsGoal} color="var(--category-activity)" label="goal" valueLabel={`${Math.round(steps / data.activity.stepsGoal * 100)}%`} size={78} />}
                </div>
                {data.activity.stepsIntraday.length > 0 && (
                  <div className="home-primary-chart">
                    <div className="home-chart-label"><span>Steps per hour</span></div>
                    <ColumnChart values={stepsByHour.values} labels={stepsByHour.labels} xValues={stepsByHour.xValues} color="var(--category-activity)" height={156} compact showRangeLabels formatter={(value) => `${formatNumber(value)} steps`} ariaLabel="Steps per hour on the selected day" />
                  </div>
                )}
                <div className="home-fact-row">
                  {hasValue(data.activity.activeMinutes) && <TinyStat label="Active minutes" value={formatNumber(data.activity.activeMinutes)} unit=" min" />}
                  {hasValue(data.activity.zoneMinutes) && <TinyStat label="Zone minutes" value={formatNumber(data.activity.zoneMinutes)} unit=" min" />}
                  {hasValue(data.activity.distanceKm) && <TinyStat label="Distance" value={formatDecimal(data.activity.distanceKm)} unit=" km" />}
                  {hasValue(data.activity.sedentaryMinutes) && <TinyStat label="Sedentary time" value={formatMinutes(data.activity.sedentaryMinutes)} />}
                </div>
              </Panel>
            )}

            {(hasSleep || vitalSnapshots.length > 0) && (
              <div className="home-side-stack">
                {hasSleep && (
                  <Panel className="home-sleep-overview" category="sleep" onClick={() => navigate('sleep')} ariaLabel="Open Sleep">
                    <PanelHeader title="Sleep" icon={SleepIcon} action={<ChevronRightIcon aria-hidden="true" />} />
                    <div className="sleep-overview-lead">
                      <div className="sleep-overview-duration"><strong>{sleepPrimaryValue}</strong>{(data.sleep.startTime || data.sleep.endTime) && <span>{formatTime(data.sleep.startTime)} – {formatTime(data.sleep.endTime)}</span>}<small>{sleepGoalNote}</small></div>
                      {(hasValue(data.sleep.score) || hasValue(data.sleep.performance) || hasValue(data.sleep.efficiency)) && <RadialProgress value={data.sleep.score ?? data.sleep.performance ?? data.sleep.efficiency} color="var(--category-sleep)" label={hasValue(data.sleep.score) ? sleepScoreCategory(data.sleep.score) : hasValue(data.sleep.performance) ? 'performance' : 'efficiency'} valueLabel={formatNumber(data.sleep.score ?? data.sleep.performance ?? data.sleep.efficiency)} size={68} />}
                    </div>
                    {data.sleep.stages.some((stage) => stage.minutes > 0) && <SleepStageBar stages={data.sleep.stages} compact showLegend={false} />}
                  </Panel>
                )}

                {vitalSnapshots.length > 0 && (
                  <Panel className="home-vitals-card" category="recovery" onClick={() => navigate('health')} ariaLabel="Open Health">
                    <PanelHeader title="Nightly signals" icon={SignalIcon} action={<ChevronRightIcon aria-hidden="true" />} />
                    <div className="vital-snapshot-grid">{vitalSnapshots.map((item) => <VitalSnapshot key={item.id} {...item} />)}</div>
                  </Panel>
                )}
              </div>
            )}
            </div>
          </HomeSection>

          {(stepsTrendCount > 1 || sleepTrendCount > 1 || restingHeartTrendCount > 1) && (
            <HomeSection id="trends" title="Personal trends">
              <div className="home-trend-grid">
                {stepsTrendCount > 1 && (
                  <Panel className="home-mini-trend" category="activity">
                    <div className="mini-trend-heading"><DuoIcon icon={StepsIcon} className="mini-trend-icon" /><strong>Steps</strong></div>
                    <TrendStats
                      current={formatNumber(analysis.steps.current)}
                      average={formatNumber(analysis.steps.baseline)}
                      difference={analysis.steps.difference === null ? '—' : signedNumber(analysis.steps.difference)}
                      sampleCount={analysis.steps.sampleCount}
                    />
                    <ColumnChart values={stepsTrend} labels={labels} xValues={xValues} target={data.activity.stepsGoal} color="var(--category-activity)" height={108} compact showRangeLabels formatter={(value) => `${formatNumber(value)} steps`} ariaLabel="Daily steps over the last 14 days" />
                  </Panel>
                )}
                {sleepTrendCount > 1 && (
                  <Panel className="home-mini-trend" category="sleep">
                    <div className="mini-trend-heading"><DuoIcon icon={SleepIcon} className="mini-trend-icon" /><strong>Sleep</strong></div>
                    <TrendStats
                      current={compactMinutes(analysis.sleep.current)}
                      average={compactMinutes(analysis.sleep.baseline)}
                      difference={formatMinutes(analysis.sleep.difference)}
                      sampleCount={analysis.sleep.sampleCount}
                    />
                    <ColumnChart values={sleepTrend} labels={labels} xValues={xValues} target={data.sleep.goalMinutes} color="var(--category-sleep)" height={108} compact showRangeLabels formatter={(value) => compactMinutes(value)} ariaLabel="Sleep duration over the last 14 days" />
                  </Panel>
                )}
                {restingHeartTrendCount > 1 && (
                  <Panel className="home-mini-trend" category="heart">
                    <div className="mini-trend-heading"><DuoIcon icon={HeartIcon} className="mini-trend-icon" /><strong>Resting heart rate</strong></div>
                    <TrendStats
                      current={analysis.restingHeartRate.current === null ? '—' : `${formatNumber(analysis.restingHeartRate.current)} bpm`}
                      average={analysis.restingHeartRate.baseline === null ? '—' : `${formatNumber(analysis.restingHeartRate.baseline)} bpm`}
                      difference={analysis.restingHeartRate.difference === null ? '—' : `${signedNumber(analysis.restingHeartRate.difference)} bpm`}
                      sampleCount={analysis.restingHeartRate.sampleCount}
                    />
                    <LineChart values={restingHeartTrend} labels={labels} xValues={xValues} target={analysis.restingHeartRate.baseline} color="var(--category-heart)" height={108} compact showRangeLabels formatter={(value) => `${Math.round(value)} bpm`} ariaLabel="Resting heart rate over the last 14 days" />
                  </Panel>
                )}
              </div>
            </HomeSection>
          )}

          {(data.activities.length > 0 || bodySnapshots.length > 0) && (
            <HomeSection id="context" title="Additional context">
              <div className="home-lower-grid">
                {data.activities.length > 0 && (
                  <Panel className="home-activities-card activity-panel" category="activity">
                    <PanelHeader title="Recent activities" icon={ActivityIcon} action={<DetailAction label="Open all activities" onClick={() => navigate('activity')} />} />
                    {data.activities.slice(0, 2).map((item, index) => <div key={item.id}>{index > 0 && <Separator />}<CompactActivity item={item} /></div>)}
                  </Panel>
                )}

                {bodySnapshots.length > 0 && (
                  <Panel className="home-body-strip" category="body">
                    <PanelHeader title="Body and log" icon={BodyIcon} action={<DetailAction label="Open Body" onClick={() => navigate('body')} />} />
                    <div className="body-snapshot-row">{bodySnapshots.map((item) => <div className="body-snapshot" key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></div>)}</div>
                  </Panel>
                )}
              </div>
            </HomeSection>
          )}
        </div>
      )}
    </div>
  )
}

export function ActivityView({ data }: ViewProps) {
  const stepValues = data.trends.map((point) => point.steps)
  const validSteps = stepValues.filter(hasValue)
  const averageSteps = validSteps.length ? validSteps.reduce((sum, value) => sum + value, 0) / validSteps.length : null
  const stepsByHour = hourlyBuckets(data.activity.stepsIntraday)
  const supporting = [
    hasValue(data.activity.floors) ? { label: 'Floors', value: formatNumber(data.activity.floors), icon: FloorsIcon } : null,
    hasValue(data.activity.lightActiveMinutes) ? { label: 'Light activity', value: formatNumber(data.activity.lightActiveMinutes), unit: 'min', icon: ActivityIcon } : null,
    hasValue(data.activity.moderateActiveMinutes) ? { label: 'Moderate activity', value: formatNumber(data.activity.moderateActiveMinutes), unit: 'min', icon: ActiveIcon } : null,
    hasValue(data.activity.vigorousActiveMinutes) ? { label: 'Vigorous activity', value: formatNumber(data.activity.vigorousActiveMinutes), unit: 'min', icon: CaloriesIcon } : null,
    hasValue(data.activity.zoneMinutes) ? { label: 'Zone minutes', value: formatNumber(data.activity.zoneMinutes), unit: 'min', icon: GaugeIcon } : null,
    hasValue(data.activity.sedentaryMinutes) ? { label: 'Sedentary time', value: formatNumber(data.activity.sedentaryMinutes), unit: 'min', icon: DurationIcon } : null,
  ].filter((item): item is SupportingMetric => item !== null)
  const activityTrendValues = [
    data.trends.map((point) => point.calories),
    data.trends.map((point) => point.distanceKm),
    data.trends.map((point) => point.activeMinutes),
    data.trends.map((point) => point.zoneMinutes),
    data.trends.map((point) => point.sedentaryMinutes),
    data.trends.map((point) => point.floors),
  ]
  const hasActivityTrends = activityTrendValues.some((values) => values.filter(hasValue).length > 1)

  return (
    <div className="page-stack activity-page">
      <div className="metric-grid activity-primary-metrics">
        <MetricTile label="Steps" value={data.activity.steps} goal={data.activity.stepsGoal} icon={StepsIcon} />
        <MetricTile label="Active minutes" value={data.activity.activeMinutes} goal={data.activity.activeMinutesGoal} unit=" min" icon={ActiveIcon} />
        <MetricTile label="Distance" value={data.activity.distanceKm} goal={data.activity.distanceGoalKm} unit=" km" icon={DistanceIcon} decimals={1} />
        <MetricTile label="Calories" value={data.activity.calories} goal={data.activity.caloriesGoal} unit=" kcal" icon={CaloriesIcon} />
      </div>
      <SupportingMetrics items={supporting} />

      <div className="chart-grid activity-chart-grid">
        {data.activity.stepsIntraday.length > 0 && (
          <Panel className="chart-panel" category="activity">
            <PanelHeader eyebrow="Day" title="Steps per hour" icon={ActivityIcon} />
            <ColumnChart
              values={stepsByHour.values}
              labels={stepsByHour.labels}
              xValues={stepsByHour.xValues}
              height={226}
              ariaLabel="Steps aggregated by hour"
            />
          </Panel>
        )}

        {validSteps.length > 1 && (
          <Panel className="chart-panel" category="activity">
            <PanelHeader
              eyebrow={`${validSteps.length} days with data`}
              title="Daily steps"
              icon={TrendIcon}
              action={averageSteps !== null ? <Badge variant="secondary">Average {formatNumber(averageSteps)}</Badge> : null}
            />
            <ColumnChart values={stepValues} labels={trendLabels(data)} xValues={trendXValues(data)} target={data.activity.stepsGoal} height={226} ariaLabel="Total steps per day" />
          </Panel>
        )}
      </div>

      {hasActivityTrends && (
        <section>
          <SectionTitle title="Activity trends" copy="Daily series returned by Google Health." />
          <div className="metric-trend-grid">
            <MetricTrendPanel data={data} category="activity" icon={CaloriesIcon} title="Calories burned" values={data.trends.map((point) => point.calories)} formatter={(value) => `${formatNumber(value)} kcal`} />
            <MetricTrendPanel data={data} category="activity" icon={DistanceIcon} title="Distance" values={data.trends.map((point) => point.distanceKm)} formatter={(value) => `${formatDecimal(value)} km`} />
            <MetricTrendPanel data={data} category="activity" icon={ActiveIcon} title="Active minutes" values={data.trends.map((point) => point.activeMinutes)} formatter={(value) => `${formatNumber(value)} min`} />
            <MetricTrendPanel data={data} category="activity" icon={GaugeIcon} title="Zone minutes" values={data.trends.map((point) => point.zoneMinutes)} formatter={(value) => `${formatNumber(value)} min`} />
            <MetricTrendPanel data={data} category="activity" icon={DurationIcon} title="Sedentary time" values={data.trends.map((point) => point.sedentaryMinutes)} formatter={(value) => formatMinutes(value)} />
            <MetricTrendPanel data={data} category="activity" icon={FloorsIcon} title="Floors" values={data.trends.map((point) => point.floors)} formatter={(value) => formatNumber(value)} />
          </div>
        </section>
      )}

      <section>
        <SectionTitle title="Workouts" copy={`${data.activities.length} activities in the synced period`} />
        <Panel className="activity-panel full-list" category="activity">
          {data.activities.map((item, index) => <div key={item.id}>{index > 0 && <Separator />}<CompactActivity item={item} detailed /></div>)}
          {!data.activities.length && <EmptyValue>No workouts recorded during this period.</EmptyValue>}
        </Panel>
      </section>

      {!hasActivityData(data) && <EmptyValue>No movement data available for this day.</EmptyValue>}
    </div>
  )
}

export function HealthView({ data }: ViewProps) {
  const heartValues = data.health.heartRateIntraday.map((point) => point.value)
  const heartLabels = data.health.heartRateIntraday.map((point) => point.time)
  const restingValues = data.trends.map((point) => point.restingHeartRate)
  const restingCount = restingValues.filter(hasValue).length
  const signals = overnightSignals(data)
  const secondary = presentSignals([
    hasValue(data.health.recoveryScore) ? { label: 'Recovery', value: formatNumber(data.health.recoveryScore), unit: '%', note: 'WHOOP recovery score', icon: GaugeIcon } : null,
    hasValue(data.health.strain) ? { label: 'Strain', value: formatDecimal(data.health.strain), note: 'WHOOP day strain', icon: ActivityIcon } : null,
    hasValue(data.health.cardioScore) ? { label: 'Cardio fitness', value: formatNumber(data.health.cardioScore), note: 'Latest score', icon: GaugeIcon } : null,
    hasValue(data.health.bloodGlucoseMgDl) ? { label: 'Blood glucose', value: formatNumber(data.health.bloodGlucoseMgDl), unit: 'mg/dL', note: 'Latest measurement', icon: WaterIcon } : null,
    hasValue(data.health.irregularRhythmAlerts) ? { label: 'Irregular rhythm', value: formatNumber(data.health.irregularRhythmAlerts), unit: 'alerts', note: 'During the synced period', icon: ShieldIcon } : null,
    data.health.ecgClassification ? { label: 'ECG', value: data.health.ecgClassification, note: 'Latest classification', icon: HeartIcon } : null,
    data.health.vo2Max ? { label: 'VO₂ max', value: data.health.vo2Max, unit: 'ml/kg/min', note: 'Cardio fitness estimate', icon: GaugeIcon } : null,
  ])
  const hasHeartSummary = heartValues.length > 0 || hasValue(data.health.currentHeartRate) || hasValue(data.health.restingHeartRate)
  const physiologyTrendValues = [
    data.trends.map((point) => point.hrvMs),
    data.trends.map((point) => point.spo2),
    data.trends.map((point) => point.breathingRate),
    data.trends.map((point) => point.skinTemperature),
    data.trends.map((point) => point.coreTemperature),
    data.trends.map((point) => point.cardioScore),
    data.trends.map((point) => point.recoveryScore),
    data.trends.map((point) => point.strain),
  ]
  const hasPhysiologyTrends = physiologyTrendValues.some((values) => values.filter(hasValue).length > 1)

  return (
    <div className="page-stack health-page">
      {hasHeartSummary && (
        <Panel className="heart-detail-card" category="heart">
          <PanelHeader eyebrow="Day" title="Heart rate" icon={HeartIcon} />
          <div className="heart-kpis">
            {hasValue(data.health.currentHeartRate) && <div className="primary-kpi"><strong>{formatNumber(data.health.currentHeartRate)}</strong><span>recent bpm</span></div>}
            {hasValue(data.health.restingHeartRate) && <TinyStat label="At rest" value={formatNumber(data.health.restingHeartRate)} unit=" bpm" />}
            {hasValue(data.health.heartRateMin) && <TinyStat label="Range" value={`${formatNumber(data.health.heartRateMin)}–${formatNumber(data.health.heartRateMax)}`} unit=" bpm" />}
          </div>
          {heartValues.length > 0 && (
            <LineChart
              values={heartValues}
              labels={heartLabels}
              xValues={timeXValues(heartLabels)}
              color="var(--category-heart)"
              target={data.health.restingHeartRate}
              targetLabel="Resting reference"
              height={266}
              formatter={(value) => `${Math.round(value)} bpm`}
              ariaLabel="Heart rate throughout the day"
            />
          )}
        </Panel>
      )}

      <div className="health-grid">
        {signals.length > 0 && (
          <section>
            <SectionTitle title="Nightly metrics" copy="Latest available measurements, without diagnostic thresholds." />
            <Panel className="signal-panel" category="heart">
              {signals.map((signal, index) => <div key={signal.label}>{index > 0 && <Separator />}<SignalRow signal={signal} /></div>)}
            </Panel>
          </section>
        )}

        {restingCount > 1 && (
          <section>
            <SectionTitle title="Resting heart rate" copy={`${restingCount} days with data`} />
            <Panel className="chart-panel compact-chart-panel" category="heart">
              <LineChart values={restingValues} labels={trendLabels(data)} xValues={trendXValues(data)} color="var(--category-heart)" height={226} formatter={(value) => `${Math.round(value)} bpm`} ariaLabel="Resting heart rate trend" />
            </Panel>
          </section>
        )}
      </div>

      {hasPhysiologyTrends && (
        <section>
          <SectionTitle title="Physiological trends" copy="Compare measurements with your personal trends, not generic thresholds." />
          <div className="metric-trend-grid">
            <MetricTrendPanel data={data} category="heart" icon={SignalIcon} title="HRV" values={data.trends.map((point) => point.hrvMs)} formatter={(value) => `${formatDecimal(value)} ms`} />
            <MetricTrendPanel data={data} category="heart" icon={CloudIcon} title="Average SpO₂" values={data.trends.map((point) => point.spo2)} formatter={(value) => `${formatDecimal(value)}%`} />
            <MetricTrendPanel data={data} category="heart" icon={BreathingIcon} title="Breathing rate" values={data.trends.map((point) => point.breathingRate)} formatter={(value) => `${formatDecimal(value)} rpm`} />
            <MetricTrendPanel data={data} category="recovery" icon={GaugeIcon} title="Skin temperature" values={data.trends.map((point) => point.skinTemperature)} formatter={(value) => `${signedNumber(value, 1)} °C`} />
            <MetricTrendPanel data={data} category="recovery" icon={GaugeIcon} title="Body temperature" values={data.trends.map((point) => point.coreTemperature)} formatter={(value) => `${formatDecimal(value)} °C`} />
            <MetricTrendPanel data={data} category="heart" icon={GaugeIcon} title="Cardio fitness" values={data.trends.map((point) => point.cardioScore)} formatter={(value) => formatNumber(value)} />
            <MetricTrendPanel data={data} category="recovery" icon={GaugeIcon} title="Recovery" values={data.trends.map((point) => point.recoveryScore)} formatter={(value) => `${formatNumber(value)}%`} target={70} />
            <MetricTrendPanel data={data} category="activity" icon={ActivityIcon} title="Strain" values={data.trends.map((point) => point.strain)} formatter={(value) => formatDecimal(value)} />
          </div>
        </section>
      )}

      {secondary.length > 0 && (
        <section>
          <SectionTitle title="Other measurements" />
          <Panel className="signal-panel secondary-signal-panel" category="heart">
            {secondary.map((signal, index) => <div key={signal.label}>{index > 0 && <Separator />}<SignalRow signal={signal} /></div>)}
          </Panel>
        </section>
      )}

      {!hasHealthData(data) && <EmptyValue>No cardiac or physiological data available for this day.</EmptyValue>}
      <div className="medical-note"><InfoIcon aria-hidden="true" /><p>Look at trends over time, not a single reading. OpenFit does not provide medical diagnoses.</p></div>
    </div>
  )
}

export function SleepView({ data }: ViewProps) {
  const sleepValues = data.trends.map((point) => point.sleepMinutes)
  const sleepCount = sleepValues.filter(hasValue).length
  const efficiencyValues = data.trends.map((point) => point.sleepEfficiency)
  const efficiencyCount = efficiencyValues.filter(hasValue).length
  const stageTimeline = data.sleep.stageTimeline ?? []
  const stageTransitions = data.sleep.stageTransitions
  const hasSummary = hasValue(data.sleep.totalMinutes) || hasValue(data.sleep.score) || hasValue(data.sleep.performance)
  return (
    <div className="page-stack sleep-page">
      {hasSummary && (
        <div className="sleep-layout">
          <Panel className="sleep-main-card" tone="violet" category="sleep">
            <PanelHeader eyebrow="Last night" title="Duration and quality" icon={SleepIcon} />
            <div className="sleep-main-summary">
              <div className="sleep-duration-large">
                <span>Sleep time</span>
                <strong>{compactMinutes(data.sleep.totalMinutes)}</strong>
                <small>{formatTime(data.sleep.startTime)} – {formatTime(data.sleep.endTime)}</small>
              </div>
              {hasValue(data.sleep.efficiency) && (
                <div className="sleep-efficiency-ring">
                  <RadialProgress
                    value={data.sleep.efficiency}
                    color="var(--category-sleep)"
                    label="Efficiency"
                    valueLabel={`${formatNumber(data.sleep.efficiency)}%`}
                    size={116}
                  />
                </div>
              )}
            </div>
            <div className="sleep-bullets">
              {hasValue(data.sleep.score) && <BulletChart value={data.sleep.score} max={100} label="Sleep score" valueLabel={`${formatNumber(data.sleep.score)} / 100 · ${sleepScoreCategory(data.sleep.score)}`} color="var(--category-sleep)" />}
              {!hasValue(data.sleep.score) && hasValue(data.sleep.performance) && <BulletChart value={data.sleep.performance} max={100} label="Sleep performance" valueLabel={`${formatNumber(data.sleep.performance)}%`} color="var(--category-sleep)" />}
              {hasValue(data.sleep.totalMinutes) && hasValue(data.sleep.goalMinutes) && (
                <BulletChart
                  value={data.sleep.totalMinutes}
                  target={data.sleep.goalMinutes}
                  max={Math.max(data.sleep.totalMinutes, data.sleep.goalMinutes) * 1.08}
                  label="Duration compared with goal"
                  valueLabel={`${compactMinutes(data.sleep.totalMinutes)} / ${compactMinutes(data.sleep.goalMinutes)}`}
                  color="var(--color-cyan)"
                />
              )}
            </div>
          </Panel>

          {data.sleep.stages.some((stage) => stage.minutes > 0) && (
            <Panel className="sleep-stage-card" category="sleep">
              <PanelHeader eyebrow="Recorded period" title="Time by stage" icon={SignalIcon} />
              <SleepStageBar stages={data.sleep.stages} />
              {data.sleep.totalMinutes !== null && data.sleep.goalMinutes !== null && (
                <div className="compact-stats">
                  <TinyStat label="Difference from goal" value={formatMinutes(data.sleep.totalMinutes - data.sleep.goalMinutes)} />
                </div>
              )}
            </Panel>
          )}
        </div>
      )}

      {stageTimeline.length > 0 && (
        <Panel className="sleep-timeline-card" category="sleep">
          <PanelHeader eyebrow={`${stageTimeline.length} segments detected`} title="Night timeline" icon={TrendIcon} />
          <SleepStageTimeline segments={stageTimeline} />
          <div className="sleep-detail-stats">
            {hasValue(data.sleep.timeInBed) && <TinyStat label="Time in bed" value={formatMinutes(data.sleep.timeInBed)} />}
            {hasValue(data.sleep.minutesAwake) && <TinyStat label="Time awake" value={formatMinutes(data.sleep.minutesAwake)} />}
            {hasValue(data.sleep.minutesToFallAsleep) && <TinyStat label="Time to fall asleep" value={formatMinutes(data.sleep.minutesToFallAsleep)} />}
            {hasValue(data.sleep.minutesAfterWakeUp) && <TinyStat label="After waking" value={formatMinutes(data.sleep.minutesAfterWakeUp)} />}
            {hasValue(stageTransitions?.wake) && <TinyStat label="Awake episodes" value={formatNumber(stageTransitions.wake)} />}
          </div>
        </Panel>
      )}

      {(sleepCount > 1 || efficiencyCount > 1) && (
        <section>
          <SectionTitle title="Sleep trends" copy="Duration and efficiency of recorded nights." />
          <div className="chart-grid sleep-history-grid">
            {sleepCount > 1 && (
              <Panel className="chart-panel sleep-trend-panel" category="sleep">
                <PanelHeader eyebrow={`${sleepCount} nights with data`} title="Duration per night" icon={SleepIcon} />
                <ColumnChart values={sleepValues} labels={trendLabels(data)} xValues={trendXValues(data)} target={data.sleep.goalMinutes} color="var(--category-sleep)" height={196} formatter={(value) => compactMinutes(value)} ariaLabel="Minutes of sleep per night" />
              </Panel>
            )}
            <MetricTrendPanel data={data} category="sleep" icon={GaugeIcon} title="Efficiency" values={efficiencyValues} formatter={(value) => `${formatNumber(value)}%`} target={90} />
          </div>
        </section>
      )}

      {!hasSleepData(data) && <EmptyValue>No sleep data available for this day.</EmptyValue>}
    </div>
  )
}

function BodyMetric({ label, value, unit, icon: Icon, note }: { label: string; value: string; unit?: string; icon: AppIcon; note: string }) {
  return (
    <div className="body-metric">
      <DuoIcon icon={Icon} className="body-metric-icon" />
      <div><span>{label}</span><strong>{value}{unit && <small>{unit}</small>}</strong><p>{note}</p></div>
    </div>
  )
}

export function BodyView({ data }: ViewProps) {
  const weightValues = data.trends.map((point) => point.weight)
  const weightCount = weightValues.filter(hasValue).length
  const hasComposition = hasValue(data.body.bmi) || hasValue(data.body.bodyFat)
  const hasDaily = hasValue(data.body.waterMl) || hasValue(data.body.caloriesIn)
  const bodyTrendValues = [
    data.trends.map((point) => point.bodyFat),
    data.trends.map((point) => point.waterMl),
    data.trends.map((point) => point.caloriesIn),
  ]
  const hasBodyTrends = bodyTrendValues.some((values) => values.filter(hasValue).length > 1)
  return (
    <div className="page-stack body-page">
      <div className="body-layout">
        {hasValue(data.body.weightKg) && (
          <Panel className="weight-card" category="body">
            <PanelHeader eyebrow={`${weightCount} measurements`} title="Weight" icon={BodyIcon} />
            <div className="body-weight-value"><strong>{formatDecimal(data.body.weightKg)}</strong><span>kg</span></div>
            {hasValue(data.body.weightGoalKg) && (
              <div className="weight-goal-copy">
                <span>Goal {formatDecimal(data.body.weightGoalKg)} kg</span>
                <strong>{formatDecimal(data.body.weightKg - data.body.weightGoalKg)} kg difference</strong>
              </div>
            )}
            {weightCount > 1 && (
              <LineChart values={weightValues} labels={trendLabels(data)} xValues={trendXValues(data)} target={data.body.weightGoalKg} targetLabel="Goal" height={238} formatter={(value) => `${formatDecimal(value)} kg`} ariaLabel="Weight trend" />
            )}
          </Panel>
        )}

        {(hasComposition || hasDaily) && (
          <div className="body-side-stack">
            {hasComposition && (
              <Panel className="body-metrics-panel" category="body">
                <PanelHeader eyebrow="Latest measurement" title="Composition" icon={GaugeIcon} />
                <div className="body-metrics-list">
                  {hasValue(data.body.bmi) && <BodyMetric label="BMI" value={formatDecimal(data.body.bmi)} icon={GaugeIcon} note="Body mass index" />}
                  {hasValue(data.body.bodyFat) && <BodyMetric label="Body fat" value={formatDecimal(data.body.bodyFat)} unit="%" icon={SignalIcon} note="Estimated percentage" />}
                </div>
              </Panel>
            )}
            {hasDaily && (
              <Panel className="body-metrics-panel body-daily-panel" category="body">
                <PanelHeader eyebrow="Day" title="Balance" icon={NutritionIcon} />
                {hasValue(data.body.waterMl) && (
                  <BulletChart
                    value={data.body.waterMl}
                    target={data.body.waterGoalMl}
                    max={Math.max(data.body.waterMl, data.body.waterGoalMl ?? 0) * 1.08}
                    label="Water"
                    valueLabel={`${formatNumber(data.body.waterMl)} ml${data.body.waterGoalMl ? ` / ${formatNumber(data.body.waterGoalMl)} ml` : ''}`}
                    color="var(--color-cyan)"
                  />
                )}
                {hasValue(data.body.caloriesIn) && <BodyMetric label="Calories consumed" value={formatNumber(data.body.caloriesIn)} unit="kcal" icon={CaloriesIcon} note="Recorded total" />}
              </Panel>
            )}
          </div>
        )}
      </div>
      {hasBodyTrends && (
        <section>
          <SectionTitle title="Body and log trends" copy="Only measurements recorded during the synced period." />
          <div className="metric-trend-grid">
            <MetricTrendPanel data={data} category="body" icon={SignalIcon} title="Body fat" values={data.trends.map((point) => point.bodyFat)} formatter={(value) => `${formatDecimal(value)}%`} />
            <MetricTrendPanel data={data} category="body" icon={WaterIcon} title="Hydration" values={data.trends.map((point) => point.waterMl)} formatter={(value) => `${formatNumber(value)} ml`} />
            <MetricTrendPanel data={data} category="body" icon={CaloriesIcon} title="Calories consumed" values={data.trends.map((point) => point.caloriesIn)} formatter={(value) => `${formatNumber(value)} kcal`} />
          </div>
        </section>
      )}
      {!hasBodyData(data) && <EmptyValue>No body measurements available for this account.</EmptyValue>}
    </div>
  )
}

function CoverageRow({ icon: Icon, label, items }: { icon: AppIcon; label: string; items: string[] }) {
  return (
    <div className="coverage-row">
      <DuoIcon icon={Icon} className="coverage-icon" />
      <div><strong>{label}</strong><span>{items.length ? items.join(' · ') : 'No data'}</span></div>
      {items.length > 0 && <CheckIcon className="coverage-check" aria-label="Available" />}
    </div>
  )
}

export function DevicesView({ data, status }: ViewProps) {
  const movement = [
    hasValue(data.activity.steps) && 'steps',
    data.activity.stepsIntraday.length > 0 && 'steps per hour',
    data.activities.length > 0 && `${data.activities.length} workouts`,
    hasValue(data.activity.activeMinutes) && 'active minutes',
  ].filter((item): item is string => Boolean(item))
  const heart = [
    data.health.heartRateIntraday.length > 0 && 'heart rate throughout the day',
    hasValue(data.health.restingHeartRate) && 'resting heart rate',
    hasValue(data.health.hrvMs) && 'HRV',
    data.health.ecgClassification && 'ECG',
  ].filter((item): item is string => Boolean(item))
  const sleep = [hasSleepData(data) && 'duration and stages', hasValue(data.sleep.score) && 'score'].filter((item): item is string => Boolean(item))
  const nightly = overnightSignals(data).map((signal) => signal.label.toLowerCase())
  const body = [
    hasValue(data.body.weightKg) && 'weight',
    hasValue(data.body.bodyFat) && 'body fat',
    hasValue(data.body.waterMl) && 'hydration',
    hasValue(data.body.caloriesIn) && 'nutrition',
  ].filter((item): item is string => Boolean(item))
  const isDemo = data.source === 'demo'
  const isConnected = status.connected || isDemo
  const sourceName = isDemo ? 'Sample data' : status.provider === 'fitbit-legacy' ? 'Fitbit legacy' : status.provider === 'whoop' ? 'WHOOP' : 'Google Health'
  const deviceName = data.device?.name ?? (isDemo ? 'Google Fitbit Air' : sourceName)

  return (
    <div className="page-stack devices-page">
      <div className="data-overview">
        <div className="data-source-column">
          <Panel className="device-card" category="device">
            <div className="device-visual device-product-visual">
              <img src="/fitbit-air.png" alt="Google Fitbit Air in Obsidian" />
            </div>
            <div className="device-copy">
              <Badge variant="secondary" className={`connection-badge ${isConnected ? 'is-connected' : ''}`}><span className={`status-dot ${isConnected ? 'online' : ''}`} /> {isConnected ? 'Connected' : 'Not connected'}</Badge>
              <h2>{deviceName}</h2>
              <p>{data.device?.type ?? sourceName}{data.device?.firmware && !isDemo ? ` · firmware ${data.device.firmware}` : ''}</p>
              <div className="device-facts">
                {hasValue(data.device?.batteryLevel ?? null) && <span><BatteryIcon /> {formatNumber(data.device?.batteryLevel ?? null)}%</span>}
                {data.device?.lastSyncTime && <span><CloudIcon /> Updated {relativeTime(data.device.lastSyncTime)}</span>}
                <span><SignalIcon /> {availableMetricCount(data)} metrics available</span>
              </div>
            </div>
          </Panel>

          <div className={`privacy-card ${status.storageEncrypted ? '' : 'is-warning'}`}>
            <ShieldIcon aria-hidden="true" />
            <div>
              <strong>{status.storageEncrypted ? 'Encrypted local storage' : 'Local encryption unavailable'}</strong>
              <p>{status.storageEncrypted ? 'Credentials and health cache are protected by the operating system keychain.' : 'Demo data does not contain personal health information; connect the Electron app to use the system vault.'}</p>
            </div>
          </div>
        </div>

        <Panel className="coverage-card" category="device">
          <PanelHeader eyebrow="Sync quality" title="Data coverage" icon={CloudIcon} />
          <BulletChart
            value={data.sync.successCount}
            target={data.sync.endpointCount}
            max={Math.max(data.sync.endpointCount, 1)}
            label="Available sources"
            valueLabel={`${data.sync.successCount} / ${data.sync.endpointCount}`}
            color="var(--color-emerald)"
          />
          <div className="coverage-list">
            <CoverageRow icon={ActivityIcon} label="Movement" items={movement} />
            <Separator />
            <CoverageRow icon={HeartIcon} label="Heart" items={heart} />
            <Separator />
            <CoverageRow icon={SleepIcon} label="Sleep" items={sleep} />
            <Separator />
            <CoverageRow icon={SignalIcon} label="Nightly signals" items={nightly} />
            <Separator />
            <CoverageRow icon={BodyIcon} label="Body and nutrition" items={body} />
          </div>
        </Panel>
      </div>

      {data.sync.errors.length > 0 && <div className="sync-note"><InfoIcon aria-hidden="true" /><p>{data.sync.errors.length} sources returned no data for the selected period. Available measurements remain visible.</p></div>}
    </div>
  )
}
