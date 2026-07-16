import { QUALITY_PREFERENCES } from "../core/settings.ts"
import { getQualityLabel } from "../youtube/quality.ts"

interface SwitchRow {
  row: HTMLDivElement
  input: HTMLInputElement
}

interface NumberRow {
  row: HTMLDivElement
  input: HTMLInputElement
}

interface SelectRow {
  row: HTMLDivElement
  select: HTMLSelectElement
}

function createLabel(
  id: string,
  title: string,
  description: string,
): HTMLLabelElement {
  const label = document.createElement("label")
  const key = document.createElement("div")
  const detail = document.createElement("div")

  label.className = "label"
  label.htmlFor = id
  key.className = "label-key"
  key.id = `${id}-label`
  key.textContent = title
  detail.className = "label-description"
  detail.id = `${id}-description`
  detail.textContent = description
  label.append(key, detail)

  return label
}

export function createSwitchRow(
  id: string,
  title: string,
  description: string,
): SwitchRow {
  const row = document.createElement("div")
  const control = document.createElement("label")
  const input = document.createElement("input")
  const track = document.createElement("span")
  const thumb = document.createElement("span")

  row.className = "row"
  control.className = "switch"
  input.id = id
  input.type = "checkbox"
  input.setAttribute("aria-labelledby", `${id}-label`)
  input.setAttribute("aria-describedby", `${id}-description`)
  track.className = "track"
  thumb.className = "thumb"
  track.appendChild(thumb)
  control.append(input, track)
  row.append(createLabel(id, title, description), control)

  return { row, input }
}

export function createNumberRow(
  id: string,
  title: string,
  description: string,
  min: number,
  max: number,
  step: number,
): NumberRow {
  const row = document.createElement("div")
  const input = document.createElement("input")

  row.className = "row"
  input.id = id
  input.className = "number-input"
  input.type = "number"
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.setAttribute("aria-labelledby", `${id}-label`)
  input.setAttribute("aria-describedby", `${id}-description`)
  row.append(createLabel(id, title, description), input)

  return { row, input }
}

export function createSelectRow(
  id: string,
  title: string,
  description: string,
): SelectRow {
  const row = document.createElement("div")
  const select = document.createElement("select")

  row.className = "row"
  select.id = id
  select.className = "select-input"

  for (const quality of QUALITY_PREFERENCES) {
    const option = document.createElement("option")
    option.value = quality
    option.textContent = getQualityLabel(quality)
    select.append(option)
  }

  row.append(createLabel(id, title, description), select)
  return { row, select }
}
