import Dexie, { type Table } from 'dexie'

export interface CachedProduct {
  id: string
  name: string
  sku: string
  price: number
  stock: number
  categoryId: string
  isActive: boolean
  updatedAt: string
}

export interface CachedCustomer {
  id: string
  name: string
  phone?: string
  email?: string
  terms?: number
  isActive: boolean
  updatedAt: string
}

export interface CachedSO {
  id: string
  soNumber: string
  status: string
  totalAmount: number
  customerId?: string
  customerName?: string
  orderDate: string
  updatedAt: string
}

interface MetaEntry {
  key: string
  value: string
}

class AppDB extends Dexie {
  products!: Table<CachedProduct>
  customers!: Table<CachedCustomer>
  salesOrders!: Table<CachedSO>
  meta!: Table<MetaEntry>

  constructor() {
    super('ZolvixDesktop')
    this.version(1).stores({
      products: 'id, name, updatedAt',
      customers: 'id, name, updatedAt',
      salesOrders: 'id, status, updatedAt',
      meta: 'key',
    })
  }
}

export const db = new AppDB()

export async function setCacheMeta(key: string): Promise<void> {
  await db.meta.put({ key: `${key}_cached_at`, value: new Date().toISOString() })
}

export async function getCacheMeta(key: string): Promise<string | null> {
  const entry = await db.meta.get(`${key}_cached_at`)
  return entry?.value ?? null
}

export async function isCacheExpired(key: string, ttlMs: number): Promise<boolean> {
  const cachedAt = await getCacheMeta(key)
  if (!cachedAt) return true
  return Date.now() - new Date(cachedAt).getTime() > ttlMs
}

export async function invalidateCache(key: string): Promise<void> {
  await db.meta.delete(`${key}_cached_at`)
}
