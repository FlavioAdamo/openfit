import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import type { SleepStage, SleepStageSegment } from '../types'
import { formatNumber, formatTime } from '../lib/format'

type NumericValue = number | null

interface BaseChartProps {
  values: NumericValue[]
  labels?: string[]
  xValues?: number[]
  color?: string
  height?: number
  compact?: boolean
  formatter?: (value: number) => string
  target?: number | null
  targetLabel?: string
  ariaLabel?: string
  variant?: 'line' | 'area'
  showRangeLabels?: boolean
}

function finiteValues(values: NumericValue[]) {
  return values.filter((value): value is number => value !== null && Number.isFinite(value))
}

function useResponsiveChartWidth(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!active || !container) return

    const updateWidth = (nextWidth: number) => {
      if (nextWidth > 0) setWidth(Math.max(240, Math.round(nextWidth)))
    }
    updateWidth(container.getBoundingClientRect().width)

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width
      if (nextWidth) updateWidth(nextWidth)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [active])

  return { containerRef, width }
}

function niceStep(range: number, tickCount = 3) {
  const rough = Math.max(range / Math.max(1, tickCount - 1), Number.EPSILON)
  const power = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / power
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 3 ? 2.5 : fraction <= 5 ? 5 : 10
  return niceFraction * power
}

function lineDomain(values: number[], target: number | null) {
  const withTarget = target === null ? values : [...values, target]
  const rawMin = Math.min(...withTarget)
  const rawMax = Math.max(...withTarget)
  const rawRange = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.08, 1)
  const step = niceStep(rawRange, 5)
  const paddedMin = Math.floor((rawMin - rawRange * 0.06) / step) * step
  const min = rawMin < 0 ? paddedMin : Math.max(0, paddedMin)
  const max = Math.ceil((rawMax + rawRange * 0.08) / step) * step
  return { min, max: max <= min ? min + step : max, step }
}

function chartSummary(values: number[], formatter: (value: number) => string) {
  const latest = values.at(-1)
  return `Minimum ${formatter(Math.min(...values))}, maximum ${formatter(Math.max(...values))}${latest === undefined ? '' : `, latest value ${formatter(latest)}`}.`
}

function finiteIndexes(values: NumericValue[]) {
  return values.flatMap((value, index) => value !== null && Number.isFinite(value) ? [index] : [])
}

function lastFiniteIndex(values: NumericValue[]) {
  return finiteIndexes(values).at(-1) ?? null
}

function stepActiveIndex(values: NumericValue[], activeIndex: number | null, direction: -1 | 1) {
  const available = finiteIndexes(values)
  if (!available.length) return null
  const currentPosition = activeIndex === null ? available.length - 1 : Math.max(0, available.indexOf(activeIndex))
  return available[Math.min(available.length - 1, Math.max(0, currentPosition + direction))]
}

function arrowDirection(key: string): -1 | 1 | null {
  if (key === 'ArrowLeft') return -1
  if (key === 'ArrowRight') return 1
  return null
}

