import Dexie, { type Table } from 'dexie'

interface CacheEntry<T> {
  key: string
  data: T
  timestamp: number
}

class MenuCacheDB extends Dexie {
  menuItems!: Table<CacheEntry<any>>
  menuCategories!: Table<CacheEntry<any>>

  constructor() {
    super('pos-menu-cache')
    this.version(1).stores({
      menuItems: 'key',
      menuCategories: 'key',
    })
  }
}

const db = new MenuCacheDB()

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Diagnostic: log silent IndexedDB failures
function warnCache(e: unknown, op: string) {
  console.warn(`[MenuCache] ${op} failed:`, e instanceof Error ? e.message : e)
}

export const menuCache = {
  async getItems(): Promise<any[] | null> {
    try {
      const entry = await db.menuItems.get('items')
      if (!entry || Date.now() - entry.timestamp > CACHE_TTL) return null
      return entry.data
    } catch (e) {
      warnCache(e, 'getItems')
      return null
    }
  },

  async setItems(data: any[]): Promise<void> {
    try {
      await db.menuItems.put({ key: 'items', data, timestamp: Date.now() })
    } catch (e) { warnCache(e, 'setItems') }
  },

  async getCategories(): Promise<any[] | null> {
    try {
      const entry = await db.menuCategories.get('categories')
      if (!entry || Date.now() - entry.timestamp > CACHE_TTL) return null
      return entry.data
    } catch (e) {
      warnCache(e, 'getCategories')
      return null
    }
  },

  async setCategories(data: any[]): Promise<void> {
    try {
      await db.menuCategories.put({ key: 'categories', data, timestamp: Date.now() })
    } catch (e) { warnCache(e, 'setCategories') }
  },

  async clear(): Promise<void> {
    try {
      await db.menuItems.clear()
      await db.menuCategories.clear()
    } catch (e) { warnCache(e, 'clear') }
  },
}
