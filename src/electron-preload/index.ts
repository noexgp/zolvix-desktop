import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
  },
  print: {
    lx310: (payload: { data: unknown; mode: 'preprinted' | 'plain' }) =>
      ipcRenderer.invoke('print:lx310', payload),
    getPrinters: () => ipcRenderer.invoke('print:getPrinters'),
  },
})
