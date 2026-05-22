import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BottomNav from './BottomNav'
import LogoutButton from './LogoutButton'

export default async function ClientShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <span className="text-lg font-bold text-gray-900">VitalGym</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 truncate max-w-[120px]">{profile?.full_name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 pb-24">
        {children}
      </main>
      <BottomNav role="client" />
    </div>
  )
}
