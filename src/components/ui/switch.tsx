import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Check, X } from "lucide-react"

type SwitchSize = "sm" | "md" | "lg"

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  size?: SwitchSize
  label?: string
  description?: string
}

const sizeMap: Record<SwitchSize, { h: string; w: string; text: string; px: string; icon: string }> = {
  sm: { h: "h-[26px]", w: "w-[62px]", text: "text-[11px]", px: "px-2.5", icon: "h-3 w-3" },
  md: { h: "h-[32px]", w: "w-[74px]", text: "text-xs", px: "px-3", icon: "h-3.5 w-3.5" },
  lg: { h: "h-[38px]", w: "w-[86px]", text: "text-sm", px: "px-3.5", icon: "h-4 w-4" },
}

export function Switch({
  checked,
  onChange,
  disabled,
  size = "md",
  label,
  description,
}: SwitchProps) {
  const s = sizeMap[size]

  return (
    <div className="flex items-center justify-between gap-4">
      {(label || description) && (
        <div className="min-w-0">
          {label && <p className="text-sm font-medium text-foreground">{label}</p>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}

      <motion.button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => { if (!disabled) onChange(!checked) }}
        disabled={disabled}
        whileTap={{ scale: disabled ? 1 : 0.93 }}
        className={cn(
          "relative shrink-0 overflow-hidden rounded-full outline-none",
          "focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          s.h, s.w,
          disabled && "cursor-not-allowed opacity-40",
          !disabled && [
            checked
              ? "shadow-[0_0_0_0_rgba(16,185,129,0)] hover:shadow-[0_0_0_4px_rgba(16,185,129,0.08)]"
              : "hover:shadow-[0_0_0_4px_rgba(0,0,0,0.04)]",
          ],
        )}
      >
        {/* ── Track Background ── */}
        <motion.div
          initial={false}
          animate={{
            background: checked
              ? "linear-gradient(135deg, #10b981, #059669)"
              : "hsl(var(--muted-foreground) / 0.12)",
          }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="absolute inset-0 rounded-full"
        />

        {/* ── Subtle glass overlay (off state) ── */}
        <motion.div
          initial={false}
          animate={{ opacity: checked ? 0 : 1 }}
          transition={{ duration: 0.25 }}
          className="absolute inset-0 rounded-full bg-gradient-to-b from-white/[0.07] to-transparent"
        />

        {/* ── Border ── */}
        <motion.div
          initial={false}
          animate={{
            borderColor: checked
              ? "rgba(16,185,129,0.5)"
              : "hsl(var(--border))",
          }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 rounded-full border"
        />

        {/* ── Outer Glow when ON ── */}
        <motion.span
          initial={false}
          animate={{
            opacity: checked ? 1 : 0,
            scale: checked ? 1 : 0.85,
          }}
          transition={{ duration: 0.25 }}
          className="absolute -inset-[3px] rounded-full shadow-[0_0_16px] shadow-emerald-500/25 blur-[5px]"
        />

        {/* ── Inner shine (ON state) ── */}
        <motion.span
          initial={false}
          animate={{ opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.3, delay: checked ? 0.05 : 0 }}
          className="absolute top-[2px] left-[2px] right-[2px] h-1/2 rounded-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none"
        />

        {/* ── Content ── */}
        <motion.div
          initial={false}
          animate={{
            justifyContent: checked ? "flex-end" : "flex-start",
          }}
          transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.5 }}
          className={cn("relative z-10 flex h-full w-full items-center", s.px)}
        >
          {/* Icon */}
          <motion.span
            key={checked ? "check" : "x"}
            initial={{ opacity: 0, scale: 0.5, rotate: -30 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.5, rotate: 30 }}
            transition={{ type: "spring", stiffness: 400, damping: 20, mass: 0.3 }}
            className={cn(
              "shrink-0",
              s.icon,
              checked ? "text-white" : "text-muted-foreground/50",
            )}
          >
            {checked ? <Check className="h-full w-full" strokeWidth={2.5} /> : <X className="h-full w-full" strokeWidth={2.5} />}
          </motion.span>

          {/* Label */}
          <motion.span
            initial={false}
            animate={{
              color: checked ? "rgb(255,255,255)" : "hsl(var(--muted-foreground))",
              fontWeight: checked ? 600 : 400,
            }}
            transition={{ duration: 0.2 }}
            className={cn(s.text, "select-none tracking-wide ml-1")}
          >
            {checked ? "On" : "Off"}
          </motion.span>
        </motion.div>
      </motion.button>
    </div>
  )
}
