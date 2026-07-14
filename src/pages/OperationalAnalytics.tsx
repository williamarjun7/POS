import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingDown, Download,
  Users, AlertTriangle, Package, PackageX, BarChart3,
  Calendar, Receipt,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Tabs } from '@/components/Tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { formatCurrency } from '@/lib/utils';
import { exportCsv } from '@/lib/services/csv-export';
import DateFilterBar, { type DateFilterState, getDateRange } from '@/components/filters/DateFilterBar';
import { useOrders, useRooms } from '../lib/hooks';
import {
  useRevenueByPeriod, useAverageOrderValue,
  useQueueAnalytics,
  useStaffOrderCounts, useLowStockProducts, useStockMovementTrends,
  useRevenueForecast, useOccupancyForecast,
} from '../lib/hooks';
import {
  useRevenueByDay,
  usePaymentMethodBreakdown,
  useStaffRoleDistribution,
  useActiveStaff,
} from '@/lib/services/finance-aggregation';
import type { Order } from '../types';
import { pageTransitionFast, staggerContainerFast } from "@/lib/animations/presets"

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ChartTooltip({ active, payload, label, formatter }: { active?: boolean; payload?: any[]; label?: string; formatter?: (v: any) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-md">
      {label && <p className="mb-1 text-sm font-medium text-foreground">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm text-muted-foreground">
          {entry.name}: {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className ?? ''}`}>
      <h3 className="mb-4 text-base font-semibold">{title}</h3>
      <div className="h-72">{children}</div>
    </div>
  );
}

// Using pageTransitionFast, staggerContainerFast from presets

export default function OperationalAnalytics() {
  // ── Date filter state (default: This Month) ──
  const [dateFilter, setDateFilter] = useState<DateFilterState>({ preset: 'this_month' })
  const dateRange = getDateRange(dateFilter)
  const rangeStart = dateRange.startDate
  const rangeEnd = dateRange.endDate

  // ── Real hooks ──
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: rooms } = useRooms();
  const { data: revenuePeriodData } = useRevenueByPeriod(7);
  // Payment methods from actual payments table (not invoices)
  const { data: paymentMethodData } = usePaymentMethodBreakdown(rangeStart, rangeEnd);
  // Revenue vs Expenses with REAL expense data
  const { data: revenueByDayData } = useRevenueByDay(7, rangeStart, rangeEnd);
  const { data: aovData } = useAverageOrderValue(30);
  const { data: queueHealth } = useQueueAnalytics();
  const { data: staffRoles } = useStaffRoleDistribution();
  const { data: activeStaff } = useActiveStaff();
  const { data: staffOrderCounts } = useStaffOrderCounts();
  const { data: lowStockProducts } = useLowStockProducts();
  const { data: stockMovements } = useStockMovementTrends(14);
  const { data: revenueForecast } = useRevenueForecast(7);
  const { data: occupancyForecast } = useOccupancyForecast(7);

  

  // ── Computed values ──
  const paidOrders = useMemo(() => (orders ?? []).filter((o: Order) => o.status === 'completed'), [orders]);
  const grossRevenue = useMemo(() => paidOrders.reduce((s, o) => s + Number(o.total || o.totalAmount), 0), [paidOrders]);
  const avgOrderValue = paidOrders.length > 0 ? grossRevenue / paidOrders.length : 0;

  const occupiedRooms = useMemo(() => (rooms ?? []).filter((r: any) => r.status === 'occupied').length, [rooms]);
  const totalRooms = useMemo(() => (rooms ?? []).length, [rooms]);
  const occupancyRate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(1) : '0.0';

  const pendingRevenue = useMemo(() => (orders ?? []).filter((o: Order) => !['completed', 'cancelled', 'refunded'].includes(o.status)).reduce((s, o) => s + Number(o.total || o.totalAmount), 0), [orders]);

  // ── Revenue vs Expenses chart with REAL expense data ──
  const monthlyRevenue = useMemo(() => {
    // Use real revenue-by-day data if available (which includes real expenses)
    if (revenueByDayData && revenueByDayData.length > 0) {
      return revenueByDayData;
    }
    // Fallback: use revenue-only data with zero expenses rather than fake numbers
    if (revenuePeriodData) {
      const dayBuckets = revenuePeriodData.dayBuckets ?? {};
      return Object.entries(dayBuckets).map(([date, revenue]) => ({
        name: DAY_NAMES[new Date(date).getDay()],
        revenue: Math.round(revenue),
        expenses: 0, // Show 0 instead of fabricated value
      }));
    }
    return [];
  }, [revenueByDayData, revenuePeriodData]);

  // Payment breakdown from payments table with proper labels
  const paymentBreakdown = useMemo(() => {
    if (paymentMethodData && paymentMethodData.length > 0) {
      return paymentMethodData
        .filter(m => m.total > 0 || ['cash', 'reception_qr', 'fonepay', 'credit'].includes(m.method))
        .map(m => ({
          name: m.label,
          value: m.total,
          color: m.color,
        }));
    }
    return [];
  }, [paymentMethodData]);

  // Payment methods details for the Payments tab
  const paymentMethodDetails = useMemo(() => {
    if (paymentMethodData && paymentMethodData.length > 0) {
      const grandTotal = paymentMethodData.reduce((s, m) => s + m.total, 0);
      return paymentMethodData
        .filter(m => ['cash', 'reception_qr', 'fonepay', 'credit'].includes(m.method))
        .map(m => ({
          method: m.label,
          count: m.count,
          total: m.total,
          percentage: grandTotal > 0 ? (m.total / grandTotal) * 100 : 0,
        }));
    }
    return [];
  }, [paymentMethodData]);

  const topProducts = useMemo(() => {
    const itemCounts: Record<string, { sold: number; revenue: number }> = {};
    (orders ?? []).forEach((o: Order) => {
      (o.order_items ?? o.items ?? []).forEach((item: any) => {
        const name = item.item_name || item.name || 'Unknown';
        const qty = item.quantity || 1;
        const price = item.price || 0;
        if (!itemCounts[name]) itemCounts[name] = { sold: 0, revenue: 0 };
        itemCounts[name].sold += qty;
        itemCounts[name].revenue += price * qty;
      });
    });
    return Object.entries(itemCounts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5);
  }, [orders]);

  // ── State ──
  const [activeTab, setActiveTab] = useState('executive');

  // ── Export CSV ──
  function handleExport() {
    const date = new Date().toISOString().split('T')[0];
    exportCsv(
      [{
        grossRevenue: `Rs. ${grossRevenue.toFixed(2)}`,
        paidOrders: paidOrders.length,
        avgOrderValue: `Rs. ${avgOrderValue.toFixed(2)}`,
        occupancyRate: `${occupancyRate}%`,
        occupiedRooms,
        totalRooms,
        activeOrders: (orders ?? []).filter((o: Order) => o.status === 'pending').length,
        pendingRevenue: `Rs. ${pendingRevenue.toFixed(0)}`,
        queueSize: queueHealth?.queueSize ?? 0,
        mutations: 0,
        channels: 0,
        lowStockItems: lowStockProducts?.length ?? 0,
        forecastTrend: revenueForecast?.trend ?? 'unknown',
        period: 'daily',
        exportedAt: new Date().toISOString(),
      }],
      [
        { label: 'Gross Revenue', value: (r: any) => r.grossRevenue },
        { label: 'Paid Orders', value: (r: any) => r.paidOrders },
        { label: 'Avg Order Value', value: (r: any) => r.avgOrderValue },
        { label: 'Occupancy Rate', value: (r: any) => r.occupancyRate },
        { label: 'Occupied Rooms', value: (r: any) => r.occupiedRooms },
        { label: 'Total Rooms', value: (r: any) => r.totalRooms },
        { label: 'Active Orders', value: (r: any) => r.activeOrders },
        { label: 'Pending Revenue', value: (r: any) => r.pendingRevenue },
        { label: 'Queue Size', value: (r: any) => r.queueSize },
        { label: 'Mutations', value: (r: any) => r.mutations },
        { label: 'Channels', value: (r: any) => r.channels },
        { label: 'Low Stock Items', value: (r: any) => r.lowStockItems },
        { label: 'Forecast Trend', value: (r: any) => r.forecastTrend },
        { label: 'Period', value: (r: any) => r.period },
        { label: 'Exported At', value: (r: any) => r.exportedAt },
      ],
      `analytics-${date}`
    );
  }

  const tabs = [
    { id: 'executive', label: 'Executive Overview' },
    { id: 'sales', label: 'Sales' },
    { id: 'financial', label: 'Financial' },
    { id: 'payments', label: 'Payments' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'motel', label: 'Motel' },
    { id: 'staff', label: 'Staff' },
  ];

  return (
    <Skeleton name="analytics" loading={ordersLoading}>
      <motion.div initial="hidden" animate="visible" variants={staggerContainerFast} className="space-y-6">
        <motion.div variants={pageTransitionFast} className="flex items-start justify-between gap-4 flex-wrap">
          <PageHeader title="Analytics" icon="BarChart3" description="Business intelligence and performance insights" />
          <button onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs font-medium hover:bg-accent transition-colors shrink-0">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </motion.div>

        {/* ── Date Filter Bar ── */}
        <motion.div variants={pageTransitionFast}>
          <DateFilterBar filter={dateFilter} dateRange={dateRange} onChange={setDateFilter} />
        </motion.div>

        <motion.div variants={pageTransitionFast}>
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </motion.div>

        {/* ── Executive Overview ── */}
        {activeTab === 'executive' && (
          <motion.div variants={pageTransitionFast} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Gross Revenue" value={formatCurrency(Math.round(grossRevenue))} icon="DollarSign" color="text-emerald-500" trend="up" trendValue={`${paidOrders.length} paid orders`} index={0} />
            <StatCard label="Avg Order Value" value={formatCurrency(Math.round(avgOrderValue))} icon="TrendingUp" color="text-blue-500" trend="up" trendValue={`From ${paidOrders.length} orders`} index={1} />
            <StatCard label="Occupancy" value={`${occupancyRate}%`} icon="Bed" color="text-cyan-500" trend="up" trendValue={`${occupiedRooms}/${totalRooms} rooms`} index={2} />
            <StatCard label="Active Staff" value={String(activeStaff?.length ?? '—')} icon="Users" color="text-violet-500" index={3} trend="neutral" trendValue={staffRoles ? `${Object.keys(staffRoles).length} roles` : '—'} />
            <StatCard label="Pending Orders" value={String((orders ?? []).filter((o: Order) => o.status === 'pending').length)} icon="ShoppingCart" color="text-orange-500" trend='neutral' trendValue={pendingRevenue > 0 ? `Rs. ${pendingRevenue.toFixed(0)} pending` : 'No pending'} index={4} />
            <StatCard label="Queue Size" value={String(queueHealth?.queueSize ?? 0)} icon="Timer" color="text-amber-500" trend="neutral" trendValue={`Avg wait ${queueHealth?.averageWaitTime ?? '—'}m`} index={5} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Revenue Trend">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} strokeWidth={2} />
                    <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Payment Breakdown">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" paddingAngle={2}>
                      {paymentBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {topProducts.length > 0 ? (
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="mb-4 text-base font-semibold">Top Products</h3>
                  <div className="space-y-3">
                    {topProducts.map((p, i) => (
                      <div key={p.name} className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{p.name}</span>
                            <span className="text-sm text-muted-foreground">{p.sold} sold</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${(p.sold / topProducts[0].sold) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="mb-4 text-base font-semibold">Top Products</h3>
                  <div className="py-8 text-center">
                    <Package className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No product data available</p>
                  </div>
                </div>
              )}

              <ChartCard title="Revenue vs Expenses">
                {monthlyRevenue.some(d => d.expenses > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                      <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-8 text-center">
                    <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No expense data recorded yet. Add expenses in Finance to see comparisons.</p>
                  </div>
                )}
              </ChartCard>
            </div>
          </motion.div>
        )}

        {/* ── Sales ── */}
        {activeTab === 'sales' && (
          <motion.div variants={pageTransitionFast} className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Revenue Trend">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                    <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Payment Distribution">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" paddingAngle={2}>
                      {paymentBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Average Order Value sparkline */}
            <ChartCard title="Average Order Value (30 days)">
              {aovData && aovData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={aovData.map((d: any, i: number) => ({ ...d, day: i + 1 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" tickFormatter={(v: number) => `Rs.${v}`} />
                    <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                    <Area type="monotone" dataKey="aov" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-8 text-center">
                  <TrendingDown className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No AOV data available</p>
                </div>
              )}
            </ChartCard>
          </motion.div>
        )}

        {/* ── Financial ── */}
        {activeTab === 'financial' && (
          <motion.div variants={pageTransitionFast} className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Revenue Breakdown">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                    <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-4 text-base font-semibold">Cash Flow Summary</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Gross Revenue', amount: grossRevenue, type: 'in' as const },
                    { label: 'Paid Orders', amount: paidOrders.length, type: 'neutral' as const },
                    { label: 'Avg Order Value', amount: avgOrderValue, type: 'neutral' as const },
                    { label: 'Pending Revenue', amount: pendingRevenue, type: 'out' as const },
                    { label: 'Occupancy Rate', amount: occupancyRate, type: 'neutral' as const },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      <span className={`text-sm font-semibold ${item.type === 'in' ? 'text-emerald-500' : item.type === 'out' ? 'text-destructive' : 'text-foreground'}`}>
                        {item.type === 'in' ? formatCurrency(Math.round(item.amount as number)) :
                         item.type === 'out' ? formatCurrency(Math.round(item.amount as number)) :
                         typeof item.amount === 'number' && item.amount > 1000 ? formatCurrency(Math.round(item.amount)) : String(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Revenue Forecast */}
            <ChartCard title="Revenue Forecast (Next 7 Days)">
              {revenueForecast ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueForecast.forecast}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" tickFormatter={(v: number) => `D+${v}`} />
                    <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" tickFormatter={(v: number) => `Rs.${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                    <Area type="monotone" dataKey="upper" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.05} strokeWidth={1} strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="projected" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="lower" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.05} strokeWidth={1} strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-8 text-center">
                  <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">Loading forecast...</p>
                </div>
              )}
            </ChartCard>
          </motion.div>
        )}

        {/* ── Payments ── */}
        {activeTab === 'payments' && (
          <motion.div variants={pageTransitionFast} className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Payment Method Distribution">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" paddingAngle={2}>
                      {paymentBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-4 text-base font-semibold">Payment Details</h3>
                {paymentMethodDetails.length > 0 ? (
                  <div className="space-y-4">
                    {paymentMethodDetails.map(({ method, count, total, percentage }) => (
                      <div key={method}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{method}</span>
                          <span className="font-medium">{formatCurrency(total)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{count} transactions ({percentage.toFixed(0)}%)</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Receipt className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No payment data yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Payment details will appear once orders are processed</p>
                  </div>
                )}
              </div>
            </div>

            {/* System Telemetry */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-4 text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-cyan-500" />
                  System Telemetry
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Queue Size</p>
                    <p className="text-lg font-bold">{queueHealth?.queueSize ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Low Stock Items</p>
                    <p className="text-lg font-bold">{lowStockProducts?.length ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Active Staff</p>
                    <p className="text-lg font-bold">{activeStaff?.length ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Total Rooms</p>
                    <p className="text-lg font-bold">{totalRooms}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Occupancy</p>
                    <p className="text-lg font-bold">{occupancyRate}%</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Active Orders</p>
                    <p className="text-lg font-bold">{(orders ?? []).filter((o: Order) => o.status === 'pending').length}</p>
                  </div>
                </div>
              </div>

              <ChartCard title="Average Order Value Trend">
                {aovData && aovData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={aovData.slice(-14).map((d: any, i: number) => ({ ...d, day: i + 1 }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                      <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" tickFormatter={(v: number) => `Rs.${v}`} />
                      <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                      <Area type="monotone" dataKey="aov" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-8 text-center">
                    <TrendingDown className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No AOV data</p>
                  </div>
                )}
              </ChartCard>
            </div>
          </motion.div>
        )}

        {/* ── Inventory ── */}
        {activeTab === 'inventory' && (
          <motion.div variants={pageTransitionFast} className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-4 text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Low Stock Alerts
                </h3>
                {lowStockProducts && lowStockProducts.length > 0 ? (
                  <div className="space-y-3">
                    {lowStockProducts.slice(0, 8).map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground">{p.category ?? 'Uncategorized'} · {p.unit}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-medium ${p.stock_balance <= 0 ? 'text-red-500' : 'text-amber-500'}`}>
                            {p.stock_balance} {p.unit}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Reorder at: {p.reorder_level}</p>
                        </div>
                      </div>
                    ))}
                    {lowStockProducts.length > 8 && (
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        ...and {lowStockProducts.length - 8} more items
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <Package className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No low stock items</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">All products above reorder levels</p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-4 text-base font-semibold flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-orange-500" />
                  Stock Movement Trends
                </h3>
                {stockMovements && Object.keys(stockMovements).length > 0 ? (
                  <>
                    <div className="h-48 flex items-end justify-between gap-1">
                      {Object.entries(stockMovements).slice(-14).map(([date, types]: [string, any]) => {
                        const total = Object.values(types).reduce((s: number, v: any) => s + v, 0);
                        const allTotals = Object.values(stockMovements).flatMap((d: any) => Object.values(d));
                        const maxTotal = Math.max(...(allTotals as number[]), 1);
                        const pct = (total / maxTotal) * 100;
                        return (
                          <div key={date} className="flex-1 flex flex-col items-center justify-end h-full">
                            <div className="w-full max-w-[16px] rounded-t bg-primary/60"
                              style={{ height: `${Math.max(pct, 4)}%` }} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground border-t pt-3">
                      <span>Movement types: {
                        Object.values(stockMovements).reduce((acc: Set<string>, types: any) => {
                          Object.keys(types).forEach(t => acc.add(t));
                          return acc;
                        }, new Set<string>()).size
                      }</span>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center">
                    <PackageX className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No stock movement data</p>
                  </div>
                )}
              </div>
            </div>


          </motion.div>
        )}

        {/* ── Motel ── */}
        {activeTab === 'motel' && (
          <motion.div variants={pageTransitionFast} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Occupancy Rate', value: `${occupancyRate}%`, change: `${occupiedRooms}/${totalRooms} rooms occupied` },
                { label: 'Occupied Rooms', value: String(occupiedRooms), change: `Out of ${totalRooms} total` },
                { label: 'Available Rooms', value: String(totalRooms - occupiedRooms), change: `${Math.max(0, totalRooms - occupiedRooms)} ready for guests` },
                { label: 'Pending Revenue', value: formatCurrency(Math.round(pendingRevenue)), change: 'From active invoices' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-card p-5">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold">{stat.value}</p>
                  <p className="mt-1 text-xs text-emerald-500">{stat.change}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Occupancy Forecast (7 Days)">
                {occupancyForecast ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={occupancyForecast.forecast.slice(0, 7)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" tickFormatter={(v: string) => {
                        const d = new Date(v);
                        return DAY_NAMES[d.getDay()];
                      }} />
                      <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
                      <Area type="monotone" dataKey="occupancyRate" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-8 text-center">
                    <Calendar className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">Loading forecast...</p>
                  </div>
                )}
              </ChartCard>

              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-4 text-base font-semibold">Room Summary</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Occupied', value: occupiedRooms, color: 'bg-blue-500', pct: totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0 },
                    { label: 'Available', value: totalRooms - occupiedRooms, color: 'bg-emerald-500', pct: totalRooms > 0 ? ((totalRooms - occupiedRooms) / totalRooms) * 100 : 0 },
                    { label: 'Total Rooms', value: totalRooms, color: 'bg-muted', pct: 100 },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-medium">{item.value}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Staff ── */}
        {activeTab === 'staff' && (
          <motion.div variants={pageTransitionFast} className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-4 text-base font-semibold">Staff Performance</h3>
                {activeStaff && activeStaff.length > 0 ? (
                  <div className="space-y-4">
                    {(() => {
                      const roleGroups = (activeStaff ?? []).reduce<Record<string, typeof activeStaff>>((acc, s) => {
                        const role = s.role ?? 'staff';
                        if (!acc[role]) acc[role] = [];
                        acc[role].push(s);
                        return acc;
                      }, {});
                      const totalOrders = Object.values(staffOrderCounts ?? {}).reduce((s: number, c: any) => s + (c.total || 0), 0);
                      return Object.entries(roleGroups).map(([role, members]) => {
                        const roleOrders = Object.entries(staffOrderCounts ?? {})
                          .filter(([id]) => members.some(m => m.id === id))
                          .reduce((s: number, [, c]: [string, any]) => s + (c.total || 0), 0);
                        return (
                          <div key={role} className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium capitalize">{role}</p>
                              <p className="text-[10px] text-muted-foreground uppercase">{members.length} active</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">{roleOrders} orders</p>
                              <p className="text-[10px] text-muted-foreground">
                                {totalOrders > 0 ? ((roleOrders / totalOrders) * 100).toFixed(0) : 0}% share
                              </p>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No active staff</p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-4 text-base font-semibold">Role Distribution</h3>
                {staffRoles ? (
                  <div className="space-y-4">
                    {Object.entries(staffRoles).map(([role, count]: [string, any]) => {
                      const total = Object.values(staffRoles).reduce((s: number, c: any) => s + c, 0);
                      const pct = total > 0 ? (Number(count) / total) * 100 : 0;
                      return (
                        <div key={role}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-muted-foreground capitalize">{role}</span>
                            <span className="font-medium">{String(count)} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No role data</p>
                  </div>
                )}
              </div>
            </div>

            {/* Orders by Staff */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-4 text-base font-semibold">Orders by Staff</h3>
              {staffOrderCounts && Object.keys(staffOrderCounts).length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(() => {
                      const names: Record<string, string> = {};
                      (activeStaff ?? []).forEach((s: any) => { if (s.name) names[s.id] = s.name; });
                      return Object.entries(staffOrderCounts).map(([id, data]: [string, any]) => ({
                        name: names[id] ?? `Staff ${id.slice(0, 4)}`,
                        orders: data.total ?? 0,
                        revenue: data.revenue ?? 0,
                      }));
                    })()} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={80} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="orders" fill="#6366f1" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="py-8 text-center">
                  <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No staff order data</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>
    </Skeleton>
  );
}
