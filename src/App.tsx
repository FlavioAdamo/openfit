import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ChevronsUpDown, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AnalysisMode, AnalysisRange, DashboardData, FitbitAuthStatus, FitbitConfigInput, HealthProvider, PageId } from '@/types'
import { createDemoData, localIso } from '@/data/demo'
import { normalizeFitbitData } from '@/data/normalize'
import { clampAnalysisRange, defaultAnalysisRange, filterDashboardDataByRange } from '@/lib/analysis-window'
import { formatDate, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ActivityView, BodyView, DevicesView, HealthView, SleepView, TodayView } from '@/components/Views'
import { HealthAssistant } from '@/components/HealthAssistant'
import type { AssistantNavigation } from '@/lib/health-assistant'
import type { AppIcon } from '@/components/icons'
import {
  ActivityIcon,
  BodyIcon,
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CloudIcon,
  DeviceIcon,
  DisconnectIcon,
  ExportIcon,
  ExternalIcon,
  HeartIcon,
  LoaderIcon,
  SettingsIcon,
  ShieldIcon,
  SleepIcon,
  SparkleIcon,
  StepsIcon,
  TodayIcon,
} from '@/components/icons'

type NavCategory = 'summary' | 'activity' | 'heart' | 'sleep' | 'body' | 'device'

const navItems: Array<{ id: PageId; label: string; copy: string; icon: AppIcon; category: NavCategory }> = [
  { id: 'today', label: 'Today', copy: 'The day’s essential overview.', icon: TodayIcon, category: 'summary' },
  { id: 'activity', label: 'Activity', copy: 'Goals, hourly distribution, and workouts.', icon: ActivityIcon, category: 'activity' },
  { id: 'health', label: 'Health', copy: 'Cardiac and physiological signals over time.', icon: HeartIcon, category: 'heart' },
  { id: 'sleep', label: 'Sleep', copy: 'Duration, quality, and composition of your latest night’s sleep.', icon: SleepIcon, category: 'sleep' },
  { id: 'body', label: 'Body', copy: 'Weight, composition, and daily balance.', icon: BodyIcon, category: 'body' },
  { id: 'devices', label: 'Data', copy: 'Sources, coverage, and local protection.', icon: DeviceIcon, category: 'device' },
]

const defaultStatus: FitbitAuthStatus = {
  isElectron: Boolean(window.fitbit),
  configured: false,
  connected: false,
  clientId: '',
  redirectUri: 'http://127.0.0.1:42813/oauth/callback',
  hasClientSecret: false,
  storageEncrypted: false,
  lastSyncAt: null,
  provider: 'google-health',
}

function providerDisplayName(provider: HealthProvider) {
  if (provider === 'fitbit-legacy') return 'Fitbit legacy'
  if (provider === 'whoop') return 'WHOOP'
  return 'Google Health'
}

function defaultRedirectForProvider(provider: HealthProvider) {
  return 'http://127.0.0.1:42813/oauth/callback'
}

interface ToastState {
  tone: 'success' | 'error' | 'neutral'
  message: string
}

interface SyncProgressState {
  completed: number
  total: number
  key?: string
  date?: string
}

function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number)
  return localIso(new Date(year, month - 1, day + days, 12))
}

