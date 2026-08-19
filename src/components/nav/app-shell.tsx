'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import {
  MoreIcon,
  PRIMARY_NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
  NAV_ITEMS,
  isNavItemActive,
} from '@/components/nav/nav-items'
import { ThemeToggle } from '@/components/nav/theme-toggle'

/**
 * Two navigations for one route table: a fixed sidebar from lg upwards, and on
 * small screens a top bar plus a bottom tab bar with the five main sections.
 * The remaining routes sit in a "Mehr" sheet. The bottom bar is fixed, so the
 * content column carries matching bottom padding and never disappears under it.
 */

function Wordmark({ className = '' }: { className?: string }): ReactElement {
  return (
    <span className={`text-lg font-semibold tracking-tight text-ink ${className}`}>TRDashboard</span>
  )
}

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement | null>(null)

  const closeMore = useCallback(() => setMoreOpen(false), [])

  useEffect(() => {
    if (!moreOpen) return
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    sheetRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [moreOpen])

  const secondaryActive = SECONDARY_NAV_ITEMS.some((item) => isNavItemActive(pathname, item.href))

  return (
    <div className="min-h-screen bg-plane">
      <a
        href="#inhalt"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-60 focus:rounded-lg focus:border focus:border-border-strong focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:text-ink"
      >
        Zum Inhalt springen
      </a>

      {/* Desktop sidebar */}
      <div className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border-hair bg-surface lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5">
          <Link
            href="/"
            className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-series-1"
          >
            <Wordmark />
            <span className="sr-only">Zur Übersicht</span>
          </Link>
        </div>

        <nav aria-label="Hauptnavigation" className="flex-1 overflow-y-auto px-3 py-2">
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = isNavItemActive(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1 ${
                      active
                        ? 'bg-surface-2 font-medium text-ink'
                        : 'text-ink-secondary hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    <item.Icon className={active ? 'text-series-1' : 'text-ink-muted'} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-border-hair p-3">
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border-hair bg-surface px-4 lg:hidden">
        <Link
          href="/"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-series-1"
        >
          <Wordmark />
          <span className="sr-only">Zur Übersicht</span>
        </Link>
        <ThemeToggle variant="compact" />
      </header>

      <main id="inhalt" tabIndex={-1} className="pb-24 lg:pb-0 lg:pl-60">
        <div className="mx-auto w-full max-w-[1400px] px-6 py-8 lg:px-10">{children}</div>
      </main>

      {/* Mobile bottom tabs */}
      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border-hair bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {/* min-w-0 down the chain: without it the grid columns keep their
            min-content width and six labels overflow a 375px screen. */}
        <ul className="grid grid-cols-6">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href)
            return (
              <li key={item.href} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[10px] leading-tight transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-series-1 ${
                    active ? 'text-series-1' : 'text-ink-muted'
                  }`}
                >
                  <item.Icon />
                  <span className="w-full truncate text-center">{item.label}</span>
                </Link>
              </li>
            )
          })}
          <li className="min-w-0">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={`flex h-16 w-full flex-col items-center justify-center gap-1 px-0.5 text-[10px] leading-tight transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-series-1 ${
                secondaryActive ? 'text-series-1' : 'text-ink-muted'
              }`}
            >
              <MoreIcon />
              <span>Mehr</span>
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Menü schließen"
            onClick={closeMore}
            className="absolute inset-0 h-full w-full bg-plane/70 backdrop-blur-sm"
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Weitere Bereiche"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border-hair bg-surface p-4 pb-8 focus-visible:outline-none"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong" />
            <ul className="flex flex-col gap-1">
              {SECONDARY_NAV_ITEMS.map((item) => {
                const active = isNavItemActive(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={closeMore}
                      className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1 ${
                        active
                          ? 'bg-surface-2 font-medium text-ink'
                          : 'text-ink-secondary hover:bg-surface-2 hover:text-ink'
                      }`}
                    >
                      <item.Icon className={active ? 'text-series-1' : 'text-ink-muted'} />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            <button
              type="button"
              onClick={closeMore}
              className="mt-3 w-full rounded-lg border border-border-hair px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1"
            >
              Schließen
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
