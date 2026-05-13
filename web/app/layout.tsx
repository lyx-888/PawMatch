import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'

import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration'
import { Shell } from '@/components/layout/Shell'

import './globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
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
  // Matches --bg from globals.css so the iOS chrome blends with the gradient.
  themeColor: '#FAF6F0',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode
  // Parallel route slot for intercepting modals. Renders alongside
  // `children` so a route like /pets/[id] can appear as a bottom sheet
  // overlay when navigated to from inside the app, while a direct URL
  // load still falls through to the full page at app/pets/[id]/page.tsx.
  modal: React.ReactNode
}>): React.ReactElement {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      {/* Browser extensions (e.g. ColorZilla, Grammarly) inject attributes on
          <body> after the server-rendered HTML arrives, which trips React's
          hydration check. Per Next docs we suppress hydration warnings here
          only — children still get full hydration validation. */}
      <body className="flex min-h-dvh flex-col" suppressHydrationWarning>
        <Shell>{children}</Shell>
        {modal}
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
