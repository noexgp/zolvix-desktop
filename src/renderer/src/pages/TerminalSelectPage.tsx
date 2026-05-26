import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { useAppStore } from '@/stores/appStore'
import type { TerminalConfig } from '@/stores/appStore'

interface TerminalOption {
  id: string
  name: string
  location: string | null
  isActive: boolean
}

export default function TerminalSelectPage() {
  const [terminals, setTerminals] = useState<TerminalOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const { setTerminalId, setTerminalConfig } = useAppStore()
  const navigate = useNavigate()

  useEffect(() => {
    apiFetch('/api/terminals')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load')))
      .then((data: TerminalOption[]) => setTerminals(data.filter(t => t.isActive)))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load terminals'))
      .finally(() => setLoading(false))
  }, [])

  async function handleConfirm() {
    if (!selected) return
    setSaving(true)
    try {
      await window.electron.store.set('terminalId', selected)
      setTerminalId(selected)
      const res = await apiFetch(`/api/terminals/${selected}`)
      if (res.ok) {
        const d = await res.json()
        const t = d.terminal
        const config: TerminalConfig = {
          id: t.id, name: t.name,
          lx310PrinterName: t.lx310PrinterName ?? null,
          formRowOffset: t.formRowOffset ?? 3,
          formColOffset: t.formColOffset ?? 5,
          paperWidth: t.paperWidth ?? 8.5,
          paperHeight: t.paperHeight ?? 11,
        }
        setTerminalConfig(config)
      }
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="bg-card rounded-xl p-8 w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Select Terminal</h1>
          <p className="text-muted-foreground text-sm mt-1">Choose which terminal this machine is.</p>
        </div>
        {loading && <p className="text-muted-foreground text-sm">Loading terminals…</p>}
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="space-y-2">
          {terminals.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`w-full text-left rounded-lg px-4 py-3 border transition-colors ${
                selected === t.id
                  ? 'border-blue-500 bg-primary/15 text-foreground'
                  : 'border-border bg-muted/50 text-foreground hover:border-border'
              }`}
            >
              <p className="font-medium">{t.name}</p>
              {t.location && <p className="text-xs text-muted-foreground">{t.location}</p>}
            </button>
          ))}
        </div>
        <Button onClick={handleConfirm} disabled={!selected || saving} className="w-full">
          {saving ? 'Saving…' : 'Use This Terminal'}
        </Button>
      </div>
    </div>
  )
}
