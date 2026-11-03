import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { PassThrough, Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createClaudeService, resolveClaudeBinary } = require('./claude-service.cjs') as {
  createClaudeService: (options?: Record<string, unknown>) => {
    getStatus: () => Record<string, unknown>
    start: () => Promise<Record<string, unknown>>
    startTurn: (input: Record<string, unknown>) => Promise<Record<string, any>>
    cancelTurn: () => Promise<boolean>
    reset: () => Promise<Record<string, unknown>>
    dispose: () => Promise<void>
  }
  resolveClaudeBinary: (options?: Record<string, unknown>) => string | null
}

type StreamMessage = Record<string, any>

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly stdin: Writable
  readonly messages: StreamMessage[] = []
  killed = false
  exitCode: number | null = null
  signalCode: string | null = null
  private inputBuffer = ''

  constructor(private readonly onMessage: (message: StreamMessage, child: FakeChild) => void = () => {}) {
    super()
    this.stdin = new Writable({
      write: (chunk, _encoding, done) => {
        this.inputBuffer += chunk.toString()
        let newline: number
        while ((newline = this.inputBuffer.indexOf('\n')) >= 0) {
          const line = this.inputBuffer.slice(0, newline)
          this.inputBuffer = this.inputBuffer.slice(newline + 1)
          if (!line) continue
          const message = JSON.parse(line) as StreamMessage
          this.messages.push(message)
          this.onMessage(message, this)
        }
        done()
      },
    })
  }

  send(message: StreamMessage) {
    this.stdout.write(`${JSON.stringify(message)}\n`)
  }

  kill(signal = 'SIGTERM') {
    this.killed = true
    this.signalCode = signal
    queueMicrotask(() => this.emit('exit', null, signal))
    return true
  }
}

const textDelta = (text: string) => ({
  type: 'stream_event',
  session_id: 'session-1',
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
})

const result = (overrides: StreamMessage = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  session_id: 'session-1',
  result: '',
  ...overrides,
})

