'use strict'

const { app, BrowserWindow, dialog, ipcMain, nativeTheme, safeStorage, session, shell } = require('electron')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { fileURLToPath } = require('node:url')

const googleHealth = require('./google-health-service.cjs')
const fitbitLegacy = require('./fitbit-legacy-service.cjs')
const whoop = require('./whoop-service.cjs')
const healthCache = require('./health-cache.cjs')
const { createCodexService, resolveCodexBinary } = require('./codex-service.cjs')

app.commandLine.appendSwitch('lang', 'en-US')

const APP_ICON_PATH = path.join(__dirname, '..', 'build', 'icon.png')
const APP_DISPLAY_NAME = 'OpenFit'
const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:42813/oauth/callback'
const DEFAULT_WHOOP_REDIRECT_URI = DEFAULT_REDIRECT_URI
// safeStorage keys are tied to the historical app name, so initialize Electron
// with the legacy identity before the secure storage backend is created.
const LEGACY_USER_DATA_NAME = 'pulseboard-fitbit-desktop'
app.setName(LEGACY_USER_DATA_NAME)
const singleInstanceLock = app.requestSingleInstanceLock()
if (!singleInstanceLock) app.quit()
const PROVIDERS = {
  'google-health': googleHealth,
  'fitbit-legacy': fitbitLegacy,
  whoop,
}

let mainWindow = null
let oauthServer = null
let oauthTimeout = null
let pendingOAuthFlow = null
let credentialFile = null
let cacheFile = null
let syncInFlight = null
let codexService = null
let assistantRequestId = null

function atomicWrite(file, content) {
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, content, { mode: 0o600 })
  fs.renameSync(temporary, file)
}

function storageEncryptionAvailable() {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform !== 'linux') return true
  try {
    return safeStorage.getSelectedStorageBackend() !== 'basic_text'
  } catch {
    return false
  }
}

function writeSecure(file, value) {
  if (!storageEncryptionAvailable()) {
    throw new Error('The operating system secure storage is unavailable. Enable it before saving credentials or health data.')
  }
  const serialized = JSON.stringify(value)
  atomicWrite(file, JSON.stringify({ version: 1, encrypted: true, data: safeStorage.encryptString(serialized).toString('base64') }))
}

function readSecure(file, fallback = null) {
  try {
    const envelope = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (envelope.encrypted !== true || !storageEncryptionAvailable()) {
      if (envelope.encrypted !== true) deleteIfPresent(file)
      return fallback
    }
    const decoded = safeStorage.decryptString(Buffer.from(envelope.data, 'base64'))
    return JSON.parse(decoded)
  } catch {
    return fallback
  }
}

function deleteIfPresent(file) {
  try { fs.rmSync(file, { force: true }) } catch { /* best effort */ }
}

function getCredentials() {
  return readSecure(credentialFile, {
    config: {
      provider: 'google-health',
      clientId: '',
      clientSecret: '',
      redirectUri: DEFAULT_REDIRECT_URI,
    },
    token: null,
    lastSyncAt: null,
  })
}

function saveCredentials(credentials) {
  writeSecure(credentialFile, credentials)
}

function publicStatus() {
  const credentials = getCredentials()
  const config = credentials.config || {}
  const provider = PROVIDERS[config.provider] ? config.provider : 'google-health'
  const needsSecret = provider === 'google-health' || provider === 'whoop'
  return {
    isElectron: true,
    configured: Boolean(config.clientId && config.redirectUri && (!needsSecret || config.clientSecret)),
    connected: Boolean(credentials.token?.access_token || credentials.token?.refresh_token),
    clientId: config.clientId || '',
    redirectUri: config.redirectUri || (provider === 'whoop' ? DEFAULT_WHOOP_REDIRECT_URI : DEFAULT_REDIRECT_URI),
    hasClientSecret: Boolean(config.clientSecret),
    storageEncrypted: storageEncryptionAvailable(),
    lastSyncAt: credentials.lastSyncAt || null,
    provider,
  }
}

function providerFor(credentials) {
  const provider = credentials.config?.provider || 'google-health'
  const service = PROVIDERS[provider]
  if (!service) throw new Error(`Unsupported health provider: ${provider}`)
  return service
}

