import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, Inbox } from "lucide-react"
import { Icon } from "@/components/icon-mapper"
import { cn } from "@/lib/utils"

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  searchable?: boolean
  searchKey?: string
  pageSize?: number
  onRowClick?: (row: T) => void
  rowAnimationDelay?: number
  /** Compact/dense mode with smaller padding */
  dense?: boolean
  // Server-side pagination props
  loading?: boolean
  totalPages?: number
  currentPage?: number
  onPageChange?: (page: number) => void
  /** ID of the currently selected row for visual highlight */
  selectedId?: string
  /** Key to use for matching selectedId against rows (default: 'id') */
  selectedKey?: string
}

function rowVariants(delay: number) {
  return {
    hidden: { opacity: 0, y: 6 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * delay, duration: 0.2, ease: "easeOut" as const },
    }),
  }
}

/** Generate a compact page range with ellipsis */
function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i)

  const pages: (number | 'ellipsis')[] = []
  if (current <= 3) {
    pages.push(0, 1, 2, 3, 'ellipsis', total - 1)
  } else if (current >= total - 4) {
    pages.push(0, 'ellipsis', total - 4, total - 3, total - 2, total - 1)
  } else {
    pages.push(0, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total - 1)
  }
  return pages
}

/** Loading skeleton row */
function SkeletonRow({ columns, dense }: { columns: Column<unknown>[]; dense?: boolean }) {
  return (
    <tr className="border-b border-border/50 last:border-0">
      {columns.map((col, i) => (
        <td key={col.key} className={cn(dense ? "px-3 py-2.5" : "px-4 py-3", col.className)}>
          <div
            className={cn(
              "h-4 rounded-md bg-muted/60 animate-pulse",
              i === 0 ? "w-32" : i === columns.length - 1 ? "w-8" : "w-20"
            )}
          />
        </td>
      ))}
    </tr>
  )
}

export function DataTable<T>({
  columns,
  data,
  searchable = false,
  searchKey,
  pageSize = 10,
  onRowClick,
  rowAnimationDelay = 0.03,
  dense = false,
  loading = false,
  totalPages: serverTotalPages,
  currentPage: serverCurrentPage,
  onPageChange,
  selectedId,
  selectedKey = 'id',
}: DataTableProps<T>) {
  const [clientPage, setClientPage] = useState(0)
  const [search, setSearch] = useState("")

  const isServerSide = serverTotalPages !== undefined

  const filtered = useMemo(() => {
    if (isServerSide || !searchable || !searchKey || !search) return data
    return data.filter((row) =>
      String((row as Record<string, unknown>)[searchKey]).toLowerCase().includes(search.toLowerCase())
    )
  }, [data, search, searchable, searchKey, isServerSide])

  const totalPages = isServerSide ? serverTotalPages! : Math.ceil(filtered.length / pageSize)
  const currentPage = isServerSide ? (serverCurrentPage ?? 0) : clientPage
  const setPage = isServerSide ? (onPageChange ?? setClientPage) : setClientPage

  const paged = isServerSide ? data : filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  const cellPadding = dense ? "px-3 py-2.5" : "px-4 py-3"

  return (
    <div className="space-y-3">
      {/* ── Search bar (client-side only) ── */}
      {searchable && searchKey && (
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    cellPadding,
                    "text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              // ── Loading state: skeleton rows (no animation wrapper to avoid AnimatePresence conflicts) ──
              Array.from({ length: 5 }).map((_, i) => (
                <tr
                  key={`skeleton-${i}`}
                  className="border-b border-border/50 last:border-0"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {columns.map((col, ci) => (
                    <td key={col.key} className={cn(dense ? "px-3 py-2.5" : "px-4 py-3", col.className)}>
                      <div
                        className={cn(
                          "h-4 rounded-md bg-muted/60 animate-pulse",
                          ci === 0 ? "w-32" : ci === columns.length - 1 ? "w-8" : "w-20"
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              // ── Empty state ──
              <tr>
                <td colSpan={columns.length} className="px-4 py-12">
                  <div className="flex flex-col items-center justify-center text-center animate-fade-in">
                    <Inbox className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No results found</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      Try adjusting your search or filters
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              // ── Data rows ──
              <AnimatePresence initial={false}>
                {paged.map((row, i) => (
                  <motion.tr
                    key={`row-${currentPage}-${i}`}
                    custom={i}
                    variants={rowVariants(rowAnimationDelay)}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, y: -4 }}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "group border-b border-border/60 last:border-0 transition-colors duration-150",
                      i % 2 === 0 ? "bg-background" : "bg-muted/10",
                      onRowClick && "cursor-pointer hover:bg-muted/40",
                      selectedId && String((row as any)[selectedKey]) === String(selectedId) &&
                        "bg-primary/5 border-l-2 border-l-primary hover:bg-primary/8"
                    )}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={cn(cellPadding, "text-sm", col.className)}>
                        {col.render
                          ? col.render(row)
                          : ((row as Record<string, unknown>)[col.key] as React.ReactNode)}
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-xs text-muted-foreground shrink-0">
            {isServerSide
              ? `Page ${currentPage + 1} of ${totalPages}`
              : `${filtered.length} result${filtered.length !== 1 ? 's' : ''} · Page ${currentPage + 1} of ${totalPages}`}
          </span>

          <div className="flex items-center gap-1">
            {/* First page */}
            <button
              onClick={() => setPage(0)}
              disabled={currentPage === 0}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:opacity-25 disabled:pointer-events-none"
              title="First page"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>

            {/* Previous */}
            <button
              onClick={() => setPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:opacity-25 disabled:pointer-events-none"
              title="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-0.5 mx-1">
              {getPageNumbers(currentPage, totalPages).map((page, idx) =>
                page === 'ellipsis' ? (
                  <span key={`e-${idx}`} className="flex h-8 w-6 items-center justify-center text-xs text-muted-foreground/40 select-none">
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => setPage(page)}
                    className={cn(
                      "flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-1.5 text-xs font-medium transition-all duration-150",
                      currentPage === page
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {page + 1}
                  </button>
                )
              )}
            </div>

            {/* Next */}
            <button
              onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:opacity-25 disabled:pointer-events-none"
              title="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>

            {/* Last page */}
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={currentPage >= totalPages - 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:opacity-25 disabled:pointer-events-none"
              title="Last page"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
