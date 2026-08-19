import { createElement, type ReactElement, type SVGProps } from 'react'

/**
 * The single source of truth for the navigation. Route, label and glyph live in
 * one record so a link can never drift away from its icon. Icons are built with
 * createElement instead of JSX to keep this a plain .ts module — no icon
 * library, every glyph is a 20x20 stroke drawing that inherits currentColor.
 */

export type NavIconProps = SVGProps<SVGSVGElement>
export type NavIcon = (props: NavIconProps) => ReactElement

export interface NavItem {
  readonly href: string
  readonly label: string
  readonly Icon: NavIcon
}

function icon(name: string, ...paths: readonly string[]): NavIcon {
  function NavGlyph(props: NavIconProps): ReactElement {
    return createElement(
      'svg',
      {
        width: 20,
        height: 20,
        viewBox: '0 0 20 20',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: false,
        ...props,
      },
      ...paths.map((d, index) => createElement('path', { key: index, d })),
    )
  }
  NavGlyph.displayName = `NavIcon(${name})`
  return NavGlyph
}

const OverviewIcon = icon(
  'overview',
  'M3.25 3.25h5v5h-5z',
  'M11.75 3.25h5v5h-5z',
  'M3.25 11.75h5v5h-5z',
  'M11.75 11.75h5v5h-5z',
)

const ActivitiesIcon = icon('activities', 'M2 10h3.4l2.4-6 3.6 12 2.4-6H18')

const TrainingIcon = icon(
  'training',
  'M10 2.75a7.25 7.25 0 1 1 0 14.5 7.25 7.25 0 0 1 0-14.5z',
  'M10 6.75a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5z',
)

const HealthIcon = icon(
  'health',
  'M10 16.6C10 16.6 3.4 12.7 3.4 8.3a3.7 3.7 0 0 1 6.6-2.3 3.7 3.7 0 0 1 6.6 2.3c0 4.4-6.6 8.3-6.6 8.3z',
)

const TrendsIcon = icon('trends', 'M3.25 2.75v14h14', 'M6.25 12.75l3.25-3.75 2.5 2.5 4.5-5.5')

const CalendarIcon = icon(
  'calendar',
  'M3.75 5.25h12.5v11.5H3.75z',
  'M3.75 9h12.5',
  'M7.25 3.25v3',
  'M12.75 3.25v3',
)

const SettingsIcon = icon(
  'settings',
  'M3 6.5h10',
  'M16 6.5h1',
  'M3 13.5h4.5',
  'M10.5 13.5h6.5',
  'M14.5 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  'M9 12a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
)

export const MoreIcon = icon(
  'more',
  'M4.6 8.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z',
  'M10 8.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z',
  'M15.4 8.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z',
)

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Übersicht', Icon: OverviewIcon },
  { href: '/aktivitaeten', label: 'Aktivitäten', Icon: ActivitiesIcon },
  { href: '/training', label: 'Training', Icon: TrainingIcon },
  { href: '/gesundheit', label: 'Gesundheit', Icon: HealthIcon },
  { href: '/trends', label: 'Trends', Icon: TrendsIcon },
  { href: '/kalender', label: 'Kalender', Icon: CalendarIcon },
  { href: '/einstellungen', label: 'Einstellungen', Icon: SettingsIcon },
]

/** The bottom tab bar shows the first five; the rest live behind "Mehr". */
export const PRIMARY_NAV_COUNT = 5

export const PRIMARY_NAV_ITEMS: readonly NavItem[] = NAV_ITEMS.slice(0, PRIMARY_NAV_COUNT)
export const SECONDARY_NAV_ITEMS: readonly NavItem[] = NAV_ITEMS.slice(PRIMARY_NAV_COUNT)

/** '/' is only ever active on an exact match; deeper routes also match their children. */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
