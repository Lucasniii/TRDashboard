'use client'

import { useCallback, useSyncExternalStore, type ReactElement } from 'react'

/**
 * Three-state theme switch. "System" means: no data-theme attribute at all, so
 * the prefers-color-scheme rules in globals.css decide. The stored value is
 * subscribed to as an external store — the server and the first client render
 * agree on 'system', and the inline script in <head> has already painted the
 * right colours, so there is nothing to flash.
 */

export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'trdashboard-theme'
const ORDER: readonly ThemeChoice[] = ['light', 'dark', 'system']

const LABELS: Record<ThemeChoice, string> = {
  light: 'Hell',
  dark: 'Dunkel',
  system: 'System',
}

function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system'
}

/**
 * localStorage as an external store: one cached snapshot plus a listener set,
 * so a write in this tab and a `storage` event from another tab both land.
 */
const listeners = new Set<() => void>()
let snapshot: ThemeChoice | null = null

function readStored(): ThemeChoice {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return isThemeChoice(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

function onStorageEvent(event: StorageEvent): void {
  if (event.key !== null && event.key !== STORAGE_KEY) return
  snapshot = readStored()
  emit()
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorageEvent)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorageEvent)
  }
}

function getSnapshot(): ThemeChoice {
  if (snapshot === null) snapshot = readStored()
  return snapshot
}

function getServerSnapshot(): ThemeChoice {
  return 'system'
}

function storeChoice(next: ThemeChoice): void {
  snapshot = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // A blocked storage quota must not break the switch itself.
  }
  emit()
}

function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') {
    delete root.dataset.theme
    return
  }
  root.dataset.theme = choice
}

function nextChoice(current: ThemeChoice): ThemeChoice {
  const index = ORDER.indexOf(current)
  return ORDER[(index + 1) % ORDER.length] ?? 'system'
}

function ThemeIcon({ choice }: { choice: ThemeChoice }): ReactElement {
  const shared = {
    width: 18,
    height: 18,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  }

  if (choice === 'light') {
    return (
      <svg {...shared}>
        <path d="M10 6.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5z" />
        <path d="M10 1.75v1.9M10 16.35v1.9M18.25 10h-1.9M3.65 10h-1.9M15.83 4.17l-1.34 1.34M5.51 14.49l-1.34 1.34M15.83 15.83l-1.34-1.34M5.51 5.51 4.17 4.17" />
      </svg>
    )
  }

  if (choice === 'dark') {
    return (
      <svg {...shared}>
        <path d="M16.25 12.4A6.9 6.9 0 0 1 7.6 3.75a6.9 6.9 0 1 0 8.65 8.65z" />
      </svg>
    )
  }

  return (
    <svg {...shared}>
      <path d="M2.75 4.25h14.5v9H2.75z" />
      <path d="M7 16.25h6" />
      <path d="M10 13.25v3" />
    </svg>
  )
}

export function ThemeToggle({
  variant = 'sidebar',
}: {
  variant?: 'sidebar' | 'compact'
}): ReactElement {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const cycle = useCallback(() => {
    const next = nextChoice(getSnapshot())
    applyTheme(next)
    storeChoice(next)
  }, [])

  const label = `Design: ${LABELS[choice]}. Umschalten auf ${LABELS[nextChoice(choice)]}`

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={cycle}
        aria-label={label}
        title={label}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-hair bg-surface text-ink-secondary transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1"
      >
        <ThemeIcon choice={choice} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="flex w-full items-center gap-3 rounded-lg border border-border-hair px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1"
    >
      <ThemeIcon choice={choice} />
      <span className="flex-1 text-left">Design</span>
      <span className="text-xs text-ink-muted">{LABELS[choice]}</span>
    </button>
  )
}
