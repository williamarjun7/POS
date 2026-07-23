import { useState, useMemo, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Download,
  FileSpreadsheet,
  FileText,
  Table,
  Search,
  TrendingUp,
  FileBarChart,
  Zap,
  Receipt,
} from "lucide-react"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { StatCard } from "@/components/ui/stat-card"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon-mapper"
import { showSuccess, showError } from "@/components/ui/toast"
import DateFilterBar, { type DateFilterState, getDateRange } from "@/components/filters/DateFilterBar"
import { cn, formatCurrency, formatTimeAgo } from "@/lib/utils"
import { insforge } from '@/lib/services/auth-service'
import { generateReport } from "@/lib/services/report-generator"
import { pageTransitionFast, staggerContainer } from "@/lib/animations/presets"

interface ReportCard {
  id: string
  title: string
  description: string
  icon: string
  category: string
  formats: ("PDF" | "Excel" | "CSV")[]
  lastGenerated: string
}

interface RecentActivity {
  id: string
  reportName: string
  format: string
  generatedBy: string
  timestamp: string
}

const reports: ReportCard[] = [
  { id: "1", title: "Daily Sales Report", description: "Complete breakdown of today's sales by category, channel, and payment method", icon: "ShoppingCart", category: "Sales Reports", formats: ["PDF", "Excel", "CSV"], lastGenerated: "2 hours ago" },
  { id: "2", title: "Weekly Sales Summary", description: "Week-over-week sales comparison with trend analysis", icon: "TrendingUp", category: "Sales Reports", formats: ["PDF", "Excel"], lastGenerated: "Yesterday" },
  { id: "3", title: "Monthly Sales Report", description: "Full monthly sales overview with category and item breakdown", icon: "BarChart3", category: "Sales Reports", formats: ["PDF", "Excel", "CSV"], lastGenerated: "3 days ago" },
  { id: "4", title: "Category-wise Sales", description: "Sales performance broken down by menu categories", icon: "PieChart", category: "Sales Reports", formats: ["PDF", "Excel"], lastGenerated: "1 day ago" },
  { id: "5", title: "Profit & Loss Statement", description: "Revenue, expenses, and net profit for any period", icon: "DollarSign", category: "Financial Reports", formats: ["PDF", "Excel"], lastGenerated: "5 days ago" },
  { id: "6", title: "Cash Flow Report", description: "Cash inflows and outflows with running balance", icon: "Wallet", category: "Financial Reports", formats: ["PDF", "Excel", "CSV"], lastGenerated: "2 days ago" },

  { id: "8", title: "Stock Status Report", description: "Current inventory levels with reorder alerts", icon: "Package", category: "Inventory Reports", formats: ["PDF", "Excel", "CSV"], lastGenerated: "4 hours ago" },
  { id: "9", title: "Consumption Report", description: "Ingredient usage vs sales to track waste and efficiency", icon: "Warehouse", category: "Inventory Reports", formats: ["PDF", "Excel"], lastGenerated: "6 hours ago" },
  { id: "10", title: "Top Customers Report", description: "Ranked list of highest spending customers", icon: "Users", category: "Customer Reports", formats: ["PDF", "Excel"], lastGenerated: "3 days ago" },
  { id: "11", title: "Room Occupancy Report", description: "Occupancy rates, room types, and revenue by room", icon: "Bed", category: "Motel Reports", formats: ["PDF", "Excel", "CSV"], lastGenerated: "Today" },

]

const formatIcons: Record<string, typeof FileText> = {
  PDF: FileText,
  Excel: FileSpreadsheet,
  CSV: Table,
}

const formatColors: Record<string, string> = {
  PDF: "text-red-500 bg-red-500/10",
  Excel: "text-emerald-500 bg-emerald-500/10",
  CSV: "text-blue-500 bg-blue-500/10",
}

const categoryColors: Record<string, string> = {
  "Sales Reports": "text-primary bg-primary/10",
  "Financial Reports": "text-success bg-success/10",
  "Inventory Reports": "text-warning bg-warning/10",
  "Customer Reports": "text-purple-500 bg-purple-500/10",
  "Motel Reports": "text-info bg-primary/10",
  "Tax Reports": "text-destructive bg-destructive/10",
}

// Using pageTransitionFast, staggerContainer, staggerItem from presets