function validateConfig(input, previous) {
  const provider = PROVIDERS[input.provider] ? input.provider : 'google-health'
  const clientId = String(input.clientId || '').trim()
  const redirectUri = String(input.redirectUri || (provider === 'whoop' ? DEFAULT_WHOOP_REDIRECT_URI : DEFAULT_REDIRECT_URI)).trim()
  const sameProvider = previous?.provider === provider
  const clientSecret = String(input.clientSecret || (sameProvider ? previous?.clientSecret : '') || '').trim()
  if (!clientId) throw new Error('Enter the OAuth Client ID.')
  if ((provider === 'google-health' || provider === 'whoop') && !clientSecret) throw new Error(`${provider === 'whoop' ? 'WHOOP' : 'Google Health'} requires the OAuth Client Secret.`)
  let parsed
  try { parsed = new URL(redirectUri) } catch { throw new Error('The callback URL is invalid.') }
  if (provider === 'whoop') {
    const isLoopback = parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' && Boolean(parsed.port)
    const isHttps = parsed.protocol === 'https:'
    if (!(isLoopback || isHttps) || parsed.username || parsed.password || parsed.hash) {
      throw new Error('For WHOOP, use the loopback callback http://127.0.0.1:42813/oauth/callback or an HTTPS callback handled by your backend.')
    }
  } else if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port || parsed.username || parsed.password || parsed.hash) {
    throw new Error('For the desktop app, use an http://127.0.0.1 loopback callback with a fixed port.')
  }
  return { provider, clientId, clientSecret, redirectUri }
}

function closeOAuthServer() {
  if (oauthTimeout) clearTimeout(oauthTimeout)
  oauthTimeout = null
  pendingOAuthFlow = null
  if (oauthServer) {
    try { oauthServer.close() } catch { /* server already stopped */ }
  }
  oauthServer = null
}

function oauthPage(success, message) {
  const color = success ? '#5ae4c0' : '#ff7b74'
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>OpenFit</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;color:#edf4f5;background:#080c11;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.card{width:min(420px,calc(100vw - 40px));padding:34px;border:1px solid #ffffff12;border-radius:20px;background:#111820;text-align:center;box-shadow:0 25px 80px #0008}.orb{display:grid;width:58px;height:58px;place-items:center;margin:0 auto 18px;border-radius:50%;color:${color};background:${color}16;font-size:25px}h1{margin:0 0 10px;font-size:22px}p{margin:0;color:#83909b;font-size:13px;line-height:1.55}</style></head><body><main class="card"><div class="orb">${success ? '✓' : '!'}</div><h1>${success ? 'Account connected' : 'Connection failed'}</h1><p>${escapeHtml(message)}<br>You can close this tab and return to OpenFit.</p></main></body></html>`
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}

