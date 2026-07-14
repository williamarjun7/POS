import { useState, useRef, useEffect, useMemo } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Sun, Moon, Bell, LogOut, User, Settings } from "lucide-react"
import { useTheme } from "@/lib/core/theme-context"
import { useAuth } from "@/lib/core/auth-context"
import logo from "@/assets/logo.png"
import { Button } from "@/components/ui/button"

interface TopNavProps {
  onMobileMenuToggle?: () => void
}

export function TopNav({ onMobileMenuToggle }: TopNavProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { toggleTheme, theme } = useTheme()
  const { user } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  // Derive initials from the authenticated user's name
  const initials = useMemo(() => {
    if (!user?.name) return '?'
    return user.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }, [user?.name])

  const currentPageName = useMemo(() => {
    const NAV_ITEMS = [
      { label: 'Dashboard', href: '/dashboard' }, { label: 'POS', href: '/pos' },
      { label: 'Orders', href: '/orders' }, { label: 'Customers', href: '/customers' },
      { label: 'Operations', href: '/operations' }, { label: 'Menu', href: '/menu' },
      { label: 'Inventory', href: '/inventory' }, { label: 'Suppliers', href: '/suppliers' },
      { label: 'Expenses', href: '/expenses' }, { label: 'Finance', href: '/finance' },
      { label: 'Analytics', href: '/analytics' }, { label: 'Reports', href: '/reports' },
      { label: 'Administration', href: '/admin' }, { label: 'Notifications', href: '/notifications' },
      { label: 'Profile', href: '/profile' }, { label: 'Print Settings', href: '/print-settings' },
      { label: 'Room Types', href: '/room-types' },
    ]
    const item = NAV_ITEMS.find(
      (item) => location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href))
    )
    return item?.label ?? 'Dashboard'
  }, [location.pathname])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex w-full items-center gap-4 px-4 lg:px-6">
        <button
          onClick={onMobileMenuToggle}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/dashboard')} aria-label="Navigate to dashboard" className="flex lg:hidden h-6 w-6 items-center justify-center rounded-md shrink-0 animate-pulse cursor-pointer overflow-hidden">
            <img src={logo} alt="Highlands Cafe & Motel Inn" className="h-full w-full rounded-full object-cover" />
          </button>
          <span className="text-lg font-semibold">{currentPageName}</span>
        </div>



        <div className="ml-auto flex items-center gap-2">
          <button className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              3
            </span>
          </button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-10 w-10 text-muted-foreground hover:text-foreground"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          <div className="h-6 w-px bg-border" />

          {/* Avatar with Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground ring-2 ring-transparent transition-all hover:ring-primary/30"
            >
              {initials}
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border bg-popover p-2 shadow-lg ring-1 ring-border/50 animate-in fade-in zoom-in-95 origin-top-right">
                <div className="px-3 py-2.5">
                  <p className="text-sm font-semibold">{user?.name ?? 'User'}</p>
                  <p className="text-xs text-muted-foreground">{user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User'}</p>
                </div>
                <div className="mx-2 h-px bg-border" />
                <button
                  onClick={() => { navigate('/profile'); setProfileOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <User className="h-4 w-4" />
                  Profile
                </button>
                <button
                  onClick={() => { navigate('/admin'); setProfileOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </button>
              </div>
            )}
          </div>

          {/* Logout */}
          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  )
}
