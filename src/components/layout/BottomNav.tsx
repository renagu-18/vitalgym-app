'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Dumbbell, Ruler, LayoutDashboard, Users } from 'lucide-react'

interface BottomNavProps {
  role: 'client' | 'admin'
}

const clientLinks = [
  { href: '/dashboard',    icon: LayoutDashboard, label: 'Inicio' },
  { href: '/calendar',     icon: CalendarDays,    label: 'Calendario' },
  { href: '/training',     icon: Dumbbell,        label: 'Rutina' },
  { href: '/measurements', icon: Ruler,           label: 'Medidas' },
]

const adminLinks = [
  { href: '/admin',              icon: LayoutDashboard, label: 'Inicio' },
  { href: '/admin/clients',      icon: Users,           label: 'Clientes' },
  { href: '/admin/calendar',     icon: CalendarDays,    label: 'Calendario' },
  { href: '/admin/training',     icon: Dumbbell,        label: 'Rutinas' },
  { href: '/admin/measurements', icon: Ruler,           label: 'Medidas' },
]

export default function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname()
  const links = role === 'admin' ? adminLinks : clientLinks

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-100">
      <div className="max-w-lg mx-auto flex items-center justify-around py-2">
        {links.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || (href !== '/dashboard' && href !== '/admin' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors
                          ${isActive ? 'text-brand' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
