import { db, invalidateCache } from './db'
import { apiFetch } from './api'

export async function syncPendingSalesOrders(): Promise<{ synced: number; failed: number }> {
  const pending = await db.pendingSalesOrders.toArray()
  let synced = 0
  let failed = 0

  for (const item of pending) {
    try {
      const res = await apiFetch('/api/sales-orders', {
        method: 'POST',
        body: JSON.stringify(item.payload),
      })
      if (!res.ok) { failed++; continue }
      const data = await res.json()

      if (item.submitAfter) {
        const soId = data.salesOrder?.id ?? data.id
        if (soId) {
          const submitRes = await apiFetch(`/api/sales-orders/${soId}/submit`, {
            method: 'POST',
            body: '{}',
          })
          if (!submitRes.ok) { failed++; continue }
        }
      }

      await db.pendingSalesOrders.delete(item.localId)
      synced++
    } catch {
      failed++
    }
  }

  if (synced > 0) await invalidateCache('salesOrders')
  return { synced, failed }
}

export async function getPendingCount(): Promise<number> {
  return db.pendingSalesOrders.count()
}
