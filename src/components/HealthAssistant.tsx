import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAssistantRuntime,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessage,
} from '@assistant-ui/react'
import { ArrowDown, ArrowUp, Plus, Sparkles, Square, X } from 'lucide-react'
import { normalizeFitbitData } from '@/data/normalize'
import {
  buildHealthAssistantContext,
  parseAssistantNavigation,
  stripAssistantNavigation,
  visibleAssistantText,
  type AssistantNavigation,
} from '@/lib/health-assistant'
import type {
  AssistantProvider,
  DashboardData,
  HealthAssistantEvent,
  HealthAssistantStatus,
  PageId,
  RawHealthArchive,
} from '@/types'

const unavailableStatus: HealthAssistantStatus = {
  provider: 'codex',
  providers: [],
  available: false,
  connected: false,
  authenticated: false,
  version: null,
}

function messageText(message: ThreadMessage | undefined) {
  if (!message) return ''
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

function archiveData(archive: RawHealthArchive | null | undefined) {
  if (!archive) return []
  return Object.values(archive.days)
    .map((payload) => normalizeFitbitData(payload))
    .sort((left, right) => left.selectedDate.localeCompare(right.selectedDate))
}

function providerLabel(status: HealthAssistantStatus) {
  return status.providers.find((provider) => provider.id === status.provider)?.label ?? 'Codex'
}

function statusLabel(status: HealthAssistantStatus, hasBridge: boolean) {
  if (!hasBridge) return 'Desktop only'
  const label = providerLabel(status)
  if (!status.available) return `${label} not found`
  if (!status.authenticated) return `Sign in to ${label}`
  return status.connected ? `${label} connected` : `${label} ready`
}

function createQueue() {
  const events: HealthAssistantEvent[] = []
  let wake: ((event: HealthAssistantEvent) => void) | null = null

  return {
    push(event: HealthAssistantEvent) {
      if (wake) {
        const resolve = wake
        wake = null
        resolve(event)
      } else {
        events.push(event)
      }
    },
    next() {
      const event = events.shift()
      if (event) return Promise.resolve(event)
      return new Promise<HealthAssistantEvent>((resolve) => { wake = resolve })
    },
  }
}

export function HealthAssistant({
  open,
  data,
  page,
  onOpenChange,
  onNavigate,
}: {
  open: boolean
  data: DashboardData
  page: PageId
  onOpenChange: (open: boolean) => void
  onNavigate: (navigation: AssistantNavigation) => void
}) {
  const dataRef = useRef(data)
  const pageRef = useRef(page)
  const navigateRef = useRef(onNavigate)
  const [status, setStatus] = useState(unavailableStatus)
  const statusRef = useRef(status)

  useEffect(() => { dataRef.current = data }, [data])
  useEffect(() => { pageRef.current = page }, [page])
  useEffect(() => { navigateRef.current = onNavigate }, [onNavigate])
  useEffect(() => { statusRef.current = status }, [status])

  const refreshStatus = useCallback(async () => {
    if (!window.healthAssistant) {
      setStatus(unavailableStatus)
      return
    }
    try {
      setStatus(await window.healthAssistant.getStatus())
    } catch (error) {
      setStatus({
        ...unavailableStatus,
        error: error instanceof Error ? error.message : 'The assistant is unavailable.',
      })
    }
  }, [])

  useEffect(() => { void refreshStatus() }, [refreshStatus])
  useEffect(() => {
    if (open) void refreshStatus()
  }, [open, refreshStatus])

  const modelAdapter = useMemo<ChatModelAdapter>(() => ({
    async *run({ messages, abortSignal }) {
      const bridge = window.healthAssistant
      if (!bridge) throw new Error('Launch OpenFit in the desktop app to use the health assistant.')

      const prompt = messageText(messages.at(-1))
      if (!prompt) throw new Error('Write a question before sending it.')

      let archived: DashboardData[] = []
      if (window.fitbit && dataRef.current.source !== 'demo') {
        try {
          archived = archiveData(await window.fitbit.getCachedArchive())
        } catch {
          archived = []
        }
      }

      const healthContext = buildHealthAssistantContext(dataRef.current, archived, pageRef.current)
      const requestId = crypto.randomUUID()
      const queue = createQueue()
      let fullText = ''
      let lastVisibleText = ''
      let completed = false

      const unsubscribe = bridge.onEvent((event) => {
        if (event.requestId === requestId) queue.push(event)
      })
      const onAbort = () => queue.push({ requestId, type: 'cancelled' })
      abortSignal.addEventListener('abort', onAbort, { once: true })

      try {
        await bridge.startTurn({ requestId, message: prompt, healthContext })
        void refreshStatus()

        while (!completed) {
          const event = await queue.next()
          if (event.type === 'delta') {
            fullText += event.delta
            const visible = visibleAssistantText(fullText)
            if (visible && visible !== lastVisibleText) {
              lastVisibleText = visible
              yield { content: [{ type: 'text', text: visible }] }
            }
          } else if (event.type === 'complete') {
            completed = true
            if (event.text) fullText = event.text
          } else if (event.type === 'error') {
            throw new Error(event.message)
          } else {
            return
          }
        }

        const navigation = parseAssistantNavigation(fullText)
        const finalText = stripAssistantNavigation(fullText)
        if (navigation) navigateRef.current(navigation)
        if (!finalText) throw new Error(`${providerLabel(statusRef.current)} completed the turn without a response.`)
        if (finalText !== lastVisibleText) {
          yield { content: [{ type: 'text', text: finalText }] }
        }
      } finally {
        abortSignal.removeEventListener('abort', onAbort)
        unsubscribe()
        if (!completed || abortSignal.aborted) void bridge.cancel(requestId)
        void refreshStatus()
      }
    },
  }), [refreshStatus])

  const runtime = useLocalRuntime(modelAdapter)
  const ready = Boolean(window.healthAssistant && status.available && status.authenticated)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <aside
        id="health-assistant"
        className={`health-assistant ${open ? 'is-open' : ''}`}
        aria-label="Health assistant"
        aria-hidden={!open}
        inert={!open}
      >
        <AssistantHeader
          status={status}
          ready={ready}
          onClose={() => onOpenChange(false)}
          onStatusRefresh={refreshStatus}
          onStatusChange={setStatus}
        />
        <AssistantThread ready={ready} providerLabel={providerLabel(status)} />
      </aside>
      {open && <button className="assistant-scrim" aria-label="Close health assistant" onClick={() => onOpenChange(false)} />}
    </AssistantRuntimeProvider>
  )
}

