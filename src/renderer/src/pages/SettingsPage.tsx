import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/stores/appStore'
import { apiFetch } from '@/lib/api'

export default function SettingsPage() {
  const { serverUrl, setServerUrl, terminalId, terminalConfig, setTerminalConfig } = useAppStore()
  const [url, setUrl] = useState(serverUrl)
  const [printerName, setPrinterName] = useState('')
  const [printers, setPrinters] = useState<string[]>([])
  const [rowOffset, setRowOffset] = useState(3)
  const [colOffset, setColOffset] = useState(5)
  const [paperWidth, setPaperWidth] = useState(8.5)
  const [paperHeight, setPaperHeight] = useState(11)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const list = await window.electron.print.getPrinters()
        setPrinters(list)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load printers')
      }
    }
    load()
    if (terminalConfig) {
      setPrinterName(terminalConfig.lx310PrinterName ?? '')
      setRowOffset(terminalConfig.formRowOffset)
      setColOffset(terminalConfig.formColOffset)
      setPaperWidth(terminalConfig.paperWidth)
      setPaperHeight(terminalConfig.paperHeight)
    }
  }, [terminalConfig])

  async function handleSave() {
    setSaveError('')
    try {
      const trimmed = url.trim().replace(/\/$/, '')
      await window.electron.store.set('serverUrl', trimmed)
      setServerUrl(trimmed)

      if (terminalId) {
        const res = await apiFetch(`/api/terminals/${terminalId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lx310PrinterName: printerName || null,
            formRowOffset: rowOffset,
            formColOffset: colOffset,
            paperWidth,
            paperHeight,
          }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error((d as { error?: string }).error ?? 'Failed to save terminal config')
        }
        const d = await res.json()
        const t = d.terminal
        setTerminalConfig({
          id: t.id, name: t.name,
          lx310PrinterName: t.lx310PrinterName ?? null,
          formRowOffset: t.formRowOffset,
          formColOffset: t.formColOffset,
          paperWidth: t.paperWidth,
          paperHeight: t.paperHeight,
        })
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings')
    }
  }

  return (
    <div className="p-8 max-w-lg space-y-8">
      <h1 className="text-foreground font-bold text-xl">Settings</h1>

      {loadError && <div className="bg-destructive/20 text-destructive text-xs p-2 rounded">{loadError}</div>}

      <div className="space-y-4">
        <h2 className="text-foreground font-semibold text-sm border-b border-border pb-1">Server</h2>
        <div className="space-y-1">
          <Label htmlFor="server-url" className="text-muted-foreground text-xs">Server URL</Label>
          <Input
            id="server-url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://your-server.com"
            className="text-foreground"
          />
        </div>
      </div>

      {terminalId && (
        <div className="space-y-4">
          <h2 className="text-foreground font-semibold text-sm border-b border-border pb-1">
            LX-310 Printer
            {terminalConfig && <span className="ml-2 text-muted-foreground font-normal">({terminalConfig.name})</span>}
          </h2>
          <div className="space-y-1">
            <Label htmlFor="printer-select" className="text-muted-foreground text-xs">Printer Name</Label>
            <select
              id="printer-select"
              value={printerName}
              onChange={e => setPrinterName(e.target.value)}
              className="w-full bg-card border border-border text-foreground text-sm rounded p-2"
            >
              <option value="">Select printer...</option>
              {printers.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="row-offset" className="text-muted-foreground text-xs">Pre-printed Form Row Offset</Label>
              <Input id="row-offset" type="number" value={rowOffset}
                onChange={e => setRowOffset(Number(e.target.value) || 0)}
                className="text-foreground" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="col-offset" className="text-muted-foreground text-xs">Column Offset</Label>
              <Input id="col-offset" type="number" value={colOffset}
                onChange={e => setColOffset(Number(e.target.value) || 0)}
                className="text-foreground" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Paper Size (inches)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="paper-width" className="text-muted-foreground text-[10px]">Width</Label>
                <Input id="paper-width" type="number" step="0.25" value={paperWidth}
                  onChange={e => setPaperWidth(parseFloat(e.target.value) || 8.5)}
                  className="text-foreground" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="paper-height" className="text-muted-foreground text-[10px]">Height</Label>
                <Input id="paper-height" type="number" step="0.25" value={paperHeight}
                  onChange={e => setPaperHeight(parseFloat(e.target.value) || 11)}
                  className="text-foreground" />
              </div>
            </div>
          </div>
        </div>
      )}

      {saveError && <div className="bg-destructive/20 text-destructive text-xs p-2 rounded">{saveError}</div>}

      <Button onClick={handleSave} className="w-full">
        {saved ? '✓ Saved' : 'Save Settings'}
      </Button>
    </div>
  )
}
