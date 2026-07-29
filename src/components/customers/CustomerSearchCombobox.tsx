/**
 * CustomerSearchCombobox — Searchable customer picker for Receive Payment
 * ──────────────────────────────────────────────────────────────────────
 *
 * Replaces the plain dropdown with a searchable combobox that:
 *   - Searches by name, phone, email
 *   - Prioritizes customers with outstanding balances
 *   - Supports keyboard navigation (Arrow keys, Enter, Escape)
 *   - Shows recent/outstanding customers at the top
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, ChevronDown, Users, Phone, CreditCard, X, Check } from "lucide-react"
import { cn, formatCurrency } from "@/lib/utils"
import { BaseModal } from "@/components/ui/modal"
import type { Customer } from "@/lib/services/customer-service"

/* ─── Types ────────────────────────────────────────────────── */

export interface CustomerQuickInfo {
  id: string
  name: string
  phone: string
  email: string
  outstandingBalance: number
  lastVisit: string
  totalOrders: number
}

interface CustomerSearchComboboxProps {
  open: boolean
  onClose: () => void
  customers: Customer[]
  customerOutstanding: Map<string, number>
  customerStats: Map<string, { totalOrders: number; lastVisit?: string }>
  onSelect: (customerId: string, customerName: string) => void
  title?: string
}

/* ─── Highlight matching text ─────────────────────────────── */

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/20 text-foreground font-semibold px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

/* ─── Score for search ranking ─────────────────────────────── */

function getSearchScore(customer: CustomerQuickInfo, query: string): number {
  const q = query.toLowerCase()
  const name = customer.name.toLowerCase()
  const phone = customer.phone.toLowerCase()
  const email = customer.email.toLowerCase()

  // Exact phone match = highest priority
  if (phone === q) return 1000
  // Exact name match
  if (name === q) return 900
  // Phone starts with
  if (phone.startsWith(q)) return 600
  // Name starts with
  if (name.startsWith(q)) return 500
  // Contains name
  if (name.includes(q)) return 300
  // Email matches
  if (email.includes(q)) return 200
  // Contains phone
  if (phone.includes(q)) return 100

  return 0
}

/* ─── Component ────────────────────────────────────────────── */

export function CustomerSearchCombobox({
  open,
  onClose,
  customers,
  customerOutstanding,
  customerStats,
  onSelect,
  title = "Select Customer",
}: CustomerSearchComboboxProps) {
  const [query, setQuery] = useState("")
  const [highlightedIdx, setHighlightedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery("")
      setHighlightedIdx(0)
    }
  }, [open])

  // Build enhanced customer list with outstanding balances
  const enhancedCustomers = useMemo((): CustomerQuickInfo[] => {
    return customers.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      outstandingBalance: customerOutstanding.get(c.id) ?? 0,
      lastVisit: c.lastVisit,
      totalOrders: customerStats.get(c.id)?.totalOrders ?? 0,
    }))
  }, [customers, customerOutstanding, customerStats])

  // Search + rank results
  const results = useMemo(() => {
    if (!query.trim()) {
      // No query: show outstanding customers first, then recent
      return [...enhancedCustomers].sort((a, b) => {
        // Outstanding first
        if (a.outstandingBalance > 0 && b.outstandingBalance === 0) return -1
        if (a.outstandingBalance === 0 && b.outstandingBalance > 0) return 1
        // Then by last visit (recent first)
        return new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime()
      }).slice(0, 20)
    }

    const scored = enhancedCustomers
      .map(c => ({ customer: c, score: getSearchScore(c, query) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)

    return scored.map(s => s.customer)
  }, [enhancedCustomers, query])

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIdx(0)
  }, [results.length])

  const handleSelect = useCallback((customer: CustomerQuickInfo) => {
    onSelect(customer.id, customer.name)
    onClose()
  }, [onSelect, onClose])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setHighlightedIdx(prev => Math.min(prev + 1, results.length - 1))
        break
      case "ArrowUp":
        e.preventDefault()
        setHighlightedIdx(prev => Math.max(prev - 1, 0))
        break
      case "Enter":
        e.preventDefault()
        if (results[highlightedIdx]) {
          handleSelect(results[highlightedIdx])
        }
        break
      case "Escape":
        e.preventDefault()
        onClose()
        break
    }
  }, [results, highlightedIdx, handleSelect, onClose])

  return (
    <BaseModal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by name, phone, or email..."
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-haspopup="listbox"
            aria-autocomplete="list"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Results count */}
        {query.trim() && (
          <p className="text-xs text-muted-foreground px-1">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </p>
        )}

        {/* Results list */}
        <div
          ref={listRef}
          className="max-h-72 overflow-y-auto space-y-0.5"
          role="listbox"
          aria-label="Customer results"
        >
          {results.length === 0 && query.trim() && (
            <div className="flex flex-col items-center py-8 text-center">
              <Users className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">No customers found</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Try a different search term
              </p>
            </div>
          )}

          {results.length === 0 && !query.trim() && (
            <div className="flex flex-col items-center py-8 text-center">
              <Search className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">Type to search customers</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Customers with outstanding balances appear first
              </p>
            </div>
          )}

          <AnimatePresence>
            {results.map((customer, idx) => (
              <motion.button
                key={customer.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02, duration: 0.15 }}
                onClick={() => handleSelect(customer)}
                onMouseEnter={() => setHighlightedIdx(idx)}
                role="option"
                aria-selected={highlightedIdx === idx}
                className={cn(
                  "w-full text-left flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                  highlightedIdx === idx
                    ? "bg-primary/10 ring-1 ring-primary/20"
                    : "hover:bg-muted"
                )}
              >
                {/* Avatar initials */}
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  customer.outstandingBalance > 0
                    ? "bg-amber-50 dark:bg-amber-950/20 text-amber-600"
                    : "bg-primary/10 text-primary"
                )}>
                  {customer.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      <HighlightedText text={customer.name} query={query} />
                    </span>
                    {customer.outstandingBalance > 0 && (
                      <span className="shrink-0 rounded-full bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                        {formatCurrency(customer.outstandingBalance)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <HighlightedText text={customer.phone} query={query} />
                    </span>
                    {customer.totalOrders > 0 && (
                      <>
                        <span className="text-muted-foreground/30">·</span>
                        <span className="text-xs text-muted-foreground">
                          {customer.totalOrders} order{customer.totalOrders > 1 ? "s" : ""}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Selected indicator */}
                {highlightedIdx === idx && (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                )}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </BaseModal>
  )
}
