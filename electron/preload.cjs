'use strict'

const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('fitbit', Object.freeze({
  getStatus: () => ipcRenderer.invoke('fitbit:get-status'),
  saveConfig: (config) => ipcRenderer.invoke('fitbit:save-config', config),
  connect: () => ipcRenderer.invoke('fitbit:connect'),
  disconnect: () => ipcRenderer.invoke('fitbit:disconnect'),
  sync: (date) => ipcRenderer.invoke('fitbit:sync', date),
  getCachedData: () => ipcRenderer.invoke('fitbit:get-cached-data'),
  getCachedArchive: () => ipcRenderer.invoke('fitbit:get-cached-archive'),
  exportData: () => ipcRenderer.invoke('fitbit:export-data'),
  openExternal: (url) => ipcRenderer.invoke('fitbit:open-external', url),
  onAuthComplete: (callback) => subscribe('fitbit:auth-complete', callback),
  onSyncProgress: (callback) => subscribe('fitbit:sync-progress', callback),
}))

contextBridge.exposeInMainWorld('healthAssistant', Object.freeze({
  getStatus: () => ipcRenderer.invoke('assistant:get-status'),
  setProvider: (provider) => ipcRenderer.invoke('assistant:set-provider', provider),
  startTurn: (input) => ipcRenderer.invoke('assistant:start-turn', input),
  cancel: (requestId) => ipcRenderer.invoke('assistant:cancel', requestId),
  reset: () => ipcRenderer.invoke('assistant:reset'),
  onEvent: (callback) => subscribe('assistant:event', callback),
}))
