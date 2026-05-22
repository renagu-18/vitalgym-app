import type { Metadata } from 'next'
import { Open_Sans } from 'next/font/google'
import './globals.css'

const openSans = Open_Sans({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'VitalGym',
  description: 'Sistema de gestión para entrenamiento personalizado',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`${openSans.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-gray-900">
        {children}
      </body>
    </html>
  )
}
