import Store from 'electron-store'

export interface NetworkPrinter {
  id: string
  label: string
  ip: string
  port: number
  paperType: string
}

interface StoreSchema {
  serverUrl: string
  setupComplete: boolean
  terminalId: string
  theme: 'light' | 'dark'
  thermalSource: string  // "driver:PrinterName" | "usb:0x04b8:0x0202" | ""
  thermalPaperType: string
  networkPrinters: NetworkPrinter[]
}

export const store = new Store<StoreSchema>({
  defaults: {
    serverUrl: '',
    setupComplete: false,
    terminalId: '',
    theme: 'dark',
    thermalSource: '',
    thermalPaperType: '80mm',
    networkPrinters: [],
  },
})