describe('Claude Code service', () => {
  it('starts lazily with every tool, MCP server, and settings source disabled', async () => {
    const child = new FakeChild()
    const spawn = vi.fn(() => child)
    const service = createClaudeService({ spawn, resolveBinary: () => '/mock/.local/bin/claude', cwd: '/mock/openfit' })

    expect(spawn).not.toHaveBeenCalled()
    await service.start()
    await service.start()

    expect(spawn).toHaveBeenCalledTimes(1)
    const [binary, args, options] = spawn.mock.calls[0] as unknown as [string, string[], Record<string, unknown>]
    expect(binary).toBe('/mock/.local/bin/claude')
    expect(options).toMatchObject({ cwd: '/mock/openfit', stdio: ['pipe', 'pipe', 'pipe'] })
    expect(args).toEqual(expect.arrayContaining([
      '--print', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--include-partial-messages',
    ]))
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('')
    expect(args[args.indexOf('--input-format') + 1]).toBe('stream-json')
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json')
    expect(args[args.indexOf('--system-prompt') + 1]).toContain('health-data assistant')
    expect(args).not.toContain('--model')
    expect(service.getStatus()).toMatchObject({ state: 'ready', connected: true, available: true })

    await service.dispose()
  })

  it('sends compact health context and streams text deltas through the final result', async () => {
    const onDelta = vi.fn()
    const onComplete = vi.fn()
    const child = new FakeChild((message, current) => {
      if (message.type !== 'user') return
      queueMicrotask(() => {
        current.send({ type: 'system', subtype: 'init', session_id: 'session-1', tools: [], mcp_servers: [] })
        current.send({ type: 'stream_event', session_id: 'session-1', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hidden' } } })
        current.send(textDelta('You slept '))
        current.send(textDelta('7 hours.'))
        current.send({ type: 'assistant', session_id: 'session-1', message: { content: [{ type: 'text', text: 'You slept 7 hours.' }] } })
        current.send(result({ result: 'You slept 7 hours.' }))
      })
    })
    const service = createClaudeService({ spawn: vi.fn(() => child), resolveBinary: () => '/mock/claude', turnTimeoutMs: 1_000 })

    const turn = await service.startTurn({
      text: 'How did I sleep?',
      healthContext: { date: '2026-06-23', sleepMinutes: 420, missing: null },
      onDelta,
      onComplete,
    })

    expect(child.messages[0]).toEqual({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: '<OPENFIT_HEALTH_CONTEXT>\n{"date":"2026-06-23","sleepMinutes":420,"missing":null}\n</OPENFIT_HEALTH_CONTEXT>' },
          { type: 'text', text: 'How did I sleep?' },
        ],
      },
    })
    expect(onDelta.mock.calls.map(([delta]) => delta)).toEqual(['You slept ', '7 hours.'])
    expect(turn).toEqual({ sessionId: 'session-1', status: 'completed', text: 'You slept 7 hours.' })
    expect(onComplete).toHaveBeenCalledWith(turn)
    expect(service.getStatus()).toMatchObject({ state: 'ready', busy: false, sessionId: 'session-1' })

    await service.dispose()
  })

  it('interrupts a running turn and settles it as cancelled', async () => {
    const child = new FakeChild((message, current) => {
      if (message.type === 'user') queueMicrotask(() => current.send(textDelta('one, two')))
      if (message.type === 'control_request' && message.request?.subtype === 'interrupt') {
        queueMicrotask(() => {
          current.send({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id } })
          current.send(result({ subtype: 'error_during_execution', is_error: true, result: undefined }))
        })
      }
    })
    const service = createClaudeService({ spawn: vi.fn(() => child), resolveBinary: () => '/mock/claude' })

    const onDelta = vi.fn(() => { void service.cancelTurn() })
    await expect(service.startTurn({ text: 'Count to 200', healthContext: '{}', onDelta })).rejects.toMatchObject({ code: 'CLAUDE_TURN_CANCELLED', name: 'AbortError' })
    expect(child.messages.some((message) => message.request?.subtype === 'interrupt')).toBe(true)
    expect(child.killed).toBe(false)
    expect(service.getStatus()).toMatchObject({ state: 'ready', busy: false, lastError: null })

    await service.dispose()
  })

  it('reports sign-in failures from the result so the UI can ask the user to log in', async () => {
    const child = new FakeChild((message, current) => {
      if (message.type === 'user') queueMicrotask(() => current.send(result({ is_error: true, result: 'Not logged in · Please run /login' })))
    })
    const service = createClaudeService({ spawn: vi.fn(() => child), resolveBinary: () => '/mock/claude' })

    await expect(service.startTurn({ text: 'Hi', healthContext: '{}' })).rejects.toMatchObject({ code: 'CLAUDE_TURN_FAILED' })
    expect(service.getStatus().lastError).toContain('Not logged in')

    await service.dispose()
  })

  it('refuses permission requests from the CLI', async () => {
    const child = new FakeChild()
    const service = createClaudeService({ spawn: vi.fn(() => child), resolveBinary: () => '/mock/claude' })
    await service.start()

    child.send({ type: 'control_request', request_id: 'req-1', request: { subtype: 'can_use_tool', tool_name: 'Bash' } })
    await vi.waitFor(() => expect(child.messages).toHaveLength(1))
    expect(child.messages[0]).toMatchObject({ type: 'control_response', response: { subtype: 'error', request_id: 'req-1' } })

    await service.dispose()
  })

  it('reset kills the process so the next turn starts a fresh conversation', async () => {
    const children: FakeChild[] = []
    const spawn = vi.fn(() => {
      const child = new FakeChild()
      children.push(child)
      return child
    })
    const service = createClaudeService({ spawn, resolveBinary: () => '/mock/claude', terminationGraceMs: 10 })
    await service.start()
    await service.reset()
    expect(children[0].killed).toBe(true)
    await service.start()
    expect(spawn).toHaveBeenCalledTimes(2)

    await service.dispose()
  })

  it('reports a missing Claude Code binary without spawning', async () => {
    const spawn = vi.fn()
    const service = createClaudeService({ spawn, resolveBinary: () => null })

    await expect(service.start()).rejects.toMatchObject({ code: 'CLAUDE_BINARY_NOT_FOUND' })
    expect(spawn).not.toHaveBeenCalled()
    expect(service.getStatus()).toMatchObject({ state: 'error', available: false, connected: false })
  })

  it('handles process errors without exposing stderr or authentication material', async () => {
    const child = new FakeChild()
    const spawn = vi.fn(() => {
      queueMicrotask(() => {
        child.stderr.write('Authorization: Bearer super-secret-token sk-also-secret')
        child.emit('error', Object.assign(new Error('sk-error-secret'), { code: 'ENOENT' }))
      })
      return child
    })
    const service = createClaudeService({ spawn, resolveBinary: () => '/mock/claude', terminationGraceMs: 10 })

    let caught: any
    try { await service.startTurn({ text: 'Hi', healthContext: '{}' }) } catch (error) { caught = error }
    expect(caught).toMatchObject({ code: 'CLAUDE_SPAWN_FAILED' })
    expect(caught.message).toContain('Could not start Claude Code (ENOENT).')
    expect(caught.message).not.toContain('super-secret')
    expect(caught.message).not.toContain('sk-error-secret')
    expect(service.getStatus()).toMatchObject({ state: 'error', connected: false })
  })

  it('finds the installer location even when the app has no shell PATH', () => {
    const existing = new Set(['/Users/me/.local/bin/claude'])
    const fakeFs = {
      accessSync: (candidate: string) => { if (!existing.has(candidate)) throw new Error('missing') },
      statSync: () => ({ isFile: () => true }),
    }
    expect(resolveClaudeBinary({ env: { PATH: '/usr/bin' }, fs: fakeFs, platform: 'darwin', homedir: '/Users/me' })).toBe('/Users/me/.local/bin/claude')
    expect(resolveClaudeBinary({ env: { PATH: '/usr/bin' }, fs: { ...fakeFs, accessSync: () => { throw new Error('missing') } }, platform: 'darwin', homedir: '/Users/me' })).toBeNull()
  })
})
