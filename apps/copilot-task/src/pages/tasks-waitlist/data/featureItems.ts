/**
 * Feature items for Section 3 - the timeline/steps view.
 *
 * Each feature has a title, description, and a list of action badges
 * (with optional icons) that appear alongside the feature description.
 */

import type { FeatureItem } from "../types";

export const FEATURE_ITEMS: FeatureItem[] = [
  {
    titleKey: "tasks.waitList.section3.items.title1",
    descriptionKey: "tasks.waitList.section3.items.description1",
    actionItems: [
      {
        labelKey: "tasks.waitList.section3.items.actionItems.item1Label1",
        icon: "arrowRefresh",
      },
    ],
  },
  {
    titleKey: "tasks.waitList.section3.items.title2",
    descriptionKey: "tasks.waitList.section3.items.description2",
    actionItems: [
      {
        labelKey: "tasks.waitList.section3.items.actionItems.item2Label1",
        icon: "edge",
      },
      {
        labelKey: "tasks.waitList.section3.items.actionItems.item2Label2",
        icon: "cursorClick",
      },
    ],
  },
  {
    titleKey: "tasks.waitList.section3.items.title3",
    descriptionKey: "tasks.waitList.section3.items.description3",
    actionItems: [
      {
        labelKey: "tasks.waitList.section3.items.actionItems.item3Label1",
        icon: "onedrive",
      },
      {
        labelKey: "tasks.waitList.section3.items.actionItems.item3Label2",
        icon: "outlook",
      },
      {
        labelKey: "tasks.waitList.section3.items.actionItems.item3Label3",
        icon: "googleCalendar",
      },
    ],
  },
  {
    titleKey: "tasks.waitList.section3.items.title4",
    descriptionKey: "tasks.waitList.section3.items.description4",
    actionItems: [
      {
        labelKey: "tasks.waitList.section3.items.actionItems.item4Label1",
        icon: "artifactSlides",
      },
      {
        labelKey: "tasks.waitList.section3.items.actionItems.item4Label2",
        icon: "artifactDocuments",
      },
      {
        labelKey: "tasks.waitList.section3.items.actionItems.item4Label3",
        icon: "artifactSheets",
      },
    ],
  },
  {
    titleKey: "tasks.waitList.section3.items.title5",
    descriptionKey: "tasks.waitList.section3.items.description5",
    actionItems: [
      {
        labelKey: "tasks.waitList.section3.items.actionItems.item5Label2",
        icon: "schedule",
      },
    ],
  },
];

export const FEATURE_SEGMENT_SIZE = 1 / FEATURE_ITEMS.length;
