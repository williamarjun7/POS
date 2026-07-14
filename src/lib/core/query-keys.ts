import type { MenuItemQueryParams } from '@/lib/api/types'

export const dashboardKeys = {
  all: ['dashboard'] as const,
  report: (startDate?: string, endDate?: string) => ['dashboard', 'report', startDate, endDate] as const,
  tables: () => ['dashboard', 'tables'] as const,
  rooms: () => ['dashboard', 'rooms'] as const,
  orders: () => ['dashboard', 'orders'] as const,
  activeBookings: ['dashboard', 'activeBookings'] as const,
  pendingInvoices: ['dashboard', 'pendingInvoices'] as const,
  roomHkTask: (roomId: string) => ['dashboard', 'hk', roomId] as const,
}

export const menuKeys = {
  all: ['menu'] as const,
  lists: () => [...menuKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown> | MenuItemQueryParams) => filters ? [...menuKeys.lists(), filters] as const : menuKeys.lists(),
  details: () => [...menuKeys.all, 'detail'] as const,
  detail: (id: string) => [...menuKeys.details(), id] as const,
  categories: () => [...menuKeys.all, 'categories'] as const,
}

export const invoiceKeys = {
  all: ['invoices'] as const,
  detail: (id: string) => ['invoices', id] as const,
  payments: (id: string) => ['invoices', id, 'payments'] as const,
  items: (id: string) => ['invoices', id, 'items'] as const,
}

export const tableSessionKeys = {
  all: ['table-sessions'] as const,
}
