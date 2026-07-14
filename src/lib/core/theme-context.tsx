import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface Accent {
  h: number
  s: number
}

interface ThemeContextValue {
  theme: Theme
  accent: Accent
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  setAccent: (accent: Accent) => void
  resetTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export const DEFAULT_ACCENT: Accent = { h: 0, s: 0 }

export const ACCENT_PRESETS: { name: string; h: number; s: number }[] = [
  { name: 'Default', h: 0, s: 0 },
  { name: 'Slate', h: 215, s: 25 },
  { name: 'Red', h: 0, s: 72 },
  { name: 'Orange', h: 24, s: 95 },
  { name: 'Amber', h: 38, s: 92 },
  { name: 'Green', h: 142, s: 71 },
  { name: 'Emerald', h: 160, s: 84 },
  { name: 'Teal', h: 173, s: 80 },
  { name: 'Cyan', h: 189, s: 94 },
  { name: 'Blue', h: 217, s: 91 },
  { name: 'Indigo', h: 239, s: 84 },
  { name: 'Violet', h: 271, s: 81 },
  { name: 'Purple', h: 288, s: 64 },
  { name: 'Pink', h: 340, s: 82 },
  { name: 'Rose', h: 0, s: 100 },
]

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialAccent(): Accent {
  try {
    const stored = localStorage.getItem('accent')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (typeof parsed.h === 'number' && typeof parsed.s === 'number') {
        return parsed
      }
    }
  } catch {
    // use default
  }
  return DEFAULT_ACCENT
}

function applyCSSVars(theme: Theme, accent: Accent) {
  const root = document.documentElement
  const { h, s } = accent

  if (theme === 'light') {
    root.style.setProperty('--primary', `${h} ${s}% 9%`)
    root.style.setProperty('--primary-foreground', `0 0% 98%`)
    root.style.setProperty('--secondary', `${h} ${Math.min(100, s + 10)}% 96%`)
    root.style.setProperty('--secondary-foreground', `${h} ${Math.min(100, s + 10)}% 9%`)
    root.style.setProperty('--muted', `${h} ${Math.min(100, s + 10)}% 93%`)
    root.style.setProperty('--muted-foreground', `${h} ${Math.max(0, s - 10)}% 50%`)
    root.style.setProperty('--accent', `${h} ${s}% 88%`)
    root.style.setProperty('--accent-foreground', `${h} ${s}% 9%`)
    root.style.setProperty('--border', `${h} ${s}% 82%`)
    root.style.setProperty('--input', `${h} ${s}% 82%`)
    root.style.setProperty('--ring', `${h} ${s}% 9%`)
  } else {
    const lightL = s > 0 ? 80 : 90
    const darkL = s > 0 ? 10 : 9
    const adjS = Math.max(0, s - 20)
    root.style.setProperty('--primary', `${h} ${adjS}% ${lightL}%`)
    root.style.setProperty('--primary-foreground', `${h} ${Math.min(100, s + 10)}% ${darkL}%`)
    root.style.setProperty('--secondary', `${h} ${adjS}% 16%`)
    root.style.setProperty('--secondary-foreground', `${h} ${adjS}% 85%`)
    root.style.setProperty('--muted', `${h} ${adjS}% 16%`)
    root.style.setProperty('--muted-foreground', `${h} ${adjS}% 70%`)
    root.style.setProperty('--accent', `${h} ${adjS}% 21%`)
    root.style.setProperty('--accent-foreground', `${h} ${adjS}% 85%`)
    root.style.setProperty('--border', `${h} ${adjS}% 28%`)
    root.style.setProperty('--input', `${h} ${adjS}% 28%`)
    root.style.setProperty('--ring', `${h} ${adjS}% ${lightL}%`)
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)
  const [accent, setAccentState] = useState<Accent>(getInitialAccent)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
    applyCSSVars(theme, accent)
  }, [theme, accent])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const stored = localStorage.getItem('theme')
      if (!stored) setThemeState(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const toggleTheme = useCallback(() => {
    const html = document.documentElement;
    html.classList.add('theme-transitioning');
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        html.classList.remove('theme-transitioning');
      });
    });
  }, [])
  const setTheme = useCallback((t: Theme) => setThemeState(t), [])
  const setAccent = useCallback(
    (a: Accent) => {
      setAccentState(a)
      localStorage.setItem('accent', JSON.stringify(a))
    },
    []
  )
  const resetTheme = useCallback(() => {
    localStorage.removeItem('theme')
    localStorage.removeItem('accent')
    setThemeState(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    setAccentState(DEFAULT_ACCENT)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, accent, toggleTheme, setTheme, setAccent, resetTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
