import { useState, useEffect } from "react"
import { BaseModal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import {
  FormInput, FormSelect, FormTextarea, FormActions,
} from "@/components/ui/form-field"
import { cn } from "@/lib/utils"
import type { Room } from "@/types"
import { Hash, Layout, DoorOpen, Sofa, Users, User, Loader2 } from "lucide-react"

// ── Shared Constants ─────────────────────────────────────────

const amenityOptions = ["WiFi", "TV", "AC", "Mini Bar", "Balcony", "Jacuzzi", "Room Service", "Safe"]
const tableSections = ["Main", "VIP", "Outdoor", "Indoor", "Balcony", "Terrace"]

// ── Room Form Modal ──────────────────────────────────────────

export function RoomFormModal({ open, room, roomTypeOptions, onSave, onClose, isSubmitting, existingRooms }: {
  open: boolean; room?: Room | null; roomTypeOptions: { value: string; label: string }[]
  onSave: (data: Omit<Room, "id"> & { id?: string }) => void; onClose: () => void
  isSubmitting?: boolean; existingRooms?: { id: string; number: string }[]
}) {
  const [number, setNumber] = useState("")
  const [type, setType] = useState("")
  const [floor, setFloor] = useState(1)
  const [price, setPrice] = useState("3500")
  const [amenities, setAmenities] = useState<string[]>(["WiFi", "TV", "AC"])
  const [numberError, setNumberError] = useState("")

  // Reset form when modal opens — always start fresh
  useEffect(() => {
    if (open) {
      setNumber(room?.number ?? "")
      setType(room?.type ?? (roomTypeOptions[0]?.value ?? "Single"))
      setFloor(room?.floor ?? 1)
      setPrice(room?.price?.toString() ?? "3500")
      setAmenities(room?.amenities ?? ["WiFi", "TV", "AC"])
      setNumberError("")
    }
  }, [open, room, roomTypeOptions])

  const toggleAmenity = (a: string) => setAmenities((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return // prevent double submit
    if (!number.trim()) { setNumberError("Room number is required"); return }

    // Check for duplicate room number (case-insensitive)
    const trimmed = number.trim()
    const duplicate = (existingRooms ?? []).find(
      r => r.number.toLowerCase() === trimmed.toLowerCase() && r.id !== room?.id
    )
    if (duplicate) {
      setNumberError(`Room number "${trimmed}" already exists`)
      return
    }

    await onSave({ id: room?.id, number: trimmed, type, floor, status: room?.status ?? "vacant", price: parseFloat(price) || 3500, amenities })
  }

  return (
    <BaseModal open={open} onClose={onClose} title={room ? "Edit Room" : "Add Room"} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <FormInput label="Room Number" required autoFocus value={number} onChange={(e) => { setNumber(e.target.value); setNumberError("") }} placeholder="e.g. 101" error={numberError} leadingIcon={<Hash className="h-4 w-4" />} />
          <FormSelect label="Type" value={type} onChange={(e) => setType(e.target.value)}>
            {roomTypeOptions.length === 0 ? <option value="Single">Single</option> : roomTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </FormSelect>
          <FormInput label="Floor" type="number" value={floor} onChange={(e) => setFloor(parseInt(e.target.value) || 1)} min={1} max={10} leadingIcon={<Layout className="h-4 w-4" />} />
          <FormInput label="Price (NPR/night)" type="number" value={price} onChange={(e) => setPrice(e.target.value)} min={0} leadingIcon={<DoorOpen className="h-4 w-4" />} />
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">Amenities</label>
          <div className="flex flex-wrap gap-2">
            {amenityOptions.map((a) => (
              <button key={a} type="button" onClick={() => toggleAmenity(a)}
                className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  amenities.includes(a) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" />{room ? "Updating..." : "Creating Room..."}</>
            ) : (
              room ? "Save Changes" : "Add Room"
            )}
          </Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}

// ── Table Form Modal ─────────────────────────────────────────

export function TableFormModal({ open, table, onSave, onClose, isSubmitting, existingTables }: {
  open: boolean; table?: any | null; onSave: (data: any) => void; onClose: () => void
  isSubmitting?: boolean; existingTables?: { id: string; table_number: string }[]
}) {
  const [tableNumber, setTableNumber] = useState("")
  const [tableName, setTableName] = useState("")
  const [capacity, setCapacity] = useState(4)
  const [section, setSection] = useState("Main")
  const [tableStatus, setTableStatus] = useState("available")
  const [shape, setShape] = useState("")
  const [notes, setNotes] = useState("")
  const [numberError, setNumberError] = useState("")
  const [capacityError, setCapacityError] = useState("")

  // Reset form when modal opens — always start fresh
  useEffect(() => {
    if (open) {
      setTableNumber(table?.table_number ?? table?.number ?? "")
      setTableName(table?.name ?? "")
      setCapacity(table?.capacity ?? 4)
      setSection(table?.area ?? table?.section ?? "Main")
      setTableStatus(table?.status ?? "available")
      setShape(table?.shape ?? "")
      setNotes(table?.notes ?? "")
      setNumberError("")
      setCapacityError("")
    }
  }, [open, table])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return // prevent double submit
    let hasError = false
    if (!tableNumber.trim()) { setNumberError("Table number is required"); hasError = true } else setNumberError("")
    if (!capacity || capacity < 1) { setCapacityError("Capacity must be at least 1"); hasError = true } else setCapacityError("")
    if (hasError) return

    // Check for duplicate table number (case-insensitive)
    const trimmed = tableNumber.trim()
    const duplicate = (existingTables ?? []).find(
      t => t.table_number.toLowerCase() === trimmed.toLowerCase() && t.id !== table?.id
    )
    if (duplicate) {
      setNumberError(`Table number "${trimmed}" already exists`)
      return
    }

    await onSave({ id: table?.id, name: tableName.trim(), table_number: trimmed, capacity, section, shape, status: tableStatus, notes })
  }

  return (
    <BaseModal open={open} onClose={onClose} title={table ? "Edit Table" : "Add Table"} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <FormInput label="Table Number" required autoFocus value={tableNumber} onChange={(e) => { setTableNumber(e.target.value); setNumberError("") }} placeholder="e.g. T1" error={numberError} leadingIcon={<Hash className="h-4 w-4" />} />
          <FormInput label="Table Name" value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="e.g. Window Seat" leadingIcon={<Sofa className="h-4 w-4" />} />
          <FormInput label="Capacity" required type="number" value={capacity} onChange={(e) => { setCapacity(parseInt(e.target.value) || 0); setCapacityError("") }} min={1} error={capacityError} leadingIcon={<Users className="h-4 w-4" />} />
          <FormSelect label="Shape (optional)" value={shape} onChange={(e) => setShape(e.target.value)}>
            <option value="">No preference</option>
            <option value="round">Round</option>
            <option value="square">Square</option>
            <option value="rectangle">Rectangle</option>
            <option value="oval">Oval</option>
            <option value="booth">Booth</option>
          </FormSelect>
          <FormSelect label="Section" value={section} onChange={(e) => setSection(e.target.value)}>
            {tableSections.map(s => <option key={s} value={s}>{s}</option>)}
          </FormSelect>
          <FormSelect label="Status" value={tableStatus} onChange={(e) => setTableStatus(e.target.value)}>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="cleaning">Cleaning</option>
            <option value="maintenance">Maintenance</option>
            <option value="disabled">Disabled</option>
          </FormSelect>
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any notes about this table..." className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-all duration-150 focus:border-primary focus:shadow-[0_0_0_3px] focus:shadow-primary/10 placeholder:text-muted-foreground/60" />
        </div>
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" />{table ? "Updating..." : "Creating Table..."}</>
            ) : (
              table ? "Save Changes" : "Add Table"
            )}
          </Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}

// ── Maintenance Form Modal ───────────────────────────────────

export function MaintenanceFormModal({ open, onSave, onClose }: {
  open: boolean; onSave: (data: { room_number: string; description: string; priority: string }) => void; onClose: () => void
}) {
  const [roomNumber, setRoomNumber] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState("medium")
  const [roomError, setRoomError] = useState("")
  const [descError, setDescError] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    let hasError = false
    if (!roomNumber.trim()) { setRoomError("Room number is required"); hasError = true } else setRoomError("")
    if (!description.trim()) { setDescError("Description is required"); hasError = true } else setDescError("")
    if (hasError) return
    onSave({ room_number: roomNumber.trim(), description: description.trim(), priority })
    onClose()
  }

  return (
    <BaseModal open={open} onClose={onClose} title="New Maintenance Request" size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <FormInput label="Room Number" required autoFocus value={roomNumber} onChange={(e) => { setRoomNumber(e.target.value); setRoomError("") }} placeholder="e.g. 101" error={roomError} leadingIcon={<Hash className="h-4 w-4" />} />
          <FormSelect label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </FormSelect>
        </div>
        <FormTextarea label="Description" required value={description} onChange={(e) => { setDescription(e.target.value); setDescError("") }} rows={3} placeholder="Describe the maintenance issue..." error={descError} />
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Create Request</Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}

// ── Housekeeping Assign Modal ────────────────────────────────

export function HousekeepingAssignModal({ open, rooms, onSave, onClose }: {
  open: boolean; rooms: Room[]; onSave: (data: { room_number: string; assigned_to: string; priority: string }) => void; onClose: () => void
}) {
  const [selectedRoom, setSelectedRoom] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [priority, setPriority] = useState("medium")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRoom || !assignedTo) return
    onSave({ room_number: selectedRoom, assigned_to: assignedTo, priority })
    onClose()
  }

  return (
    <BaseModal open={open} onClose={onClose} title="Assign Housekeeping" size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormSelect label="Room" value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}>
          <option value="">Select room...</option>
          {rooms.map(r => (
            <option key={r.id} value={r.room_number || r.number}>
              Room {r.room_number || r.number} - {r.type}
            </option>
          ))}
        </FormSelect>
        <FormInput label="Assigned To" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Staff name" leadingIcon={<User className="h-4 w-4" />} />
        <FormSelect label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </FormSelect>
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Assign</Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}
