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
      const res = await fetch(`${trimmed}/api/health`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error('Server returned an error')
      await window.electron.store.set('serverUrl', trimmed)
      await window.electron.store.set('setupComplete', true)
      setServerUrl(trimmed)
      setSetupComplete(true)
      navigate('/login')
    } catch {
      setError('Cannot reach server. Check the URL and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="bg-slate-800 rounded-xl p-8 w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Welcome to Zolvix Desktop</h1>
          <p className="text-slate-400 text-sm mt-1">Enter your server URL to get started.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="server-url" className="text-slate-300">Server URL</Label>
          <Input
            id="server-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourvps.com"
            className="bg-slate-700 border-slate-600 text-white"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
        <Button onClick={handleSave} disabled={loading} className="w-full">
          {loading ? 'Connecting...' : 'Connect'}
        </Button>
      </div>
    </div>
  )
}
