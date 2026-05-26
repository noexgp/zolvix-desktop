import { create } from 'zustand'
import type { CurrentUser } from '@/lib/auth'

export interface BusinessSettings {
  bypassApproval: boolean
  name: string
}

export interface TerminalConfig {
  id: string
  name: string
  lx310PrinterName: string | null
  formRowOffset: number
  formColOffset: number
  paperWidth: number
  paperHeight: number
}

interface AppStore {
  serverUrl: string
  setupComplete: boolean
  terminalId: string
  currentUser: CurrentUser | null
  businessSettings: BusinessSettings | null
  terminalConfig: TerminalConfig | null
  setServerUrl: (url: string) => void
  setSetupComplete: (v: boolean) => void
  setTerminalId: (id: string) => void
  setCurrentUser: (u: CurrentUser | null) => void
  setBusinessSettings: (s: BusinessSettings) => void
  setTerminalConfig: (c: TerminalConfig | null) => void
}

export const useAppStore = create<AppStore>((set) => ({
  serverUrl: '',
  setupComplete: false,
  terminalId: '',
  currentUser: null,
  businessSettings: null,
  terminalConfig: null,
  setServerUrl: (serverUrl) => set({ serverUrl }),
  setSetupComplete: (setupComplete) => set({ setupComplete }),
  setTerminalId: (terminalId) => set({ terminalId }),
  setCurrentUser: (currentUser) => set({ currentUser }),
  setBusinessSettings: (businessSettings) => set({ businessSettings }),
  setTerminalConfig: (terminalConfig) => set({ terminalConfig }),
}))
