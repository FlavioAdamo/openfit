export function formatNumber(value: number | null, options: Intl.NumberFormatOptions = {}) {
  if (value === null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0, ...options }).format(value)
}

export function formatDecimal(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  const sign = value < 0 ? '−' : ''
  const absolute = Math.abs(value)
  const hours = Math.floor(absolute / 60)
  const minutes = Math.round(absolute % 60)
  if (!hours) return `${sign}${minutes} min`
  return `${sign}${hours} h ${String(minutes).padStart(2, '0')} min`
}

export function compactMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  const hours = Math.floor(value / 60)
  const minutes = Math.round(value % 60)
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

export function formatTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(11, 16) || value
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(date)
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions = {}) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', options).format(date)
}

export function relativeTime(value: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(date)
}