function AssistantHeader({
  status,
  ready,
  onClose,
  onStatusRefresh,
  onStatusChange,
}: {
  status: HealthAssistantStatus
  ready: boolean
  onClose: () => void
  onStatusRefresh: () => Promise<void>
  onStatusChange: (status: HealthAssistantStatus) => void
}) {
  const runtime = useAssistantRuntime()

  const newConversation = async () => {
    runtime.thread.cancelRun()
    runtime.thread.reset()
    await window.healthAssistant?.reset()
    await onStatusRefresh()
  }

  // Each assistant keeps its own conversation, so switching starts a fresh thread.
  const switchProvider = async (provider: AssistantProvider) => {
    if (!window.healthAssistant || provider === status.provider) return
    runtime.thread.cancelRun()
    runtime.thread.reset()
    try {
      onStatusChange(await window.healthAssistant.setProvider(provider))
    } catch {
      await onStatusRefresh()
    }
  }

  return (
    <header className="assistant-header">
      <div className="assistant-title">
        <span className="assistant-mark"><Sparkles aria-hidden="true" /></span>
        <span>
          <strong>Health assistant</strong>
          <small><i className={ready ? 'is-ready' : ''} />{statusLabel(status, Boolean(window.healthAssistant))}</small>
        </span>
      </div>
      {status.providers.length > 1 && (
        <div className="assistant-provider" role="radiogroup" aria-label="Assistant">
          {status.providers.map((provider) => (
            <label key={provider.id} className={provider.id === status.provider ? 'active' : ''} title={provider.available ? provider.label : `${provider.label} is not installed`}>
              <input
                className="sr-only"
                type="radio"
                name="assistant-provider"
                value={provider.id}
                checked={provider.id === status.provider}
                onChange={() => void switchProvider(provider.id)}
              />
              {provider.label}
            </label>
          ))}
        </div>
      )}
      <div className="assistant-header-actions">
        <button type="button" aria-label="New conversation" title="New conversation" onClick={() => void newConversation()}>
          <Plus aria-hidden="true" />
        </button>
        <button type="button" aria-label="Close assistant" title="Close" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

function AssistantThread({ ready, providerLabel }: { ready: boolean; providerLabel: string }) {
  return (
    <ThreadPrimitive.Root className="assistant-thread">
      <ThreadPrimitive.Viewport className="assistant-viewport">
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <div className="assistant-welcome">
            <h2>Ask your health data.</h2>
            <p>I can compare days, explain trends, and take you to the relevant view.</p>
            <div className="assistant-suggestions" aria-label="Suggested questions">
              <ThreadPrimitive.Suggestion prompt="How did I sleep last night?" send disabled={!ready}>How did I sleep?</ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion prompt="Compare my activity over the last seven days." send disabled={!ready}>Compare this week</ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion prompt="Show me my heart health data." send disabled={!ready}>Open heart data</ThreadPrimitive.Suggestion>
            </div>
          </div>
        </AuiIf>

        <div className="assistant-messages">
          <ThreadPrimitive.Messages>
            {({ message }) => message.role === 'user' ? <UserMessage /> : <AssistantMessage />}
          </ThreadPrimitive.Messages>
        </div>

        <ThreadPrimitive.ViewportFooter className="assistant-viewport-footer">
          <ThreadPrimitive.ScrollToBottom className="assistant-scroll-bottom" aria-label="Scroll to latest response">
            <ArrowDown aria-hidden="true" />
          </ThreadPrimitive.ScrollToBottom>
          <ComposerPrimitive.Root className="assistant-composer">
            <ComposerPrimitive.Input
              className="assistant-composer-input"
              rows={1}
              disabled={!ready}
              placeholder={ready ? 'Ask about your health…' : `Install ${providerLabel} to chat`}
              aria-label="Message health assistant"
            />
            <AuiIf condition={(state) => !state.thread.isRunning}>
              <ComposerPrimitive.Send className="assistant-send" disabled={!ready} aria-label="Send message">
                <ArrowUp aria-hidden="true" />
              </ComposerPrimitive.Send>
            </AuiIf>
            <AuiIf condition={(state) => state.thread.isRunning}>
              <ComposerPrimitive.Cancel className="assistant-send is-cancel" aria-label="Stop response">
                <Square aria-hidden="true" />
              </ComposerPrimitive.Cancel>
            </AuiIf>
          </ComposerPrimitive.Root>
          <p className="assistant-disclaimer">Health context, not medical advice.</p>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="assistant-user-message">
      <div><MessagePrimitive.Parts /></div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="assistant-ai-message">
      <span className="assistant-response-mark" aria-hidden="true">+</span>
      <div><MessagePrimitive.Parts /></div>
    </MessagePrimitive.Root>
  )
}
