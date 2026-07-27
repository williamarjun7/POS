import { useState } from "react"
import { Outlet } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Sidebar } from "@/layouts/Sidebar"
import { TopNav } from "@/layouts/TopNav"
import { RouteTransition } from "@/components/RouteTransition"
import { useMediaQuery } from "@/lib/hooks/useMediaQuery"

const SIDEBAR_WIDTH = 260
const SIDEBAR_COLLAPSED_WIDTH = 64

export function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const isLg = useMediaQuery("(min-width: 1024px)")

  const toggleCollapse = () => setCollapsed((prev) => !prev)
  const toggleMobile = () => setMobileOpen((prev) => !prev)

  return (
    // ═══ Root: full viewport, no body scrolling ═══
    // h-dvh = 100dvh (dynamic viewport height).
    // overflow-hidden prevents scroll chaining into body.
    // flex-col stacks TopNav + main content vertically.
    <div className="h-dvh flex flex-col overflow-hidden bg-background">
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

      {/* Mobile sidebar — slide-out drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 left-0 z-50 h-full lg:hidden"
          >
            <Sidebar collapsed={false} onToggle={toggleMobile} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop sidebar — fixed to the left, taken out of flow so main content can shift right */}
      <div className="hidden lg:block fixed top-0 left-0 z-40 h-screen">
        <Sidebar collapsed={collapsed} onToggle={toggleCollapse} />
      </div>

      {/* ═══ Main content column ═══
          Takes full remaining height after TopNav.
          overflow-y-auto makes this the single scrollable area for page content.
          min-h-0 is essential for flex children to shrink below their content height. */}
      <motion.div
        animate={{
          marginLeft: isLg ? (collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH) : 0,
        }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="flex flex-col min-h-0 flex-1 max-lg:ml-0"
      >
        <TopNav onMobileMenuToggle={toggleMobile} />
        <main className="flex-1 overflow-y-auto min-h-0 p-3 sm:p-4 lg:p-5">
          <div className="fluid-container min-h-0">
            <RouteTransition>
              <Outlet />
            </RouteTransition>
          </div>
        </main>
      </motion.div>
    </div>
  )
}
