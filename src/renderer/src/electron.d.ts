// Bridge type declaration — keep in sync with src/electron-preload/index.d.ts
export {}
declare global {
  interface Window {
    electron: {
      store: {
        get(key: string): Promise<unknown>
        set(key: string, value: unknown): Promise<void>
      }
      print: {
        lx310(payload: { data: unknown; mode: 'preprinted' | 'plain' }): Promise<void>
        getPrinters(): Promise<string[]>
      }
    }
  }
}
