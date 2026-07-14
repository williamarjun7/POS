import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

// ── Quick Action Button (used in RoomCard & TableCard context menus) ─────

export function QuickActionButton({
  icon: Icon, label, onClick, variant = "default",
}: {
  icon: React.ElementType; label: string; onClick: () => void; variant?: "default" | "danger" | "success"
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      data-menu-item
      role="menuitem"
      tabIndex={-1}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors w-full",
        variant === "default" && "text-muted-foreground hover:bg-muted hover:text-foreground",
        variant === "danger" && "text-red-500 hover:bg-red-500/10",
        variant === "success" && "text-emerald-500 hover:bg-emerald-500/10",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </motion.button>
  )
}
