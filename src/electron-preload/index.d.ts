// Bridge type declaration — keep in sync with src/renderer/src/electron.d.ts
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
