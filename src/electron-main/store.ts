import Store from 'electron-store'

interface StoreSchema {
  serverUrl: string
  setupComplete: boolean
  terminalId: string
}

export const store = new Store<StoreSchema>({
  defaults: {
    serverUrl: '',
    setupComplete: false,
    terminalId: '',
  },
})
