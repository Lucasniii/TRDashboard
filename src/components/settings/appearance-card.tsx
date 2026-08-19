import type { ReactElement } from 'react'

import { ThemeToggle } from '@/components/nav/theme-toggle'
import { Card, CardBody, CardHeader } from '@/components/ui/card'

/**
 * "Darstellung": the same three-state switch that sits in the sidebar, here
 * with the sentence that explains what "System" means. The choice lives in
 * localStorage, not in the user settings, so it never travels through the
 * repository.
 */

const HEADING_ID = 'darstellung-titel'

export function AppearanceCard(): ReactElement {
  return (
    <Card aria-labelledby={HEADING_ID}>
      <CardHeader
        id={HEADING_ID}
        as="h2"
        title="Darstellung"
        hint="Hell, Dunkel oder System."
      />

      <CardBody className="flex flex-col gap-3">
        <div className="max-w-xs">
          <ThemeToggle />
        </div>
        <p className="text-sm text-ink-secondary">
          Ein Klick wechselt zur nächsten Einstellung. „System“ folgt der Einstellung des
          Betriebssystems. Die Auswahl gilt nur für dieses Gerät und wird lokal im Browser
          gespeichert.
        </p>
      </CardBody>
    </Card>
  )
}
