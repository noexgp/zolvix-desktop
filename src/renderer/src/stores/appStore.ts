import { create } from 'zustand'
import type { CurrentUser } from '@/lib/auth'

export interface NetworkPrinter {
  id: string
  label: string
  ip: string
  port: number
  paperType: string
}

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
  theme: 'light' | 'dark'
  thermalSource: string  // "driver:PrinterName" | "usb:0x04b8:0x0202" | ""
  thermalPaperType: string
  networkPrinters: NetworkPrinter[]
  setServerUrl: (url: string) => void
  setSetupComplete: (v: boolean) => void
  setTerminalId: (id: string) => void
  setCurrentUser: (u: CurrentUser | null) => void
  setBusinessSettings: (s: BusinessSettings) => void
  setTerminalConfig: (c: TerminalConfig | null) => void
  setTheme: (t: 'light' | 'dark') => void
  setThermalSource: (s: string) => void
  setThermalPaperType: (t: string) => void
  setNetworkPrinters: (p: NetworkPrinter[]) => void
}

export const useAppStore = create<AppStore>((set) => ({
  serverUrl: '',
  setupComplete: false,
  terminalId: '',
  currentUser: null,
  businessSettings: null,
  terminalConfig: null,
  theme: 'dark',
  thermalSource: '',
  thermalPaperType: '80mm',
  networkPrinters: [],
  setServerUrl: (serverUrl) => set({ serverUrl }),
  setSetupComplete: (setupComplete) => set({ setupComplete }),
  setTerminalId: (terminalId) => set({ terminalId }),
  setCurrentUser: (currentUser) => set({ currentUser }),
  setBusinessSettings: (businessSettings) => set({ businessSettings }),
  setTerminalConfig: (terminalConfig) => set({ terminalConfig }),
  setTheme: (theme) => set({ theme }),
  setThermalSource: (thermalSource) => set({ thermalSource }),
  setThermalPaperType: (thermalPaperType) => set({ thermalPaperType }),
  setNetworkPrinters: (networkPrinters) => set({ networkPrinters }),
}))