async function startOAuthFlow() {
  if (oauthServer || pendingOAuthFlow) throw new Error('A connection process is already in progress.')
  const credentials = getCredentials()
  const status = publicStatus()
  if (!status.configured) throw new Error('Complete the OAuth configuration first.')
  const service = providerFor(credentials)
  const redirect = new URL(credentials.config.redirectUri)
  const state = crypto.randomBytes(4).toString('hex')
  const pkce = service.createPkce()
  pendingOAuthFlow = { credentials, service, state, pkce }

  if (redirect.protocol === 'http:') {
    await new Promise((resolve, reject) => {
      oauthServer = http.createServer(async (request, response) => {
        const incoming = new URL(request.url, credentials.config.redirectUri)
        if (incoming.pathname !== redirect.pathname) {
          response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          response.end('Not found')
          return
        }
        const result = await completeOAuthAuthorization(incoming)
        response.writeHead(result.ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' })
        response.end(oauthPage(result.ok, result.message))
      })
      oauthServer.once('error', (error) => {
        closeOAuthServer()
        reject(error.code === 'EADDRINUSE' ? new Error(`Port ${redirect.port} is already in use.`) : error)
      })
      oauthServer.listen(Number(redirect.port), '127.0.0.1', resolve)
    })
  }

  oauthTimeout = setTimeout(() => {
    mainWindow?.webContents.send('fitbit:auth-complete', { ok: false, error: 'The OAuth session expired.' })
    closeOAuthServer()
  }, 5 * 60_000)

  try {
    await shell.openExternal(service.createAuthorizationUrl(credentials.config, state, pkce))
  } catch (error) {
    closeOAuthServer()
    throw error
  }
  return { ok: true }
}

async function completeOAuthAuthorization(incoming) {
  const active = pendingOAuthFlow
  if (!active) return { ok: false, message: 'No OAuth session is active.' }
  const returnedState = incoming.searchParams.get('state')
  const code = incoming.searchParams.get('code')
  const oauthError = incoming.searchParams.get('error')
  if (returnedState !== active.state) {
    mainWindow?.webContents.send('fitbit:auth-complete', { ok: false, error: 'Invalid OAuth state.' })
    closeOAuthServer()
    return { ok: false, message: 'The request security check is invalid.' }
  }
  if (oauthError || !code) {
    const message = incoming.searchParams.get('error_description') || oauthError || 'Authorization canceled.'
    mainWindow?.webContents.send('fitbit:auth-complete', { ok: false, error: message })
    closeOAuthServer()
    return { ok: false, message }
  }
  try {
    const token = await active.service.exchangeAuthorizationCode(active.credentials.config, code, active.pkce.verifier)
    saveCredentials({ ...active.credentials, token, lastSyncAt: null })
    deleteIfPresent(cacheFile)
    const providerName = active.service.provider === 'google-health' ? 'Google Health' : active.service.provider === 'whoop' ? 'WHOOP' : 'Fitbit legacy'
    mainWindow?.webContents.send('fitbit:auth-complete', { ok: true })
    closeOAuthServer()
    return { ok: true, message: `${providerName} is ready.` }
  } catch (error) {
    const message = error.message || 'Authorization failed.'
    mainWindow?.webContents.send('fitbit:auth-complete', { ok: false, error: message })
    closeOAuthServer()
    return { ok: false, message }
  }
}

async function validAccessToken(credentials) {
  if (!credentials.token) throw new Error('Account not connected.')
  if (Number(credentials.token.expiresAt || 0) > Date.now() + 90_000 && credentials.token.access_token) {
    return credentials
  }
  const service = providerFor(credentials)
  const token = await service.refreshAccessToken(credentials.config, credentials.token)
  const updated = { ...credentials, token }
  saveCredentials(updated)
  return updated
}

async function syncData(date) {
  const today = localIsoDate()
  const archive = readSecure(cacheFile, null)
  if (date < today) {
    const cached = healthCache.cachedDay(archive, date)
    if (cached) return { ...cached, cacheHit: true }
  }

  let credentials = getCredentials()
  credentials = await validAccessToken(credentials)
  const service = providerFor(credentials)
  const payload = await service.syncData(credentials.token.access_token, date, (progress) => {
    mainWindow?.webContents.send('fitbit:sync-progress', { ...progress, date })
  })
  const total = Number(payload.requestStats?.total || 0)
  const succeeded = Number(payload.requestStats?.succeeded || 0)
  const successfulKeys = Array.isArray(payload.requestStats?.successfulKeys) ? payload.requestStats.successfulKeys : []
  const minimumUsefulResponses = service.provider === 'whoop' ? 1 : Math.max(3, Math.ceil(total * 0.2))
  const measurementKeys = service.provider === 'google-health'
    ? ['stepsDaily', 'caloriesDaily', 'distanceDaily', 'activeMinutesDaily', 'zoneMinutesDaily', 'weightDaily', 'waterDaily', 'nutritionDaily', 'heartIntradayRaw', 'restingHeartRaw', 'hrvRaw', 'spo2Raw', 'breathingRaw', 'skinTemperatureRaw', 'cardioRaw', 'sleepRaw', 'activitiesRaw', 'ecgRaw', 'irnAlertsRaw', 'glucoseRaw']
    : service.provider === 'whoop'
    ? ['cycles', 'recoveries', 'sleeps', 'workouts', 'body']
    : ['activity', 'stepsIntraday', 'stepsTrend', 'caloriesTrend', 'heartIntraday', 'heartTrend', 'sleep', 'sleepTrend', 'bodyWeight', 'bodyFat', 'food', 'water', 'breathing', 'hrv', 'spo2', 'skinTemperature', 'coreTemperature', 'cardio', 'ecg', 'irregularRhythmAlerts', 'bloodGlucose', 'activities']
  const hasMeasurementResponse = successfulKeys.some((key) => measurementKeys.includes(key))
  if (!total || succeeded < minimumUsefulResponses || !hasMeasurementResponse) {
    throw new Error('The sync did not return enough valid sources. The previous cache was preserved.')
  }
  writeSecure(cacheFile, healthCache.storeDay(archive, payload))
  credentials.lastSyncAt = payload.generatedAt
  saveCredentials(credentials)
  return payload
}

function developmentUrl() {
  if (app.isPackaged || !process.env.VITE_DEV_SERVER_URL) return null
  try {
    const parsed = new URL(process.env.VITE_DEV_SERVER_URL)
    if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.username || parsed.password) return null
    return parsed
  } catch {
    return null
  }
}

