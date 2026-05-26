import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ClipboardList, FileText, Users, Package, Settings, LogOut, Sun, Moon } from 'lucide-react'
import { logout } from '@/lib/auth'
import { useAppStore } from '@/stores/appStore'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

const nav = [
  { group: 'PIPELINE', items: [
    { to: '/sales-orders', icon: ClipboardList, label: 'Sales Orders' },
    { to: '/invoices',     icon: FileText,      label: 'Invoices' },
  ]},
  { group: 'REFERENCE', items: [
    { to: '/customers', icon: Users,   label: 'Ledger' },
    { to: '/products',  icon: Package, label: 'Products' },
  ]},
]

export default function Sidebar() {
  const { currentUser, setCurrentUser, theme, setTheme, serverUrl } = useAppStore()
  const navigate = useNavigate()
  const [online, setOnline] = useState(false)

  useEffect(() => {
    async function check() {
      if (!serverUrl || !navigator.onLine) { setOnline(false); return }
      const result = await window.electron.server.checkHealth(serverUrl).catch(() => ({ ok: false }))
      setOnline(result.ok)
    }
    check()
    const interval = setInterval(check, 30_000)
    window.addEventListener('online', check)
    window.addEventListener('offline', () => setOnline(false))
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', check)
      window.removeEventListener('offline', () => setOnline(false))
    }
  }, [serverUrl])

  async function handleLogout() {
    await logout()
    setCurrentUser(null)
    navigate('/login')
  }

  async function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    await window.electron.store.set('theme', next)
  }

  return (
    <aside aria-label="Main navigation" className="w-40 bg-sidebar flex flex-col shrink-0 h-screen border-r border-sidebar-border">
      <div className="px-3 py-4 border-b border-sidebar-border">
        <div className="text-primary font-bold text-sm">ZOLVIX</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', online ? 'bg-green-500' : 'bg-red-500')} />
          <span className="text-muted-foreground text-xs">{online ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {nav.map(({ group, items }) => (
          <div key={group} className="mb-3">
            <div className="px-3 py-1 text-xs text-muted-foreground font-medium">{group}</div>
            {items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn('flex items-center gap-2 px-3 py-2 text-xs rounded mx-1 mb-0.5',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60'
                  )
                }
              >
                <Icon className="w-4 h-4" />{label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-1">
        <NavLink to="/settings" className={({ isActive }) =>
          cn('flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-sidebar-accent/60',
            isActive ? 'text-foreground' : 'text-sidebar-foreground hover:text-foreground'
          )
        }>
          <Settings className="w-4 h-4" /> Settings
        </NavLink>

        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-sidebar-foreground hover:text-foreground w-full rounded hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>

        <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{currentUser?.name || currentUser?.email}</div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-sidebar-foreground hover:text-destructive w-full rounded hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </aside>
  )
}
