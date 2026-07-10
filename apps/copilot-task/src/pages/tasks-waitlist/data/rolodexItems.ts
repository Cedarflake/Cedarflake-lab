/**
 * Rolodex content data for Section 2.
 *
 * The rolodex shows an animated sentence that flips between three
 * variations: "I want to [create/book/make] a [presentation/haircut/spreadsheet]
 * for my [report/daughter/budget]".
 *
 * Two layouts are provided:
 * - 3-line: Compact layout where text and images share rows
 * - 5-line: Expanded layout for narrow containers where content wraps
 */

import { STATIC_ASSET_PREFIX } from "../constants";
import type { RolodexItem, RolodexLayout } from "../types";

const ASSET_BASE = STATIC_ASSET_PREFIX;

// ===================== 3-Line Layout (Wide) =====================

const ROLODEX_ITEMS_3LINE: RolodexItem[] = [
  {
    id: "1-1",
    type: "text",
    content1: "I want to",
    content2: "I want to",
    content3: "I want to",
    row: 0,
    col: 0,
    animate: false,
  },
  {
    id: "1-2",
    type: "image",
    content1: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-1a.png`,
    content2: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-2a.png`,
    content3: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-3a.png`,
    row: 0,
    col: 2,
  },
  {
    id: "1-3",
    type: "text",
    content1: "create",
    content2: "book",
    content3: "make",
    row: 0,
    col: 2,
    animate: true,
  },
  {
    id: "2-1",
    type: "text",
    content1: "a",
    content2: "a",
    content3: "a",
    row: 1,
    col: 0,
    animate: false,
  },
  {
    id: "2-3",
    type: "image",
    content1: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-1b.png`,
    content2: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-2b.png`,
    content3: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-3b.png`,
    row: 1,
    col: 2,
  },
  {
    id: "2-4",
    type: "text",
    content1: "presentation",
    content2: "haircut",
    content3: "spreadsheet",
    row: 1,
    col: 2,
    animate: true,
  },
  {
    id: "3-1",
    type: "text",
    content1: "for my",
    content2: "for my",
    content3: "for my",
    row: 2,
    col: 0,
    animate: false,
  },
  {
    id: "3-2",
    type: "image",
    content1: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-1c.png`,
    content2: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-2c.png`,
    content3: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-3c.png`,
    row: 2,
    col: 2,
  },
  {
    id: "3-3",
    type: "text",
    content1: "report",
    content2: "daughter",
    content3: "budget",
    row: 2,
    col: 2,
    animate: true,
  },
];

// ===================== 5-Line Layout (Narrow) =====================

const ROLODEX_ITEMS_5LINE: RolodexItem[] = [
  {
    id: "1-1",
    type: "text",
    content1: "I want to",
    content2: "I want to",
    content3: "I want to",
    row: 0,
    col: 0,
    animate: false,
  },
  {
    id: "1-2",
    type: "image",
    content1: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-1a.png`,
    content2: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-2a.png`,
    content3: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-3a.png`,
    row: 0,
    col: 1,
  },
  {
    id: "2-1",
    type: "text",
    content1: "create",
    content2: "book",
    content3: "make",
    row: 1,
    col: 1,
    animate: true,
  },
  {
    id: "3-1",
    type: "text",
    content1: "a",
    content2: "a",
    content3: "a",
    row: 2,
    col: 0,
    animate: false,
  },
  {
    id: "3-2",
    type: "image",
    content1: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-1b.png`,
    content2: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-2b.png`,
    content3: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-3b.png`,
    row: 2,
    col: 1,
  },
  {
    id: "3-3",
    type: "text",
    content1: "presentation",
    content2: "haircut",
    content3: "spreadsheet",
    row: 2,
    col: 1,
    animate: true,
  },
  {
    id: "4-1",
    type: "text",
    content1: "for my",
    content2: "for my",
    content3: "for my",
    row: 3,
    col: 0,
    animate: false,
  },
  {
    id: "4-2",
    type: "image",
    content1: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-1c.png`,
    content2: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-2c.png`,
    content3: `${ASSET_BASE}/images/tasks/waitlist/rolodex/rolodex-3c.png`,
    row: 3,
    col: 1,
  },
  {
    id: "5-1",
    type: "text",
    content1: "report",
    content2: "daughter",
    content3: "budget",
    row: 4,
    col: 1,
    animate: true,
  },
];

// ===================== Helpers =====================
export function getDiagonalIndex(row: number, col: number): number {
  return row + col;
}

export function getMaxDiagonalIndex(items: RolodexItem[]): number {
  return Math.max(...items.map((item) => getDiagonalIndex(item.row, item.col)));
}

export function getRolodexItems(layout: RolodexLayout): RolodexItem[] {
  return layout === "5-line" ? ROLODEX_ITEMS_5LINE : ROLODEX_ITEMS_3LINE;
}