function isTrustedRendererUrl(value) {
  try {
    const parsed = new URL(value)
    const devUrl = developmentUrl()
    if (devUrl) return parsed.origin === devUrl.origin
    if (parsed.protocol !== 'file:') return false
    return path.resolve(fileURLToPath(parsed)) === path.resolve(__dirname, '..', 'dist', 'index.html')
  } catch {
    return false
  }
}

function assertTrustedSender(event) {
  const frame = event.senderFrame
  if (!mainWindow || event.sender !== mainWindow.webContents || !frame || frame !== event.sender.mainFrame || !isTrustedRendererUrl(frame.url)) {
    throw new Error('IPC request rejected: untrusted renderer origin.')
  }
}

function trustedHandle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event)
    return handler(...args)
  })
}

function sendAssistantEvent(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('assistant:event', event)
}

function assistantErrorMessage(error) {
  const message = error instanceof Error ? error.message : 'Codex is unavailable right now.'
  return String(message)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600) || 'Codex is unavailable right now.'
}

function validAssistantRequestId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value)
}

function validSyncDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day, 12))
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false
  return value <= localIsoDate()
}

function localIsoDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function createWindow() {
  nativeTheme.themeSource = 'dark'
  const devUrl = developmentUrl()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 930,
    minWidth: 960,
    minHeight: 680,
    icon: APP_ICON_PATH,
    show: false,
    backgroundColor: '#101112',
    title: 'OpenFit',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  })
  if (devUrl) {
    void mainWindow.loadURL(devUrl.toString())
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
  mainWindow.on('closed', () => { mainWindow = null })
}

