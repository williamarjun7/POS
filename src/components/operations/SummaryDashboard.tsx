import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  Hotel, User, CheckCircle2, Calendar, Sparkles, Wrench, X,
  Sofa, Users, CookingPot, Receipt, Zap,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────

export type TabId = "rooms" | "tables"

export interface RoomStats {
  total: number; occupied: number; vacant: number; available: number
  reserved: number; cleaning: number; dirty: number; outOfOrder: number
  disabled: number; housekeepingPending: number; maintenanceOpen: number; occupancyRate: number
}

export interface TableStats {
  total: number; occupied: number; available: number; reserved: number
  disabled: number; activeOrders: number; pendingBills: number
}

// ── Animation variants ───────────────────────────────────────

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
}

// ── Summary Stat Card ────────────────────────────────────────

function SummaryStatCard({
  icon: Icon, label, value, color, subtitle, progress, progressColor,
}: {
  icon: React.ElementType; label: string; value: number; color: string
  subtitle?: string; progress?: number; progressColor?: string
}) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      variants={shouldReduceMotion ? undefined : staggerItem}
      whileHover={shouldReduceMotion ? undefined : { y: -4, boxShadow: "0 12px 24px -8px rgba(0,0,0,0.15)" }}
      className="group relative flex flex-col h-full min-h-[130px] rounded-xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-foreground/10"
    >
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-background to-muted shadow-sm ring-1 ring-border/40">
          <Icon className={cn("h-4 w-4", color)} />
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center mt-3">
        <p className="text-2xl font-bold tracking-tight text-foreground">
          {value}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">{label}</p>
      </div>
      {progress !== undefined && (
        <div className="mt-auto pt-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground/50 mb-1">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className={cn("h-full rounded-full", progressColor ?? "bg-primary")}
            />
          </div>
        </div>
      )}
      {subtitle && (
        <p className="mt-2 text-[10px] text-muted-foreground/40">{subtitle}</p>
      )}
    </motion.div>
  )
}

// ── Summary Dashboard ────────────────────────────────────────

export function SummaryDashboard({ roomStats, tableStats, activeTab }: {
  roomStats: RoomStats; tableStats: TableStats; activeTab: TabId
}) {
  const shouldReduceMotion = useReducedMotion()

  const roomCards = (
    <>
      <SummaryStatCard icon={Hotel} label="Total Rooms" value={roomStats.total} color="text-blue-500" />
      <SummaryStatCard icon={User} label="Occupied" value={roomStats.occupied} color="text-primary" progress={roomStats.occupancyRate} progressColor="bg-primary" subtitle={`${roomStats.occupancyRate}% occupancy`} />
      <SummaryStatCard icon={CheckCircle2} label="Available" value={roomStats.available} color="text-emerald-500" />
      <SummaryStatCard icon={Calendar} label="Reserved" value={roomStats.reserved} color="text-amber-500" />
      <SummaryStatCard icon={Sparkles} label="Cleaning" value={roomStats.cleaning} color="text-cyan-500" subtitle={`HK: ${roomStats.housekeepingPending} pending`} />
      <SummaryStatCard icon={Wrench} label="Maintenance" value={roomStats.maintenanceOpen} color="text-orange-500" subtitle={`${roomStats.maintenanceOpen} open`} />
      <SummaryStatCard icon={X} label="Disabled" value={roomStats.disabled} color="text-red-500" />
    </>
  )

  const tableCards = (
    <>
      <SummaryStatCard icon={Sofa} label="Total Tables" value={tableStats.total} color="text-purple-500" />
      <SummaryStatCard icon={Users} label="Occupied" value={tableStats.occupied} color="text-primary" />
      <SummaryStatCard icon={CheckCircle2} label="Available" value={tableStats.available} color="text-emerald-500" />
      <SummaryStatCard icon={Calendar} label="Reserved" value={tableStats.reserved} color="text-amber-500" />
      <SummaryStatCard icon={CookingPot} label="Active Orders" value={tableStats.activeOrders} color="text-orange-500" />
      <SummaryStatCard icon={Receipt} label="Pending Bills" value={tableStats.pendingBills} color="text-red-500" />
      <SummaryStatCard icon={X} label="Disabled" value={tableStats.disabled} color="text-red-500" />
    </>
  )

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-foreground">
          {activeTab === "rooms" ? "Rooms Overview" : "Tables Overview"}
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Live</span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? false : { opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4"
        >
          {activeTab === "rooms" ? roomCards : tableCards}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
