export type FeedbackKind = "boost" | "checkpoint" | "drift" | "near-miss" | "shard"

export interface ScoreEvent {
  label: string
  feedbackKind?: FeedbackKind
}

export function resolveScoreFeedback(event: ScoreEvent): FeedbackKind | null {
  return event.feedbackKind ?? null
}