function registerIpc() {
  trustedHandle('fitbit:get-status', () => publicStatus())
  trustedHandle('fitbit:get-cached-data', () => healthCache.latestDay(readSecure(cacheFile, null)))
  trustedHandle('fitbit:get-cached-archive', () => healthCache.normalizeArchive(readSecure(cacheFile, null)))
  trustedHandle('fitbit:save-config', (input) => {
    if (syncInFlight) throw new Error('Wait for the sync to finish before changing the configuration.')
    const credentials = getCredentials()
    const config = validateConfig(input || {}, credentials.config)
    const oauthIdentityChanged = ['provider', 'clientId', 'clientSecret', 'redirectUri']
      .some((key) => String(credentials.config?.[key] || '') !== String(config[key] || ''))
    saveCredentials({ ...credentials, config, token: oauthIdentityChanged ? null : credentials.token, lastSyncAt: oauthIdentityChanged ? null : credentials.lastSyncAt })
    if (oauthIdentityChanged) deleteIfPresent(cacheFile)
    return publicStatus()
  })
  trustedHandle('fitbit:connect', () => {
    if (syncInFlight) throw new Error('Wait for the sync to finish before reconnecting the account.')
    return startOAuthFlow()
  })
  trustedHandle('fitbit:disconnect', async () => {
    if (syncInFlight) throw new Error('Wait for the sync to finish before disconnecting the account.')
    const credentials = getCredentials()
    try {
      await providerFor(credentials).revokeToken(credentials.token, credentials.config)
    } catch (error) {
      console.warn('Remote revocation failed; local credentials will still be deleted.', error)
    }
    try {
      saveCredentials({ ...credentials, token: null, lastSyncAt: null })
    } catch {
      deleteIfPresent(credentialFile)
    }
    deleteIfPresent(cacheFile)
    closeOAuthServer()
    return publicStatus()
  })
  trustedHandle('fitbit:sync', async (date) => {
    if (!validSyncDate(String(date))) throw new Error('Invalid sync date.')
    if (syncInFlight) throw new Error('A sync is already in progress.')
    syncInFlight = syncData(String(date))
    try {
      return await syncInFlight
    } finally {
      syncInFlight = null
    }
  })
  trustedHandle('fitbit:export-data', async () => {
    const cached = healthCache.normalizeArchive(readSecure(cacheFile, null))
    if (!Object.keys(cached.days).length) throw new Error('There is no real data to export yet.')
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export OpenFit archive',
      defaultPath: `openfit-archive-${cached.lastDate || 'health'}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    fs.writeFileSync(result.filePath, JSON.stringify(cached, null, 2), { mode: 0o600 })
    return { canceled: false, path: result.filePath }
  })
  trustedHandle('fitbit:open-external', (value) => {
    const url = new URL(String(value))
    if (url.protocol !== 'https:') throw new Error('Only HTTPS links are allowed.')
    return shell.openExternal(url.toString())
  })
  trustedHandle('assistant:get-status', () => {
    const status = codexService?.getStatus() || {}
    const available = status.available ?? Boolean(resolveCodexBinary())
    const unauthorized = /unauthorized|not logged|sign in|authentication/i.test(String(status.lastError || ''))
    return {
      available,
      connected: Boolean(status.connected),
      authenticated: Boolean(available && !unauthorized),
      version: null,
      ...(status.lastError ? { error: status.lastError } : {}),
    }
  })
  trustedHandle('assistant:start-turn', (input) => {
    if (!codexService) throw new Error('The Codex bridge is not ready.')
    if (!input || !validAssistantRequestId(input.requestId)) throw new Error('Invalid assistant request.')
    const requestId = input.requestId
    if (assistantRequestId && assistantRequestId !== requestId) throw new Error('Wait for the current assistant response to finish.')
    const message = String(input.message || '').trim()
    const healthContext = String(input.healthContext || '').trim()
    if (!message || message.length > 20_000) throw new Error('The assistant message is empty or too long.')
    if (!healthContext || healthContext.length > 500_000) throw new Error('The health context is empty or too large.')

    assistantRequestId = requestId
    void codexService.startTurn({
      text: message,
      healthContext,
      onDelta: (delta) => {
        if (assistantRequestId === requestId) sendAssistantEvent({ requestId, type: 'delta', delta })
      },
    }).then((result) => {
      if (assistantRequestId !== requestId) return
      assistantRequestId = null
      sendAssistantEvent({ requestId, type: 'complete', text: result.text })
    }).catch((error) => {
      if (assistantRequestId !== requestId) return
      assistantRequestId = null
      if (error?.name === 'AbortError' || error?.code === 'CODEX_TURN_CANCELLED') {
        sendAssistantEvent({ requestId, type: 'cancelled' })
      } else {
        sendAssistantEvent({ requestId, type: 'error', message: assistantErrorMessage(error) })
      }
    })
    return { requestId }
  })
  trustedHandle('assistant:cancel', async (requestId) => {
    if (!validAssistantRequestId(requestId) || assistantRequestId !== requestId) return
    await codexService?.cancelTurn()
  })
  trustedHandle('assistant:reset', async () => {
    assistantRequestId = null
    await codexService?.reset()
  })
}

function registerProtocolClient() {
  try {
    if (process.defaultApp && process.argv[1]) {
      app.setAsDefaultProtocolClient('openfit', process.execPath, [path.resolve(process.argv[1])])
    } else {
      app.setAsDefaultProtocolClient('openfit')
    }
  } catch (error) {
    console.warn('Could not register openfit:// protocol handler.', error)
  }
}

function handleOpenFitUrl(value) {
  let parsed
  try { parsed = new URL(String(value)) } catch { return false }
  if (parsed.protocol !== 'openfit:' || parsed.hostname !== 'oauth' || parsed.pathname !== '/whoop') return false
  void completeOAuthAuthorization(parsed)
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
  return true
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleOpenFitUrl(url)
})

app.on('second-instance', (_event, argv) => {
  const callbackUrl = argv.find((value) => String(value).startsWith('openfit://'))
  if (callbackUrl) handleOpenFitUrl(callbackUrl)
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  app.setName(APP_DISPLAY_NAME)
  registerProtocolClient()
  if (process.platform === 'darwin') app.dock.setIcon(APP_ICON_PATH)
  const userData = process.env.OPENFIT_USER_DATA || path.join(app.getPath('appData'), LEGACY_USER_DATA_NAME)
  app.setPath('userData', userData)
  credentialFile = path.join(userData, 'credentials.secure.json')
  cacheFile = path.join(userData, 'health-cache.secure.json')
  codexService = createCodexService({ cwd: userData, clientVersion: app.getVersion() })
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  if (!developmentUrl()) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://health.googleapis.com https://api.fitbit.com https://api.prod.whoop.com"],
        },
      })
    })
  }
  registerIpc()
  createWindow()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('window-all-closed', () => {
  closeOAuthServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeOAuthServer()
  void codexService?.dispose()
})
