export type AdminActionState =
  | {
      kind: "idle"
      message: ""
    }
  | {
      kind: "error" | "reauth_required" | "conflict"
      message: string
    }

export type AdminActionFailureKind = Exclude<AdminActionState["kind"], "idle">

const failureMessages: Record<AdminActionFailureKind, string> = {
  error: "Review the submitted values and try again.",
  reauth_required: "Your owner session is no longer valid.",
  conflict: "The data changed while this form was open.",
}

export const initialAdminActionState: AdminActionState = {
  kind: "idle",
  message: "",
}

export function createAdminActionFailureState(
  kind: AdminActionFailureKind,
): AdminActionState {
  return {
    kind,
    message: failureMessages[kind],
  }
}