function IconButton({ label, children, ...props }: { label: string; children: ReactNode } & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><Button aria-label={label} variant="ghost" size="icon" {...props}>{children}</Button></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export default function App() {
  const [page, setPage] = useState<PageId>('today')
  const [selectedDate, setSelectedDate] = useState(localIso())
  const [data, setData] = useState<DashboardData>(() => createDemoData())
  const [status, setStatus] = useState(defaultStatus)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('daily')
  const [analysisRange, setAnalysisRange] = useState<AnalysisRange | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncTargetDate, setSyncTargetDate] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgressState | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const selectedDateRef = useRef(selectedDate)
  const dataDateRef = useRef(data.selectedDate)
  const syncingRef = useRef(false)
  const syncTargetDateRef = useRef<string | null>(null)
  const queuedDateRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [page])

  useEffect(() => {
    selectedDateRef.current = selectedDate
  }, [selectedDate])

  useEffect(() => {
    dataDateRef.current = data.selectedDate
  }, [data.selectedDate])

  const defaultRange = useMemo(() => defaultAnalysisRange(data.trends, data.selectedDate), [data.selectedDate, data.trends])
  const normalizedAnalysisRange = useMemo(
    () => clampAnalysisRange(analysisRange ?? defaultRange, data.trends, data.selectedDate),
    [analysisRange, data.selectedDate, data.trends, defaultRange],
  )
  const analysisData = useMemo(
    () => filterDashboardDataByRange(data, normalizedAnalysisRange),
    [data, normalizedAnalysisRange],
  )

  useEffect(() => {
    if (!analysisRange || analysisRange.startDate !== normalizedAnalysisRange.startDate || analysisRange.endDate !== normalizedAnalysisRange.endDate) {
      setAnalysisRange(normalizedAnalysisRange)
    }
  }, [analysisRange, normalizedAnalysisRange])

  const loadNativeState = useCallback(async () => {
    if (!window.fitbit) return
    try {
      const [nextStatus, cached] = await Promise.all([window.fitbit.getStatus(), window.fitbit.getCachedData()])
      setStatus(nextStatus)
      if (cached) {
        const normalized = normalizeFitbitData(cached)
        dataDateRef.current = normalized.selectedDate
        selectedDateRef.current = normalized.selectedDate
        setData({ ...normalized, source: 'cache' })
        setSelectedDate(normalized.selectedDate)
      }
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to read the local status.' })
    }
  }, [])

  const runSync = useCallback(async (requestedDate?: string) => {
    if (!window.fitbit) {
      setSettingsOpen(true)
      return
    }

    const firstDate = requestedDate ?? selectedDateRef.current
    if (syncingRef.current) {
      queuedDateRef.current = firstDate
      return
    }

    syncingRef.current = true
    setSyncing(true)
    let nextDate: string | null = firstDate

    try {
      while (nextDate) {
        const date: string = nextDate
        queuedDateRef.current = null
        syncTargetDateRef.current = date
        setSyncTargetDate(date)
        setSyncProgress({ completed: 0, total: 0 })

        try {
          const payload = await window.fitbit.sync(date)
          const normalized = normalizeFitbitData(payload)

          if (selectedDateRef.current === date) {
            dataDateRef.current = normalized.selectedDate
            setData(normalized)
            setToast({
              tone: payload.cacheHit || payload.errors.length ? 'neutral' : 'success',
              message: payload.cacheHit
                ? 'Day loaded from the local archive.'
                : payload.errors.length
                ? `Updated. ${payload.errors.length} sources have no data for this period.`
                : 'Data updated.',
            })
          }

          void window.fitbit.getStatus().then(setStatus).catch(() => undefined)
        } catch (error) {
          const queuedDate = queuedDateRef.current
          const failedDateIsStillSelected = selectedDateRef.current === date
          const hasDifferentDateQueued = Boolean(queuedDate && queuedDate !== date)

          if (failedDateIsStillSelected && !hasDifferentDateQueued) {
            selectedDateRef.current = dataDateRef.current
            setSelectedDate(dataDateRef.current)
            setToast({ tone: 'error', message: error instanceof Error ? error.message : 'Sync failed.' })
          }
        }

        const queuedDate = queuedDateRef.current
        queuedDateRef.current = null
        nextDate = queuedDate && queuedDate !== date ? queuedDate : null
      }
    } finally {
      syncingRef.current = false
      syncTargetDateRef.current = null
      queuedDateRef.current = null
      setSyncing(false)
      setSyncTargetDate(null)
      setSyncProgress(null)
    }
  }, [])

  useEffect(() => {
    void loadNativeState()
    if (!window.fitbit) return
    const unsubscribeAuth = window.fitbit.onAuthComplete(async (result) => {
      setConnecting(false)
      if (!result.ok) {
        setToast({ tone: 'error', message: result.error ?? 'Authorization failed.' })
        return
      }
      setSettingsOpen(false)
      const authDate = selectedDateRef.current
      setToast({ tone: 'success', message: 'Account connected. Syncing data…' })
      await loadNativeState()
      selectedDateRef.current = authDate
      setSelectedDate(authDate)
      void runSync(authDate)
    })
    const unsubscribeSync = window.fitbit.onSyncProgress((progress) => {
      if (syncingRef.current && (!progress.date || progress.date === syncTargetDateRef.current)) {
        setSyncProgress(progress)
      }
    })
    return () => {
      unsubscribeAuth()
      unsubscribeSync()
    }
  }, [loadNativeState, runSync])

  useEffect(() => {
    if (!toast) return
    if (toast.tone === 'error') return
    const timer = window.setTimeout(() => setToast(null), 4_500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const visibleNav = navItems

  const changeDate = (date: string) => {
    if (!date || date > localIso()) return
    selectedDateRef.current = date
    setSelectedDate(date)
    if (data.source === 'demo' && !status.connected) {
      const demoData = createDemoData(date)
      dataDateRef.current = demoData.selectedDate
      setData(demoData)
      return
    }
    if (status.connected) void runSync(date)
  }

  const connect = async () => {
    if (!window.fitbit) {
      setToast({ tone: 'neutral', message: 'Launch OpenFit in the Electron app to connect your health provider.' })
      return
    }
    if (!status.configured) {
      setSettingsOpen(true)
      return
    }
    setConnecting(true)
    try {
      const result = await window.fitbit.connect()
      if (!result.ok) throw new Error(result.message ?? 'Unable to start OAuth.')
      setToast({ tone: 'neutral', message: 'Complete authorization in your browser.' })
    } catch (error) {
      setConnecting(false)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : 'Connection failed.' })
    }
  }

  const saveAndConnect = async (config: FitbitConfigInput) => {
    if (!window.fitbit) return
    try {
      const nextStatus = await window.fitbit.saveConfig(config)
      setStatus(nextStatus)
      setConnecting(true)
      const result = await window.fitbit.connect()
      if (!result.ok) throw new Error(result.message ?? 'Unable to start OAuth.')
      setToast({ tone: 'neutral', message: 'Authorize OpenFit in the browser window.' })
    } catch (error) {
      setConnecting(false)
      setToast({ tone: 'error', message: error instanceof Error ? error.message : 'Invalid configuration.' })
    }
  }

  const disconnect = async () => {
    if (!window.fitbit) return
    setStatus(await window.fitbit.disconnect())
    setData(createDemoData(selectedDate))
    setSettingsOpen(false)
    setPage('today')
    setToast({ tone: 'success', message: 'Account disconnected and local data removed.' })
  }

  const exportData = async () => {
    if (!window.fitbit || data.source === 'demo') {
      setToast({ tone: 'neutral', message: 'Connect a health provider to export real data.' })
      return
    }
    const result = await window.fitbit.exportData()
    if (!result.canceled) setToast({ tone: 'success', message: 'JSON archive exported.' })
  }

  const currentView = useMemo(() => {
    const props = {
      data,
      analysisData,
      status,
      navigate: setPage,
      analysisMode,
      setAnalysisMode,
      analysisRange: normalizedAnalysisRange,
      defaultAnalysisRange: defaultRange,
      setAnalysisRange,
    }
    if (page === 'activity') return <ActivityView {...props} />
    if (page === 'health') return <HealthView {...props} />
    if (page === 'sleep') return <SleepView {...props} />
    if (page === 'body') return <BodyView {...props} />
    if (page === 'devices') return <DevicesView {...props} />
    return <TodayView {...props} />
  }, [analysisData, analysisMode, data, defaultRange, normalizedAnalysisRange, page, status])

  const isToday = selectedDate === localIso()
  const sourceLabel = status.connected
    ? providerDisplayName(status.provider)
    : data.source === 'demo' ? 'Demo data' : 'Local cache'
  const pageMeta = navItems.find((item) => item.id === page) ?? navItems[0]
  const loadingSelectedDate = syncing && data.selectedDate !== selectedDate
  const selectedDateQueued = loadingSelectedDate && syncTargetDate !== null && syncTargetDate !== selectedDate
  const syncProgressPercent = syncProgress && syncProgress.total > 0
    ? Math.round(syncProgress.completed / syncProgress.total * 100)
    : null
  const syncProgressLabel = syncProgress?.total
    ? `${syncProgress.completed} of ${syncProgress.total} sources`
    : 'Starting secure sync…'
  const batteryLevel = data.device?.batteryLevel == null
    ? null
    : Math.max(0, Math.min(100, Math.round(data.device.batteryLevel)))

  const navigate = (nextPage: PageId) => {
    setPage(nextPage)
  }

  const navigateFromAssistant = (navigation: AssistantNavigation) => {
    if (navigation.date) changeDate(navigation.date)
    if (navigation.page) setPage(navigation.page)
  }

  return (
    <SidebarProvider className={cn('app-shell', assistantOpen && 'assistant-open')}>
      <div className="window-drag-region" />
      <OpenFitSidebar
        items={visibleNav}
        page={page}
        userName={data.profile.displayName}
        userAvatar={data.profile.avatar}
        sourceLabel={sourceLabel}
        onNavigate={navigate}
        onSettings={() => setSettingsOpen(true)}
      />

      <SidebarInset className="main-area">
        <header className="topbar">
          <div className="topbar-heading">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="sidebar-trigger" aria-label="Toggle navigation" />
              </TooltipTrigger>
              <TooltipContent>Toggle navigation</TooltipContent>
            </Tooltip>
            <div>
              <h1>{pageMeta.label}</h1>
              <p className="topbar-meta">
                <span>{page === 'today' ? formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' }) : pageMeta.copy}</span>
              </p>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="date-control">
              <IconButton label="Previous day" onClick={() => changeDate(shiftDate(selectedDate, -1))}><ChevronLeftIcon /></IconButton>
              <label className="date-picker">
                {loadingSelectedDate ? <LoaderCircle className="spin" aria-hidden="true" /> : <CalendarIcon aria-hidden="true" />}
                <span>{isToday ? 'Today' : formatDate(selectedDate, { day: 'numeric', month: 'short' })}</span>
                <input type="date" value={selectedDate} max={localIso()} onChange={(event) => changeDate(event.target.value)} />
              </label>
              <IconButton label="Next day" disabled={isToday} onClick={() => changeDate(shiftDate(selectedDate, 1))}><ChevronRightIcon /></IconButton>
            </div>

            {batteryLevel != null && (
              <div className="fitbit-battery" role="status" aria-label={`Fitbit battery ${batteryLevel}%`}>
                <span className="battery-glyph" aria-hidden="true">
                  <span className="battery-charge" style={{ width: `${batteryLevel}%` }} />
                </span>
                <span className="battery-percent">{batteryLevel}%</span>
              </div>
            )}

            <IconButton
              label={assistantOpen ? 'Close health assistant' : 'Open health assistant'}
              className={cn('assistant-toggle', assistantOpen && 'is-active')}
              aria-controls="health-assistant"
              aria-expanded={assistantOpen}
              onClick={() => setAssistantOpen((open) => !open)}
            >
              <Sparkles />
            </IconButton>
            {status.connected ? (
              <>
                {syncing && (
                  <span className="sync-status" role="status" aria-live="polite">
                    {syncProgress?.total ? `${syncProgress.completed}/${syncProgress.total}` : 'Syncing'}
                  </span>
                )}
                <IconButton
                  label={syncProgress?.total ? `Syncing data ${syncProgress.completed} of ${syncProgress.total}` : syncing ? 'Starting data sync' : 'Refresh data'}
                  className="refresh-button"
                  onClick={() => runSync()}
                  disabled={syncing}
                >
                  {syncing ? <LoaderCircle className="spin" /> : <RefreshCw />}
                </IconButton>
              </>
            ) : (
              <Button className="connect-button" aria-label={`Connect ${providerDisplayName(status.provider)}`} onClick={connect} disabled={connecting}>
                {connecting ? <LoaderIcon className="spin" /> : <CloudIcon />}<span>Connect</span>
              </Button>
            )}
          </div>
        </header>

        <div className="page-content" key={page} aria-busy={loadingSelectedDate}>
          {loadingSelectedDate ? (
            <div className="date-loading" role="status" aria-live="polite">
              <LoaderCircle className="spin" aria-hidden="true" />
              <div>
                <strong>
                  {selectedDateQueued
                    ? `${formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })} is next`
                    : `Loading ${formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}`}
                </strong>
                <span>
                  {selectedDateQueued && syncTargetDate
                    ? `Finishing ${formatDate(syncTargetDate, { day: 'numeric', month: 'short' })} first · ${syncProgressLabel}`
                    : syncProgressLabel}
                </span>
                <div
                  className={cn('date-loading-progress', syncProgressPercent === null && 'is-indeterminate')}
                  role="progressbar"
                  aria-label="Data sync progress"
                  aria-valuemin={0}
                  aria-valuemax={syncProgress?.total || 100}
                  aria-valuenow={syncProgress?.total ? syncProgress.completed : undefined}
                >
                  <i style={{ width: syncProgressPercent === null ? '32%' : `${syncProgressPercent}%` }} />
                </div>
                {selectedDateQueued && <small>You can keep moving between days; the latest selection loads next.</small>}
              </div>
            </div>
          ) : currentView}
        </div>
      </SidebarInset>

      <HealthAssistant
        open={assistantOpen}
        data={data}
        page={page}
        onOpenChange={setAssistantOpen}
        onNavigate={navigateFromAssistant}
      />

      <SettingsDialog
        open={settingsOpen}
        status={status}
        connecting={connecting}
        onOpenChange={setSettingsOpen}
        onSave={saveAndConnect}
        onConnect={connect}
        onExport={exportData}
        onDisconnect={disconnect}
      />

      {toast && (
        <div className={cn('toast', `toast-${toast.tone}`)} role={toast.tone === 'error' ? 'alert' : 'status'}>
          {toast.tone === 'success' ? <CheckIcon /> : toast.tone === 'error' ? <CloseIcon /> : <SparkleIcon />}
          <span>{toast.message}</span>
          <button className="toast-close" aria-label="Close notification" onClick={() => setToast(null)}><CloseIcon /></button>
        </div>
      )}
    </SidebarProvider>
  )
}

function OpenFitSidebar({
  items,
  page,
  userName,
  userAvatar,
  sourceLabel,
  onNavigate,
  onSettings,
}: {
  items: typeof navItems
  page: PageId
  userName: string
  userAvatar: string | null
  sourceLabel: string
  onNavigate: (page: PageId) => void
  onSettings: () => void
}) {
  const { setOpenMobile } = useSidebar()
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'PB'
  const wellbeingItems = items.filter((item) => item.id !== 'devices')
  const dataItem = items.find((item) => item.id === 'devices')

  const selectPage = (nextPage: PageId) => {
    onNavigate(nextPage)
    setOpenMobile(false)
  }

  const openSettings = () => {
    setOpenMobile(false)
    onSettings()
  }

  return (
    <Sidebar collapsible="icon" className="pulse-sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="sidebar-workspace" tooltip="OpenFit" onClick={() => selectPage('today')}>
              <span className="sidebar-workspace-mark">
                <img src="./app-icon.png" alt="" aria-hidden="true" />
              </span>
              <span className="sidebar-workspace-copy">
                <strong>OpenFit</strong>
                <small>Health dashboard</small>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Wellbeing</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu aria-label="Main navigation">
              {wellbeingItems.map(({ id, label, icon: Icon, category }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    data-category={category}
                    isActive={page === id}
                    tooltip={label}
                    aria-current={page === id ? 'page' : undefined}
                    onClick={() => selectPage(id)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dataItem && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    data-category={dataItem.category}
                    isActive={page === dataItem.id}
                    tooltip={dataItem.label}
                    aria-current={page === dataItem.id ? 'page' : undefined}
                    onClick={() => selectPage(dataItem.id)}
                  >
                    <dataItem.icon aria-hidden="true" />
                    <span>{dataItem.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Settings" onClick={openSettings}>
                  <SettingsIcon />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="sidebar-user" tooltip={userName} onClick={openSettings}>
              <Avatar className="sidebar-user-avatar">
                {userAvatar && <AvatarImage src={userAvatar} alt="" />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="sidebar-user-copy">
                <strong>{userName}</strong>
                <small>{sourceLabel}</small>
              </span>
              <ChevronsUpDown className="sidebar-switcher-icon" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function SettingsDialog({
  open,
  status,
  connecting,
  onOpenChange,
  onSave,
  onConnect,
  onExport,
  onDisconnect,
}: {
  open: boolean
  status: FitbitAuthStatus
  connecting: boolean
  onOpenChange: (open: boolean) => void
  onSave: (config: FitbitConfigInput) => Promise<void>
  onConnect: () => Promise<void>
  onExport: () => Promise<void>
  onDisconnect: () => Promise<void>
}) {
  const [clientId, setClientId] = useState(status.clientId)
  const [clientSecret, setClientSecret] = useState('')
  const [redirectUri, setRedirectUri] = useState(status.redirectUri)
  const [provider, setProvider] = useState<HealthProvider>(status.provider)
  const [editing, setEditing] = useState(!status.configured)

  useEffect(() => {
    if (!open) return
    setClientId(status.clientId)
    setRedirectUri(status.redirectUri)
    setProvider(status.provider)
    setClientSecret('')
    setEditing(!status.configured)
  }, [open, status])

  useEffect(() => {
    if (!open) return
    if (!status.configured || status.provider !== provider) setRedirectUri(defaultRedirectForProvider(provider))
  }, [open, provider, status.configured, status.provider])

  const secretRequired = provider === 'google-health' || provider === 'whoop'
  const providerLabel = providerDisplayName(provider)
  const savedSecretMatchesProvider = status.hasClientSecret && status.provider === provider
  const canSave = status.storageEncrypted
    && clientId.trim().length > 2
    && (!secretRequired || clientSecret.trim().length > 4 || savedSecretMatchesProvider)
    && (provider === 'whoop' ? (redirectUri.startsWith('http://127.0.0.1:') || redirectUri.startsWith('https://')) : redirectUri.startsWith('http://127.0.0.1:'))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    void onSave({
      provider,
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim() || undefined,
      redirectUri: redirectUri.trim(),
    })
  }

  const openDeveloperPortal = () => {
    const url = provider === 'google-health'
      ? 'https://console.cloud.google.com/apis/library/health.googleapis.com'
      : provider === 'whoop'
        ? 'https://developer.whoop.com/'
        : 'https://dev.fitbit.com/apps/new'
    if (window.fitbit) void window.fitbit.openExternal(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog" showCloseButton>
        <DialogHeader>
          <div className="dialog-icon"><CloudIcon /></div>
          <DialogTitle>{status.connected && !editing ? `${providerLabel} connected` : `Connect ${providerLabel}`}</DialogTitle>
          <DialogDescription>Your credentials and data remain encrypted on this computer.</DialogDescription>
        </DialogHeader>

        {status.connected && !editing ? (
          <div className="connected-state">
            <div className="connection-check"><CheckIcon /></div>
            <div><h3>Sync active</h3><p>Last updated {relativeTime(status.lastSyncAt)}.</p></div>
            <div className="connected-actions">
              <Button onClick={onConnect} disabled={connecting}>{connecting ? <LoaderCircle className="spin" /> : <RefreshCw />} Reauthorize</Button>
              <Button variant="outline" onClick={() => setEditing(true)}><SettingsIcon /> Edit configuration</Button>
              <Button variant="outline" onClick={() => void onExport()}><ExportIcon /> Export data</Button>
              <Button variant="destructive" onClick={() => void onDisconnect()}><DisconnectIcon /> Disconnect and delete local data</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="settings-form">
            <div className="provider-picker" role="radiogroup" aria-label="Health provider">
              <label className={cn(provider === 'google-health' && 'active')}>
                <input className="sr-only" type="radio" name="health-provider" value="google-health" checked={provider === 'google-health'} onChange={() => setProvider('google-health')} />
                <CloudIcon /><span><strong>Google Health</strong><small>API v4 · recommended</small></span>{provider === 'google-health' && <CheckIcon />}
              </label>
              <label className={cn(provider === 'fitbit-legacy' && 'active')}>
                <input className="sr-only" type="radio" name="health-provider" value="fitbit-legacy" checked={provider === 'fitbit-legacy'} onChange={() => setProvider('fitbit-legacy')} />
                <DeviceIcon /><span><strong>Fitbit legacy</strong><small>Temporary compatibility</small></span>{provider === 'fitbit-legacy' && <CheckIcon />}
              </label>
              <label className={cn(provider === 'whoop' && 'active')}>
                <input className="sr-only" type="radio" name="health-provider" value="whoop" checked={provider === 'whoop'} onChange={() => setProvider('whoop')} />
                <ActivityIcon /><span><strong>WHOOP</strong><small>Recovery, strain, sleep</small></span>{provider === 'whoop' && <CheckIcon />}
              </label>
            </div>

            <div className="form-field">
              <Label htmlFor="client-id">OAuth Client ID</Label>
              <Input id="client-id" value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" />
            </div>
            {secretRequired && (
              <div className="form-field">
                <Label htmlFor="client-secret">Client Secret {savedSecretMatchesProvider && <span>· leave blank to keep the current one</span>}</Label>
                <Input id="client-secret" type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={savedSecretMatchesProvider ? '••••••••••••' : ''} autoComplete="new-password" />
              </div>
            )}
            <div className="form-field">
              <Label htmlFor="callback-url">Callback URL</Label>
              <Input id="callback-url" value={redirectUri} onChange={(event) => setRedirectUri(event.target.value)} spellCheck={false} />
              <p>{provider === 'whoop' ? 'Register http://127.0.0.1:42813/oauth/callback exactly in the WHOOP Developer Dashboard. During connection, OpenFit listens on this local address for the OAuth callback.' : 'It must exactly match the loopback URL configured in the provider console.'}</p>
            </div>

            <button type="button" className="portal-link" onClick={openDeveloperPortal}>Open developer console <ExternalIcon /></button>
            <div className="scope-note"><ShieldIcon /><p>Read-only permissions for activity, heart, sleep, and authorized measurements.</p></div>

            <DialogFooter className="settings-footer">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={!canSave || connecting}>{connecting ? <LoaderIcon className="spin" /> : <CloudIcon />} Save and connect</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
