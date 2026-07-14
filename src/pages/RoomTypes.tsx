import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { DataTable, type Column } from "@/components/DataTable"
import { StatCard } from "@/components/ui/stat-card"
import { BaseModal } from "@/components/ui/modal"
import { FormInput, FormTextarea, FormActions } from "@/components/ui/form-field"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import { cn, formatCurrency } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { Plus, Edit, Trash2, Users, Wifi, Tv, Snowflake, GlassWater, Sun, Wind, Sofa, ShieldCheck } from "lucide-react"
import { useRoomTypes, type RoomType, type NewRoomTypeData } from "@/lib/services/room-type-service"
import { pageTransitionFast, staggerContainer } from "@/lib/animations/presets"

const AMENITY_ICONS: Record<string, typeof Wifi> = {
  WiFi: Wifi, TV: Tv, AC: Snowflake, "Mini Bar": GlassWater,
  Balcony: Sun, Jacuzzi: Wind, "Room Service": Sofa, Safe: ShieldCheck,
}

function RoomTypeFormModal({
  open,
  roomType,
  onSave,
  onClose,
}: {
  open: boolean
  roomType?: RoomType | null
  onSave: (data: NewRoomTypeData) => void
  onClose: () => void
}) {
  const [name, setName] = useState(roomType?.name ?? "")
  const [description, setDescription] = useState(roomType?.description ?? "")
  const [pricePerNight, setPricePerNight] = useState(String(roomType?.pricePerNight ?? ""))
  const [capacity, setCapacity] = useState(String(roomType?.capacity ?? "2"))
  const [amenities, setAmenities] = useState<string[]>(roomType?.amenities ?? [])
  const [nameError, setNameError] = useState("")

  const allAmenities = ["WiFi", "TV", "AC", "Mini Bar", "Balcony", "Jacuzzi", "Room Service", "Safe"]

  const toggleAmenity = (a: string) => {
    setAmenities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setNameError("Room type name is required"); return }
    onSave({
      name: name.trim(),
      description: description.trim(),
      pricePerNight: Number(pricePerNight) || 0,
      capacity: Number(capacity) || 2,
      amenities,
    })
    onClose()
  }

  return (
    <BaseModal open={open} onClose={onClose} title={roomType ? "Edit Room Type" : "Add Room Type"} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormInput
          label="Room Type Name"
          required
          value={name}
          onChange={(e) => { setName(e.target.value); setNameError("") }}
          placeholder="e.g. Deluxe Suite"
          error={nameError}
        />
        <FormTextarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the room type..."
          rows={2}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="Price per Night (Rs.)"
            type="number"
            required
            min={0}
            value={pricePerNight}
            onChange={(e) => setPricePerNight(e.target.value)}
            placeholder="0"
          />
          <FormInput
            label="Capacity (guests)"
            type="number"
            required
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="2"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">Amenities</label>
          <div className="flex flex-wrap gap-2">
            {allAmenities.map((a) => {
              const Icon = AMENITY_ICONS[a] ?? Wifi
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAmenity(a)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    amenities.includes(a)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {a}
                </button>
              )
            })}
          </div>
        </div>
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">{roomType ? "Save Changes" : "Add Room Type"}</Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}

export function RoomTypes() {
  const { roomTypes, isLoading, loadError, addRoomType, updateRoomType, deleteRoomType, refresh } = useRoomTypes()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<RoomType | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleSave = async (data: NewRoomTypeData) => {
    try {
      if (editing) {
        await updateRoomType(editing.id, data)
        showSuccess(`Room type "${data.name}" updated`)
      } else {
        await addRoomType(data)
        showSuccess(`Room type "${data.name}" added`)
      }
    } catch {
      showError('Failed to save room type')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteRoomType(deleteId)
      showSuccess('Room type deleted')
    } catch {
      showError('Failed to delete room type. It may be in use by existing rooms.')
    } finally {
      setDeleteId(null)
    }
  }

  const avgPrice = useMemo(() => {
    if (roomTypes.length === 0) return 0
    return Math.round(roomTypes.reduce((s, r) => s + r.pricePerNight, 0) / roomTypes.length)
  }, [roomTypes])

  const totalCapacity = useMemo(() => roomTypes.reduce((s, r) => s + r.capacity, 0), [roomTypes])

  const columns: Column<RoomType>[] = [
    { key: "name", header: "Room Type", render: (r) => <span className="font-semibold text-foreground">{r.name}</span> },
    { key: "description", header: "Description", render: (r) => <span className="text-sm text-muted-foreground truncate max-w-[200px]">{r.description || "—"}</span> },
    { key: "pricePerNight", header: "Price/Night", render: (r) => <span className="font-semibold tabular-nums">{formatCurrency(r.pricePerNight)}</span> },
    { key: "capacity", header: "Capacity", render: (r) => (
      <div className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-muted-foreground" /><span>{r.capacity}</span></div>
    )},
    { key: "amenities", header: "Amenities", render: (r) => (
      <div className="flex flex-wrap gap-1">
        {r.amenities.slice(0, 3).map((a) => {
          const Icon = AMENITY_ICONS[a] ?? Wifi
          return (
            <span key={a} className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title={a}>
              <Icon className="h-2.5 w-2.5" />
            </span>
          )
        })}
        {r.amenities.length > 3 && <span className="text-[10px] text-muted-foreground">+{r.amenities.length - 3}</span>}
      </div>
    )},
    { key: "actions", header: "", render: (r) => (
      <div className="flex gap-1">
        <button onClick={() => { setEditing(r); setShowForm(true) }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Edit">
          <Edit className="h-4 w-4" />
        </button>
        <button onClick={() => setDeleteId(r.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )},
  ]

  return (
    <PageTransition>
      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="space-y-6">
        <PageHeader
          title="Room Types"
          icon="BedDouble"
          description="Manage room categories, pricing, and amenities"
          actions={
            <Button size="sm" onClick={() => { setEditing(null); setShowForm(true) }}>
              <Plus className="h-4 w-4 mr-1" /> Add Room Type
            </Button>
          }
        />

        <motion.div variants={pageTransitionFast} className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Room Types" value={roomTypes.length} icon="BedDouble" color="text-primary" index={0} />
          <StatCard label="Avg Price/Night" value={formatCurrency(avgPrice)} icon="DollarSign" color="text-success" index={1} />
          <StatCard label="Total Capacity" value={totalCapacity} icon="Users" color="text-info" index={2} />
        </motion.div>

        <motion.div variants={pageTransitionFast} className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5 shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <p className="text-muted-foreground">{loadError}</p>
              <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
            </div>
          ) : roomTypes.length === 0 ? (
            <EmptyState icon="BedDouble" title="No room types" description="Add your first room type to start managing rooms." />
          ) : (
            <DataTable columns={columns} data={roomTypes} pageSize={10} />
          )}
        </motion.div>

        <RoomTypeFormModal open={showForm} roomType={editing} onSave={handleSave} onClose={() => { setShowForm(false); setEditing(null) }} />

        <ConfirmDialog
          open={!!deleteId}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
          title="Delete Room Type"
          message="Are you sure you want to delete this room type? This cannot be undone if rooms are assigned to it."
          confirmLabel="Delete"
          variant="danger"
        />
      </motion.div>
    </PageTransition>
  )
}
