import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore, type NetworkPrinter } from '@/stores/appStore'
import { apiFetch } from '@/lib/api'

const PAPER_TYPES = [
  { value: '80mm', label: '80mm Thermal' },
  { value: '58mm', label: '58mm Thermal' },
  { value: '76mm', label: '76mm Dot Matrix' },
]

interface UsbDevice { vid: number; pid: number; name: string; paper: string }

interface BirConfig {
  businessName: string
  address: string
  tin: string
  vatRegistered: boolean
  vatRate: number
  invoiceTitle: string
  ptuNo: string
  min: string
  serialNo: string
  accreditation: string
  softwareProvider: string
  softwareTin: string
  footerNote: string
}

const DEFAULT_BIR: BirConfig = {
  businessName: '', address: '', tin: '', vatRegistered: true, vatRate: 12,
  invoiceTitle: 'SALES INVOICE', ptuNo: '', min: '', serialNo: '',
  accreditation: '', softwareProvider: 'Zolvix POS', softwareTin: '', footerNote: 'Thank you, come again!',
}

export default function SettingsPage() {
  const { serverUrl, setServerUrl, terminalId, terminalConfig, setTerminalConfig, thermalSource, thermalPaperType, setThermalSource, setThermalPaperType, networkPrinters, setNetworkPrinters } = useAppStore()
  const [url, setUrl] = useState(serverUrl)
  const [printerName, setPrinterName] = useState('')
  const [printers, setPrinters] = useState<string[]>([])
  const [rowOffset, setRowOffset] = useState(3)
  const [colOffset, setColOffset] = useState(5)
  const [paperWidth, setPaperWidth] = useState(8.5)
  const [paperHeight, setPaperHeight] = useState(11)
  const [thermalSelected, setThermalSelected] = useState(thermalSource)
  const [thermalPaper, setThermalPaper] = useState(thermalPaperType || '80mm')
  const [usbDevices, setUsbDevices] = useState<UsbDevice[]>([])
  const [netPrinters, setNetPrinters] = useState<NetworkPrinter[]>(networkPrinters)
  const [newNet, setNewNet] = useState({ label: '', ip: '', port: '9100', paperType: '80mm' })
  const [bir, setBir] = useState<BirConfig>(DEFAULT_BIR)
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
    setThermalSelected(thermalSource)
    setThermalPaper(thermalPaperType || '80mm')
    window.electron.print.detectUsb().then(setUsbDevices).catch(() => {})
    window.electron.store.get('birConfig')
      .then(v => { if (v) setBir({ ...DEFAULT_BIR, ...(v as Partial<BirConfig>) }) })
      .catch(() => {})
  }, [terminalConfig])

  async function handleSave() {
    setSaveError('')
    try {
      const trimmed = url.trim().replace(/\/$/, '')
      await window.electron.store.set('serverUrl', trimmed)
      setServerUrl(trimmed)

      await window.electron.store.set('thermalSource', thermalSelected)
      await window.electron.store.set('thermalPaperType', thermalPaper)
      await window.electron.store.set('networkPrinters', netPrinters)
      await window.electron.store.set('birConfig', bir)
      setThermalSource(thermalSelected)
      setThermalPaperType(thermalPaper)
      setNetworkPrinters(netPrinters)

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

      <div className="space-y-4">
        <h2 className="text-foreground font-semibold text-sm border-b border-border pb-1">POS / Receipt Printer</h2>

        <div className="space-y-1">
          <Label htmlFor="thermal-source" className="text-muted-foreground text-xs">Printer</Label>
          <select
            id="thermal-source"
            value={thermalSelected}
            onChange={e => {
              setThermalSelected(e.target.value)
              // Auto-fill paper type from USB device if detected
              const val = e.target.value
              if (val.startsWith('usb:')) {
                const [, vidStr, pidStr] = val.split(':')
                const match = usbDevices.find(d =>
                  `0x${d.vid.toString(16)}` === vidStr && `0x${d.pid.toString(16)}` === pidStr
                )
                if (match) setThermalPaper(match.paper)
              }
            }}
            className="w-full bg-card border border-border text-foreground text-sm rounded p-2"
          >
            <option value="">Select printer...</option>
            {usbDevices.length > 0 && (
              <optgroup label="USB Direct (no driver)">
                {usbDevices.map(d => {
                  const val = `usb:0x${d.vid.toString(16)}:0x${d.pid.toString(16)}`
                  return <option key={val} value={val}>{d.name} — USB Direct</option>
                })}
              </optgroup>
            )}
            {printers.length > 0 && (
              <optgroup label="Windows Driver">
                {printers.map(p => <option key={p} value={`driver:${p}`}>{p}</option>)}
              </optgroup>
            )}
          </select>
          {usbDevices.length === 0 && (
            <p className="text-muted-foreground text-[10px]">No USB printers detected — plug in printer then reopen Settings.</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="thermal-paper" className="text-muted-foreground text-xs">Paper Type</Label>
          <select
            id="thermal-paper"
            value={thermalPaper}
            onChange={e => setThermalPaper(e.target.value)}
            className="w-full bg-card border border-border text-foreground text-sm rounded p-2"
          >
            {PAPER_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-foreground font-semibold text-sm border-b border-border pb-1">Network Printers</h2>

        {netPrinters.length > 0 && (
          <div className="space-y-2">
            {netPrinters.map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-card border border-border rounded p-2">
                <div className="flex-1 min-w-0">
                  <div className="text-foreground text-xs font-medium">{p.label}</div>
                  <div className="text-muted-foreground text-[10px]">{p.ip}:{p.port} · {p.paperType}</div>
                </div>
                <button
                  onClick={() => setNetPrinters(prev => prev.filter(x => x.id !== p.id))}
                  className="text-destructive text-xs px-2 py-1 hover:bg-destructive/10 rounded"
                >Remove</button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 border border-border rounded p-3">
          <div className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">Add Printer</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-[10px]">Label</Label>
              <Input placeholder="e.g. Kitchen" value={newNet.label}
                onChange={e => setNewNet(p => ({ ...p, label: e.target.value }))}
                className="text-foreground text-xs h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-[10px]">IP Address</Label>
              <Input placeholder="192.168.1.101" value={newNet.ip}
                onChange={e => setNewNet(p => ({ ...p, ip: e.target.value }))}
                className="text-foreground text-xs h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-[10px]">Port</Label>
              <Input type="number" value={newNet.port}
                onChange={e => setNewNet(p => ({ ...p, port: e.target.value }))}
                className="text-foreground text-xs h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-[10px]">Paper Type</Label>
              <select value={newNet.paperType}
                onChange={e => setNewNet(p => ({ ...p, paperType: e.target.value }))}
                className="w-full bg-card border border-border text-foreground text-xs rounded p-1.5 h-8">
                {PAPER_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <Button size="sm" variant="outline" className="w-full text-xs mt-1"
            disabled={!newNet.label.trim() || !newNet.ip.trim()}
            onClick={() => {
              setNetPrinters(prev => [...prev, {
                id: Date.now().toString(),
                label: newNet.label.trim(),
                ip: newNet.ip.trim(),
                port: parseInt(newNet.port) || 9100,
                paperType: newNet.paperType,
              }])
              setNewNet({ label: '', ip: '', port: '9100', paperType: '80mm' })
            }}>
            + Add
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-foreground font-semibold text-sm border-b border-border pb-1">Business / BIR Receipt</h2>
        <p className="text-muted-foreground text-[10px] -mt-2">Printed on every POS receipt. Leave a field blank to omit its line.</p>

        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Registered Business Name</Label>
          <Input value={bir.businessName} onChange={e => setBir(b => ({ ...b, businessName: e.target.value }))} className="text-foreground" />
        </div>
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Address</Label>
          <Input value={bir.address} onChange={e => setBir(b => ({ ...b, address: e.target.value }))} className="text-foreground" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">TIN</Label>
            <Input value={bir.tin} onChange={e => setBir(b => ({ ...b, tin: e.target.value }))} placeholder="000-000-000-00000" className="text-foreground" />
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Invoice Title</Label>
            <Input value={bir.invoiceTitle} onChange={e => setBir(b => ({ ...b, invoiceTitle: e.target.value }))} className="text-foreground" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-foreground text-sm pt-5">
            <input type="checkbox" checked={bir.vatRegistered} onChange={e => setBir(b => ({ ...b, vatRegistered: e.target.checked }))} className="w-4 h-4 accent-primary" />
            VAT Registered
          </label>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">VAT Rate (%)</Label>
            <Input type="number" value={bir.vatRate} onChange={e => setBir(b => ({ ...b, vatRate: parseFloat(e.target.value) || 0 }))} className="text-foreground" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">PTU No.</Label>
            <Input value={bir.ptuNo} onChange={e => setBir(b => ({ ...b, ptuNo: e.target.value }))} className="text-foreground" />
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">MIN</Label>
            <Input value={bir.min} onChange={e => setBir(b => ({ ...b, min: e.target.value }))} className="text-foreground" />
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Serial No.</Label>
            <Input value={bir.serialNo} onChange={e => setBir(b => ({ ...b, serialNo: e.target.value }))} className="text-foreground" />
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Accreditation No.</Label>
            <Input value={bir.accreditation} onChange={e => setBir(b => ({ ...b, accreditation: e.target.value }))} className="text-foreground" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Software Provider</Label>
            <Input value={bir.softwareProvider} onChange={e => setBir(b => ({ ...b, softwareProvider: e.target.value }))} className="text-foreground" />
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Provider TIN</Label>
            <Input value={bir.softwareTin} onChange={e => setBir(b => ({ ...b, softwareTin: e.target.value }))} placeholder="000-000-000-00000" className="text-foreground" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Footer Note</Label>
          <Input value={bir.footerNote} onChange={e => setBir(b => ({ ...b, footerNote: e.target.value }))} className="text-foreground" />
        </div>
      </div>

      {saveError && <div className="bg-destructive/20 text-destructive text-xs p-2 rounded">{saveError}</div>}

      <Button onClick={handleSave} className="w-full">
        {saved ? '✓ Saved' : 'Save Settings'}
      </Button>
    </div>
  )
}
