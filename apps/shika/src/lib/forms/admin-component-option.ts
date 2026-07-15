import type { StatusProjection } from "@/domain/status"

export interface AdminComponentOption {
  componentId: string
  name: string
  componentVersion: number
  condition: StatusProjection["condition"]
  isPublic: boolean
  metadataPublicationVersion: number
  statusPublicationVersion: number
}
