'use strict'

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.disableHardwareAcceleration()

const pages = [
  ['Activity', 'activity'],
  ['Health', 'health'],
  ['Sleep', 'sleep'],
  ['Body', 'body'],
  ['Data', 'data'],
]

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

app.whenReady().then(async () => {
  const outputDirectory = path.join(__dirname, '..', '.artifacts')
  fs.mkdirSync(outputDirectory, { recursive: true })
  const window = new BrowserWindow({
    width: 1440,
    height: 930,
    show: false,
    backgroundColor: '#080c11',
    webPreferences: { sandbox: true, contextIsolation: true },
  })
  await window.loadURL(process.env.PULSEBOARD_CAPTURE_URL || 'http://127.0.0.1:5173/')
  await wait(1200)

  async function capture(name) {
    const image = await window.webContents.capturePage()
    const output = path.join(outputDirectory, `${name}.png`)
    fs.writeFileSync(output, image.toPNG())
    console.log(output)
  }

  async function clickVisibleButton(label) {
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

  async function openMobileNavigation() {
    await window.webContents.executeJavaScript(`
      (() => {
        const button = document.querySelector('button[aria-label="Toggle navigation"]')
        if (!button) throw new Error('Capture target button not found: Toggle navigation')
        button.click()
      })()
    `)
  }

  async function waitForActivePage(label) {
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

  async function navigate(label, name, { mobile = false } = {}) {
    if (mobile) {
      await openMobileNavigation()
      await wait(150)
    }
    await clickVisibleButton(label)
    await waitForActivePage(label)
    await wait(350)
    await capture(name)
  }

  await capture('dashboard')
  for (const [label, name] of pages) {
    await navigate(label, name)
  }
  await clickVisibleButton('Settings')
  await wait(180)
  await capture('settings')
  await window.webContents.executeJavaScript(`document.querySelector('[data-slot="dialog-close"]')?.click()`)
  window.setSize(430, 850)
  await window.loadURL(process.env.PULSEBOARD_CAPTURE_URL || 'http://127.0.0.1:5173/')
  await wait(600)
  await capture('mobile')
  for (const [label, name] of pages) {
    await navigate(label, `mobile-${name}`, { mobile: true })
  }
  window.destroy()
  app.quit()
})
