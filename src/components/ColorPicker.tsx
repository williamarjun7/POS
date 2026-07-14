import { useState, useRef } from 'react'
import { useTheme, ACCENT_PRESETS } from '../lib/core/theme-context'
import { cn } from '../lib/utils'
import { Pipette } from 'lucide-react'

const SWATCH_SIZE = 'h-8 w-8'

export default function ColorPicker() {
  const { accent, setAccent } = useTheme()
  const inputRef = useRef<HTMLInputElement>(null)
  const [customHex, setCustomHex] = useState(() => {
    const { h, s } = accent
    return hslToHex(h, s, 50)
  })

  function hslToHex(h: number, s: number, l: number): string {
    s /= 100
    l /= 100
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => {
      const k = (n + h / 30) % 12
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
      return Math.round(255 * color)
        .toString(16)
        .padStart(2, '0')
    }
    return `#${f(0)}${f(8)}${f(4)}`
  }

  const isSelected = (h: number, s: number) => accent.h === h && accent.s === s

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {ACCENT_PRESETS.map((p) => (
          <button
            key={p.name}
            title={p.name}
            onClick={() => {
              setAccent({ h: p.h, s: p.s })
              setCustomHex(hslToHex(p.h, p.s, 50))
            }}
            className={cn(
              'rounded-full ring-offset-2 ring-offset-background transition-all',
              SWATCH_SIZE,
              isSelected(p.h, p.s) && 'ring-2 ring-foreground scale-110'
            )}
            style={{
              backgroundColor: `hsl(${p.h} ${p.s}% 50%)`,
            }}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => inputRef.current?.click()}
          className={cn(
            'rounded-full ring-offset-2 ring-offset-background transition-all flex items-center justify-center overflow-hidden',
            SWATCH_SIZE,
            !ACCENT_PRESETS.some((p) => isSelected(p.h, p.s)) && 'ring-2 ring-foreground scale-110'
          )}
          style={{ backgroundColor: customHex }}
          title="Custom color"
        >
          <Pipette className="h-3.5 w-3.5 text-background mix-blend-difference" />
        </button>
        <input
          ref={inputRef}
          type="color"
          value={customHex}
          onChange={(e) => {
            const hex = e.target.value
            setCustomHex(hex)
            const r = parseInt(hex.substring(1, 3), 16) / 255
            const g = parseInt(hex.substring(3, 5), 16) / 255
            const b = parseInt(hex.substring(5, 7), 16) / 255
            const max = Math.max(r, g, b), min = Math.min(r, g, b)
            let h = 0, s = 0
            const l = (max + min) / 2
            if (max !== min) {
              const d = max - min
              s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
              switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
                case g: h = ((b - r) / d + 2) / 6; break
                case b: h = ((r - g) / d + 4) / 6; break
              }
            }
            setAccent({ h: Math.round(h * 360), s: Math.round(s * 100) })
          }}
          className="sr-only"
          tabIndex={-1}
        />
        <span className="text-xs text-muted-foreground ml-1">Custom</span>
      </div>
    </div>
  )
}
