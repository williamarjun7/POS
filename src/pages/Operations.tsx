import { useState, useMemo, useCallback, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { PageTransition } from "@/components/ui/PageTransition"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { formatCurrency, formatTimeAgo, cn } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { logActivitySafe } from "@/lib/services/activity-log-service"
import { BookingFormModal } from "@/components/rooms/BookingFormModal"
import { useBookings } from "@/lib/services/booking-service"
import { useOperationsData } from "../lib/hooks/useOperationsData"
import type { Room, RoomStatus, HousekeepingTask, MaintenanceRequest } from "@/types"
import type { Booking } from "@/lib/services/booking-service"
import {
  useCreateRoom,
  useUpdateRoom,
  useDeleteRoom,
  useCreateTable,
  useUpdateTable,
  useDeleteTable,
  useCreateMaintenanceRequest,
  useUpdateRoomStatus,
} from "../lib/hooks"
import { updateTable as updateTableOp, releaseTable as releaseTableOp } from "../lib/db/operations"
import { useQueryClient } from '@tanstack/react-query'
import { invalidateOperationsData } from '../lib/hooks/useOperationsData'
import {
  Search, Plus, BedDouble, LayoutGrid, List,
  Sofa, RefreshCw, Clock, SlidersHorizontal,
  Building2, X,
} from "lucide-react"
import { RequirePermission } from "@/lib/core/PermissionGuards"

// ── Import extracted components ──────────────────────────────

import { SummaryDashboard } from "@/components/operations/SummaryDashboard"
import type { RoomStats, TableStats, TabId } from "@/components/operations/SummaryDashboard"
import { RoomCard } from "@/components/operations/RoomCard"
import { RoomCheckoutDialog } from "@/components/operations/RoomCheckoutDialog"
import { RoomFolio } from "@/components/operations/RoomFolio"
import { TableCard } from "@/components/operations/TableCard"
import {
  RoomFormModal, TableFormModal, MaintenanceFormModal, HousekeepingAssignModal,
} from "@/components/operations/ModalForms"

// ═══════════════════════════════════════════════════════════════
//  1. TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════

type ViewMode = "grid" | "table"

// ── Animation variants ───────────────────────────────────────

const staggerContainer = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.08 } },
}

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
}

const tabVariants = {
  enter: { opacity: 1, x: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15, ease: "easeIn" as const } },
}

// ═══════════════════════════════════════════════════════════════
//  2. (helpers imported from @/lib/utils)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  3. PREMIUM OPERATIONS HEADER
// ═══════════════════════════════════════════════════════════════

