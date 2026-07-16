import { useState, useMemo, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { Icon } from "@/components/icon-mapper"
import { BaseModal } from "@/components/ui/modal"
import {
  FormInput, FormSelect, FormTextarea, FormActions, FormToggle,
} from "@/components/ui/form-field"
import { cn } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import type { MenuItem, MenuCategory } from "@/types"
import { Button } from "@/components/ui/button"
import {
  useMenuCategories,
  useMenuItems,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  useToggleMenuItemAvailability,
  useCreateMenuCategory,
  useDeleteMenuCategory,
} from "@/lib/api/menu.hooks"
import { uploadItemImage, deleteItemImage } from "@/lib/db/menu"
import { EmptyState } from "@/components/EmptyState"
import {
  Plus, Edit, Trash2, Search, Grid3X3, List, X, MenuIcon,
  EyeOff, Upload, Image as ImageIcon, Loader2,
} from "lucide-react"

// ─── Constants ────────────────────────────────────────────────

type ViewMode = "grid" | "list"
type FilterType = "all" | "available" | "unavailable"

const STAGGER_DELAY = 0.025
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"]
const MAX_IMAGE_SIZE_MB = 5

// ─── Parts ────────────────────────────────────────────────────

// ─── Toggle Switch ────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      whileTap={{ scale: 0.88 }}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked
          ? "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/30"
          : "bg-muted-foreground/15 hover:bg-muted-foreground/25",
      )}
    >
      <motion.span
        animate={{ x: checked ? 17 : 3 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.8 }}
        className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm shadow-black/10 ring-0"
      />
    </motion.button>
  )
}

// ─── Image Upload Area ────────────────────────────────────────

