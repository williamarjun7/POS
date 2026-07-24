import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  GripVertical,
  Tag,
  Layers,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { BaseModal } from "@/components/ui/modal"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import { cn } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { pageTransitionFast, staggerContainer } from "@/lib/animations/presets"
import { useExpenseCategories, slugify } from "@/lib/services/expense-category-service"

/* ─── Category color mapping (same as Expenses.tsx) ──────── */

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  dairy:        { bg: "bg-blue-50 dark:bg-blue-950/30",   text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  grocery:      { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  vegetables:   { bg: "bg-green-50 dark:bg-green-950/30", text: "text-green-700 dark:text-green-300", dot: "bg-green-500" },
  fruits:       { bg: "bg-rose-50 dark:bg-rose-950/30",   text: "text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
  meat:         { bg: "bg-red-50 dark:bg-red-950/30",     text: "text-red-700 dark:text-red-300", dot: "bg-red-500" },
  bakery:       { bg: "bg-orange-50 dark:bg-orange-950/30",text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  snacks:       { bg: "bg-yellow-50 dark:bg-yellow-950/30",text: "text-yellow-700 dark:text-yellow-300", dot: "bg-yellow-500" },
  beverages:    { bg: "bg-cyan-50 dark:bg-cyan-950/30",   text: "text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-500" },
  tea_coffee:   { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-800 dark:text-amber-200", dot: "bg-amber-700" },
  fuel:         { bg: "bg-gray-50 dark:bg-gray-950/30",   text: "text-gray-700 dark:text-gray-300", dot: "bg-gray-500" },
  transport:    { bg: "bg-sky-50 dark:bg-sky-950/30",     text: "text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  cleaning:     { bg: "bg-teal-50 dark:bg-teal-950/30",   text: "text-teal-700 dark:text-teal-300", dot: "bg-teal-500" },
  laundry:      { bg: "bg-indigo-50 dark:bg-indigo-950/30",text: "text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500" },
  maintenance:  { bg: "bg-orange-50 dark:bg-orange-950/30",text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  housekeeping: { bg: "bg-purple-50 dark:bg-purple-950/30",text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500" },
  utilities:    { bg: "bg-slate-50 dark:bg-slate-950/30", text: "text-slate-700 dark:text-slate-300", dot: "bg-slate-500" },
  internet:     { bg: "bg-blue-50 dark:bg-blue-950/30",   text: "text-blue-600 dark:text-blue-300", dot: "bg-blue-400" },
  electricity:  { bg: "bg-yellow-50 dark:bg-yellow-950/30",text: "text-yellow-600 dark:text-yellow-300", dot: "bg-yellow-400" },
  rent:         { bg: "bg-violet-50 dark:bg-violet-950/30",text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  salary:       { bg: "bg-emerald-50 dark:bg-emerald-950/30",text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  office:       { bg: "bg-stone-50 dark:bg-stone-950/30", text: "text-stone-700 dark:text-stone-300", dot: "bg-stone-500" },
  equipment:    { bg: "bg-neutral-50 dark:bg-neutral-950/30",text: "text-neutral-700 dark:text-neutral-300", dot: "bg-neutral-500" },
  room_supplies:{ bg: "bg-pink-50 dark:bg-pink-950/30",   text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500" },
  toiletries:   { bg: "bg-fuchsia-50 dark:bg-fuchsia-950/30",text: "text-fuchsia-700 dark:text-fuchsia-300", dot: "bg-fuchsia-500" },
  amenities:    { bg: "bg-lime-50 dark:bg-lime-950/30",   text: "text-lime-700 dark:text-lime-300", dot: "bg-lime-500" },
  marketing:    { bg: "bg-rose-50 dark:bg-rose-950/30",   text: "text-rose-600 dark:text-rose-300", dot: "bg-rose-400" },
  misc:         { bg: "bg-gray-50 dark:bg-gray-950/30",   text: "text-gray-600 dark:text-gray-400", dot: "bg-gray-400" },
}

const DEFAULT_COLOR = { bg: "bg-gray-50 dark:bg-gray-950/30", text: "text-gray-600 dark:text-gray-400", dot: "bg-gray-400" }

function getCategoryColor(slug: string) {
  return CATEGORY_COLORS[slug] ?? DEFAULT_COLOR
}

/* ─── Component ───────────────────────────────────────────── */

export function ExpenseCategoriesPage() {
  const { categories, isLoading, loadError, create, update, remove, refresh } = useExpenseCategories()

  const [search, setSearch] = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<typeof categories[0] | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", slug: "", description: "" })
  const [autoSlug, setAutoSlug] = useState(true)

  // ── Filtered categories ──
  const filtered = useMemo(() => {
    if (!search) return categories
    const q = search.toLowerCase()
    return categories.filter(
      c => c.name.toLowerCase().includes(q) || c.slug.includes(q) || c.description.toLowerCase().includes(q),
    )
  }, [categories, search])

  // ── Stats ──
  const activeCount = useMemo(() => categories.filter(c => c.isActive).length, [categories])
  const disabledCount = categories.length - activeCount

  // ── Open create modal ──
  const openCreate = () => {
    setEditingCategory(null)
    setForm({ name: "", slug: "", description: "" })
    setAutoSlug(true)
    setModalOpen(true)
  }

  // ── Open edit modal ──
  const openEdit = (cat: typeof categories[0]) => {
    setEditingCategory(cat)
    setForm({ name: cat.name, slug: cat.slug, description: cat.description })
    setAutoSlug(false)
    setModalOpen(true)
  }

  // ── Handle name change (auto-slug) ──
  const handleNameChange = (name: string) => {
    setForm(prev => ({
      ...prev,
      name,
      slug: autoSlug ? slugify(name) : prev.slug,
    }))
  }

  // ── Save ──
  const handleSave = async () => {
    if (!form.name.trim()) {
      showError("Category name is required")
      return
    }
    if (!form.slug.trim()) {
      showError("Slug is required")
      return
    }
    // Validate slug format
    if (!/^[a-z0-9_]+$/.test(form.slug)) {
      showError("Slug can only contain lowercase letters, numbers, and underscores")
      return
    }

    try {
      if (editingCategory) {
        await update(editingCategory.id, {
          name: form.name,
          slug: form.slug,
          description: form.description,
        })
        showSuccess(`"${form.name}" updated`)
      } else {
        await create({
          name: form.name,
          slug: form.slug,
          description: form.description,
          sortOrder: categories.length + 1,
        })
        showSuccess(`"${form.name}" created`)
      }
      setModalOpen(false)
      setEditingCategory(null)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save category")
    }
  }

  // ── Toggle active state ──
  const handleToggleActive = async (cat: typeof categories[0]) => {
    try {
      await update(cat.id, { isActive: !cat.isActive })
      showSuccess(`"${cat.name}" ${cat.isActive ? "disabled" : "enabled"}`)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update category")
    }
  }

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await remove(deleteId)
      showSuccess("Category deleted")
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete category")
    } finally {
      setDeleteId(null)
    }
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <motion.div variants={pageTransitionFast}>
          <PageHeader
            title="Expense Categories"
            icon="Layers"
            description="Manage expense categories — edit names, enable/disable, add new ones"
            actions={
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" /> New Category
                </Button>
              </div>
            }
          />
        </motion.div>

        {/* Stats bar */}
        <motion.div variants={pageTransitionFast} className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <Tag className="h-4 w-4 text-primary" />
            <span className="font-medium">{categories.length}</span>
            <span className="text-muted-foreground">total</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <Eye className="h-4 w-4 text-success" />
            <span className="font-medium">{activeCount}</span>
            <span className="text-muted-foreground">active</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{disabledCount}</span>
            <span className="text-muted-foreground">disabled</span>
          </div>

          {/* Search */}
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Search categories..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-56 rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>
        </motion.div>

        {/* List */}
        <motion.div variants={pageTransitionFast}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <AlertCircle className="h-10 w-10 text-destructive/60" />
              <p className="text-muted-foreground">{loadError}</p>
              <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="Layers"
              title={search ? "No categories match your search" : "No expense categories yet"}
              description={search ? "Try a different search term" : "Add your first expense category to get started."}
              action={
                !search ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> New Category
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="divide-y divide-border">
                {filtered.map((cat, idx) => {
                  const color = getCategoryColor(cat.slug)
                  return (
                    <motion.div
                      key={cat.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className={cn(
                        "flex items-center gap-4 px-5 py-4 transition-colors",
                        !cat.isActive && "opacity-60",
                      )}
                    >
                      {/* Drag handle visual indicator */}
                      <div className="flex shrink-0 cursor-grab text-muted-foreground/30">
                        <GripVertical className="h-4 w-4" />
                      </div>

                      {/* Color dot + name */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className={cn("h-3 w-3 shrink-0 rounded-full", color.dot)} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{cat.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {cat.description || <span className="italic">No description</span>}
                          </p>
                        </div>
                      </div>

                      {/* Slug badge */}
                      <span className="hidden sm:inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {cat.slug}
                      </span>

                      {/* Sort order */}
                      <span className="hidden md:inline text-xs text-muted-foreground/60 w-8 text-center">
                        #{cat.sortOrder}
                      </span>

                      {/* Active toggle */}
                      <button
                        onClick={() => handleToggleActive(cat)}
                        className={cn(
                          "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                          cat.isActive
                            ? "bg-success/10 text-success hover:bg-success/20"
                            : "bg-muted text-muted-foreground hover:bg-muted/80",
                        )}
                        title={cat.isActive ? "Click to disable" : "Click to enable"}
                      >
                        {cat.isActive ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        <span className="hidden sm:inline">{cat.isActive ? "Active" : "Disabled"}</span>
                      </button>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEdit(cat)}
                          className="rounded-lg p-1.5 hover:bg-muted transition-colors"
                          title="Edit"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => setDeleteId(cat.id)}
                          className="rounded-lg p-1.5 hover:bg-destructive/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive/70" />
                        </button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )}
        </motion.div>

        {/* ── Create / Edit Modal ── */}
        <BaseModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditingCategory(null) }}
          title={editingCategory ? "Edit Category" : "New Expense Category"}
          size="sm"
        >
          <div className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">Category Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Dairy Products, Cleaning Supplies"
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                autoFocus
              />
            </div>

            {/* Slug */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">
                Slug
                <button
                  type="button"
                  onClick={() => setAutoSlug(!autoSlug)}
                  className={cn(
                    "ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                    autoSlug
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {autoSlug ? "Auto" : "Manual"}
                </button>
              </label>
              <input
                type="text"
                required
                placeholder="dairy_products"
                value={form.slug}
                onChange={e => { setForm(p => ({ ...p, slug: e.target.value })); setAutoSlug(false) }}
                className={cn(
                  "w-full rounded-lg border bg-background px-3 py-2.5 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:border-primary transition-all",
                  form.slug && !/^[a-z0-9_]+$/.test(form.slug)
                    ? "border-destructive focus:ring-destructive/30"
                    : "border-border focus:ring-primary/30",
                )}
              />
              {form.slug && !/^[a-z0-9_]+$/.test(form.slug) && (
                <p className="text-[10px] text-destructive">Only lowercase letters, numbers, and underscores</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">Description <span className="text-muted-foreground/50">(optional)</span></label>
              <input
                type="text"
                placeholder="Brief description of this category..."
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => { setModalOpen(false); setEditingCategory(null) }}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {editingCategory ? "Save Changes" : "Create Category"}
              </Button>
            </div>
          </div>
        </BaseModal>

        {/* Delete Confirmation */}
        <ConfirmDialog
          open={!!deleteId}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
          title="Delete Category"
          message="Are you sure you want to delete this expense category? This cannot be undone. Existing expenses with this category will retain the category slug but will no longer have a matching category entry."
          confirmLabel="Delete"
          variant="danger"
        />
      </div>
    </PageTransition>
  )
}
