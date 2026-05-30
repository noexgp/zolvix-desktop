import { describe, it, expect } from 'vitest'
import { buildCustomerSearchUrl } from '../useCustomerSearch'

describe('buildCustomerSearchUrl', () => {
  it('returns null for empty or whitespace input', () => {
    expect(buildCustomerSearchUrl('')).toBe(null)
    expect(buildCustomerSearchUrl('   ')).toBe(null)
  })
  it('builds a URL with encoded query and limit=30 for typed input', () => {
    expect(buildCustomerSearchUrl('Maria')).toBe('/api/customer?search=Maria&limit=30')
    expect(buildCustomerSearchUrl('hello world')).toBe('/api/customer?search=hello%20world&limit=30')
    expect(buildCustomerSearchUrl('a&b')).toBe('/api/customer?search=a%26b&limit=30')
  })
  it('trims whitespace before building', () => {
    expect(buildCustomerSearchUrl('  Maria  ')).toBe('/api/customer?search=Maria&limit=30')
  })
})
