/**
 * Shared table/room status mapping constants.
 *
 * Extracted from duplicate inline definitions in POS.tsx and DashboardPage.tsx
 * to eliminate maintenance overhead and ensure consistency.
 */

export const TABLE_STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  free: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
  dirty: 'Needs Cleaning',
  disabled: 'Disabled',
  out_of_order: 'Out of Order',
};

export const TABLE_STATUS_COLORS: Record<string, string> = {
  available: 'bg-emerald-500',
  free: 'bg-emerald-500',
  occupied: 'bg-orange-500',
  reserved: 'bg-blue-500',
  cleaning: 'bg-cyan-500',
  maintenance: 'bg-red-500',
  dirty: 'bg-amber-500',
  needs_checkout: 'bg-orange-500',
  needs_payment: 'bg-red-500',
};
