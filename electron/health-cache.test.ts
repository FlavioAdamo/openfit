import { describe, expect, it } from 'vitest'

const { cachedDay, historyCoverage, latestDay, normalizeArchive, storeDay, storeHistory } = require('./health-cache.cjs')

const payload = (date: string) => ({ source: 'google-health', date, generatedAt: `${date}T12:00:00Z`, endpoints: {}, errors: [], rateLimit: {} })

describe('health history cache', () => {
  it('migrates the previous single-day cache', () => {
    const oldCache = payload('2026-06-21')
    expect(normalizeArchive(oldCache)).toMatchObject({ version: 3, lastDate: '2026-06-21', days: { '2026-06-21': oldCache }, history: null })
  })

  it('migrates a version 2 archive without history', () => {
    const archive = { version: 2, lastDate: '2026-06-22', days: { '2026-06-22': payload('2026-06-22') } }
    expect(normalizeArchive(archive)).toMatchObject({ version: 3, lastDate: '2026-06-22', history: null })
    expect(cachedDay(archive, '2026-06-22')?.date).toBe('2026-06-22')
  })

  it('keeps every stored day and returns each one independently', () => {
    const archive = storeDay(storeDay(null, payload('2026-06-21')), payload('2026-06-22'))
    expect(cachedDay(archive, '2026-06-21')?.date).toBe('2026-06-21')
    expect(cachedDay(archive, '2026-06-22')?.date).toBe('2026-06-22')
    expect(latestDay(archive)?.date).toBe('2026-06-22')
  })

  it('replaces only the matching day', () => {
    const first = storeDay(storeDay(null, payload('2026-06-21')), payload('2026-06-22'))
    const updated = storeDay(first, { ...payload('2026-06-22'), generatedAt: 'new' })
    expect(cachedDay(updated, '2026-06-21')?.generatedAt).toBe('2026-06-21T12:00:00Z')
    expect(cachedDay(updated, '2026-06-22')?.generatedAt).toBe('new')
  })

  it('merges history chunks by date without erasing earlier measurements', () => {
    const first = storeHistory(storeDay(null, payload('2026-06-22')), {
      source: 'google-health',
      generatedAt: '2026-06-22T10:00:00Z',
      days: {
        '2026-05-01': { steps: 8000, restingHeartRate: 58 },
        '2026-05-02': { steps: 6500, weight: 72.4 },
        'not-a-date': { steps: 1 },
        '2026-05-03': { steps: null },
      },
    })
    const updated = storeHistory(first, {
      generatedAt: '2026-06-23T10:00:00Z',
      days: { '2026-05-02': { steps: 7000, weight: null, sleepMinutes: 410 } },
    })

    expect(cachedDay(updated, '2026-06-22')?.date).toBe('2026-06-22')
    expect(updated.history.generatedAt).toBe('2026-06-23T10:00:00Z')
    expect(Object.keys(updated.history.days).sort()).toEqual(['2026-05-01', '2026-05-02'])
    expect(updated.history.days['2026-05-02']).toMatchObject({ steps: 7000, weight: 72.4, sleepMinutes: 410, hrvMs: null })
    expect(updated.history.days['2026-05-01']).toMatchObject({ steps: 8000, restingHeartRate: 58 })
  })

  it('keeps the last run and reports coverage', () => {
    expect(historyCoverage(null)).toBeNull()
    const lastRun = { requested: { start: '2026-04-01', end: '2026-06-22' }, startedAt: 'a', finishedAt: 'b', cancelled: false, errors: [] }
    const archive = storeHistory(null, {
      generatedAt: '2026-06-22T10:00:00Z',
      days: { '2026-06-20': { steps: 100 }, '2026-04-03': { sleepMinutes: 400 } },
      lastRun,
    })
    expect(historyCoverage(archive)).toEqual({ start: '2026-04-03', end: '2026-06-20', dayCount: 2, generatedAt: '2026-06-22T10:00:00Z' })
    const withoutRunChange = storeHistory(archive, { days: { '2026-06-21': { steps: 5 } } })
    expect(withoutRunChange.history.lastRun).toEqual(lastRun)
    expect(normalizeArchive(withoutRunChange).history.days['2026-06-21'].steps).toBe(5)
  })
})
