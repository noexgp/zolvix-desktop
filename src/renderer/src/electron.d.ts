// Bridge type declaration — keep in sync with src/electron-preload/index.d.ts
export {}
declare global {
  interface Window {
    electron: {
      store: {
        get(key: string): Promise<unknown>
        set(key: string, value: unknown): Promise<void>
      }
      api: {
        fetch(payload: { url: string; method: string; headers: Record<string, string>; body?: string }): Promise<{ status: number; headers: Record<string, string | string[]>; body: string }>
      }
      server: {
        checkHealth(url: string): Promise<{ ok: boolean; status?: number; error?: string }>
      }
      print: {
        lx310(payload: { data: unknown; mode: 'preprinted' | 'plain'; printerName: string; offsets: { row: number; col: number }; paper: { width: number; height: number } }): Promise<void>
        thermal(payload: { data: unknown; source: string; paperType: string }): Promise<void>
        detectUsb(): Promise<Array<{ vid: number; pid: number; name: string; paper: string }>>
        network(payload: { data: unknown; ip: string; port: number; paperType: string }): Promise<void>
        getPrinters(): Promise<string[]>
      }
    }
  }
}
