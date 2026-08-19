import type { Metadata } from 'next'
import type { ReactElement, ReactNode } from 'react'
import { AppShell } from '@/components/nav/app-shell'
import './globals.css'

export const metadata: Metadata = {
  title: 'TRDashboard',
  description: 'Training und Gesundheit im Überblick',
}

/**
 * Runs before first paint: the stored choice is stamped on <html> so the page
 * never renders in the wrong theme first. "system" stores no attribute, which
 * leaves the prefers-color-scheme rules in charge.
 */
const themeScript = `(function(){try{var t=localStorage.getItem('trdashboard-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="de-AT" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-plane text-ink antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
