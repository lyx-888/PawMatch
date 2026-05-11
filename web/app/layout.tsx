import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration'

import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: 'PawMatch SG — find a shelter pet',
    template: '%s · PawMatch SG',
  },
  description: 'Singapore shelter pets, in one place. Swipe through real pets up for adoption.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'PawMatch',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
  },
}

export const viewport: Viewport = {
  // `viewport-fit: cover` lets the page draw into iOS safe areas so the bottom
  // home-indicator strip doesn't show iOS's default black background.
  themeColor: '#fafaf9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>): React.ReactElement {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-dvh flex-col bg-stone-50 text-stone-900">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
