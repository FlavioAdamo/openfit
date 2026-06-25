'use strict'

const { app, BrowserWindow, ipcMain, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.setName('pulseboard-fitbit-desktop')
app.disableHardwareAcceleration()

function readSecure(file) {
  const envelope = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (envelope.encrypted !== true || !safeStorage.isEncryptionAvailable()) {
    throw new Error('Archivio sicuro non disponibile.')
  }
  return JSON.parse(safeStorage.decryptString(Buffer.from(envelope.data, 'base64')))
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function clickVisibleButton(window, label) {
  await window.webContents.executeJavaScript(`
    (() => {
      const targetLabel = ${JSON.stringify(label)}
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim()
      const isVisible = (element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
      }
      const button = [...document.querySelectorAll('button')]
        .find((candidate) => normalize(candidate.textContent) === targetLabel && isVisible(candidate))
      if (!button) throw new Error(\`Capture target button not found: \${targetLabel}\`)
      button.click()
    })()
  `)
}

async function waitForActivePage(window, label) {
  await window.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const targetLabel = ${JSON.stringify(label)}
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim()
      const deadline = Date.now() + 2000
      const check = () => {
        const active = [...document.querySelectorAll('button[aria-current="page"]')]
          .find((button) => normalize(button.textContent) === targetLabel)
        if (active) {
          resolve(true)
          return
        }
        if (Date.now() > deadline) {
          reject(new Error(\`Navigation did not activate page: \${targetLabel}\`))
          return
        }
        window.setTimeout(check, 50)
      }
      check()
    })
  `)
}

app.whenReady().then(async () => {
  try {
    const userData = path.join(app.getPath('appData'), 'pulseboard-fitbit-desktop')
    const cache = readSecure(path.join(userData, 'health-cache.secure.json'))
    const credentials = readSecure(path.join(userData, 'credentials.secure.json'))
    const outputDirectory = path.join(__dirname, '..', 'screenshots')
    fs.mkdirSync(outputDirectory, { recursive: true })

    ipcMain.handle('fitbit:get-status', () => ({
      isElectron: true,
      configured: true,
      connected: true,
      clientId: '',
      redirectUri: credentials.config?.redirectUri || '',
      hasClientSecret: true,
      storageEncrypted: true,
      lastSyncAt: credentials.lastSyncAt || cache.generatedAt || null,
      provider: 'google-health',
    }))
    ipcMain.handle('fitbit:get-cached-data', () => cache)

    const window = new BrowserWindow({
      width: 1440,
      height: 930,
      show: false,
      backgroundColor: '#080c11',
      webPreferences: {
        preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
      },
    })

    await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    await wait(1000)
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Page.enable')

    async function capture(name) {
      await wait(250)
      const contentSize = await window.webContents.executeJavaScript(`({
        width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      })`)
      const result = await window.webContents.debugger.sendCommand('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: Math.ceil(contentSize.width),
          height: Math.ceil(contentSize.height),
          scale: 1,
        },
      })
      const output = path.join(outputDirectory, `${name}.png`)
      fs.writeFileSync(output, Buffer.from(result.data, 'base64'))
      console.log(output)
    }

    async function navigate(label) {
      await clickVisibleButton(window, label)
      await waitForActivePage(window, label)
      await wait(350)
    }

    await navigate('Activity')
    await capture('reale-attivita-desktop')
    await navigate('Health')
    await capture('reale-salute-desktop')
    await navigate('Sleep')
    await capture('reale-sonno-desktop')

    window.setSize(430, 850)
    await wait(350)
    await capture('reale-sonno-mobile')

    window.webContents.debugger.detach()
    window.destroy()
    app.quit()
  } catch (error) {
    console.error(error.stack || error.message)
    app.exit(1)
  }
})
