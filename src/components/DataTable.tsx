import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"
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
  /** Animation delay stagger in ms between rows */
  rowAnimationDelay?: number
  // Server-side pagination props (if provided, overrides client-side pagination)
  loading?: boolean
  totalPages?: number
  currentPage?: number
  onPageChange?: (page: number) => void
}

function rowVariants(delay: number) {
  return {
    hidden: { opacity: 0, y: 8 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * delay, duration: 0.2, ease: "easeOut" as const },
    }),
  }
}

export function DataTable<T>({
  columns,
  data,
  searchable = false,
  searchKey,
  pageSize = 10,
  onRowClick,
  rowAnimationDelay = 0.03,
  loading = false,
  totalPages: serverTotalPages,
  currentPage: serverCurrentPage,
  onPageChange,
}: DataTableProps<T>) {
  const [clientPage, setClientPage] = useState(0)
  const [search, setSearch] = useState("")

  // Determine if we're using server-side or client-side pagination
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

  return (
    <div className="space-y-4">
      {searchable && searchKey && (
        <div className="relative max-w-sm">
          <Icon
            name="Search"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-foreground/30"
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-3 text-left font-medium text-muted-foreground",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {paged.length === 0 ? (
                <motion.tr
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <td
                    colSpan={columns.length}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No results found.
                  </td>
                </motion.tr>
              ) : (
                paged.map((row, i) => (
                  <motion.tr
                    key={`${currentPage}-${i}`}
                    custom={i}
                    variants={rowVariants(rowAnimationDelay)}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, y: -4 }}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "border-b border-border last:border-0 transition-colors duration-150",
                      onRowClick && "cursor-pointer hover:bg-muted/50"
                    )}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={cn("px-4 py-3", col.className)}>
                        {col.render
                          ? col.render(row)
                          : ((row as Record<string, unknown>)[col.key] as React.ReactNode)}
                      </td>
                    ))}
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="text-xs">
            Page {currentPage + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i
              } else if (currentPage < 3) {
                pageNum = i
              } else if (currentPage > totalPages - 3) {
                pageNum = totalPages - 5 + i
              } else {
                pageNum = currentPage - 2 + i
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-all duration-150",
                    currentPage === pageNum
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {pageNum + 1}
                </button>
              )
            })}
            <button
              onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
