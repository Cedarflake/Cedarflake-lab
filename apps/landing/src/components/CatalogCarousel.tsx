import type { CatalogProject } from "../types/project"
import { Carousel } from "./Carousel"
import { CatalogCard } from "./CatalogCard"

interface CatalogCarouselProps {
  hint: string
  labelledBy: string
  projects: readonly CatalogProject[]
}

export function CatalogCarousel({ hint, labelledBy, projects }: CatalogCarouselProps) {
  const isSparse = projects.length <= 2

  return (
    <Carousel
      className={`catalog-carousel${isSparse ? " catalog-carousel--sparse" : ""}`}
      hint={hint}
      items={projects}
      labelledBy={labelledBy}
      renderItem={(project) => <CatalogCard project={project} />}
      showControls={!isSparse}
    />
  )
}
