import { useGameStore } from "@/game/useGameStore"

export function DrivingFeedback() {
  const speed = useGameStore((state) => state.speed)
  const status = useGameStore((state) => state.status)
  const impactId = useGameStore((state) => state.impactId)
  const opacity = status === "running" ? Math.min(speed / 90, 0.42) : 0

  return (
    <>
      <div className="speed-veil" style={{ opacity }} aria-hidden="true" />
      {impactId > 0 ? <div key={impactId} className="impact-flash" aria-hidden="true" /> : null}
    </>
  )
}
