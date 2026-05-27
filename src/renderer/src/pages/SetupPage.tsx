import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/stores/appStore'

export default function SetupPage() {
  const [url, setUrl] = useState('https://')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setServerUrl, setSetupComplete } = useAppStore()
  const navigate = useNavigate()

  async function handleSave() {
    setLoading(true)
    setError('')
    try {
      const trimmed = url.trim().replace(/\/$/, '')
      if (!trimmed || trimmed === 'https:' || trimmed === 'https:/') {
        setError('Please enter a valid server URL.')
        setLoading(false)
        return
      }
      const result = await window.electron.server.checkHealth(trimmed)
      if (!result.ok) {
        const detail = result.error ?? `HTTP ${result.status}`
        setError(`Cannot reach server: ${detail}`)
        setLoading(false)
        return
      }
      await window.electron.store.set('serverUrl', trimmed)
      await window.electron.store.set('setupComplete', true)
      setServerUrl(trimmed)
      setSetupComplete(true)
      navigate('/login')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Cannot reach server: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="bg-card rounded-xl p-8 w-full max-w-md space-y-6 shadow-lg border border-border">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to Zolvix Desktop</h1>
          <p className="text-muted-foreground text-sm mt-1">Enter your server URL to get started.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="server-url" className="text-foreground">Server URL</Label>
          <Input
            id="server-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourvps.com"
            className="text-foreground"
          />
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
        <Button onClick={handleSave} disabled={loading} className="w-full">
          {loading ? 'Connecting...' : 'Connect'}
        </Button>
      </div>
    </div>
  )
}