function AccessibleChartTable({
  title,
  labels,
  values,
  formatter,
}: {
  title: string
  labels: string[]
  values: NumericValue[]
  formatter: (value: number) => string
}) {
  return (
    <div className="sr-only">
      <table className="chart-data-table">
        <caption>{title}</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Value</th></tr></thead>
        <tbody>
          {values.map((value, index) => (
            <tr key={`${labels[index] ?? index}-${index}`}>
              <th scope="row">{labels[index] ?? `Point ${index + 1}`}</th>
              <td>{value === null ? 'Missing data' : formatter(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CompactRangeLabels({ labels }: { labels: string[] }) {
  if (labels.length < 2) return null
  const middle = labels[Math.floor((labels.length - 1) / 2)]
  return (
    <div className="chart-range-labels" aria-hidden="true">
      <span>{labels[0]}</span>
      <span>{middle}</span>
      <span>{labels.at(-1)}</span>
    </div>
  )
}

export function LineChart({
  values,
  labels = [],
  xValues,
  color = 'var(--category-color, var(--chart-1))',
  height = 220,
  compact = false,
  formatter = (value) => formatNumber(value),
  target = null,
  targetLabel = 'Goal',
  ariaLabel = 'Trend over time',
  variant = 'line',
  showRangeLabels = false,
}: BaseChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const areaId = useId().replace(/:/g, '')
  const valid = finiteValues(values)
  const { containerRef, width } = useResponsiveChartWidth(valid.length > 0)
  if (!valid.length) return <div className="chart-empty" style={{ height }}>No data for this range</div>

  const margin = compact
    ? { top: 7, right: 2, bottom: showRangeLabels ? 22 : 7, left: 2 }
    : { top: 18, right: 14, bottom: 30, left: 48 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const domain = lineDomain(valid, target)
  const validX = xValues?.length === values.length && xValues.every(Number.isFinite) ? xValues : values.map((_, index) => index)
  const xMin = Math.min(...validX)
  const xMax = Math.max(...validX)
  const xFor = (index: number) => margin.left + (xMax === xMin ? plotWidth / 2 : ((validX[index] - xMin) / (xMax - xMin)) * plotWidth)
  const yFor = (value: number) => margin.top + ((domain.max - value) / (domain.max - domain.min)) * plotHeight
  const segmentIndexes: number[][] = []
  let currentIndexes: number[] = []
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      if (currentIndexes.length) segmentIndexes.push(currentIndexes)
      currentIndexes = []
      return
    }
    currentIndexes.push(index)
  })
  if (currentIndexes.length) segmentIndexes.push(currentIndexes)
  const baseline = margin.top + plotHeight
  const segments = segmentIndexes.map((indexes) => {
    const line = indexes.map((index, position) => {
      const value = values[index] as number
      return `${position ? 'L' : 'M'} ${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`
    }).join(' ')
    const first = indexes[0]
    const last = indexes[indexes.length - 1]
    return {
      line,
      area: `M ${xFor(first).toFixed(2)} ${baseline.toFixed(2)} ${line.replace(/^M/, 'L')} L ${xFor(last).toFixed(2)} ${baseline.toFixed(2)} Z`,
    }
  })
  const middleTick = Math.min(domain.max, domain.min + Math.ceil((domain.max - domain.min) / (domain.step * 2)) * domain.step)
  const ticks = [domain.min, middleTick, domain.max]
  const labelEvery = Math.max(1, Math.ceil(labels.length / 6))
  const lastValidIndex = lastFiniteIndex(values)
  const activeValue = activeIndex === null ? null : values[activeIndex]
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointerX = (event.clientX - bounds.left) / Math.max(bounds.width, 1) * width
    let nearestIndex: number | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    values.forEach((value, index) => {
      if (value === null || !Number.isFinite(value)) return
      const distance = Math.abs(xFor(index) - pointerX)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })
    setActiveIndex(nearestIndex)
  }
  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const direction = arrowDirection(event.key)
    if (direction === null) return
    event.preventDefault()
    setActiveIndex(stepActiveIndex(values, activeIndex, direction))
  }

  return (
    <div ref={containerRef} className={`line-chart ${compact ? 'is-compact' : ''} is-${variant}`} style={{ height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        tabIndex={0}
        aria-label={ariaLabel}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setActiveIndex(null)}
        onFocus={() => setActiveIndex(lastFiniteIndex(values))}
        onBlur={() => setActiveIndex(null)}
        onKeyDown={handleKeyDown}
      >
        <title>{ariaLabel}</title>
        <desc>{chartSummary(valid, formatter)}</desc>
        {variant === 'area' && segments.map((segment, index) => (
          <path
            key={`area-${areaId}-${index}`}
            d={segment.area}
            fill={color}
            fillOpacity={compact ? 0.12 : 0.09}
            stroke="none"
          />
        ))}
        {!compact && ticks.map((tick, index) => {
          const y = yFor(tick)
          return (
            <g key={`${tick}-${index}`}>
              <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} className="chart-gridline" />
              <text x={margin.left - 9} y={y + 3} textAnchor="end" className="chart-tick">{formatter(tick)}</text>
            </g>
          )
        })}
        {target !== null && target >= domain.min && target <= domain.max && (
          <g>
            <line x1={margin.left} y1={yFor(target)} x2={width - margin.right} y2={yFor(target)} className="chart-target-line" />
            {!compact && <text x={width - margin.right} y={yFor(target) - 7} textAnchor="end" className="chart-target-label">{targetLabel} · {formatter(target)}</text>}
          </g>
        )}
        {segments.map((segment, index) => (
          <path key={index} d={segment.line} fill="none" stroke={color} strokeWidth={compact ? 2.4 : 2.6} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {!compact && values.length <= 20 && values.map((value, index) => value !== null && Number.isFinite(value) ? (
          <circle key={index} cx={xFor(index)} cy={yFor(value)} r={index === lastValidIndex ? 4 : 2.8} fill="var(--card)" stroke={color} strokeWidth="2" />
        ) : null)}
        {!compact && labels.map((label, index) => {
          const lastIndex = labels.length - 1
          if (index !== lastIndex && (index % labelEvery !== 0 || lastIndex - index < labelEvery)) return null
          return <text key={`${label}-${index}`} x={xFor(index)} y={height - 7} textAnchor="middle" className="chart-label">{label}</text>
        })}
        {activeIndex !== null && activeValue !== null && Number.isFinite(activeValue) && (
          <g className="chart-active-mark" aria-hidden="true">
            <line x1={xFor(activeIndex)} y1={margin.top} x2={xFor(activeIndex)} y2={baseline} className="chart-hover-guide" />
            <circle cx={xFor(activeIndex)} cy={yFor(activeValue)} r={compact ? 5 : 5.5} fill="var(--card)" stroke={color} strokeWidth="3" />
          </g>
        )}
      </svg>
      {activeIndex !== null && activeValue !== null && Number.isFinite(activeValue) && (
        <div
          className="chart-tooltip"
          style={{ left: `clamp(52px, ${xFor(activeIndex) / width * 100}%, calc(100% - 52px))`, top: `${yFor(activeValue) / height * 100}%` }}
          role="status"
        >
          <span>{labels[activeIndex] ?? `Point ${activeIndex + 1}`}</span>
          <strong>{formatter(activeValue)}</strong>
        </div>
      )}
      {compact && showRangeLabels && <CompactRangeLabels labels={labels} />}
      <AccessibleChartTable title={ariaLabel} labels={labels} values={values} formatter={formatter} />
    </div>
  )
}

export function ColumnChart({
  values,
  labels = [],
  xValues,
  color = 'var(--category-color, var(--chart-1))',
  height = 220,
  compact = false,
  formatter = (value) => formatNumber(value),
  target = null,
  targetLabel = 'Goal',
  ariaLabel = 'Values by period',
  showRangeLabels = false,
}: BaseChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const valid = finiteValues(values)
  const { containerRef, width } = useResponsiveChartWidth(valid.length > 0)
  if (!valid.length) return <div className="chart-empty" style={{ height }}>No data for this range</div>

  const margin = compact
    ? { top: 8, right: 2, bottom: showRangeLabels ? 22 : 8, left: 2 }
    : { top: 20, right: 14, bottom: 30, left: 48 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const rawMax = Math.max(...valid, target ?? 0, 1)
  const step = niceStep(rawMax, 4)
  const max = Math.ceil(rawMax / step) * step
  const validX = xValues?.length === values.length && xValues.every(Number.isFinite) ? xValues : values.map((_, index) => index)
  const sortedX = [...validX].sort((a, b) => a - b)
  const positiveSteps = sortedX.slice(1).map((value, index) => value - sortedX[index]).filter((value) => value > 0)
  const typicalStep = positiveSteps.length ? Math.min(...positiveSteps) : 1
  const xMin = Math.min(...validX) - typicalStep / 2
  const xMax = Math.max(...validX) + typicalStep / 2
  const slotWidth = plotWidth * typicalStep / Math.max(typicalStep, xMax - xMin)
  const barWidth = Math.max(3, Math.min(compact ? 14 : 26, slotWidth * 0.62))
  const yFor = (value: number) => margin.top + (1 - value / max) * plotHeight
  const xCenter = (index: number) => margin.left + ((validX[index] - xMin) / Math.max(typicalStep, xMax - xMin)) * plotWidth
  const ticks = [0, max / 2, max]
  const labelEvery = Math.max(1, Math.ceil(labels.length / 7))
  const activeValue = activeIndex === null ? null : values[activeIndex]
  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const direction = arrowDirection(event.key)
    if (direction === null) return
    event.preventDefault()
    setActiveIndex(stepActiveIndex(values, activeIndex, direction))
  }

  return (
    <div ref={containerRef} className={`column-chart ${compact ? 'is-compact' : ''}`} style={{ height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        tabIndex={0}
        aria-label={ariaLabel}
        onPointerLeave={() => setActiveIndex(null)}
        onFocus={() => setActiveIndex(lastFiniteIndex(values))}
        onBlur={() => setActiveIndex(null)}
        onKeyDown={handleKeyDown}
      >
        <title>{ariaLabel}</title>
        <desc>{chartSummary(valid, formatter)}</desc>
        {compact && (
          <line
            x1={margin.left}
            y1={margin.top + plotHeight}
            x2={width - margin.right}
            y2={margin.top + plotHeight}
            className="chart-baseline"
          />
        )}
        {!compact && ticks.map((tick, index) => {
          const y = yFor(tick)
          return (
            <g key={`${tick}-${index}`}>
              <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} className="chart-gridline" />
              <text x={margin.left - 9} y={y + 3} textAnchor="end" className="chart-tick">{formatter(tick)}</text>
            </g>
          )
        })}
        {target !== null && target <= max && (
          <g>
            <line x1={margin.left} y1={yFor(target)} x2={width - margin.right} y2={yFor(target)} className="chart-target-line" />
            {!compact && <text x={width - margin.right} y={yFor(target) - 7} textAnchor="end" className="chart-target-label">{targetLabel} · {formatter(target)}</text>}
          </g>
        )}
        {values.map((value, index) => {
          const numeric = value ?? 0
          const barHeight = value === null ? 0 : (numeric / max) * plotHeight
          return (
            <rect
              key={`${labels[index] ?? index}-${index}`}
              x={xCenter(index) - barWidth / 2}
              y={margin.top + plotHeight - barHeight}
              width={barWidth}
              height={barHeight}
              rx={Math.min(4, barWidth / 3)}
              fill={value === null ? 'var(--border)' : color}
              opacity={value === null ? 0.3 : activeIndex === null || activeIndex === index ? 0.92 : 0.34}
              className="chart-column-mark"
              onPointerEnter={() => value !== null && setActiveIndex(index)}
            />
          )
        })}
        {!compact && labels.map((label, index) => {
          const lastIndex = labels.length - 1
          if (index !== lastIndex && (index % labelEvery !== 0 || lastIndex - index < labelEvery)) return null
          return <text key={`${label}-${index}`} x={xCenter(index)} y={height - 7} textAnchor="middle" className="chart-label">{label}</text>
        })}
      </svg>
      {activeIndex !== null && activeValue !== null && Number.isFinite(activeValue) && (
        <div
          className="chart-tooltip"
          style={{ left: `clamp(52px, ${xCenter(activeIndex) / width * 100}%, calc(100% - 52px))`, top: `${yFor(activeValue) / height * 100}%` }}
          role="status"
        >
          <span>{labels[activeIndex] ?? `Period ${activeIndex + 1}`}</span>
          <strong>{formatter(activeValue)}</strong>
        </div>
      )}
      {compact && showRangeLabels && <CompactRangeLabels labels={labels} />}
      <AccessibleChartTable title={ariaLabel} labels={labels} values={values} formatter={formatter} />
    </div>
  )
}

export function RadialProgress({
  value,
  max = 100,
  color = 'var(--category-color, var(--chart-1))',
  label,
  valueLabel,
  size = 84,
}: {
  value: number | null
  max?: number
  color?: string
  label: string
  valueLabel?: string
  size?: number
}) {
  if (value === null || !Number.isFinite(value)) return null
  const safeMax = Math.max(1, max)
  const progress = Math.min(1, Math.max(0, value / safeMax))
  const radius = 42
  const circumference = Math.PI * 2 * radius
  const displayValue = valueLabel ?? `${Math.round(progress * 100)}%`
  return (
    <div className="radial-progress" style={{ width: size, height: size, '--radial-size': `${size}px` } as CSSProperties} role="img" aria-label={`${label}: ${displayValue}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="radial-track" cx="50" cy="50" r={radius} />
        <circle
          className="radial-value"
          cx="50"
          cy="50"
          r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <span><strong>{displayValue}</strong><small>{label}</small></span>
    </div>
  )
}

export function BulletChart({
  value,
  target,
  max,
  color = 'var(--category-color, var(--chart-1))',
  label,
  valueLabel,
}: {
  value: number | null
  target?: number | null
  max: number
  color?: string
  label: string
  valueLabel?: string
}) {
  if (value === null) return null
  const safeMax = Math.max(max, value, target ?? 0, 1)
  const valuePercent = Math.min(100, Math.max(0, value / safeMax * 100))
  const targetPercent = target === null || target === undefined ? null : Math.min(100, Math.max(0, target / safeMax * 100))
  return (
    <div className="bullet-chart" role="img" aria-label={`${label}: ${valueLabel ?? formatNumber(value)}${target === null || target === undefined ? '' : `, goal ${formatNumber(target)}`}`}>
      <div className="bullet-track">
        <span className="bullet-value" style={{ width: `${valuePercent}%`, background: color }} />
        {targetPercent !== null && <span className="bullet-target" style={{ left: `${targetPercent}%` }} />}
      </div>
      <div className="bullet-caption"><span>{label}</span><strong>{valueLabel ?? formatNumber(value)}</strong></div>
    </div>
  )
}

export function SleepStageBar({
  stages,
  compact = false,
  showLegend = true,
}: {
  stages: SleepStage[]
  compact?: boolean
  showLegend?: boolean
}) {
  const total = stages.reduce((sum, stage) => sum + stage.minutes, 0)
  if (!total) return <div className="chart-empty is-small">No sleep stages available</div>
  return (
    <div className={`sleep-stage-wrap ${compact ? 'is-compact' : ''}`}>
      <div className="sleep-stage-bar" role="img" aria-label={`Recorded-period distribution: ${stages.map((stage) => `${stage.name} ${stage.minutes} minutes`).join(', ')}`}>
        {stages.map((stage) => (
          <div
            key={stage.key}
            className="sleep-stage-segment"
            style={{ width: `${stage.minutes / total * 100}%`, background: `var(--sleep-${stage.key})` }}
            title={`${stage.name}: ${stage.minutes} min (${Math.round(stage.minutes / total * 100)}%)`}
          />
        ))}
      </div>
      {showLegend && (
        <div className="sleep-stage-legend">
          {stages.map((stage) => (
            <div key={stage.key}>
              <span className="legend-dot" style={{ background: `var(--sleep-${stage.key})` }} />
              <span>{stage.name}</span>
              <strong>{Math.round(stage.minutes / total * 100)}% · {Math.floor(stage.minutes / 60) ? `${Math.floor(stage.minutes / 60)}h ` : ''}{stage.minutes % 60}m</strong>
            </div>
          ))}
        </div>
      )}
      {!compact && <p className="sleep-stage-caption">Percentages of the recorded period, including awake time.</p>}
    </div>
  )
}

const sleepTimelineConfig = {
  wake: { label: 'Awake', color: 'var(--sleep-wake)' },
  rem: { label: 'REM', color: 'var(--sleep-rem)' },
  light: { label: 'Light', color: 'var(--sleep-light)' },
  deep: { label: 'Deep', color: 'var(--sleep-deep)' },
} as const

export function SleepStageTimeline({
  segments,
  height = 188,
}: {
  segments: SleepStageSegment[]
  height?: number
}) {
  const validSegments = segments
    .map((segment) => ({
      ...segment,
      start: new Date(segment.startTime).getTime(),
      end: new Date(segment.endTime).getTime(),
    }))
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .sort((left, right) => left.start - right.start)
  const { containerRef, width } = useResponsiveChartWidth(validSegments.length > 0)
  if (!validSegments.length) return <div className="chart-empty" style={{ height }}>Detailed timeline unavailable</div>

  const keys = ['wake', 'rem', 'light', 'deep'] as const
  const start = validSegments[0].start
  const end = validSegments.at(-1)?.end ?? validSegments[0].end
  const margin = { top: 10, right: 10, bottom: 28, left: 68 }
  const plotWidth = Math.max(1, width - margin.left - margin.right)
  const plotHeight = Math.max(1, height - margin.top - margin.bottom)
  const rowHeight = plotHeight / keys.length
  const xFor = (value: number) => margin.left + ((value - start) / Math.max(1, end - start)) * plotWidth
  const yFor = (type: SleepStageSegment['type']) => margin.top + (keys.indexOf(type) + 0.5) * rowHeight
  const middle = new Date(start + (end - start) / 2).toISOString()

  return (
    <div ref={containerRef} className="sleep-timeline-chart" style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Sleep-stage timeline across ${validSegments.length} segments`}>
        <title>Detailed sleep-stage timeline</title>
        {keys.map((key) => (
          <g key={key}>
            <line x1={margin.left} y1={yFor(key)} x2={width - margin.right} y2={yFor(key)} className="sleep-timeline-gridline" />
            <text x={margin.left - 10} y={yFor(key) + 4} textAnchor="end" className="sleep-timeline-label">{sleepTimelineConfig[key].label}</text>
          </g>
        ))}
        {validSegments.slice(0, -1).map((segment, index) => {
          const next = validSegments[index + 1]
          if (!next || Math.abs(next.start - segment.end) > 120_000) return null
          return <line key={`connector-${index}`} x1={xFor(segment.end)} y1={yFor(segment.type)} x2={xFor(segment.end)} y2={yFor(next.type)} className="sleep-timeline-connector" />
        })}
        {validSegments.map((segment, index) => {
          const durationMinutes = Math.max(1, Math.round((segment.end - segment.start) / 60_000))
          return (
            <line
              key={`${segment.startTime}-${index}`}
              x1={xFor(segment.start)}
              y1={yFor(segment.type)}
              x2={Math.max(xFor(segment.start) + 2, xFor(segment.end))}
              y2={yFor(segment.type)}
              stroke={sleepTimelineConfig[segment.type].color}
              className="sleep-timeline-segment"
            >
              <title>{`${sleepTimelineConfig[segment.type].label}: ${formatTime(segment.startTime)}–${formatTime(segment.endTime)}, ${durationMinutes} min`}</title>
            </line>
          )
        })}
        <text x={margin.left} y={height - 5} textAnchor="start" className="sleep-timeline-time">{formatTime(validSegments[0].startTime)}</text>
        <text x={margin.left + plotWidth / 2} y={height - 5} textAnchor="middle" className="sleep-timeline-time">{formatTime(middle)}</text>
        <text x={width - margin.right} y={height - 5} textAnchor="end" className="sleep-timeline-time">{formatTime(validSegments.at(-1)?.endTime ?? null)}</text>
      </svg>
    </div>
  )
}
