import { readSingleJsonField, readSingleTextField } from "./form-data"

export function readIncidentMetadataForm(formData: FormData) {
  return {
    idempotencyKey: readSingleTextField(formData, "idempotencyKey"),
    incidentId: readSingleTextField(formData, "incidentId"),
    expectedIncidentVersion: readSingleTextField(
      formData,
      "expectedIncidentVersion",
    ),
    expectedPublicationVersion: readSingleTextField(
      formData,
      "expectedPublicationVersion",
    ),
    effectiveAt: readSingleTextField(formData, "effectiveAt"),
    title: readSingleTextField(formData, "title"),
    severity: readSingleTextField(formData, "severity"),
    ownerSummary: readSingleTextField(formData, "ownerSummary"),
    privateNote: readSingleTextField(formData, "privateNote"),
    currentAffectedComponents: readSingleJsonField(
      formData,
      "currentAffectedComponents",
    ),
    affectedComponents: readSingleJsonField(formData, "affectedComponents"),
    publicationMode: readSingleTextField(formData, "publicationMode"),
    publicTitle: readSingleTextField(formData, "publicTitle"),
    publicSeverity: readSingleTextField(formData, "publicSeverity"),
    publicSummary: readSingleTextField(formData, "publicSummary"),
  }
}
