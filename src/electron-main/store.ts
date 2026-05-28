import Store from 'electron-store'

export interface NetworkPrinter {
  id: string
  label: string
  ip: string
  port: number
  paperType: string
}

export interface BirConfig {
  businessName: string
  address: string
  tin: string
  vatRegistered: boolean
  vatRate: number
  invoiceTitle: string
  ptuNo: string
  min: string
  serialNo: string
  accreditation: string
  softwareProvider: string
  softwareTin: string
  footerNote: string
}

export const DEFAULT_BIR: BirConfig = {
  businessName: '',
  address: '',
  tin: '',
  vatRegistered: true,
  vatRate: 12,
  invoiceTitle: 'SALES INVOICE',
  ptuNo: '',
  min: '',
  serialNo: '',
  accreditation: '',
  softwareProvider: 'Zolvix POS',
  softwareTin: '',
  footerNote: 'Thank you, come again!',
}

interface StoreSchema {
  serverUrl: string
  setupComplete: boolean
  terminalId: string
  theme: 'light' | 'dark'
  thermalSource: string  // "driver:PrinterName" | "usb:0x04b8:0x0202" | ""
  thermalPaperType: string
  networkPrinters: NetworkPrinter[]
  birConfig: BirConfig
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
    birConfig: DEFAULT_BIR,
  },
})
