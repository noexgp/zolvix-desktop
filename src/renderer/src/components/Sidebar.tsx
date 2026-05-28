import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  ClipboardList, FileText, Users, Package, Settings, LogOut, Sun, Moon,
  ShoppingCart, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { logout } from '@/lib/auth'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'
import { syncPendingSalesOrders, getPendingCount } from '@/lib/sync'

const nav = [
  { group: 'POS', items: [
    { to: '/sales', icon: ShoppingCart, label: 'Sales' },
  ]},
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
  const location = useLocation()
  const [online, setOnline] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  // Auto-collapse to an icon rail on the Sales screen; manual toggle overrides
  // until the next navigation.
  const [collapsed, setCollapsed] = useState(location.pathname === '/sales')

  useEffect(() => {
    setCollapsed(location.pathname === '/sales')
  }, [location.pathname])

  async function refreshPendingCount() {
    const count = await getPendingCount()
    setPendingCount(count)
  }

  useEffect(() => {
    let wasOnline = false

    async function check() {
      if (!serverUrl || !navigator.onLine) { setOnline(false); return }
      const result = await window.electron.server.checkHealth(serverUrl).catch(() => ({ ok: false }))
      const nowOnline = result.ok
      setOnline(nowOnline)

      if (nowOnline && !wasOnline) {
        await syncPendingSalesOrders()
        await refreshPendingCount()
      }
      wasOnline = nowOnline
      await refreshPendingCount()
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

  const footerItem = (label: string) => collapsed ? label : undefined

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        'bg-sidebar flex flex-col shrink-0 h-screen border-r border-sidebar-border transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-40'
      )}
    >
      {/* Header */}
      <div className="border-b border-sidebar-border p-3">
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
          {!collapsed && <span className="text-primary font-bold text-sm">ZOLVIX</span>}
          <button
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="text-muted-foreground hover:text-foreground rounded p-1 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>
        <div className={cn('flex items-center gap-1.5 mt-1.5', collapsed && 'justify-center')}>
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', online ? 'bg-green-500' : 'bg-red-500')} />
          {!collapsed && <span className="text-muted-foreground text-xs">{online ? 'Online' : 'Offline'}</span>}
          {!collapsed && pendingCount > 0 && (
            <span className="ml-auto text-[10px] bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded-full font-medium">
              {pendingCount} pending
            </span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {nav.map(({ group, items }) => (
          <div key={group} className="mb-3">
            {!collapsed && <div className="px-3 py-1 text-xs text-muted-foreground font-medium">{group}</div>}
            {items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                aria-label={label}
                className={({ isActive }) =>
                  cn(
                    'flex items-center rounded mx-1 mb-0.5 text-xs transition-colors',
                    collapsed ? 'justify-center px-0 py-2.5' : 'gap-2 px-3 py-2',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60'
                  )
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        <NavLink
          to="/settings"
          title={footerItem('Settings')}
          aria-label="Settings"
          className={({ isActive }) =>
            cn(
              'flex items-center rounded text-xs transition-colors hover:bg-sidebar-accent/60',
              collapsed ? 'justify-center px-0 py-2' : 'gap-2 px-2 py-1.5',
              isActive ? 'text-foreground' : 'text-sidebar-foreground hover:text-foreground'
            )
          }
        >
          <Settings className="w-4 h-4 shrink-0" />{!collapsed && 'Settings'}
        </NavLink>

        <button
          onClick={toggleTheme}
          title={footerItem(theme === 'dark' ? 'Light mode' : 'Dark mode')}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className={cn(
            'flex items-center text-xs text-sidebar-foreground hover:text-foreground w-full rounded hover:bg-sidebar-accent/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            collapsed ? 'justify-center px-0 py-2' : 'gap-2 px-2 py-1.5'
          )}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
          {!collapsed && (theme === 'dark' ? 'Light mode' : 'Dark mode')}
        </button>

        {!collapsed && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{currentUser?.name || currentUser?.email}</div>
        )}

        <button
          onClick={handleLogout}
          title={footerItem('Sign out')}
          aria-label="Sign out"
          className={cn(
            'flex items-center text-xs text-sidebar-foreground hover:text-destructive w-full rounded hover:bg-sidebar-accent/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            collapsed ? 'justify-center px-0 py-2' : 'gap-2 px-2 py-1.5'
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />{!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  )
}
