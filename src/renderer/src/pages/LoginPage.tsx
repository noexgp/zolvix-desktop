import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { login } from '@/lib/auth'
import { useAppStore } from '@/stores/appStore'
import { apiFetch } from '@/lib/api'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setCurrentUser, setBusinessSettings } = useAppStore()
  const navigate = useNavigate()

  async function handleLogin() {
    setLoading(true)
    setError('')
    try {
      const user = await login(email, password)
      setCurrentUser(user)
      const bRes = await apiFetch('/api/settings/business')
      if (bRes.ok) {
        const bData = await bRes.json()
        setBusinessSettings({
          bypassApproval: bData.bypassApproval ?? false,
          name: bData.name ?? '',
        })
      }
      navigate('/sales-orders')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="bg-slate-800 rounded-xl p-8 w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold text-white">Sign In</h1>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
        <Button onClick={handleLogin} disabled={loading} className="w-full">
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </div>
    </div>
  )
}
