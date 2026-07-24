import { useState, useRef, useEffect, useMemo } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Sun, Moon, LogOut, User, Settings } from "lucide-react"
import { useTheme } from "@/lib/core/theme-context"
import { useAuth } from "@/lib/core/auth-context"
import logo from "@/assets/logo.png"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ConfirmDialog"

interface TopNavProps {
  onMobileMenuToggle?: () => void
}

export function TopNav({ onMobileMenuToggle }: TopNavProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { toggleTheme, theme } = useTheme()
  const { user, logout } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
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
      { label: 'Administration', href: '/admin' },
      { label: 'Profile', href: '/profile' }, { label: 'Print Settings', href: '/print-settings' }, { label: 'Expense Categories', href: '/expense-categories' },
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
    <>
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex w-full items-center gap-2 sm:gap-4 px-responsive">
        {/* Mobile hamburger */}
        <button
          onClick={onMobileMenuToggle}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
          aria-label="Toggle menu"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Page title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button onClick={() => navigate('/dashboard')} aria-label="Navigate to dashboard" className="flex lg:hidden h-8 w-8 shrink-0 items-center justify-center rounded-md cursor-pointer overflow-hidden">
            <img src={logo} alt="Highlands Cafe & Motel Inn" className="h-full w-full rounded-full object-cover" />
          </button>
          <span className="text-base sm:text-lg font-semibold text-truncate">{currentPageName}</span>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9 sm:h-10 sm:w-10 text-muted-foreground hover:text-foreground"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 sm:h-5 sm:w-5" /> : <Moon className="h-4 w-4 sm:h-5 sm:w-5" />}
          </Button>

          <div className="hidden sm:block h-6 w-px bg-border shrink-0" />

          {/* Avatar with Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground ring-2 ring-transparent transition-all hover:ring-primary/30"
              aria-label="Profile menu"
            >
              {initials}
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-2 shadow-lg ring-1 ring-border/50 animate-in fade-in zoom-in-95 origin-top-right">
                <div className="px-3 py-2.5">
                  <p className="text-sm font-semibold text-truncate">{user?.name ?? 'User'}</p>
                  <p className="text-xs text-muted-foreground">{user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User'}</p>
                </div>
                <div className="mx-2 h-px bg-border" />
                <button
                  onClick={() => { navigate('/profile'); setProfileOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <User className="h-4 w-4 shrink-0" />
                  Profile
                </button>
                <button
                  onClick={() => { navigate('/admin'); setProfileOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  Settings
                </button>
              </div>
            )}
          </div>

          {/* Logout */}
          <button
            onClick={() => setLogoutConfirmOpen(true)}
            className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>
    </header>

      {/* Logout Confirmation Dialog — rendered outside the sticky header
          so fixed positioning works correctly (sticky containers can clip
          fixed-position child elements) */}
      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Logout"
        message={`Are you sure you want to logout${user?.name ? `, ${user.name}` : ''}? You'll need to sign in again.`}
        confirmLabel="Logout"
        cancelLabel="Stay Signed In"
        variant="danger"
        onConfirm={() => {
          setLogoutConfirmOpen(false)
          // Chain the redirect AFTER logout() fully completes.
          // logout() does: await signOut() → clearSession() → setUser(null).
          // Without this .then(), the redirect fires before clearSession()
          // runs, leaving stale loginTimestamp in localStorage. On page
          // reload, isSessionValid() returns true and the SDK restores
          // the session, silently re-logging the user in.
          logout().then(() => {
            window.location.href = '/login'
          })
        }}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
    </>
  )
}
