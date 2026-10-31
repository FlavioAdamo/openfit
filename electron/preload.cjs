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
  getHistory: () => ipcRenderer.invoke('fitbit:get-history'),
  backfillHistory: (input) => ipcRenderer.invoke('fitbit:backfill-history', input),
  cancelBackfill: () => ipcRenderer.invoke('fitbit:cancel-backfill'),
  exportData: () => ipcRenderer.invoke('fitbit:export-data'),
  openExternal: (url) => ipcRenderer.invoke('fitbit:open-external', url),
  onAuthComplete: (callback) => subscribe('fitbit:auth-complete', callback),
  onSyncProgress: (callback) => subscribe('fitbit:sync-progress', callback),
  onBackfillProgress: (callback) => subscribe('fitbit:backfill-progress', callback),
}))

contextBridge.exposeInMainWorld('healthAssistant', Object.freeze({
  getStatus: () => ipcRenderer.invoke('assistant:get-status'),
  startTurn: (input) => ipcRenderer.invoke('assistant:start-turn', input),
  cancel: (requestId) => ipcRenderer.invoke('assistant:cancel', requestId),
  reset: () => ipcRenderer.invoke('assistant:reset'),
  onEvent: (callback) => subscribe('assistant:event', callback),
}))