export function Reports() {
  const [selectedCategory, setSelectedCategory] = useState<string>("All")
  const [searchQuery, setSearchQuery] = useState("")
  const [dateFilter, setDateFilter] = useState<DateFilterState>({
    preset: "this_month",
  })
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  // ─── Live database data ───────────────────────────────────
  const [todayRevenue, setTodayRevenue] = useState(0)
  const [todayPaymentCount, setTodayPaymentCount] = useState(0)
  const [totalInvoices, setTotalInvoices] = useState(0)
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([])
  const [monthlyPaymentCount, setMonthlyPaymentCount] = useState(0)
  const [lastActivityTime, setLastActivityTime] = useState<string>("N/A")
  const [pendingInvoices, setPendingInvoices] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayStr = todayStart.toISOString()
        const monthStart = new Date()
        monthStart.setDate(1)
        monthStart.setHours(0, 0, 0, 0)
        const monthStr = monthStart.toISOString()

        // Today's payments — date-constrained DB query
        const [paymentsRes, invoicesRes, activitiesRes] = await Promise.all([
          insforge.database
            .from('payments')
            .select('amount, created_at')
            .gte('created_at', todayStr),
          insforge.database
            .from('invoices')
            .select('status'),
          insforge.database
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20),
        ])

        if (paymentsRes.data) {
          const allTodayPayments = paymentsRes.data as Array<{ amount: number; created_at: string }>
          setTodayRevenue(allTodayPayments.reduce((sum, p) => sum + Number(p.amount), 0))
          setTodayPaymentCount(allTodayPayments.length)
        }

        // Fetch payments for this month separately (date-constrained)
        const { data: monthPayments } = await insforge.database
          .from('payments')
          .select('amount')
          .gte('created_at', monthStr)
        if (monthPayments) {
          setMonthlyPaymentCount(monthPayments.length)
        }

        // Invoices — date-constrained (count query)
        if (invoicesRes.data) {
          const allInvoices = invoicesRes.data as Array<{ status: string }>
          setTotalInvoices(allInvoices.length)
          setPendingInvoices(allInvoices.filter(i => i.status === 'pending' || i.status === 'partial').length)
        }

        // Activity logs — already limited to 20 via query
        if (activitiesRes.data) {
          const logs = activitiesRes.data as Array<any>
          setRecentActivities(
            logs.map((a, i) => ({
              id: a.id || `act-${i}`,
              reportName: a.entity_label || a.activity_type || 'System Activity',
              format: a.status || '-',
              generatedBy: a.user_name || 'System',
              timestamp: formatTimeAgo(a.created_at),
            }))
          )
          if (logs.length > 0) {
            setLastActivityTime(formatTimeAgo(logs[0].created_at))
          }
        }
      } catch (err) {
        console.error('Failed to load reports data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  const uniqueCategories = useMemo(() => ["All", ...new Set(reports.map((r) => r.category))], [])

  const filtered = useMemo(() => {
    return reports.filter((report) => {
      const matchesCategory = selectedCategory === "All" || report.category === selectedCategory
      const matchesSearch =
        searchQuery === "" ||
        report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.description.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [selectedCategory, searchQuery])

  const totalReports = reports.length

  const dateRange = getDateRange(dateFilter)

  const handleGenerate = async (report: ReportCard, format: string) => {
    const key = `${report.id}-${format}`
    setGeneratingId(key)
    try {
      await generateReport({
        reportId: report.id,
        reportTitle: report.title,
        format: format as 'PDF' | 'Excel' | 'CSV',
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      })
      showSuccess(`${report.title} generated as ${format}`)
    } catch {
      showError(`Failed to generate ${report.title} as ${format}`)
    } finally {
      setGeneratingId(null)
    }
  }

  const isGenerating = (reportId: string, format: string) => generatingId === `${reportId}-${format}`

  return (
    <PageTransition>
      <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-6">
        <motion.div variants={pageTransitionFast}>
          <PageHeader title="Reports" icon="FileBarChart" description="Generate and download business reports" />
        </motion.div>

        {/* Summary Stats */}
        <motion.div variants={pageTransitionFast} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <motion.div whileHover={{ y: -3, scale: 1.02 }}>
            <StatCard label="Total Reports" value={totalReports} icon="FileBarChart" color="text-primary" />
          </motion.div>
          <motion.div whileHover={{ y: -3, scale: 1.02 }}>
            <StatCard label="Today's Revenue" value={formatCurrency(todayRevenue)} icon="DollarSign" color="text-success" />
          </motion.div>
          <motion.div whileHover={{ y: -3, scale: 1.02 }}>
            <StatCard label="Total Invoices" value={String(totalInvoices)} icon="Receipt" color="text-warning" className="truncate" />
          </motion.div>
          <motion.div whileHover={{ y: -3, scale: 1.02 }}>
            <StatCard label="Last Activity" value={lastActivityTime} icon="Clock" color="text-purple-500" />
          </motion.div>
        </motion.div>

        {/* Filters */}
        <motion.div variants={pageTransitionFast} className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search reports..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {uniqueCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          <DateFilterBar filter={dateFilter} dateRange={getDateRange(dateFilter)} onChange={setDateFilter} />
        </motion.div>

        {/* Report Cards Grid */}
        <motion.div variants={pageTransitionFast} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((report, i) => (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.25 }}
              whileHover={{ y: -4, scale: 1.02 }}
              className="group flex flex-col rounded-xl border border-border bg-card/80 backdrop-blur-sm p-5 transition-all hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="mb-3 flex items-start justify-between">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    categoryColors[report.category] ?? "text-muted-foreground bg-muted"
                  )}
                >
                  <Icon name={report.icon} className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {report.category}
                </span>
              </div>

              <h4 className="mb-1 text-sm font-semibold text-foreground">{report.title}</h4>
              <p className="mb-1 text-xs leading-relaxed text-muted-foreground">{report.description}</p>
              <p className="mb-4 text-[10px] text-muted-foreground">Last generated: {report.lastGenerated}</p>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1.5">
                  {report.formats.map((fmt) => {
                    const FormatIcon = formatIcons[fmt]
                    const loading = isGenerating(report.id, fmt)
                    return (
                      <button
                        key={fmt}
                        onClick={() => handleGenerate(report, fmt)}
                        disabled={loading}
                        className={cn(
                          "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all hover:opacity-80 disabled:opacity-50",
                          formatColors[fmt]
                        )}
                      >
                        {loading ? (
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <FormatIcon className="h-3 w-3" />
                        )}
                        {fmt}
                      </button>
                    )
                  })}
                </div>
                <Button
                  size="sm"
                  onClick={() => handleGenerate(report, report.formats[0])}
                  disabled={isGenerating(report.id, report.formats[0])}
                  className="h-7 gap-1.5 px-3 text-xs"
                >
                  {isGenerating(report.id, report.formats[0]) ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Quick Generate
                </Button>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {filtered.length === 0 && (            <motion.div variants={pageTransitionFast} className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16">
            <FileBarChart className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">No reports match your filters</p>
          </motion.div>
        )}

        {/* Recent Activity */}
        <motion.div variants={pageTransitionFast} className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            >
              <Zap className="h-4 w-4 text-primary" />
            </motion.div>
            <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
            {loading && <span className="ml-auto h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
          </div>
          <div className="overflow-x-auto">
            {recentActivities.length === 0 && !loading ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No recent activity recorded yet.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="pb-2 font-medium">Activity</th>
                    <th className="pb-2 font-medium">Details</th>
                    <th className="pb-2 font-medium">User</th>
                    <th className="pb-2 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentActivities.map((item, idx) => (
                    <motion.tr 
                      key={item.id} 
                      className="text-foreground"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      whileHover={{ backgroundColor: 'rgba(var(--color-muted), 0.5)' }}
                    >
                      <td className="py-2.5 font-medium">{item.reportName}</td>
                      <td className="py-2.5">
                        <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium", formatColors[item.format] || "text-muted-foreground bg-muted")}>
                          {item.format}
                        </span>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{item.generatedBy}</td>
                      <td className="py-2.5 text-muted-foreground">{item.timestamp}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>

        {/* Quick Stats */}
        <motion.div variants={pageTransitionFast} className="grid gap-4 sm:grid-cols-3">
          <motion.div 
            whileHover={{ y: -3, scale: 1.02 }}
            className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5 shadow-sm"
          >
            <div className="mb-2 flex items-center gap-2">
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <TrendingUp className="h-4 w-4 text-primary" />
              </motion.div>
              <span className="text-xs font-medium text-muted-foreground">Today's Revenue</span>
            </div>
            <p className="text-lg font-bold text-foreground">{formatCurrency(todayRevenue)}</p>
            <p className="text-[10px] text-muted-foreground">{todayPaymentCount} payment{todayPaymentCount !== 1 ? 's' : ''} today</p>
          </motion.div>
          <motion.div 
            whileHover={{ y: -3, scale: 1.02 }}
            className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5 shadow-sm"
          >
            <div className="mb-2 flex items-center gap-2">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Download className="h-4 w-4 text-success" />
              </motion.div>
              <span className="text-xs font-medium text-muted-foreground">Payments This Month</span>
            </div>
            <p className="text-lg font-bold text-foreground">{monthlyPaymentCount}</p>
            <p className="text-[10px] text-muted-foreground">Across all payment methods</p>
          </motion.div>
          <motion.div 
            whileHover={{ y: -3, scale: 1.02 }}
            className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5 shadow-sm"
          >
            <div className="mb-2 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-warning" />
              <span className="text-xs font-medium text-muted-foreground">Pending Invoices</span>
            </div>
            <p className="text-lg font-bold text-foreground">{pendingInvoices}</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <motion.div 
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
                initial={{ width: 0 }}
                animate={{ width: totalInvoices > 0 ? `${(pendingInvoices / totalInvoices) * 100}%` : '0%' }}
                transition={{ delay: 0.5, duration: 1, ease: "easeOut" }}
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">of {totalInvoices} total invoices</p>
          </motion.div>
        </motion.div>
      </motion.div>
    </PageTransition>
  )
}
