import { useState } from "react"
import { Outlet } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Sidebar } from "@/layouts/Sidebar"
import { TopNav } from "@/layouts/TopNav"
import { RouteTransition } from "@/components/RouteTransition"

const SIDEBAR_WIDTH = 260
const SIDEBAR_COLLAPSED_WIDTH = 64

export function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggleCollapse = () => setCollapsed((prev) => !prev)
  const toggleMobile = () => setMobileOpen((prev) => !prev)

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={toggleMobile}
          />
        )}
      </AnimatePresence>

      {/* Mobile sidebar */}
      <div className={cn("lg:hidden", mobileOpen ? "block" : "hidden")}>
        <Sidebar collapsed={false} onToggle={toggleCollapse} />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} onToggle={toggleCollapse} />
      </div>

      {/* Main content */}
      <motion.div
        animate={{
          marginLeft: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="min-h-screen flex-1 max-lg:ml-0"
      >
        <TopNav onMobileMenuToggle={toggleMobile} />
        <main className="p-4 lg:p-6">
          <div className="mx-auto max-w-[1600px]">
            <RouteTransition>
              <Outlet />
            </RouteTransition>
          </div>
        </main>
      </motion.div>
    </div>
  )
}
