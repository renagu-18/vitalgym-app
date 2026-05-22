import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BottomNav from '@/components/layout/BottomNav'
import LogoutButton from '@/components/layout/LogoutButton'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-black text-white px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold">
            VitalGym <span className="text-xs font-normal text-gray-500 ml-1">Admin</span>
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 truncate max-w-[120px]">{profile?.full_name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24">
        {children}
      </main>

      <BottomNav role="admin" />
    </div>
  )
}
