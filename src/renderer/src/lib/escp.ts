import { useAppStore } from '@/stores/appStore'

export async function printLx310(invoice: unknown, mode: 'preprinted' | 'plain'): Promise<void> {
  const { terminalConfig } = useAppStore.getState()
  await window.electron.print.lx310({
    data: invoice,
    mode,
    printerName: terminalConfig?.lx310PrinterName ?? '',
    offsets: { row: terminalConfig?.formRowOffset ?? 3, col: terminalConfig?.formColOffset ?? 5 },
    paper: { width: terminalConfig?.paperWidth ?? 8.5, height: terminalConfig?.paperHeight ?? 11 },
  })
}
