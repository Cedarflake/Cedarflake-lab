import { ArrowDown, ArrowUpRight, GitFork } from "lucide-react"

import { CatalogCarousel } from "./components/CatalogCarousel"
import { FeaturedCarousel } from "./components/FeaturedCarousel"
import { SectionHeading } from "./components/SectionHeading"
import { WorkbenchGroup } from "./components/WorkbenchGroup"
import { siteConfig } from "./config/site"
import {
  buildingProjects,
  labStats,
  otherProjects,
  showcaseProjects,
  workbenchGroups,
} from "./lib/projectCatalog"

export function App() {
  const heroBrand = siteConfig.hero.brand

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="site-header">
        <a className="mini-brand" href="#top" aria-label={siteConfig.header.homeLabel}>
          <span>{siteConfig.header.brand}</span>
          <span>{siteConfig.header.edition}</span>
        </a>
        <nav aria-label="Primary navigation">
          {siteConfig.navigation.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <a className="github-link" href={siteConfig.repositoryUrl} rel="noreferrer" target="_blank">
          <GitFork aria-hidden="true" />
          <span>{siteConfig.header.sourceLabel}</span>
        </a>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero__wash hero__wash--one" aria-hidden="true" />
          <div className="hero__wash hero__wash--two" aria-hidden="true" />
          <p className="hero__eyebrow">{siteConfig.hero.eyebrow}</p>
          <h1 className="hero__title" id="hero-title">
            <span className="hero__brand-text sr-only">{heroBrand.alt}</span>
            <span
              className="hero__brand-visual"
              style={{
                aspectRatio: `${heroBrand.width} / ${heroBrand.height}`,
                backgroundImage: `url("${heroBrand.src}")`,
              }}
              aria-hidden="true"
            />
          </h1>
          <div className="hero__content">
            <p className="hero__statement">{siteConfig.hero.statement}</p>
            <div className="hero__intro">
              <p>{siteConfig.hero.description}</p>
              <div className="hero__actions">
                <a className="button button--primary" href={siteConfig.hero.primaryAction.href}>
                  {siteConfig.hero.primaryAction.label}
                  <ArrowDown aria-hidden="true" />
                </a>
                <a
                  className="button button--ghost"
                  href={siteConfig.repositoryUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {siteConfig.hero.secondaryActionLabel}
                  <ArrowUpRight aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
          <dl className="hero__stats">
            {labStats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
          <div className="lab-rule" aria-hidden="true">
            {siteConfig.hero.ruler.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>

        <section
          className="page-section"
          id={siteConfig.sections.featured.id}
          aria-labelledby={siteConfig.sections.featured.heading.titleId}
        >
          <SectionHeading {...siteConfig.sections.featured.heading} />
          <FeaturedCarousel
            hint={siteConfig.sections.featured.carouselHint}
            labelledBy={siteConfig.sections.featured.heading.titleId}
            projects={showcaseProjects}
          />
        </section>

        <section
          className="page-section page-section--catalog"
          id={siteConfig.sections.building.id}
          aria-labelledby={siteConfig.sections.building.heading.titleId}
        >
          <SectionHeading {...siteConfig.sections.building.heading} />
          <CatalogCarousel
            hint={siteConfig.sections.building.carouselHint}
            labelledBy={siteConfig.sections.building.heading.titleId}
            projects={buildingProjects}
          />
        </section>

        <section
          className="page-section page-section--workbench"
          id={siteConfig.sections.workbench.id}
          aria-labelledby={siteConfig.sections.workbench.heading.titleId}
        >
          <div className="workbench-intro">
            <SectionHeading {...siteConfig.sections.workbench.heading} />
            <p className="workbench-intro__note">{siteConfig.sections.workbench.note}</p>
          </div>
          <div className="workbench-groups">
            {workbenchGroups.map((group) => (
              <WorkbenchGroup key={group.id} group={group} />
            ))}
          </div>
        </section>

        <section
          className="page-section page-section--others"
          id={siteConfig.sections.others.id}
          aria-labelledby={siteConfig.sections.others.heading.titleId}
        >
          <SectionHeading {...siteConfig.sections.others.heading} />
          <CatalogCarousel
            hint={siteConfig.sections.others.carouselHint}
            labelledBy={siteConfig.sections.others.heading.titleId}
            projects={otherProjects}
          />
        </section>

        <section
          className="open-bench"
          id={siteConfig.openBench.id}
          aria-labelledby={siteConfig.openBench.titleId}
        >
          <div className="open-bench__heading">
            <p className="eyebrow">{siteConfig.openBench.eyebrow}</p>
            <h2 id={siteConfig.openBench.titleId}>{siteConfig.openBench.title}</h2>
          </div>
          <ul className="command-stack" aria-label="Common repository commands">
            {siteConfig.openBench.commands.map((command) => (
              <li key={command}>
                <code>
                  <span>$</span> {command}
                </code>
              </li>
            ))}
          </ul>
          <a href={siteConfig.repositoryUrl} rel="noreferrer" target="_blank">
            {siteConfig.openBench.actionLabel}
            <ArrowUpRight aria-hidden="true" />
          </a>
        </section>
      </main>

      <footer className="site-footer">
        <p>{siteConfig.name}</p>
        <p>{siteConfig.footer.note}</p>
        <a href="#top">{siteConfig.footer.backToTopLabel}</a>
      </footer>
    </div>
  )
}
