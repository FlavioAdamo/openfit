import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

function loadPreloadBridge() {
  const filename = path.resolve('electron/preload.cjs')
  const source = fs.readFileSync(filename, 'utf8')
  const exposed = new Map<string, Record<string, (...args: any[]) => unknown>>()
  const invoke = vi.fn((channel: string, ...args: unknown[]) => ({ channel, args }))
  const on = vi.fn()
  const removeListener = vi.fn()
  const preloadModule = new Module(filename)
  const realRequire = preloadModule.require.bind(preloadModule)
  const preloadModuleWithInternals = preloadModule as Module & {
    _compile: (source: string, filename: string) => void
  }
  const ModuleWithInternals = Module as typeof Module & {
    _nodeModulePaths: (from: string) => string[]
  }

  preloadModule.filename = filename
  preloadModule.paths = ModuleWithInternals._nodeModulePaths(path.dirname(filename))
  preloadModule.require = ((id: string) => {
    if (id === 'electron') {
      return {
        contextBridge: {
          exposeInMainWorld: (key: string, value: Record<string, (...args: any[]) => unknown>) => exposed.set(key, value),
        },
        ipcRenderer: { invoke, on, removeListener },
      }
    }
    return realRequire(id)
  }) as NodeJS.Require

  preloadModuleWithInternals._compile(source, filename)
  return { exposed, invoke, on, removeListener }
}

describe('preload bridge contract', () => {
  it('exposes the expected Fitbit bridge methods and IPC channels', () => {
    const { exposed, invoke, on, removeListener } = loadPreloadBridge()
    const fitbit = exposed.get('fitbit')

    expect(new Set(Object.keys(fitbit ?? {}))).toEqual(new Set([
      'getStatus',
      'saveConfig',
      'connect',
      'disconnect',
      'sync',
      'getCachedData',
      'getCachedArchive',
      'exportData',
      'openExternal',
      'onAuthComplete',
      'onSyncProgress',
    ]))

    expect(fitbit?.getStatus()).toMatchObject({ channel: 'fitbit:get-status' })
    expect(fitbit?.saveConfig({ clientId: 'id' })).toMatchObject({ channel: 'fitbit:save-config', args: [{ clientId: 'id' }] })
    expect(fitbit?.connect()).toMatchObject({ channel: 'fitbit:connect' })
    expect(fitbit?.disconnect()).toMatchObject({ channel: 'fitbit:disconnect' })
    expect(fitbit?.sync('2026-06-22')).toMatchObject({ channel: 'fitbit:sync', args: ['2026-06-22'] })
    expect(fitbit?.getCachedData()).toMatchObject({ channel: 'fitbit:get-cached-data' })
    expect(fitbit?.getCachedArchive()).toMatchObject({ channel: 'fitbit:get-cached-archive' })
    expect(fitbit?.exportData()).toMatchObject({ channel: 'fitbit:export-data' })
    expect(fitbit?.openExternal('https://example.test')).toMatchObject({ channel: 'fitbit:open-external', args: ['https://example.test'] })

    const handleAuthComplete = vi.fn()
    const unsubscribeAuth = fitbit?.onAuthComplete(handleAuthComplete) as () => void
    const authListener = on.mock.calls.at(-1)?.[1]
    expect(on.mock.calls.at(-1)?.[0]).toBe('fitbit:auth-complete')
    authListener('electron-event', { ok: true })
    expect(handleAuthComplete).toHaveBeenCalledWith({ ok: true })
    unsubscribeAuth()
    expect(removeListener).toHaveBeenCalledWith('fitbit:auth-complete', authListener)

    const handleSyncProgress = vi.fn()
    const unsubscribeSync = fitbit?.onSyncProgress(handleSyncProgress) as () => void
    const syncListener = on.mock.calls.at(-1)?.[1]
    expect(on.mock.calls.at(-1)?.[0]).toBe('fitbit:sync-progress')
    syncListener('electron-event', { completed: 1, total: 2, key: 'steps' })
    expect(handleSyncProgress).toHaveBeenCalledWith({ completed: 1, total: 2, key: 'steps' })
    unsubscribeSync()
    expect(removeListener).toHaveBeenCalledWith('fitbit:sync-progress', syncListener)
    expect(invoke).toHaveBeenCalledTimes(9)
  })

  it('exposes the expected health assistant bridge methods and IPC channels', () => {
    const { exposed, invoke, on, removeListener } = loadPreloadBridge()
    const assistant = exposed.get('healthAssistant')

    expect(new Set(Object.keys(assistant ?? {}))).toEqual(new Set([
      'getStatus',
      'startTurn',
      'cancel',
      'reset',
      'onEvent',
    ]))

    expect(assistant?.getStatus()).toMatchObject({ channel: 'assistant:get-status' })
    expect(assistant?.startTurn({ requestId: 'abc12345' })).toMatchObject({
      channel: 'assistant:start-turn',
      args: [{ requestId: 'abc12345' }],
    })
    expect(assistant?.cancel('abc12345')).toMatchObject({ channel: 'assistant:cancel', args: ['abc12345'] })
    expect(assistant?.reset()).toMatchObject({ channel: 'assistant:reset' })

    const handleAssistantEvent = vi.fn()
    const unsubscribe = assistant?.onEvent(handleAssistantEvent) as () => void
    const listener = on.mock.calls.at(-1)?.[1]
    expect(on.mock.calls.at(-1)?.[0]).toBe('assistant:event')
    listener('electron-event', { requestId: 'abc12345', type: 'delta', delta: 'hi' })
    expect(handleAssistantEvent).toHaveBeenCalledWith({ requestId: 'abc12345', type: 'delta', delta: 'hi' })
    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith('assistant:event', listener)
    expect(invoke).toHaveBeenCalledTimes(4)
  })
})