function ImageUploadArea({
  currentImage, file, preview, onFileSelect, onRemove, disabled,
}: {
  currentImage?: string | null
  file: File | null
  preview: string | null
  onFileSelect: (f: File) => void
  onRemove: () => void
  disabled: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = useCallback((f: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(f.type)) {
      showError("Only JPEG, PNG, WebP, and AVIF images are accepted")
      return
    }
    if (f.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      showError(`Image must be under ${MAX_IMAGE_SIZE_MB}MB`)
      return
    }
    onFileSelect(f)
  }, [onFileSelect])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    // Reset so the same file can be re-selected
    e.target.value = ""
  }, [handleFile])

  const displaySrc = preview ?? currentImage ?? null

  if (displaySrc) {
    return (
      <div className="relative overflow-hidden rounded-lg border border-border bg-muted/20">
        <img
          src={displaySrc}
          alt="Item preview"
          className="h-40 w-full object-cover"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80 disabled:opacity-50"
          title="Remove image"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {file && (
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">
            New
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-6 transition-colors",
        dragOver
          ? "border-primary/50 bg-primary/5"
          : "border-border hover:border-foreground/30 hover:bg-muted/30",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <Upload className="h-6 w-6 text-muted-foreground/40" />
      <p className="text-xs font-medium text-muted-foreground/70">
        Drop an image or click to browse
      </p>
      <p className="text-[10px] text-muted-foreground/40">
        PNG, JPG, WebP &middot; Max {MAX_IMAGE_SIZE_MB}MB
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  )
}

// ─── Item Form Modal ──────────────────────────────────────────

function ItemFormModal({
  open, item, categories, onSave, onClose,
}: {
  open: boolean
  item?: Partial<MenuItem> | null
  categories: MenuCategory[]
  onSave: (data: MenuItem) => void
  onClose: () => void
}) {
  const [name, setName] = useState(item?.name ?? "")
  const [description, setDescription] = useState(item?.description ?? "")
  const [price, setPrice] = useState(String(item?.price ?? ""))
  const [category, setCategory] = useState(item?.category ?? categories[0]?.id ?? "")
  const [available, setAvailable] = useState(item?.available ?? true)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [removeExistingImage, setRemoveExistingImage] = useState(false)

  // Reset form state when modal opens/closes or item changes
  const isOpen = open
  const prevOpen = useRef(open)
  if (isOpen !== prevOpen.current) {
    prevOpen.current = isOpen
    if (isOpen) {
      setName(item?.name ?? "")
      setDescription(item?.description ?? "")
      setPrice(String(item?.price ?? ""))
      setCategory(item?.category ?? categories[0]?.id ?? "")
      setAvailable(item?.available ?? true)
      setImageFile(null)
      setImagePreview(null)
      setRemoveExistingImage(false)
    }
  }

  const handleSelectFile = useCallback((f: File) => {
    setImageFile(f)
    setImagePreview(URL.createObjectURL(f))
    setRemoveExistingImage(false)
  }, [])

  const handleRemoveImage = useCallback(() => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview(null)
    if (item?.image) setRemoveExistingImage(true)
  }, [imagePreview, item?.image])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !price) { showError("Name and price are required"); return }

    setUploading(true)
    try {
      // 1. Upload new image if selected
      let imageUrl = removeExistingImage ? "" : (item?.image ?? "")
      if (imageFile) {
        imageUrl = await uploadItemImage(imageFile)
      }

      // 2. Delete old image from storage if replaced
      if (item?.image && (imageFile || removeExistingImage) && item.image !== imageUrl) {
        deleteItemImage(item.image).catch(() => {})
      }

      // 3. Call parent save
      onSave({
        id: item?.id ?? `m${Date.now()}`,
        name, description, price: Number(price),
        category, available, image: imageUrl || undefined, tags: [],
      })
      onClose()
    } catch (err) {
      showError(`Failed to upload image: ${err instanceof Error ? err.message : "Unknown error"}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <BaseModal open={open} onClose={onClose} title={item?.id ? "Edit Item" : "Add Item"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Image upload */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Photo</label>
          <ImageUploadArea
            currentImage={removeExistingImage ? null : item?.image}
            file={imageFile}
            preview={imagePreview}
            onFileSelect={handleSelectFile}
            onRemove={handleRemoveImage}
            disabled={uploading}
          />
        </div>

        <FormInput label="Item Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cappuccino" disabled={uploading} />
        <FormTextarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Brief description" disabled={uploading} />
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="Price (Rs.)" required type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="250" disabled={uploading} />
          <FormSelect label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={categories.map((c) => ({ value: c.id, label: c.name }))} disabled={uploading} />
        </div>
        <FormToggle label="Available" description="Item is currently available for order" checked={available} onChange={setAvailable} disabled={uploading} />
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button type="submit" disabled={uploading}>
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
            ) : (
              item?.id ? "Update Item" : "Add Item"
            )}
          </Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}

// ─── Category Form Modal ──────────────────────────────────────

function CategoryFormModal({ open, onSave, onClose }: {
  open: boolean; categories: MenuCategory[]; onSave: (name: string) => void; onClose: () => void
}) {
  const [name, setName] = useState("")
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!name) return; onSave(name); setName(""); onClose() }
  return (
    <BaseModal open={open} onClose={onClose} title="Add Category" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormInput label="Category Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Snacks" autoFocus />
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Add Category</Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}

// ─── Category Nav Item ────────────────────────────────────────

function CategoryNavItem({
  cat, active, count, onSelect, onDelete,
}: {
  cat: MenuCategory; active: boolean; count: number
  onSelect: () => void; onDelete?: () => void
}) {
  return (
    <div className="group/cat flex items-center">
      <button onClick={onSelect}
        className={cn(
          "flex flex-1 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150",
          active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon name={cat.icon} className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground/50")} />
        <span className="flex-1 truncate text-left">{cat.name}</span>
        <span className={cn("text-xs tabular-nums", active ? "text-primary font-medium" : "text-muted-foreground/50")}>{count}</span>
      </button>
      {onDelete && (
        <button onClick={onDelete}
          className="ml-0.5 shrink-0 rounded-md p-1.5 text-muted-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover/cat:opacity-100">
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

// ─── Filter Pill ──────────────────────────────────────────────

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150",
        active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}

// ─── Menu Card (Grid View) ────────────────────────────────────

function MenuCard({ item, onEdit, onDelete, onToggle }: {
  item: MenuItem; onEdit: () => void; onDelete: () => void; onToggle: () => void
}) {
  return (
    <div
      className={cn(
        "group flex flex-col w-full h-full overflow-hidden rounded-xl border bg-card transition-all duration-150 hover:shadow-md hover:border-foreground/20",
        !item.available && "opacity-55",
      )}
    >
      {/* ── Image (only when available) ── */}
      {item.image && (
        <div className="relative aspect-[4/3] overflow-hidden bg-muted/10 shrink-0">
          <img
            src={item.image}
            alt={item.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          {!item.available && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
              <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white">
                <EyeOff className="h-3 w-3" /> Unavailable
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col p-3.5 min-h-0">
        {/* ── Header: Name + Toggle ── */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground leading-snug truncate flex-1 min-w-0">{item.name}</h3>
          <Toggle checked={item.available} onChange={onToggle} />
        </div>

        {/* ── Description ── */}
        {item.description && (
          <p className="text-xs text-muted-foreground/50 mt-1 leading-relaxed line-clamp-1">{item.description}</p>
        )}

        {/* ── Spacer pushes footer down ── */}
        <div className="flex-1 min-h-[4px]" />

        {/* ── Footer: Price + Actions ── */}
        <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-border">
          <div className="flex items-baseline gap-1">
            <span className="text-xs text-muted-foreground/40 font-medium">Rs.</span>
            <span className="text-base font-bold text-foreground tabular-nums">{item.price.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={onEdit}
              className="rounded-lg p-1.5 text-muted-foreground/40 hover:bg-muted hover:text-foreground transition-colors" title="Edit">
              <Edit className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete}
              className="rounded-lg p-1.5 text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Menu Row (List View) ─────────────────────────────────────

function MenuRow({ item, onEdit, onDelete, onToggle, index }: {
  item: MenuItem; onEdit: () => void; onDelete: () => void; onToggle: () => void; index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * STAGGER_DELAY }}
      className={cn(
        "group grid grid-cols-[44px_1fr_1fr_100px_70px_80px] items-center gap-3 border-b border-border px-5 py-2.5 transition-colors last:border-0 hover:bg-muted/20",
        !item.available && "opacity-50",
      )}
    >
      {/* Thumbnail */}
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted/20">
        {item.image ? (
          <img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground/20" />
          </div>
        )}
      </div>

      {/* Name */}
      <div className="min-w-0">
        <span className="text-sm font-medium text-foreground">{item.name}</span>
        {item.description && <p className="truncate text-xs text-muted-foreground/50 mt-0.5">{item.description}</p>}
      </div>

      {/* Category */}
      <span className="text-xs text-muted-foreground/70">{item.category}</span>

      {/* Price */}
      <span className="text-sm font-semibold text-foreground tabular-nums">Rs.{item.price.toLocaleString()}</span>

      {/* Toggle */}
      <div className="flex justify-center">
        <Toggle checked={item.available} onChange={onToggle} />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1">
        <button onClick={onEdit}
          className="rounded-md p-1.5 text-muted-foreground/40 transition-all hover:bg-muted hover:text-foreground" title="Edit">
          <Edit className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete}
          className="rounded-md p-1.5 text-muted-foreground/40 transition-all hover:bg-destructive/10 hover:text-destructive" title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  )
}

// ─── Page Layout ──────────────────────────────────────────────

export function Menu() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<FilterType>("all")
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "item" | "category"; id: string; name: string } | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── Data ──
  const { data: cats = [] } = useMenuCategories()
  const { data: itemsData } = useMenuItems({ pageSize: 99 })
  const items = useMemo(() => itemsData?.data ?? [], [itemsData])

  // ── Mutations ──
  const createItem = useCreateMenuItem()
  const updateItem = useUpdateMenuItem()
  const deleteItem = useDeleteMenuItem()
  const toggleAvail = useToggleMenuItemAvailability()
  const createCategory = useCreateMenuCategory()
  const deleteCategoryMut = useDeleteMenuCategory()

  // ── Lookups ──
  const catNameToId = useMemo(() => {
    const m = new Map<string, string>(); cats.forEach(c => m.set(c.name, c.id)); return m
  }, [cats])

  // ── Handlers ──
  const toggleAvailability = async (id: string) => {
    try { await toggleAvail.mutateAsync(id); showSuccess("Item availability updated") }
    catch (err) { showError(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`) }
  }

  const handleSaveItem = async (data: MenuItem) => {
    try {
      const isUpdate = items.some((i) => i.id === data.id)
      const catId = catNameToId.get(data.category) ?? data.category
      const payload = { ...data, category: catId, tags: [] }

      if (isUpdate) {
        await updateItem.mutateAsync({ id: data.id, data: payload })
        showSuccess("Item updated")
      } else {
        await createItem.mutateAsync(payload)
        showSuccess("Item added")
      }
    } catch {
      showError("Failed to save item")
    }
  }

  const handleDeleteItem = async () => {
    if (!deleteConfirm || deleteConfirm.type !== "item") return
    try {
      // Delete DB record first, then clean up image from storage
      const item = items.find((i) => i.id === deleteConfirm.id)
      await deleteItem.mutateAsync(deleteConfirm.id)
      if (item?.image) deleteItemImage(item.image).catch(() => {})
      showSuccess("Item deleted")
    } catch { showError("Failed to delete item") }
    setDeleteConfirm(null)
  }

  const handleAddCategory = async (name: string) => {
    try { await createCategory.mutateAsync({ name, icon: "UtensilsCrossed" }); showSuccess("Category added") } catch { showError("Failed to add category") }
  }

  const handleDeleteCategory = async () => {
    if (!deleteConfirm || deleteConfirm.type !== "category") return
    try { await deleteCategoryMut.mutateAsync(deleteConfirm.id); showSuccess("Category deleted") } catch { showError("Failed to delete category") }
    if (activeCategory === deleteConfirm.id) setActiveCategory(null)
    setDeleteConfirm(null)
  }

  // ── Filtering ──
  const filteredItems = useMemo(() => {
    let r = items
    if (activeCategory) {
      r = r.filter((item) => {
        const cid = catNameToId.get(item.category) ?? item.category
        return cid === activeCategory || item.category === activeCategory
      })
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      r = r.filter((i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
    }
    if (filterType === "available") r = r.filter((i) => i.available)
    if (filterType === "unavailable") r = r.filter((i) => !i.available)
    return r
  }, [items, activeCategory, searchQuery, filterType, catNameToId])

  const filterPills: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "available", label: "Available" },
    { key: "unavailable", label: "Unavailable" },
  ]

  // ── Render ──
  return (
    <PageTransition className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Menu Management"
        icon="UtensilsCrossed"
        description="Manage categories and items"
        actions={
          <div className="hidden gap-2 sm:flex">
            <Button size="sm" variant="outline" onClick={() => setShowCategoryForm(true)}>
              <Plus className="h-4 w-4" /> Category
            </Button>
            <Button size="sm" onClick={() => { setEditingItem(null); setShowItemForm(true) }}>
              <Plus className="h-4 w-4" /> Add Item
            </Button>
          </div>
        }
      />

      {/* Mobile FAB */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2 sm:hidden">
        <Button size="icon" variant="outline" className="h-11 w-11 rounded-full shadow-lg" onClick={() => setShowCategoryForm(true)}><Plus className="h-5 w-5" /></Button>
        <Button size="icon" className="h-12 w-12 rounded-full shadow-lg" onClick={() => { setEditingItem(null); setShowItemForm(true) }}><Plus className="h-5 w-5" /></Button>
      </div>

      <div className="flex gap-6">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        {/* ─── Sidebar ─── */}
        <motion.aside
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.2 } }}
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-80 shrink-0 border-r bg-background p-2.5 transition-transform duration-200 lg:static lg:translate-x-0 lg:rounded-xl lg:border lg:p-2",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-2 flex items-center justify-between lg:hidden">
            <h3 className="text-sm font-semibold">Categories</h3>
            <button onClick={() => setSidebarOpen(false)} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>

          {/* All Items */}
          <CategoryNavItem
            cat={{ id: "", name: "All Items", itemCount: items.length, icon: "LayoutGrid" }}
            active={activeCategory === null} count={items.length}
            onSelect={() => { setActiveCategory(null); setSidebarOpen(false) }}
          />

          {/* Category list */}
          <div className="mt-0.5 space-y-0.5">
            {cats.map((cat) => (
              <CategoryNavItem
                key={cat.id} cat={cat} active={activeCategory === cat.id}
                count={items.filter((i) => i.category === cat.name).length}
                onSelect={() => { setActiveCategory(cat.id); setSidebarOpen(false) }}
                onDelete={() => setDeleteConfirm({ type: "category", id: cat.id, name: cat.name })}
              />
            ))}
          </div>

          {/* Add Category button */}
          <button onClick={() => setShowCategoryForm(true)}
            className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm font-medium text-muted-foreground/60 transition-colors hover:border-foreground/30 hover:text-foreground">
            <Plus className="h-4 w-4" /> Add Category
          </button>
        </motion.aside>

        {/* ─── Main Content ─── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search + View Toggle Row */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button onClick={() => setSidebarOpen(true)}
                className="shrink-0 rounded-lg border border-border p-2.5 text-muted-foreground hover:bg-muted lg:hidden transition-colors">
                <MenuIcon className="h-4 w-4" />
              </button>
              <div className="relative flex-1 sm:min-w-[240px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
                <input type="text" placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-foreground/30 focus:outline-none focus:ring-1 focus:ring-foreground/10 transition-all" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="hidden shrink-0 items-center rounded-lg border border-border p-0.5 sm:flex">
                <button onClick={() => setViewMode("grid")}
                  className={cn("rounded-md p-1.5 transition-colors", viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button onClick={() => setViewMode("list")}
                  className={cn("rounded-md p-1.5 transition-colors", viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5 bg-background">
                {filterPills.map(({ key, label }) => (
                  <FilterPill key={key} label={label} active={filterType === key} onClick={() => setFilterType(key)} />
                ))}
              </div>
              <p className="shrink-0 text-xs text-muted-foreground/60 tabular-nums">
                {filteredItems.length} item{filteredItems.length !== 1 && "s"}
              </p>
            </div>
          </div>

          {/* ─── Grid View ─── */}
          <AnimatePresence mode="wait">
            {viewMode === "grid" && (
              <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              >
                {filteredItems.length === 0 ? (
                  <div className="col-span-full">
                    <EmptyState icon="UtensilsCrossed" title="No items found"
                      description={searchQuery ? `No results for "${searchQuery}"` : "No menu items yet. Add your first item!"} />
                  </div>
                ) : (
                  filteredItems.map((item, idx) => (
                    <motion.div key={item.id}
                      className="h-full w-full"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: idx * STAGGER_DELAY }}
                    >
                      <MenuCard
                        item={item}
                        onEdit={() => { setEditingItem(item); setShowItemForm(true) }}
                        onDelete={() => setDeleteConfirm({ type: "item", id: item.id, name: item.name })}
                        onToggle={() => toggleAvailability(item.id)}
                      />
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── List View ─── */}
          <AnimatePresence mode="wait">
            {viewMode === "list" && (
              <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="overflow-hidden rounded-xl border border-border"
              >
                {/* Table header */}
                <div className="grid grid-cols-[44px_1fr_1fr_100px_70px_80px] items-center gap-3 border-b border-border bg-muted/30 px-5 py-2.5">
                  {["", "Item", "Category", "Price", "Status", ""].map((h) => (
                    <span key={h} className={cn("text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50", h === "Price" && "text-right", h === "Status" && "text-center")}>{h}</span>
                  ))}
                </div>

                {filteredItems.length === 0 ? (
                  <div>
                    <EmptyState icon="UtensilsCrossed" title="No items found"
                      description={searchQuery ? `No results for "${searchQuery}"` : "No menu items in this view."} />
                  </div>
                ) : (
                  filteredItems.map((item, i) => (
                    <MenuRow key={item.id} item={item} index={i}
                      onEdit={() => { setEditingItem(item); setShowItemForm(true) }}
                      onDelete={() => setDeleteConfirm({ type: "item", id: item.id, name: item.name })}
                      onToggle={() => toggleAvailability(item.id)}
                    />
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modals */}
      <ItemFormModal open={showItemForm} item={editingItem} categories={cats}
        onSave={handleSaveItem} onClose={() => { setShowItemForm(false); setEditingItem(null) }} />
      <CategoryFormModal open={showCategoryForm} categories={cats}
        onSave={(name) => handleAddCategory(name)} onClose={() => setShowCategoryForm(false)} />

      {/* Confirm dialogs */}
      <ConfirmDialog open={deleteConfirm?.type === "item"} title="Delete Item"
        message={`Are you sure you want to delete "${deleteConfirm?.name ?? ""}"? This cannot be undone.`}
        confirmLabel="Delete" variant="danger" onConfirm={handleDeleteItem} onCancel={() => setDeleteConfirm(null)} />
      <ConfirmDialog open={deleteConfirm?.type === "category"} title="Delete Category"
        message={`Delete category "${deleteConfirm?.name ?? ""}"? Only empty categories can be deleted.`}
        confirmLabel="Delete" variant="danger" onConfirm={handleDeleteCategory} onCancel={() => setDeleteConfirm(null)} />
    </PageTransition>
  )
}
