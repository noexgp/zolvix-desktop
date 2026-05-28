import { useEffect, useState } from 'react'
import { MemoryRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import SetupPage from '@/pages/SetupPage'
import LoginPage from '@/pages/LoginPage'
import SalesPage from '@/pages/SalesPage'
import SalesOrdersPage from '@/pages/SalesOrdersPage'
import InvoicesPage from '@/pages/InvoicesPage'
import CustomersPage from '@/pages/CustomersPage'
import ProductsPage from '@/pages/ProductsPage'
import SettingsPage from '@/pages/SettingsPage'
import NewSOPage from '@/pages/NewSOPage'
import EditSOPage from '@/pages/EditSOPage'
import InvoiceDetailPage from '@/pages/InvoiceDetailPage'
import TerminalSelectPage from './pages/TerminalSelectPage'
import { useAppStore } from '@/stores/appStore'
import { getSession } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { isCacheExpired, setCacheMeta, db } from '@/lib/db'

function AppLayout() {
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { currentUser, setupComplete, terminalId } = useAppStore()
  if (!setupComplete) return <Navigate to="/setup" replace />
  if (!currentUser) return <Navigate to="/login" replace />
  if (!terminalId) return <Navigate to="/terminal-select" replace />
  return <>{children}</>
}

export default function App() {
  const { setCurrentUser, setSetupComplete, setServerUrl, setBusinessSettings, setTerminalId, setTerminalConfig, setTheme, theme, setThermalSource, setThermalPaperType, setNetworkPrinters } = useAppStore()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      const url = await window.electron.store.get('serverUrl') as string
      const setupDone = await window.electron.store.get('setupComplete') as boolean
      const storedTerminalId = await window.electron.store.get('terminalId') as string
      const storedTheme = await window.electron.store.get('theme') as 'light' | 'dark' | undefined
      const storedThermalSource = await window.electron.store.get('thermalSource') as string | undefined
      const storedThermalPaper = await window.electron.store.get('thermalPaperType') as string | undefined
      const storedNetworkPrinters = await window.electron.store.get('networkPrinters') as import('@/stores/appStore').NetworkPrinter[] | undefined
      if (storedThermalSource) setThermalSource(storedThermalSource)
      if (storedThermalPaper) setThermalPaperType(storedThermalPaper)
      if (storedNetworkPrinters?.length) setNetworkPrinters(storedNetworkPrinters)
      const resolvedTheme = storedTheme ?? 'dark'
      setTheme(resolvedTheme)
      document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
      if (url) setServerUrl(url)
      if (setupDone) setSetupComplete(true)
      if (storedTerminalId) setTerminalId(storedTerminalId)
      if (setupDone && url) {
        const user = await getSession()
        if (user) {
          setCurrentUser(user)
          try {
            const bRes = await apiFetch('/api/settings/business')
            if (bRes.ok) {
              const b = await bRes.json()
              setBusinessSettings({ bypassApproval: !(b.requireSoApproval ?? true), name: b.name ?? '' })
            }
          } catch { /* non-critical */ }
          if (storedTerminalId) {
            try {
              const tRes = await apiFetch(`/api/terminals/${storedTerminalId}`)
              if (tRes.ok) {
                const d = await tRes.json()
                const t = d.terminal
                setTerminalConfig({
                  id: t.id, name: t.name,
                  lx310PrinterName: t.lx310PrinterName ?? null,
                  formRowOffset: t.formRowOffset ?? 3,
                  formColOffset: t.formColOffset ?? 5,
                  paperWidth: t.paperWidth ?? 8.5,
                  paperHeight: t.paperHeight ?? 11,
                })
              }
            } catch { /* non-critical */ }
          }
        }
      }
      setReady(true)
    }
    init()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    async function refreshOnFocus() {
      if (!useAppStore.getState().currentUser) return
      try {

        if (await isCacheExpired('products', 5 * 60 * 1000)) {
          const res = await apiFetch('/api/products?limit=500&isActive=true')
          if (res.ok) {
            const data = await res.json()
            const items: Array<{ id: string; name: string; sku?: string; barcode?: string; unit?: string; price: number | string; stock?: number; categoryId?: string; categoryName?: string; category?: { name?: string }; isActive: boolean; updatedAt: string; vatType?: string }> = Array.isArray(data) ? data : (data.products ?? data.data ?? [])
            await db.products.clear()
            await db.products.bulkPut(items.map(p => ({
              id: p.id, name: p.name, sku: p.sku ?? '', barcode: p.barcode ?? '', unit: p.unit ?? '',
              price: Number(p.price), stock: p.stock ?? 0,
              categoryId: p.categoryId ?? '', categoryName: p.categoryName ?? p.category?.name ?? '',
              isActive: p.isActive, updatedAt: p.updatedAt,
              vatType: p.vatType ?? 'VATABLE',
            })))
            await setCacheMeta('products')
          }
        }

        if (await isCacheExpired('customers', 5 * 60 * 1000)) {
          const res = await apiFetch('/api/customer?limit=500')
          if (res.ok) {
            const data = await res.json()
            const items: Array<{ id: string; name: string; phone?: string; email?: string; address?: string; terms?: number; isActive: boolean; updatedAt: string }> = Array.isArray(data) ? data : (data.customers ?? [])
            await db.customers.clear()
            await db.customers.bulkPut(items.map(c => ({
              id: c.id, name: c.name, phone: c.phone ?? '', email: c.email ?? '',
              address: c.address ?? '', terms: c.terms, isActive: c.isActive, updatedAt: c.updatedAt,
            })))
            await setCacheMeta('customers')
          }
        }
      } catch {
        // Background refresh — silently ignore errors
      }
    }

    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [])

  if (!ready) return <div className="min-h-screen bg-background" />

  return (
    <MemoryRouter>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/terminal-select" element={<TerminalSelectPage />} />
        <Route element={<AuthGuard><AppLayout /></AuthGuard>}>
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/sales-orders" element={<SalesOrdersPage />} />
          <Route path="/sales-orders/new" element={<NewSOPage />} />
          <Route path="/sales-orders/:id/edit" element={<EditSOPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/sales-orders" replace />} />
      </Routes>
    </MemoryRouter>
  )
}
