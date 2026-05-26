import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
  },
  api: {
    fetch: (payload: { url: string; method: string; headers: Record<string, string>; body?: string }) =>
      ipcRenderer.invoke('api:fetch', payload),
  },
  server: {
    checkHealth: (url: string) => ipcRenderer.invoke('server:checkHealth', url),
  },
  print: {
    lx310: (payload: { data: unknown; mode: 'preprinted' | 'plain'; printerName: string; offsets: { row: number; col: number }; paper: { width: number; height: number } }) =>
      ipcRenderer.invoke('print:lx310', payload),
    getPrinters: () => ipcRenderer.invoke('print:getPrinters'),
  },
})
