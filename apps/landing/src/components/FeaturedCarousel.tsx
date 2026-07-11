import type { ShowcaseProject } from "../types/project"
import { Carousel } from "./Carousel"
import { ProjectCard } from "./ProjectCard"

interface FeaturedCarouselProps {
  hint: string
  labelledBy: string
  projects: readonly ShowcaseProject[]
}

export function FeaturedCarousel({ hint, labelledBy, projects }: FeaturedCarouselProps) {
  return (
    <Carousel
      className="featured-carousel"
      hint={hint}
      items={projects}
      labelledBy={labelledBy}
      renderItem={(project, index) => <ProjectCard project={project} isPriority={index === 0} />}
    />
  )
}