function OperationsHeader({ lastUpdated, onRefresh, refreshing }: {
  lastUpdated: string
  refreshing: boolean
  onRefresh: () => void
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState("")

  return (
    <div className="mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
            className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10"
          >
            <Building2 className="h-6 w-6 text-primary" />
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
          </motion.div>
          <div>
            <motion.h1
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              className="text-2xl font-bold tracking-tight text-foreground"
            >
              Operations
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                All systems operational
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                <Clock className="h-3 w-3" />
                Updated {formatTimeAgo(lastUpdated)}
              </span>
            </motion.p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Global Search */}
          <div className="relative">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSearchOpen(!searchOpen)}
              className={cn(
                "flex items-center gap-2 rounded-xl border bg-background px-3.5 py-2 text-sm transition-all",
                searchOpen
                  ? "border-primary shadow-[0_0_0_3px] shadow-primary/10"
                  : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
              )}
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search rooms & tables...</span>
              <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline">⌘K</kbd>
            </motion.button>
            <AnimatePresence>
              {searchOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
                >
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                    <input type="text" autoFocus placeholder="Search by room, table, guest..." value={globalSearch}
                      onChange={(e) => setGlobalSearch(e.target.value)}
                      className="h-11 w-full border-0 bg-transparent pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/40" />
                  </div>
                  <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground/50">
                    Type a room number, guest name, or table to search
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Refresh Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={onRefresh}
            disabled={refreshing}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </motion.button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  4. ROOMS VIEW
// ═══════════════════════════════════════════════════════════════

function RoomsView({
  rooms, hkTasks, mtRequests, roomTypeOptions,
}: {
  rooms: Room[]; hkTasks: HousekeepingTask[]; mtRequests: MaintenanceRequest[]
  roomTypeOptions: { value: string; label: string }[]
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [floorFilter, setFloorFilter] = useState<string>("all")
  const [hkFilter, setHkFilter] = useState<string>("all")
  const [mtFilter, setMtFilter] = useState<string>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [sortBy, setSortBy] = useState<string>("number")

  const [showRoomForm, setShowRoomForm] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [deletingRoom, setDeletingRoom] = useState<Room | null>(null)
  const [bookingRoom, setBookingRoom] = useState<Room | null>(null)
  const [checkoutRoom, setCheckoutRoom] = useState<Room | null>(null)
  const [checkoutBooking, setCheckoutBooking] = useState<Booking | null>(null)
  const [folioRoom, setFolioRoom] = useState<Room | null>(null)
  const [folioBooking, setFolioBooking] = useState<Booking | null>(null)
  const [releaseConfirmRoom, setReleaseConfirmRoom] = useState<Room | null>(null)
  const [showHKForm, setShowHKForm] = useState(false)
  const [showMTForm, setShowMTForm] = useState(false)
  const [,setMtFormRoom] = useState<Room | null>(null)

  const createRoom = useCreateRoom()
  const updateRoom = useUpdateRoom()
  const deleteRoom = useDeleteRoom()
  const queryClient = useQueryClient()
  const updateRoomStatus = useUpdateRoomStatus()
  const createMT = useCreateMaintenanceRequest()
  const isSavingRoom = createRoom.isPending || updateRoom.isPending
  const floors = useMemo(() => [...new Set(rooms.map(r => r.floor))].sort(), [rooms])

  const { activeBookings, cancelBooking } = useBookings()

  const hkByRoom = useMemo(() => {
    const map = new Map<string, HousekeepingTask>()
    hkTasks.forEach(t => map.set(t.roomNumber, t))
    return map
  }, [hkTasks])

  const mtByRoom = useMemo(() => {
    const map = new Map<string, MaintenanceRequest>()
    mtRequests.forEach(r => map.set(r.roomNumber, r))
    return map
  }, [mtRequests])

  const filteredRooms = useMemo(() => {
    let result = [...rooms]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r =>
        (r.room_number || r.number).toLowerCase().includes(q) ||
        (r.guest && r.guest.toLowerCase().includes(q))
      )
    }
    if (statusFilter !== "all") result = result.filter(r => r.status === statusFilter)
    if (floorFilter !== "all") result = result.filter(r => r.floor === parseInt(floorFilter))
    if (hkFilter !== "all") {
      result = result.filter(r => {
        const task = hkByRoom.get(r.room_number || r.number)
        if (hkFilter === "none") return !task
        return task?.status === hkFilter
      })
    }
    if (mtFilter !== "all") {
      result = result.filter(r => {
        const req = mtByRoom.get(r.room_number || r.number)
        if (mtFilter === "none") return !req
        return req?.status === mtFilter
      })
    }
    result.sort((a, b) => {
      switch (sortBy) {
        case "number": return (a.room_number || a.number).localeCompare(b.room_number || b.number, undefined, { numeric: true })
        case "floor": return a.floor - b.floor
        case "status": return a.status.localeCompare(b.status)
        case "price": return (a.pricePerNight || 0) - (b.pricePerNight || 0)
        default: return 0
      }
    })
    return result
  }, [rooms, searchQuery, statusFilter, floorFilter, hkFilter, mtFilter, sortBy, hkByRoom, mtByRoom])

  const navigate2 = useNavigate()

  const handleRoomAction = useCallback(async (room: Room, action: string) => {
    switch (action) {
      case "reserve":
      case "checkin":
        setBookingRoom(room); break
      case "folio":
        // Show the room folio
        const folioRoomBooking = activeBookings.find(b => b.roomId === room.id)
        setFolioBooking(folioRoomBooking ?? null)
        setFolioRoom(room)
        break
      case "checkout":
        // Find the booking for this room to show in checkout dialog
        const checkoutRoomBooking = activeBookings.find(b => b.roomId === room.id)
        setCheckoutBooking(checkoutRoomBooking ?? null)
        setCheckoutRoom(room)
        break
      case "openpos":
        navigate2(`/pos?room=${room.id}`)
        break
      case "cancelreservation":
        try {
          // Cancel the actual booking record — this also frees the room
          const roomBooking = activeBookings.find(b => b.roomId === room.id)
          if (roomBooking) {
            await cancelBooking(roomBooking.id)
          } else {
            // No booking record found — free the room directly
            await updateRoomStatus.mutateAsync({ id: room.id, status: "vacant" })
          }
          logActivitySafe({ activityType: "booking_cancelled", entityId: room.id, entityLabel: `Room ${room.room_number || room.number}`, status: "vacant" })
          showSuccess(`Reservation for Room ${room.room_number || room.number} cancelled`)
        } catch (err) { showError((err as Error)?.message || "Failed to cancel reservation") }
        break
      case "release":
        setReleaseConfirmRoom(room)
        break
      case "markclean":
        try {
          await updateRoomStatus.mutateAsync({ id: room.id, status: "vacant" })
          showSuccess(`Room ${room.room_number || room.number} marked clean`)
        } catch (err) { showError((err as Error)?.message || "Failed to update") }
        break
      case "edit":
        setEditingRoom(room); setShowRoomForm(true); break
      case "hk":
        setShowHKForm(true); break
      case "mt":
        setMtFormRoom(room); setShowMTForm(true); break
      case "clean":
        try {
          await updateRoomStatus.mutateAsync({ id: room.id, status: room.status === "dirty" ? "cleaning" : "vacant" })
          showSuccess(`Room ${room.room_number || room.number} marked as cleaning`)
        } catch (err) { showError((err as Error)?.message || "Failed to update") }
        break
      case "details":
        showSuccess(`Room ${room.room_number || room.number} — ${room.type || ''}`); break
      case "toggle":
        const newStatus: RoomStatus = room.status === "out_of_order" ? "vacant" : "out_of_order"
        try {
          await updateRoomStatus.mutateAsync({ id: room.id, status: newStatus })
          logActivitySafe({ activityType: "room_status_change", entityId: room.id, entityLabel: `Room ${room.room_number || room.number}`, status: newStatus })
          showSuccess(`Room ${room.room_number || room.number} ${newStatus === "out_of_order" ? "disabled" : "enabled"}`)
        } catch (err) { showError((err as Error)?.message || "Failed to update status") }
        break
      case "bookings":
      case "history":
      case "editbooking":
      case "extend":
        showSuccess(`${action.replace(/_/g, " ")} feature coming soon`); break
    }
  }, [updateRoomStatus, logActivitySafe, navigate2, activeBookings, cancelBooking])

  const handleSaveRoom = useCallback(async (data: Omit<Room, "id"> & { id?: string }) => {
    try {
      if (data.id) {
        await updateRoom.mutateAsync({ id: data.id, room_number: data.number, floor: data.floor, price_per_night: data.price || 0, amenities: data.amenities })
        showSuccess(`Room ${data.number} updated`)
      } else {
        await createRoom.mutateAsync({ room_number: data.number, floor: data.floor, price_per_night: data.price || 3500, amenities: data.amenities || [] })
        showSuccess(`Room ${data.number} added`)
      }
      setShowRoomForm(false)
      setEditingRoom(null)
    } catch (err) { showError((err as Error)?.message || "Failed to save room") }
  }, [createRoom, updateRoom])

  const handleDeleteRoom = useCallback(async () => {
    if (!deletingRoom) return
    try {
      await deleteRoom.mutateAsync({ id: deletingRoom.id })
      showSuccess(`Room ${deletingRoom.room_number || deletingRoom.number} deleted`)
      setDeletingRoom(null)
    } catch (err) { showError((err as Error)?.message || "Failed to delete room") }
  }, [deletingRoom, deleteRoom])

  const handleReleaseRoom = useCallback(async () => {
    if (!releaseConfirmRoom) return
    try {
      await updateRoomStatus.mutateAsync({ id: releaseConfirmRoom.id, status: "vacant" })
      logActivitySafe({ activityType: "room_released", entityId: releaseConfirmRoom.id, entityLabel: `Room ${releaseConfirmRoom.room_number || releaseConfirmRoom.number}`, status: "vacant" })
      showSuccess(`Room ${releaseConfirmRoom.room_number || releaseConfirmRoom.number} released to available`)
      setReleaseConfirmRoom(null)
    } catch (err) { showError((err as Error)?.message || "Failed to release room") }
  }, [releaseConfirmRoom, updateRoomStatus])

  const handleCreateMT = useCallback(async (data: { room_number: string; description: string; priority: string }) => {
    try {
      await createMT.mutateAsync({ room_number: data.room_number, description: data.description, priority: data.priority, reported_by: "System" })
      showSuccess(`Maintenance request created for Room ${data.room_number}`)
    } catch (err) { showError((err as Error)?.message || "Failed to create request") }
  }, [createMT])

  const isFiltered = searchQuery || statusFilter !== "all" || floorFilter !== "all" || hkFilter !== "all" || mtFilter !== "all"

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
            <input type="text" placeholder="Search room or guest..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:shadow-[0_0_0_3px] focus:shadow-primary/5" />
          </div>
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-3 w-3 text-muted-foreground/40" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs outline-none transition-colors focus:border-primary/50 text-muted-foreground">
              <option value="all">All Status</option>
              {["vacant", "occupied", "reserved", "cleaning", "maintenance", "dirty", "out_of_order"].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ")}</option>
              ))}
            </select>
            <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs outline-none transition-colors focus:border-primary/50 text-muted-foreground">
              <option value="all">All Floors</option>
              {floors.map(f => <option key={f} value={f}>Floor {f}</option>)}
            </select>
            <select value={hkFilter} onChange={(e) => setHkFilter(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs outline-none transition-colors focus:border-primary/50 text-muted-foreground">
              <option value="all">All HK</option>
              <option value="none">No HK Task</option>
              <option value="pending">HK Pending</option>
              <option value="in_progress">HK In Progress</option>
              <option value="completed">HK Completed</option>
            </select>
            <select value={mtFilter} onChange={(e) => setMtFilter(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs outline-none transition-colors focus:border-primary/50 text-muted-foreground">
              <option value="all">All MT</option>
              <option value="none">No Issues</option>
              <option value="open">MT Open</option>
              <option value="in_progress">MT In Progress</option>
              <option value="resolved">MT Resolved</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs outline-none transition-colors focus:border-primary/50 text-muted-foreground">
              <option value="number">Sort: Number</option>
              <option value="floor">Sort: Floor</option>
              <option value="status">Sort: Status</option>
              <option value="price">Sort: Price</option>
            </select>
          </div>
          {isFiltered && (
            <motion.button initial={{ scale: 0.8 }} animate={{ scale: 1 }}
              onClick={() => { setSearchQuery(""); setStatusFilter("all"); setFloorFilter("all"); setHkFilter("all"); setMtFilter("all") }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-muted transition-colors">
              <X className="h-3 w-3" /> Clear
            </motion.button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-border bg-background p-0.5">
            <button onClick={() => setViewMode("grid")}
              className={cn("rounded-lg p-1.5 transition-all", viewMode === "grid" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode("table")}
              className={cn("rounded-lg p-1.5 transition-all", viewMode === "table" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
          <RequirePermission permission="operations.manage">
            <Button size="sm" onClick={() => { setEditingRoom(null); setShowRoomForm(true) }}>
              <Plus className="h-4 w-4 mr-1" /> Add Room
            </Button>
          </RequirePermission>
        </div>
      </div>

      {/* Room Grid/Table */}
      <AnimatePresence mode="wait">
        {viewMode === "grid" ? (
          <motion.div key="grid" initial="hidden" animate="visible" exit="exit" variants={staggerContainer}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredRooms.length === 0 ? (
              <motion.div variants={staggerItem} className="col-span-full flex flex-col items-center justify-center py-16">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-muted/50">
                  <BedDouble className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-foreground">No rooms found</p>
                <p className="mt-1 text-xs text-muted-foreground/50">{searchQuery ? `No results matching "${searchQuery}"` : "Try adjusting your filters"}</p>
              </motion.div>
            ) : (
              filteredRooms.map((room) => (
                <RoomCard key={room.id} room={room}
                  hkTask={hkByRoom.get(room.room_number || room.number)}
                  mtReq={mtByRoom.get(room.room_number || room.number)}
                  onAction={handleRoomAction} />
              ))
            )}
          </motion.div>
        ) : (
          <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="overflow-hidden rounded-xl border border-border/60">
            <div className="grid grid-cols-[70px_1fr_100px_80px_100px_100px_80px] gap-2 border-b border-border bg-muted/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              <span>Room</span><span>Type / Guest</span><span>Status</span><span>Floor</span><span>HK Status</span><span>MT Status</span><span className="text-right">Price</span>
            </div>
            {filteredRooms.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground/50">No rooms found</div>
            ) : (
              filteredRooms.map((room, idx) => (
                <motion.div key={room.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.015 }}
                  className="grid grid-cols-[70px_1fr_100px_80px_100px_100px_80px] gap-2 border-b border-border px-4 py-3 text-sm transition-colors last:border-0 hover:bg-muted/20 items-center">
                  <span className="font-semibold text-foreground">{room.room_number || room.number}</span>
                  <div className="min-w-0">
                    <span className="text-foreground text-xs font-medium">{room.type}</span>
                    {room.guest && <p className="text-[10px] text-muted-foreground/60 truncate">{room.guest}</p>}
                  </div>
                  <RoomStatusBadgeInline status={room.status} />
                  <span className="text-xs text-muted-foreground/70">Floor {room.floor}</span>
                  <div>{hkBadge(room)}</div>
                  <div>{mtBadge(room)}</div>
                  <span className="text-right text-xs font-medium text-foreground/80">Rs.{room.pricePerNight?.toLocaleString() || "—"}</span>
                </motion.div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <RoomFormModal open={showRoomForm} room={editingRoom} roomTypeOptions={roomTypeOptions} onSave={handleSaveRoom} onClose={() => { setShowRoomForm(false); setEditingRoom(null) }} isSubmitting={isSavingRoom} existingRooms={rooms.map(r => ({ id: r.id, number: r.number || r.room_number || '' }))} />
      {bookingRoom && <BookingFormModal room={bookingRoom} onClose={() => setBookingRoom(null)} />}
      {/* ── Folio Dialog ── */}
      {folioRoom && (
        <RoomFolio
          room={folioRoom}
          booking={folioBooking}
          onClose={() => { setFolioRoom(null); setFolioBooking(null) }}
          onCheckout={(room, booking) => {
            // Transition from folio to checkout
            setFolioRoom(null)
            setFolioBooking(null)
            setCheckoutBooking(booking ?? folioBooking)
            setCheckoutRoom(room)
          }}
        />
      )}

      {/* ── Checkout Dialog ── */}
      {checkoutRoom && (
        <RoomCheckoutDialog
          room={checkoutRoom}
          booking={checkoutBooking}
          onClose={() => { setCheckoutRoom(null); setCheckoutBooking(null) }}
          onComplete={() => {
            invalidateOperationsData(queryClient)
            setCheckoutRoom(null)
            setCheckoutBooking(null)
          }}
        />
      )}
      <HousekeepingAssignModal open={showHKForm} rooms={rooms} onSave={async (data) => {
        showSuccess(`Housekeeping assigned to ${data.assigned_to} for Room ${data.room_number}`)
      }} onClose={() => setShowHKForm(false)} />
      <MaintenanceFormModal open={showMTForm} onSave={handleCreateMT} onClose={() => { setShowMTForm(false); setMtFormRoom(null) }} />
      <ConfirmDialog open={!!deletingRoom} title="Delete Room" message={`Delete Room ${deletingRoom?.room_number || deletingRoom?.number}?`} confirmLabel="Delete" variant="danger" onConfirm={handleDeleteRoom} onCancel={() => setDeletingRoom(null)} />
      {/* Release confirmation — separate warning box + dialog because ConfirmDialog.message only accepts a string */}
      {releaseConfirmRoom && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setReleaseConfirmRoom(null)}>
          <div className="w-full max-w-sm rounded-2xl border bg-card shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">Release Room — Are you sure?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  This will release <strong>Room {releaseConfirmRoom.room_number || releaseConfirmRoom.number}</strong>
                  {releaseConfirmRoom.guest && <> ({releaseConfirmRoom.guest})</>} to <strong>Available</strong>.
                </p>
              </div>

              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 p-3.5">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-1.5">
                  ⚠️ Warning
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400/90 leading-relaxed">
                  This bypasses the normal checkout flow. The guest's outstanding charges will <strong>not</strong> be
                  settled, no invoice will be generated, and no payment will be collected. Use the{' '}
                  <strong>Checkout</strong> button for proper billing.
                </p>
              </div>

              <p className="text-xs text-muted-foreground/60">This action cannot be undone.</p>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={() => setReleaseConfirmRoom(null)}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-all">
                  Cancel
                </button>
                <button onClick={handleReleaseRoom}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition-all shadow-sm active:scale-95">
                  Yes, Release Room
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )

  function RoomStatusBadgeInline({ status }: { status: RoomStatus }) {
    const colors: Record<string, string> = {
      occupied: "bg-primary/10 text-primary border-primary/20",
      vacant: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      available: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      reserved: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      cleaning: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
      maintenance: "bg-orange-500/10 text-orange-500 border-orange-500/20",
      dirty: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      out_of_order: "bg-red-500/10 text-red-500 border-red-500/20",
    }
    return (
      <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium border", colors[status] ?? "bg-muted text-muted-foreground")}>
        {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")}
      </span>
    )
  }

  const hkStyle = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-amber-500/15 text-amber-500 border-amber-500/20",
      in_progress: "bg-blue-500/15 text-blue-500 border-blue-500/20",
      completed: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
    }
    return colors[status] ?? "bg-muted text-muted-foreground border-border"
  }
  const mtStyle = (status: string) => {
    const colors: Record<string, string> = {
      open: "bg-red-500/15 text-red-500 border-red-500/20",
      assigned: "bg-orange-500/15 text-orange-500 border-orange-500/20",
      in_progress: "bg-blue-500/15 text-blue-500 border-blue-500/20",
      resolved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
      closed: "bg-muted text-muted-foreground border-border",
    }
    return colors[status] ?? "bg-muted text-muted-foreground border-border"
  }

  function hkBadge(room: Room) {
    const t = hkByRoom.get(room.room_number || room.number)
    return t ? (
      <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium", hkStyle(t.status))}>
        {t.status.replace(/_/g, " ")}
      </span>
    ) : (
      <span className="text-[10px] text-muted-foreground/30">—</span>
    )
  }

  function mtBadge(room: Room) {
    const r = mtByRoom.get(room.room_number || room.number)
    return r ? (
      <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium", mtStyle(r.status))}>
        {r.status}
      </span>
    ) : (
      <span className="text-[10px] text-muted-foreground/30">—</span>
    )
  }
}

// ═══════════════════════════════════════════════════════════════
//  5. TABLES VIEW
// ═══════════════════════════════════════════════════════════════

function TablesView({ tables }: { tables: any[] }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [sectionFilter, setSectionFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [capacityFilter, setCapacityFilter] = useState<string>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [sortBy, setSortBy] = useState<string>("number")

  const [showTableForm, setShowTableForm] = useState(false)
  const [editingTable, setEditingTable] = useState<any | null>(null)
  const [deletingTable, setDeletingTable] = useState<any | null>(null)

  const createTable = useCreateTable()
  const updateTable = useUpdateTable()
  const deleteTable = useDeleteTable()
  const isSavingTable = createTable.isPending || updateTable.isPending

  const sections = useMemo(() => [...new Set(tables.map(t => t.area || t.section || "Main"))], [tables])

  const filteredTables = useMemo(() => {
    let result = [...tables]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t => (t.table_number || t.number || "").toLowerCase().includes(q))
    }
    if (sectionFilter !== "all") result = result.filter(t => (t.area || t.section || "Main") === sectionFilter)
    if (statusFilter !== "all") result = result.filter(t => t.status === statusFilter)
    if (capacityFilter !== "all") result = result.filter(t => t.capacity >= parseInt(capacityFilter))
    result.sort((a, b) => {
      switch (sortBy) {
        case "number": return (a.table_number || a.number || "").localeCompare(b.table_number || b.number || "", undefined, { numeric: true })
        case "capacity": return (a.capacity || 0) - (b.capacity || 0)
        case "status": return (a.status || "").localeCompare(b.status || "")
        default: return 0
      }
    })
    return result
  }, [tables, searchQuery, sectionFilter, statusFilter, capacityFilter, sortBy])

  const queryClient = useQueryClient()

  const handleTableAction = useCallback(async (table: any, action: string) => {
    switch (action) {
      case "edit": setEditingTable(table); setShowTableForm(true); break
      case "delete": setDeletingTable(table); break
      case "enable":
        try {
          await updateTableOp({ id: table.id, status: 'available' })
          showSuccess(`Table ${table.table_number || table.number} enabled`)
          invalidateOperationsData(queryClient)
        } catch (err) { showError((err as Error)?.message || "Failed to enable table") }
        break
      case "disable":
        try {
          await updateTableOp({ id: table.id, status: 'disabled' })
          showSuccess(`Table ${table.table_number || table.number} disabled`)
          invalidateOperationsData(queryClient)
        } catch (err) { showError((err as Error)?.message || "Failed to disable table") }
        break
      case "open":
        break
      case "reserve":
        break
      case "release":
        try {
          // 1. Cancel active batches + reset table via the single-table release function.
          //    This properly cancels all non-paid, non-cancelled order batches and their
          //    items, then resets the table to 'available' — preventing fetchDashboardTables()
          //    from still deriving the status as 'occupied' from leftover batches.
          await releaseTableOp({ id: table.id })

          // 2. Immediately update local cache so the UI reflects the change right away
          queryClient.setQueryData(['operations', 'all'], (old: any) => {
            if (!old) return old
            return {
              ...old,
              tables: (old.tables ?? []).map((t: any) =>
                t.id === table.id ? { ...t, status: 'available', running_total: undefined } : t
              ),
            }
          })

          showSuccess(`Table ${table.table_number || table.number} released`)

          // 3. Invalidate to ensure future refetches get fresh data
          invalidateOperationsData(queryClient)
        } catch (err) {
          showError((err as Error)?.message || "Failed to release table")
        }
        break
      case "transfer":
      case "split":
        showSuccess(`${action.replace(/_/g, " ")} feature coming soon`); break
    }
  }, [queryClient])

  const handleSaveTable = useCallback(async (data: any) => {
    try {
      if (data.id) {
        await updateTable.mutateAsync({ id: data.id, table_number: data.table_number, capacity: data.capacity, section: data.section, status: data.status })
        showSuccess(`Table ${data.table_number} updated`)
      } else {
        await createTable.mutateAsync({ table_number: data.table_number, capacity: data.capacity, section: data.section, status: data.status })
        showSuccess(`Table ${data.table_number} added`)
      }
      setShowTableForm(false)
      setEditingTable(null)
    } catch (err) { showError((err as Error)?.message || "Failed to save table") }
  }, [createTable, updateTable])

  const handleDeleteTable = useCallback(async () => {
    if (!deletingTable) return
    try {
      await deleteTable.mutateAsync({ id: deletingTable.id })
      showSuccess(`Table ${deletingTable.table_number || deletingTable.number} deleted`)
      setDeletingTable(null)
    } catch (err) { showError((err as Error)?.message || "Failed to delete table") }
  }, [deletingTable, deleteTable])

  const isFiltered = searchQuery || sectionFilter !== "all" || statusFilter !== "all" || capacityFilter !== "all"

  const groupedBySection = useMemo(() => {
    const groups = new Map<string, any[]>()
    filteredTables.forEach(t => {
      const section = t.area || t.section || "Main"
      if (!groups.has(section)) groups.set(section, [])
      groups.get(section)!.push(t)
    })
    return groups
  }, [filteredTables])

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
            <input type="text" placeholder="Search tables..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:shadow-[0_0_0_3px] focus:shadow-primary/5" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs outline-none focus:border-primary/50 text-muted-foreground">
            <option value="all">All Status</option>
            {["available", "occupied", "reserved", "cleaning", "maintenance", "disabled"].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}
            className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs outline-none focus:border-primary/50 text-muted-foreground">
            <option value="all">All Sections</option>
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={capacityFilter} onChange={(e) => setCapacityFilter(e.target.value)}
            className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs outline-none focus:border-primary/50 text-muted-foreground">
            <option value="all">Any Size</option>
            <option value="2">2+ seats</option>
            <option value="4">4+ seats</option>
            <option value="6">6+ seats</option>
            <option value="8">8+ seats</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs outline-none focus:border-primary/50 text-muted-foreground">
            <option value="number">Sort: Number</option>
            <option value="capacity">Sort: Capacity</option>
            <option value="status">Sort: Status</option>
          </select>
          {isFiltered && (
            <motion.button initial={{ scale: 0.8 }} animate={{ scale: 1 }}
              onClick={() => { setSearchQuery(""); setSectionFilter("all"); setStatusFilter("all"); setCapacityFilter("all") }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-muted transition-colors">
              <X className="h-3 w-3" /> Clear
            </motion.button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-border bg-background p-0.5">
            <button onClick={() => setViewMode("grid")}
              className={cn("rounded-lg p-1.5 transition-all", viewMode === "grid" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode("table")}
              className={cn("rounded-lg p-1.5 transition-all", viewMode === "table" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
          <RequirePermission permission="operations.manage">
            <Button size="sm" onClick={() => { setEditingTable(null); setShowTableForm(true) }}>
              <Plus className="h-4 w-4 mr-1" /> Add Table
            </Button>
          </RequirePermission>
        </div>
      </div>

      {/* Section Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => setSectionFilter("all")}
          className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", sectionFilter === "all" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}>
          All
        </button>
        {sections.map(s => (
          <button key={s} onClick={() => setSectionFilter(s)}
            className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", sectionFilter === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}>
            {s}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {viewMode === "grid" ? (
          <motion.div key="grid-table" initial="hidden" animate="visible" exit="exit" variants={staggerContainer} className="space-y-6">
            {groupedBySection.size === 0 ? (
              <motion.div variants={staggerItem} className="flex flex-col items-center justify-center py-16">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-muted/50">
                  <Sofa className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-foreground">No tables found</p>
                <p className="mt-1 text-xs text-muted-foreground/50">Try adjusting your filters</p>
              </motion.div>
            ) : (
              Array.from(groupedBySection.entries()).map(([section, sectionTables]) => (
                <motion.div key={section} variants={staggerItem} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">{section}</h3>
                    <span className="text-[10px] text-muted-foreground/40">({sectionTables.length} table{sectionTables.length !== 1 ? "s" : ""})</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {sectionTables.map((table: any) => (
                      <TableCard key={table.id} table={table} onAction={handleTableAction} />
                    ))}
                  </div>
                </motion.div>
              ))
            )}
          </motion.div>
        ) : (
          <motion.div key="table-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="overflow-hidden rounded-xl border border-border/60">
            <div className="grid grid-cols-[60px_1fr_70px_80px_80px_80px_80px] gap-2 border-b border-border bg-muted/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              <span>#</span><span>Name</span><span>Seats</span><span>Section</span><span>Status</span><span>Orders</span><span className="text-right">Bill</span>
            </div>
            {filteredTables.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground/50">No tables found</div>
            ) : (
              filteredTables.map((table: any, idx: number) => (
                <motion.div key={table.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.01 }}
                  className="grid grid-cols-[60px_1fr_70px_80px_80px_80px_80px] gap-2 border-b border-border px-4 py-3 text-sm transition-colors last:border-0 hover:bg-muted/20 items-center">
                  <span className="font-semibold text-foreground">{table.table_number || table.number}</span>
                  <span className="text-xs text-foreground/80 truncate">{table.name || `Table ${table.table_number || table.number}`}</span>
                  <span className="text-xs text-muted-foreground/70">{table.capacity}</span>
                  <span className="text-xs text-muted-foreground/70">{table.area || table.section || "Main"}</span>
                  <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium w-fit",
                    table.status === "available" || table.status === "free" ? "bg-emerald-500/10 text-emerald-500"
                    : table.status === "occupied" ? "bg-primary/10 text-primary"
                    : table.status === "reserved" ? "bg-amber-500/10 text-amber-500"
                    : "bg-muted text-muted-foreground")}>
                    {table.status.charAt(0).toUpperCase() + table.status.slice(1)}
                  </span>
                  <span className="text-xs text-muted-foreground/70">{table.order_count || 0}</span>
                  <span className="text-right text-xs font-medium text-foreground/80">{table.running_total ? formatCurrency(table.running_total) : "—"}</span>
                </motion.div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <TableFormModal open={showTableForm} table={editingTable} onSave={handleSaveTable} onClose={() => { setShowTableForm(false); setEditingTable(null) }} isSubmitting={isSavingTable} existingTables={tables.map((t: any) => ({ id: t.id, table_number: t.table_number || t.number || '' }))} />
      <ConfirmDialog open={!!deletingTable} title="Delete Table" message={`Delete Table ${deletingTable?.table_number || deletingTable?.number}?`} confirmLabel="Delete" variant="danger" onConfirm={handleDeleteTable} onCancel={() => setDeletingTable(null)} />
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  6. MAIN OPERATIONS EXPORT
// ═══════════════════════════════════════════════════════════════

export function Operations() {
  const [activeTab, setActiveTab] = useState<TabId>("rooms")
  const [lastUpdated, setLastUpdated] = useState(new Date().toISOString())
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useOperationsData()

  // Memoize extracted data to give useMemo stable references — prevents
  // unnecessary recalculations when this component re-renders.
  const roomList = useMemo(() => data?.rooms ?? [], [data?.rooms])
  const tableList = useMemo(() => data?.tables ?? [], [data?.tables])
  const hkTasks = useMemo(() => data?.hkTasks ?? [], [data?.hkTasks])
  const mtRequests = useMemo(() => data?.mtRequests ?? [], [data?.mtRequests])
  const roomTypeOptions = useMemo(() => data?.roomTypeOptions ?? [], [data?.roomTypeOptions])

  useEffect(() => {
    setLastUpdated(new Date().toISOString())
  }, [roomList.length, tableList.length, hkTasks.length, mtRequests.length])

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refetch().finally(() => setRefreshing(false));
  }, [refetch])

  const roomStats: RoomStats = useMemo(() => {
    const stats = {
      total: roomList.length,
      occupied: roomList.filter(r => r.status === "occupied").length,
      vacant: roomList.filter(r => r.status === "vacant").length,
      available: roomList.filter(r => r.status === "available").length,
      reserved: roomList.filter(r => r.status === "reserved").length,
      cleaning: roomList.filter(r => r.status === "cleaning").length,
      dirty: roomList.filter(r => r.status === "dirty").length,
      outOfOrder: roomList.filter(r => r.status === "out_of_order" || r.status === "maintenance").length,
      disabled: roomList.filter(r => r.status === "out_of_order").length,
      housekeepingPending: hkTasks.filter(t => t.status !== "completed").length,
      maintenanceOpen: mtRequests.filter(r => r.status === "open" || r.status === "in_progress").length,
      occupancyRate: 0,
    }
    stats.occupancyRate = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0
    return stats
  }, [roomList, hkTasks, mtRequests])

  const tableStats: TableStats = useMemo(() => ({
    total: tableList.length,
    occupied: tableList.filter(t => t.status === "occupied").length,
    available: tableList.filter(t => t.status === "available" || t.status === "free").length,
    reserved: tableList.filter(t => t.status === "reserved").length,
    disabled: tableList.filter(t => t.status === "disabled" || t.status === "out_of_order").length,
    activeOrders: tableList.filter(t => t.status === "occupied" && !!t.running_total).length,
    pendingBills: tableList.filter(t => t.status === "occupied" && (t.running_total ?? 0) > 0).length,
  }), [tableList])

  const tabs = [
    { id: "rooms" as TabId, label: "Rooms", count: roomStats.total, icon: BedDouble },
    { id: "tables" as TabId, label: "Tables", count: tableStats.total, icon: Sofa },
  ]

  if (isLoading) {
    return (
      <PageTransition className="space-y-6">
        {/* Header skeleton */}
        <div className="mb-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </div>
        {/* KPI skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[130px] rounded-xl" />
          ))}
        </div>
        {/* Tab skeleton */}
        <Skeleton className="h-12 rounded-xl" />
        {/* Content skeleton */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="space-y-6">
      <OperationsHeader lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={handleRefresh} />
      <SummaryDashboard roomStats={roomStats} tableStats={tableStats} activeTab={activeTab} />

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-card/50 p-1 shadow-sm">
        {tabs.map((tab) => (
          <motion.button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn("relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
              activeTab === tab.id ? "text-foreground" : "text-muted-foreground/60 hover:text-foreground/80")}>
            {activeTab === tab.id && (
              <motion.div layoutId="activeTab" className="absolute inset-0 rounded-xl bg-background shadow-sm ring-1 ring-border/40"
                transition={{ type: "spring", stiffness: 500, damping: 30 }} />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <tab.icon className="h-4 w-4" />
              {tab.label}
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">{tab.count}</span>
            </span>
          </motion.button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeTab === "rooms" ? (
          <motion.div key="rooms" variants={tabVariants} initial="exit" animate="enter" exit="exit">
            <RoomsView rooms={roomList} hkTasks={hkTasks} mtRequests={mtRequests} roomTypeOptions={roomTypeOptions} />
          </motion.div>
        ) : (
          <motion.div key="tables" variants={tabVariants} initial="exit" animate="enter" exit="exit">
            <TablesView tables={tableList} />
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
