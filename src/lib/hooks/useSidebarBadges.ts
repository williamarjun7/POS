import { useState, useEffect } from 'react'
import { db } from '@/lib/db/insforge'
import type { OrderBatchRow, MaintenanceRequestRow, InventoryItemRow } from '@/lib/db/types'

export interface SidebarBadges {
  orders: number
  operations: number
  inventory: number
}

export function useSidebarBadges() {
  const [badges, setBadges] = useState<SidebarBadges>({
    orders: 0,
    operations: 0,
    inventory: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBadges = async () => {
      try {
        const [ordersRes, maintRes, inventoryRes] = await Promise.all([
          db.findMany<OrderBatchRow>('order_batches'),
          db.findMany<MaintenanceRequestRow>('maintenance_requests'),
          db.findMany<InventoryItemRow>('inventory_items'),
        ])

        setBadges({
          orders:
            ordersRes.data?.filter(
              (o) => o.status !== 'paid' && o.status !== 'cancelled'
            ).length ?? 0,
          operations:
            maintRes.data?.filter(
              (m) => m.status === 'open' || m.status === 'in_progress'
            ).length ?? 0,
          inventory:
            inventoryRes.data?.filter(
              (i) => i.current_stock < i.min_stock
            ).length ?? 0,
        })
      } catch {
        // Fail silently — badges stay at 0
      } finally {
        setLoading(false)
      }
    }
    fetchBadges()
  }, [])

  return { badges, loading }
}
