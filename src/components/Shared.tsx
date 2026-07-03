import type { KeyboardEvent, ReactNode } from 'react'
import { Card, CardAction, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import type { AnalysisMode, AnalysisRange } from '@/types'
import type { AppIcon } from './icons'
import { ChevronDownIcon, ChevronUpIcon, MinusIcon } from './icons'
import { BulletChart } from './Charts'

interface PanelProps {
  children: ReactNode
  className?: string
  tone?: 'default' | 'mint' | 'blue' | 'violet' | 'amber'
  category?: 'activity' | 'heart' | 'sleep' | 'recovery' | 'body' | 'device'
  onClick?: () => void
  ariaLabel?: string
}

export function Panel({ children, className, tone = 'default', category, onClick, ariaLabel }: PanelProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onClick()
  }

  return (
    <Card
      className={cn('panel', `tone-${tone}`, onClick && 'is-clickable', className)}
      data-category={category}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
    >
      {children}
    </Card>
  )
}

export function DuoIcon({ icon: Icon, className }: { icon: AppIcon; className?: string }) {
  return (
    <span className={cn('duo-icon', className)} aria-hidden="true">
      <Icon aria-hidden="true" />
    </span>
  )
}

export function PanelHeader({
  eyebrow,
  title,
  icon: Icon,
  action,
}: {
  eyebrow?: string
  title: string
  icon?: AppIcon
  action?: ReactNode
}) {
  return (
    <CardHeader className="panel-header">
      <div className="panel-title-wrap">
        {Icon && <DuoIcon icon={Icon} className="panel-title-icon" />}
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
      </div>
      {action && (
        <CardAction className="panel-header-actions">
          {action}
        </CardAction>
      )}
    </CardHeader>
  )
}

interface MetricProps {
  label: string
  value: number | null
  unit?: string
  goal?: number | null
  icon: AppIcon
  decimals?: number
  onClick?: () => void
}

export function MetricTile({
  label,
  value,
  unit = '',
  goal = null,
  icon: Icon,
  decimals = 0,
  onClick,
}: MetricProps) {
  if (value === null) return null
  const percent = goal && goal > 0 ? value / goal * 100 : null
  const formattedValue = formatNumber(value, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return (
    <Panel className="metric-tile" category="activity" onClick={onClick} ariaLabel={`${label}: ${formattedValue}${unit}`}>
      <div className="metric-tile-head">
        <DuoIcon icon={Icon} />
        <span>{label}</span>
      </div>
      <div className="metric-value">
        {formattedValue}
        <span>{unit}</span>
      </div>
      {goal !== null && goal > 0 ? (
        <div className="metric-goal">
          <BulletChart
            value={value}
            target={goal}
            max={Math.max(value, goal) * 1.08}
            label={`${Math.round(percent ?? 0)}% of goal`}
            valueLabel={`${formattedValue} / ${formatNumber(goal)}${unit}`}
          />
        </div>
      ) : null}
    </Panel>
  )
}

export function Delta({ value, suffix = ' vs. previous period' }: { value: number | null; suffix?: string }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="delta neutral"><MinusIcon aria-hidden="true" /> comparison unavailable</span>
  }
  const up = value > 0
  const Icon = up ? ChevronUpIcon : ChevronDownIcon
  return <span className={cn('delta', up ? 'up' : 'down')}><Icon aria-hidden="true" /> {Math.abs(value).toFixed(1)}%{suffix}</span>
}

export function EmptyValue({ children = 'Not available for this device or day.' }: { children?: ReactNode }) {
  return <div className="empty-value">{children}</div>
}

export function AnalysisModeToggle({
  value,
  onChange,
}: {
  value: AnalysisMode
  onChange: (mode: AnalysisMode) => void
}) {
  return (
    <div className="analysis-toggle" role="tablist" aria-label="Analysis mode">
      {(['daily', 'weekly', 'monthly'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={value === mode}
          className={cn('analysis-toggle-button', value === mode && 'is-active')}
          onClick={() => onChange(mode)}
        >
          {mode === 'daily' ? 'Daily' : mode === 'weekly' ? 'Weekly' : 'Monthly'}
        </button>
      ))}
    </div>
  )
}

export function AnalysisWindowControls({
  mode,
  onModeChange,
  range,
  defaultRange,
  onRangeChange,
  maxDate,
}: {
  mode: AnalysisMode
  onModeChange: (mode: AnalysisMode) => void
  range: AnalysisRange
  defaultRange: AnalysisRange
  onRangeChange: (range: AnalysisRange) => void
  maxDate: string
}) {
  const rangeLabel = `${range.startDate} - ${range.endDate}`
  return (
    <div className="analysis-controls">
      <AnalysisModeToggle value={mode} onChange={onModeChange} />
      <details className="analysis-range-popover">
        <summary className="analysis-range-summary">
          <span>Window</span>
          <strong>{rangeLabel}</strong>
          <ChevronDownIcon aria-hidden="true" />
        </summary>
        <div className="analysis-range-controls">
          <label className="analysis-range-field">
            <span>From</span>
            <input
              type="date"
              value={range.startDate}
              max={range.endDate}
              onChange={(event) => onRangeChange({ ...range, startDate: event.target.value })}
            />
          </label>
          <label className="analysis-range-field">
            <span>To</span>
            <input
              type="date"
              value={range.endDate}
              min={range.startDate}
              max={maxDate}
              onChange={(event) => onRangeChange({ ...range, endDate: event.target.value })}
            />
          </label>
          <button type="button" className="analysis-range-reset" onClick={() => onRangeChange(defaultRange)}>
            Latest 8w
          </button>
        </div>
      </details>
    </div>
  )
}
