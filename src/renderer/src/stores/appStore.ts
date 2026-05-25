import { create } from 'zustand'
import type { CurrentUser } from '@/lib/auth'

export interface BusinessSettings {
  bypassApproval: boolean
  name: string
}

interface AppStore {
  serverUrl: string
  setupComplete: boolean
  currentUser: CurrentUser | null
  businessSettings: BusinessSettings | null
  setServerUrl: (url: string) => void
  setSetupComplete: (v: boolean) => void
  setCurrentUser: (u: CurrentUser | null) => void
  setBusinessSettings: (s: BusinessSettings) => void
}

export const useAppStore = create<AppStore>((set) => ({
  serverUrl: '',
  setupComplete: false,
  currentUser: null,
  businessSettings: null,
  setServerUrl: (serverUrl) => set({ serverUrl }),
  setSetupComplete: (setupComplete) => set({ setupComplete }),
  setCurrentUser: (currentUser) => set({ currentUser }),
  setBusinessSettings: (businessSettings) => set({ businessSettings }),
}))
