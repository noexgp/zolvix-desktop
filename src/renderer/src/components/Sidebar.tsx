import { NavLink } from 'react-router-dom'
import { ClipboardList, FileText, Users, Package, Settings, LogOut } from 'lucide-react'
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
    { to: '/customers', icon: Users,   label: 'Customers' },
    { to: '/products',  icon: Package, label: 'Products' },
  ]},
]

export default function Sidebar() {
  const { currentUser, setCurrentUser } = useAppStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    setCurrentUser(null)
    navigate('/login')
  }

  return (
    <aside className="w-40 bg-slate-950 flex flex-col shrink-0 h-screen">
      <div className="px-3 py-4 border-b border-slate-800">
        <div className="text-blue-400 font-bold text-sm">ZOLVIX</div>
        <div className="text-slate-500 text-xs">Desktop</div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {nav.map(({ group, items }) => (
          <div key={group} className="mb-3">
            <div className="px-3 py-1 text-xs text-slate-500 font-medium">{group}</div>
            {items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn('flex items-center gap-2 px-3 py-2 text-xs rounded mx-1 mb-0.5',
                    isActive ? 'bg-blue-900/50 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  )
                }
              >
                <Icon className="w-4 h-4" />{label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-800 p-3 space-y-1">
        <NavLink to="/settings" className={({ isActive }) =>
          cn('flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-slate-800',
            isActive ? 'text-white' : 'text-slate-400 hover:text-white'
          )
        }>
          <Settings className="w-4 h-4" /> Settings
        </NavLink>
        <div className="px-2 py-1.5 text-xs text-slate-500">{currentUser?.name}</div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-400 hover:text-red-400 w-full rounded hover:bg-slate-800"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </aside>
  )
}
