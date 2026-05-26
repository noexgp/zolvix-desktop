import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/stores/appStore'

export default function SettingsPage() {
  const { serverUrl, setServerUrl } = useAppStore()
  const [url, setUrl] = useState(serverUrl)
  const [printerName, setPrinterName] = useState('')
  const [printers, setPrinters] = useState<string[]>([])
  const [rowOffset, setRowOffset] = useState(3)
  const [colOffset, setColOffset] = useState(5)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const pn = await window.electron.store.get('lx310PrinterName') as string | undefined
        const off = await window.electron.store.get('formOffsets') as { row: number; col: number } | undefined
        if (pn) setPrinterName(pn)
        if (off) { setRowOffset(off.row); setColOffset(off.col) }
        const list = await window.electron.print.getPrinters()
        setPrinters(list)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load settings')
      }
    }
    load()
  }, [])

  async function handleSave() {
    setSaveError('')
    try {
      const trimmed = url.trim().replace(/\/$/, '')
      await window.electron.store.set('serverUrl', trimmed)
      await window.electron.store.set('lx310PrinterName', printerName)
      await window.electron.store.set('formOffsets', { row: rowOffset, col: colOffset })
      setServerUrl(trimmed)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings')
    }
  }

  return (
    <div className="p-8 max-w-lg space-y-8">
      <h1 className="text-white font-bold text-xl">Settings</h1>

      {loadError && <div className="bg-red-900/30 text-red-400 text-xs p-2 rounded">{loadError}</div>}

      <div className="space-y-4">
        <h2 className="text-slate-300 font-semibold text-sm border-b border-slate-700 pb-1">Server</h2>
        <div className="space-y-1">
          <Label htmlFor="server-url" className="text-slate-400 text-xs">Server URL</Label>
          <Input
            id="server-url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://your-server.com"
            className="bg-slate-800 border-slate-700 text-white"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-slate-300 font-semibold text-sm border-b border-slate-700 pb-1">LX-310 Printer</h2>
        <div className="space-y-1">
          <Label htmlFor="printer-select" className="text-slate-400 text-xs">Printer Name</Label>
          <select
            id="printer-select"
            value={printerName}
            onChange={e => setPrinterName(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded p-2"
          >
            <option value="">Select printer...</option>
            {printers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="row-offset" className="text-slate-400 text-xs">Pre-printed Form Row Offset</Label>
            <Input
              id="row-offset"
              type="number"
              value={rowOffset}
              onChange={e => setRowOffset(Number(e.target.value) || 0)}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="col-offset" className="text-slate-400 text-xs">Column Offset</Label>
            <Input
              id="col-offset"
              type="number"
              value={colOffset}
              onChange={e => setColOffset(Number(e.target.value) || 0)}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>
        </div>
      </div>

      {saveError && <div className="bg-red-900/30 text-red-400 text-xs p-2 rounded">{saveError}</div>}

      <Button onClick={handleSave} className="w-full">
        {saved ? '✓ Saved' : 'Save Settings'}
      </Button>
    </div>
  )
}
