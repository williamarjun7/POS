import {
  LayoutDashboard, ShoppingCart, ClipboardList, Receipt, CreditCard,
  Package, UtensilsCrossed, Users, Calendar, BedDouble, Truck, BarChart3,
  Settings, LogOut, PanelLeftClose, PanelLeft, Search, Bell, Moon, Sun,
  ChevronDown, TrendingUp, TrendingDown, DollarSign, Wallet, Calculator,
  Percent, RotateCcw, Landmark, Headphones, Banknote, Smartphone, Building2,
  Clock, FileCheck, Clock3, AlertCircle, ShoppingBag, CheckCircle2, XCircle,
  Timer, ConciergeBell, UserPlus, UserCheck, Heart, RefreshCw, Coins,
  AlertTriangle, PackageX, Warehouse, ArrowDownRight, Trash2, Bed, DoorOpen,
  LogIn, Tag, ArrowUpRight, Plus, Monitor, FileText, Minus, MoreHorizontal,
  ExternalLink, Filter, Download, ChevronRight, ChevronLeft, Home, X, Utensils,
  Wrench, Sparkles, ClipboardCheck, ChefHat, Store, PieChart, FileBarChart, CookingPot,
  Shield, CircleDollarSign, Activity, Zap, Hotel, Coffee, Mail, Phone,
  MapPin, Star, MessageSquare, Eye, Edit, Lock, UserCog, Gauge, Thermometer,
  Droplets, Wifi, Tv, Sofa, ShowerHead, CircleAlert, HandCoins, Scale,  QrCode, Printer,
   Cigarette, Flame, Milk, Leaf, Citrus, GlassWater, type LucideIcon,
} from "lucide-react"

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard, ShoppingCart, ClipboardList, Receipt, CreditCard,
  Package, UtensilsCrossed, Users, Calendar, BedDouble, Truck, BarChart3,
  Settings, LogOut, PanelLeftClose, PanelLeft, Search, Bell, Moon, Sun,
  ChevronDown, TrendingUp, TrendingDown, DollarSign, Wallet, Calculator,
  Percent, RotateCcw, Landmark, Headphones, Banknote, Utensils, Smartphone, Building2,
  Clock, FileCheck, Clock3, AlertCircle, ShoppingBag, CheckCircle2, XCircle,
  Timer, ConciergeBell, UserPlus, UserCheck, Heart, RefreshCw, Coins,
  AlertTriangle, PackageX, Warehouse, ArrowDownRight, Trash2, Bed, DoorOpen,
  LogIn, Tag, ArrowUpRight, Plus, Monitor, FileText, Minus, MoreHorizontal,
  ExternalLink, Filter, Download, ChevronRight, ChevronLeft, Home, X,
  Wrench, Sparkles, ClipboardCheck, ChefHat, Store, PieChart, FileBarChart, CookingPot,
  Shield, CircleDollarSign, Activity, Zap, Hotel, Coffee, Mail, Phone,
  MapPin, Star, MessageSquare, Eye, Edit, Lock, UserCog, Gauge, Thermometer,
  Droplets, Wifi, Tv, Sofa, ShowerHead, CircleAlert, HandCoins, Scale, QrCode, Printer,
  Cigarette, Flame, Milk, Leaf, Citrus, GlassWater,
}

type IconProps = Omit<React.ComponentProps<LucideIcon>, "name">

export function Icon({ name, className, ...props }: { name: string; className?: string } & IconProps) {
  const IconComponent = iconMap[name]
  if (!IconComponent) return null
  return <IconComponent className={className} {...props} />
}
