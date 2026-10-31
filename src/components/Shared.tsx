import type { KeyboardEvent, ReactNode } from 'react'
import { Card, CardAction, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import type { TrendWindow } from '@/lib/trend-window'
import type { AppIcon } from './icons'
import { BulletChart } from './Charts'

export type PanelCategory = 'activity' | 'heart' | 'sleep' | 'recovery' | 'body' | 'device'

interface PanelProps {
  children: ReactNode
  className?: string
  category?: PanelCategory
  onClick?: () => void
  ariaLabel?: string
}

export function Panel({ children, className, category, onClick, ariaLabel }: PanelProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onClick()
  }

  return (
    <Card
      className={cn('panel', onClick && 'is-clickable', className)}
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
  category?: PanelCategory
  onClick?: () => void
}

export function MetricTile({
  label,
  value,
  unit = '',
  goal = null,
  icon: Icon,
  decimals = 0,
  category = 'activity',
  onClick,
}: MetricProps) {
  if (value === null) return null
  const percent = goal && goal > 0 ? value / goal * 100 : null
  const formattedValue = formatNumber(value, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return (
    <Panel className="metric-tile" category={category} onClick={onClick} ariaLabel={`${label}: ${formattedValue}${unit}`}>
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

export function EmptyValue({ children = 'Not available for this device or day.' }: { children?: ReactNode }) {
  return <div className="empty-value">{children}</div>
}

const windowLabels: Record<TrendWindow, { short: string; long: string }> = {
  14: { short: '14 d', long: '14 days' },
  30: { short: '30 d', long: '30 days' },
  90: { short: '90 d', long: '90 days' },
  365: { short: '1 y', long: '1 year' },
}

// Radio-group segmented control. Arrow keys move the selection and focus together.
export function TrendWindowControl({
  value,
  options,
  onChange,
}: {
  value: TrendWindow
  options: readonly TrendWindow[]
  onChange: (window: TrendWindow) => void
}) {
  if (options.length < 2) return null

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!direction) return
    event.preventDefault()
    const next = options[(options.indexOf(value) + direction + options.length) % options.length]
    onChange(next)
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-window="${next}"]`)?.focus()
  }

  return (
    <div className="segmented-control" role="radiogroup" aria-label="Trend window">
      {options.map((option) => {
        const active = option === value
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={windowLabels[option].long}
            data-window={option}
            tabIndex={active ? 0 : -1}
            className={cn('segmented-option', active && 'is-active')}
            onClick={() => onChange(option)}
            onKeyDown={onKeyDown}
          >
            {windowLabels[option].short}
          </button>
        )
      })}
    </div>
  )
}
