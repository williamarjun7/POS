import { useNavigate, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import {
  PanelLeftClose,
  PanelLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/icon-mapper"
import { useSidebarBadges } from "@/lib/hooks/useSidebarBadges"
import { usePermissions } from "@/lib/core/permissions"
import logo from "@/assets/logo.png"
import type { SidebarItem } from "@/types"

const EXPANDED_WIDTH = 260
const COLLAPSED_WIDTH = 64

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { badges } = useSidebarBadges()
  const { can } = usePermissions()

  // Inline navigation items — permissions are checked per item
  const NAV_ITEMS: SidebarItem[] = [
    { label: "Dashboard", icon: "LayoutDashboard", href: "/dashboard" },
    { label: "POS", icon: "ShoppingCart", href: "/pos", permission: "orders.create" },
    { label: "Orders", icon: "ClipboardList", href: "/orders", permission: "orders.view" },
    { label: "Customers", icon: "Users", href: "/customers", permission: "customers.view" },
    { label: "Operations", icon: "BedDouble", href: "/operations", permission: "operations.view" },
    { label: "Menu", icon: "UtensilsCrossed", href: "/menu", permission: "menu.view" },
    { label: "Inventory", icon: "Package", href: "/inventory", permission: "inventory.view" },
    { label: "Suppliers", icon: "Truck", href: "/suppliers", permission: "suppliers.view" },
    { label: "Expenses", icon: "Receipt", href: "/expenses", permission: "expenses.create" },
    { label: "Finance", icon: "CreditCard", href: "/finance", permission: "finance.view" },
    { label: "Analytics", icon: "BarChart3", href: "/analytics", permission: "reports.view" },
    { label: "Reports", icon: "FileText", href: "/reports", permission: "reports.view" },
    { label: "Administration", icon: "Settings", href: "/admin", permission: "users.manage" },
    { label: "Notifications", icon: "Bell", href: "/notifications", permission: "notifications.view" },
    { label: "Profile", icon: "UserCheck", href: "/profile", permission: "profile.view" },
    { label: "Print Settings", icon: "Printer", href: "/print-settings", permission: "print.manage" },
    { label: "Room Types", icon: "BedDouble", href: "/room-types", permission: "operations.manage" },
  ]

  // Filter sidebar items by permission, respecting each item's required permission
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.permission) return true
    return can(item.permission)
  })

  const badgeMap: Record<string, number> = {
    '/orders': badges.orders,
    '/operations': badges.operations,
    '/inventory': badges.inventory,
    '/notifications': badges.notifications,
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className={cn(
        "fixed top-0 left-0 z-50 flex h-full flex-col bg-sidebar text-sidebar-foreground",
        "border-r border-sidebar-border",
        "max-lg:z-50 max-lg:shadow-xl"
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <img src={logo} alt="Highlands Cafe & Motel Inn" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="truncate text-sm font-semibold"
          >
            Highlands Cafe & Motel Inn
          </motion.span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto no-scrollbar px-2 py-3">
        <ul className="space-y-0.5">
          {visibleItems.map((item: SidebarItem) => {
            const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href))
            return (
              <li key={item.href}>
                <button
                  onClick={() => navigate(item.href)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    collapsed && "justify-center px-0"
                  )}
                >
                  <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                  {!collapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                  {!collapsed && (badgeMap[item.href] ?? 0) > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {badgeMap[item.href]}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-2 space-y-1">
        <button
          onClick={onToggle}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? (
            <PanelLeft className="h-5 w-5 shrink-0" />
          ) : (
            <PanelLeftClose className="h-5 w-5 shrink-0" />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  )
}
