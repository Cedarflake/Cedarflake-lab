interface SectionHeadingProps {
  index: string
  eyebrow: string
  titleId: string
  title: string
  description: string
}

export function SectionHeading({
  index,
  eyebrow,
  titleId,
  title,
  description,
}: SectionHeadingProps) {
  return (
    <header className="section-heading">
      <div className="section-heading__marker" aria-hidden="true">
        <span>{index}</span>
        <span className="section-heading__rule" />
      </div>
      <div className="section-heading__copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  )
}
