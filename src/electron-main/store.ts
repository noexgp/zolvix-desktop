import Store from 'electron-store'

interface StoreSchema {
  serverUrl: string
  lx310PrinterName: string
  formOffsets: { row: number; col: number }
  setupComplete: boolean
}

export const store = new Store<StoreSchema>({
  defaults: {
    serverUrl: '',
    lx310PrinterName: '',
    formOffsets: { row: 3, col: 5 },
    setupComplete: false,
  },
})
