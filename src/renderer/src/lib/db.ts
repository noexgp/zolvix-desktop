import Dexie, { type Table } from 'dexie'

export interface SOLinePayload {
  productId: string
  quantity: number
  unitPrice: number
  discount: number
  total: number
  lineNumber: number
}

export interface PendingSOPayload {
  customerId: string
  employeeId?: string
  orderDate: string
  notes?: string
  discount?: number
  discountMode?: string
  deliveryFee?: number
  details: SOLinePayload[]
}

export interface PendingSO {
  localId: string
  payload: PendingSOPayload
  customerName: string
  submitAfter: boolean
  createdAt: string
}

export interface CachedProduct {
  id: string
  name: string
  sku: string
  barcode?: string
  unit?: string
  price: number
  stock: number
  categoryId: string
  categoryName?: string
  isActive: boolean
  updatedAt: string
  vatType?: string
}

export interface CachedCustomer {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
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
  deliveryDate?: string
  notes?: string
  updatedAt: string
  userId?: string
}

interface MetaEntry {
  key: string
  value: string
}

export class AppDB extends Dexie {
  products!: Table<CachedProduct>
  customers!: Table<CachedCustomer>
  salesOrders!: Table<CachedSO>
  meta!: Table<MetaEntry>
  pendingSalesOrders!: Table<PendingSO>

  constructor() {
    super('ZolvixDesktop')
    this.version(1).stores({
      products:    'id, name, updatedAt',
      customers:   'id, name, updatedAt',
      salesOrders: 'id, status, updatedAt',
      meta:        'key',
    })
    this.version(2).stores({
      products:    'id, name, updatedAt',
      customers:   'id, name, updatedAt',
      salesOrders: 'id, soNumber, status, updatedAt',
      meta:        'key',
    })
    this.version(3).stores({
      products:    'id, name, updatedAt',
      customers:   'id, name, updatedAt',
      salesOrders: 'id, soNumber, status, userId, updatedAt',
      meta:        'key',
    })
    this.version(4).stores({
      products:            'id, name, updatedAt',
      customers:           'id, name, updatedAt',
      salesOrders:         'id, soNumber, status, userId, updatedAt',
      meta:                'key',
      pendingSalesOrders:  'localId, createdAt',
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
