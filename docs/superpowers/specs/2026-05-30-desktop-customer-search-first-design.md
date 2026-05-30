# Desktop Customer Search-First Picker — Design Spec

**Date:** 2026-05-30
**Project:** Zolvix Desktop (`zolvix-desktop`)

## Problem

The customer picker in the desktop sales screen is fed a one-time cached list (`/api/customer?limit=500` at startup, stored in `db.customers`, loaded into `SalesPage` state, filtered client-side inside `SearchableSelect`). Two consequences for any larger customer base:

1. **Missing customers** — anyone past the first 500 active records is silently invisible to the cashier.
2. **Weak match** — search is a simple case-insensitive `label.includes()`, name only (no email/phone match), no fuzzy/server-side ranking.

## Scope

In scope (v1):
- Replace the cached, client-side customer filter with a debounced server search via the existing `GET /api/customer?search=<q>&limit=30` (which already matches name + email + phone). 
- **Walk-in stays the always-visible default** at the top of the dropdown.
- Empty search → only `[Walk-in]` shows (no fetch). Typing → debounced server results replace the rest of the list.
- Offline / error → fall back to filtering the locally-cached `db.customers`.

Out of scope:
- A "recent customers" or "top customers" empty-state list.
- A new server endpoint / pagination beyond `limit=30`.
- Changes to the broader `CustomersPage` admin screen.

## Key decisions

- **Endpoint = existing `/api/customer?search=<q>&limit=30`.** Server already matches name/email/phone (`/Users/glenn/dev/zolvix/app/api/customer/route.ts:19-22`). No web change needed.
- **Empty search returns immediately with no fetch** — cuts a request that would just return the (large) default page; the cashier sees Walk-in only and is free to type. Mirrors how the new product grid pattern minimises idle traffic.
- **`SearchableSelect` extension is opt-in.** Add an optional `onSearchChange?: (q: string) => void` prop. When provided, the component stops doing its internal `.includes()` filter and renders `items` as-is — parent owns them. When omitted, current behaviour is preserved verbatim, so no other call sites change.
- **Offline fallback = the same cached `db.customers` set.** Same approach as `useSalesProducts`: on network/error, query `db.customers.toArray()` and run a case-insensitive includes on name/email/phone.
- **No new caching layer.** The hook does not persist its own results; cached `db.customers` (already populated and refreshed by `App.tsx:152`) is the only persistent store.

## Architecture

```
keystroke in picker
        │
        ▼
setCustomerSearch (lifted state in ProductGrid)
        │
        ▼
useCustomerSearch({ search }) ─ debounce 250 ms ─► GET /api/customer?search=<q>&limit=30
        │                                                        │
        │                                                  ok / non-ok / network err
        │                                                        │
        │                                          ─ ok ─►  CachedCustomer[]
        │                                          ─ err ─► db.customers fallback filter
        ▼
items = [{ id: '', label: 'Walk-in' }, ...result]
        │
        ▼
<SearchableSelect items={items} onSearchChange={setCustomerSearch} ... />
```

## Components

| File | Action |
|------|--------|
| `src/renderer/src/hooks/useCustomerSearch.ts` | new — `buildCustomerSearchUrl(q)` pure helper + `useCustomerSearch({ search })` hook (debounced fetch + cancel-flag + offline fallback) |
| `src/renderer/src/hooks/__tests__/useCustomerSearch.test.ts` | new — unit tests for `buildCustomerSearchUrl` |
| `src/renderer/src/components/SearchableSelect.tsx` | add optional `onSearchChange?: (q: string) => void` prop; when supplied, call it on every `setQuery(...)` and skip the internal `.includes()` filter — render `items` straight through |
| `src/renderer/src/components/ProductGrid.tsx` | drop the `customerItems = customers.map(...)` memo; add `const [customerSearch, setCustomerSearch] = useState('')` + `const { customers: searchedCustomers } = useCustomerSearch({ search: customerSearch })`; build `items={[{ id: '', label: 'Walk-in' }, ...searchedCustomers.map(...)]}`; pass `onSearchChange={setCustomerSearch}` to the `<SearchableSelect>` |

No server change, no schema change, no settings.

## Data flow notes

- `useCustomerSearch` returns `{ customers: CachedCustomer[]; loading: boolean }` (mirroring `useSalesProducts`'s shape). v1 surfaces `loading` from the hook but the picker UI does not need to show a spinner — the existing dropdown is fast enough. The flag is still exported for symmetry / future use.
- The `SearchableSelect` already handles open/closed/keyboard nav; making `onSearchChange` optional means we don't touch any other call site (e.g. category pickers elsewhere).
- The picker's value (`customer?.id`) and `onSelectCustomer(...)` semantics are unchanged. Walk-in's empty id `''` still maps to `null`.

## Error handling & edge cases

- `search` is the empty string → hook returns `[]` immediately (no fetch). Walk-in is the only visible row.
- Network error / non-OK → fallback to filtering `db.customers` for `name|email|phone` includes `q` (case-insensitive), capped at 30.
- Rapid typing → debounce 250 ms; superseded fetches set `cancelled = true` in the cleanup so stale results never overwrite a newer one. (The IPC bridge ignores `AbortSignal`, same constraint as the products hook.)
- Picker closed without selecting → `customerSearch` state stays as last input; not visible to the user. When the picker reopens, the previous search text is wherever the `SearchableSelect` left it — acceptable v1 behavior.

## Testing

- **Unit:** `buildCustomerSearchUrl(q: string): string` — empty/whitespace input → `null` (no URL, no fetch); non-empty → `/api/customer?search=<encoded>&limit=30`. Pure and fast.
- **Manual smoke:**
  - Open Sales. Customer dropdown shows **Walk-in** (and nothing else) until you type.
  - Type a name fragment → after ~250 ms the dropdown lists matches from the **whole** customer DB (not capped at 500).
  - Type an email/phone fragment → matches there too (server already handles).
  - Clear the input → list reverts to just Walk-in.
  - Disconnect the network → typing falls back to the local cached set.
  - Selecting a customer still sets `customer` correctly; selecting Walk-in still resets it to `null`.
