// src/renderer/src/lib/escp.ts
export async function printLx310(invoice: unknown, mode: 'preprinted' | 'plain'): Promise<void> {
  await window.electron.print.lx310({ data: invoice, mode })
}
