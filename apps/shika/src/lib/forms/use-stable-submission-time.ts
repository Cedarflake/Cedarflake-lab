"use client"

import { useRef } from "react"

export function useStableSubmissionTime(preparedAt: number) {
  const effectiveAtRef = useRef<HTMLInputElement>(null)
  const submittedAtRef = useRef<number | null>(null)

  const captureSubmissionTime = () => {
    const input = effectiveAtRef.current
    if (!input) return

    submittedAtRef.current ??= Date.now()
    input.value = String(submittedAtRef.current)
  }

  return { effectiveAtRef, captureSubmissionTime, preparedAt }
}
