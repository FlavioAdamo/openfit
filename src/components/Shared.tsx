import type { KeyboardEvent, ReactNode } from 'react'
import { Card, CardAction, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
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
