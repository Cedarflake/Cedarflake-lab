const fallbackOwnerPath = "/admin"

export function normalizeOwnerReturnPath(value: unknown) {
  return value === fallbackOwnerPath ? value : fallbackOwnerPath
}
