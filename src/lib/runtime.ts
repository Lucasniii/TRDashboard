/**
 * Where configuration actually lives depends on where the app runs. Locally it
 * is .env.local and a restart; on Vercel it is the project's environment
 * variables and a redeploy. Telling someone to edit a file that does not exist
 * on the machine serving the page is worse than saying nothing, so every hint
 * about credentials goes through here.
 *
 * Server-only: Vercel's flags are not exposed to the browser. Client components
 * receive the finished sentence as a prop.
 */

/** Vercel sets both on every deployment, including previews. */
export const IS_HOSTED: boolean =
  process.env.VERCEL === '1' || (process.env.VERCEL_ENV ?? '') !== ''

/** Names the two variables and where they belong. */
export function credentialsHint(first: string, second: string): string {
  return IS_HOSTED
    ? `Zugangsdaten fehlen: ${first} und ${second} in den Projekteinstellungen bei Vercel hinterlegen und neu bereitstellen.`
    : `Zugangsdaten fehlen: ${first} und ${second} in .env.local eintragen und den Server neu starten.`
}

/** Same split for the "you are looking at demo data" note. */
export function dataSourceHint(variable: string): string {
  return IS_HOSTED
    ? `Setze ${variable}=local in den Projekteinstellungen bei Vercel und stelle neu bereit, damit deine echten Daten angezeigt werden.`
    : `Setze ${variable}=local in .env.local und starte den Server neu, damit deine echten Daten angezeigt werden.`
}

/** The generic "credentials are missing" sentence, without naming variables. */
export function missingCredentialsSentence(): string {
  return IS_HOSTED
    ? 'Für diese Quelle fehlen die Zugangsdaten. Hinterlege Client-ID und Secret in den Projekteinstellungen bei Vercel und stelle neu bereit.'
    : 'Für diese Quelle fehlen die Zugangsdaten. Trage Client-ID und Secret in .env.local ein und starte den Server neu.'
}
