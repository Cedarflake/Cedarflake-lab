import { Orbit } from "lucide-react"

export function SiteHeader() {
  return (
    <header className="site-header">
      <a className="brand" href="#preview" aria-label="Focus Orb preview">
        <Orbit aria-hidden="true" className="brand__icon" />
        <span>Focus Orb</span>
      </a>
      <code className="install-command">pnpm add @cedarflake/focus-orb</code>
    </header>
  )
}
