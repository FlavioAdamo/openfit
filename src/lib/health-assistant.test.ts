import { describe, expect, it } from 'vitest'
import { createDemoData } from '@/data/demo'
import {
  buildHealthAssistantContext,
  parseAssistantNavigation,
  stripAssistantNavigation,
  visibleAssistantText,
} from './health-assistant'

describe('health assistant context', () => {
  it('includes every category and the selected-day detail without null noise', () => {
    const data = createDemoData('2026-06-23')
    const context = JSON.parse(buildHealthAssistantContext(data, [data], 'sleep'))

    expect(context.app).toMatchObject({ currentPage: 'sleep', selectedDate: '2026-06-23' })
    expect(context.archive.dayCount).toBe(data.history.length)
    expect(context.archive.firstDate).toBe(data.history[0]?.date)
    expect(context.selectedDayDetail.summary).toHaveProperty('activity')
    expect(context.selectedDayDetail.summary).toHaveProperty('health')
    expect(context.selectedDayDetail.summary).toHaveProperty('sleep')
    expect(context.selectedDayDetail.summary).toHaveProperty('body')
    expect(context.selectedDayDetail.intraday.heartRate.length).toBeGreaterThan(0)
  })
})

describe('assistant navigation directives', () => {
  it('parses and removes a valid directive', () => {
    const text = 'Apro il sonno di ieri.\n<!-- openfit:navigate {"page":"sleep","date":"2026-06-22"} -->'
    expect(parseAssistantNavigation(text)).toEqual({ page: 'sleep', date: '2026-06-22' })
    expect(stripAssistantNavigation(text)).toBe('Apro il sonno di ieri.')
    expect(visibleAssistantText(text)).toBe('Apro il sonno di ieri.')
    expect(visibleAssistantText('Apro il sonno.\n<!-- pulse')).toBe('Apro il sonno.')
  })

  it('ignores invalid pages and malformed JSON', () => {
    expect(parseAssistantNavigation('<!-- openfit:navigate {"page":"admin"} -->')).toBeNull()
    expect(parseAssistantNavigation('<!-- openfit:navigate {"date":"2026-02-31"} -->')).toBeNull()
    expect(parseAssistantNavigation('<!-- openfit:navigate nope -->')).toBeNull()
  })
})
