/**
 * Mock: i18n translation hook.
 * Returns the key itself as the "translated" text for preview purposes.
 * In production, this would fetch from a locale bundle.
 */

import { useCallback } from "react";

const MOCK_TRANSLATIONS: Record<string, string> = {
  "tasks.waitList.section1.wordmarkAlt": "Copilot",
  "tasks.waitList.section1.headlineTop": "The new way to",
  "tasks.waitList.section1.headlineBottom": "get things done",
  "tasks.waitList.section1.description":
    "Copilot Tasks works in the background to handle your to-dos -- from research to scheduling to creating documents.",
  "tasks.waitList.section1.ariaLabel": "Hero",
  "tasks.waitList.section2.ariaLabel": "Interactive sentence",
  "tasks.waitList.section2.introText": "Ask Copilot to do something, and it will",
  "tasks.waitList.section2.carouselPlay": "Play animation",
  "tasks.waitList.section2.carouselPause": "Pause animation",
  "tasks.waitList.section3.ariaLabel": "Features",
  "tasks.waitList.section3.headerHeadline": "What can Copilot Tasks do?",
  "tasks.waitList.section3.headerSubtitle":
    "Copilot Tasks can handle complex, multi-step work -- so you can focus on what matters most.",
  "tasks.waitList.section3.items.title1": "Stays on top of your tasks",
  "tasks.waitList.section3.items.description1":
    "Copilot monitors your tasks and proactively keeps things moving -- refreshing research, checking for updates, and nudging you when something needs attention.",
  "tasks.waitList.section3.items.title2": "Works across the web",
  "tasks.waitList.section3.items.description2":
    "Copilot uses Microsoft Edge to browse, click, and interact with websites on your behalf.",
  "tasks.waitList.section3.items.title3": "Connects your services",
  "tasks.waitList.section3.items.description3":
    "Copilot integrates with OneDrive, Outlook, Google Calendar, and more to complete tasks that span multiple services.",
  "tasks.waitList.section3.items.title4": "Creates polished artifacts",
  "tasks.waitList.section3.items.description4":
    "Copilot produces professional documents, slide decks, and spreadsheets ready to share.",
  "tasks.waitList.section3.items.title5": "Schedules and sends for you",
  "tasks.waitList.section3.items.description5":
    "Copilot can schedule meetings, send emails, and manage your calendar.",
  "tasks.waitList.section3.items.actionItems.item1Label1": "Auto-refresh",
  "tasks.waitList.section3.items.actionItems.item2Label1": "Edge",
  "tasks.waitList.section3.items.actionItems.item2Label2": "Click & interact",
  "tasks.waitList.section3.items.actionItems.item3Label1": "OneDrive",
  "tasks.waitList.section3.items.actionItems.item3Label2": "Outlook",
  "tasks.waitList.section3.items.actionItems.item3Label3": "Google Calendar",
  "tasks.waitList.section3.items.actionItems.item4Label1": "Slides",
  "tasks.waitList.section3.items.actionItems.item4Label2": "Documents",
  "tasks.waitList.section3.items.actionItems.item4Label3": "Sheets",
  "tasks.waitList.section3.items.actionItems.item5Label2": "Schedule",
  "tasks.waitList.section4.text1.title": "Research in depth",
  "tasks.waitList.section4.text1.subtitle":
    "Copilot browses the web to find, compare, and summarize information for you.",
  "tasks.waitList.section4.text2.title": "Draft with precision",
  "tasks.waitList.section4.text2.subtitle":
    "From emails to documents, Copilot creates polished drafts based on your instructions.",
  "tasks.waitList.section4.text3.title": "Plan and organize",
  "tasks.waitList.section4.text3.subtitle":
    "Copilot helps you plan trips, compare options, and organize your findings.",
  "tasks.waitList.section4.images.image1Alt": "Copilot researching information on the web.",
  "tasks.waitList.section4.images.image1TextHeadline": "Research in depth",
  "tasks.waitList.section4.images.image1TextDescription":
    "Copilot browses the web to find, compare, and summarize information for you.",

  "tasks.waitList.section4.images.image2Alt": "Copilot drafting a document.",
  "tasks.waitList.section4.images.image2TextHeadline": "Draft with precision",
  "tasks.waitList.section4.images.image2TextDescription":
    "From emails to documents, Copilot creates polished drafts based on your instructions.",

  "tasks.waitList.section4.images.image3Alt": "Copilot planning and organizing a project.",
  "tasks.waitList.section4.images.image3TextHeadline": "Plan and organize",
  "tasks.waitList.section4.images.image3TextDescription":
    "Copilot helps you plan trips, compare options, and organize your findings.",

  "tasks.waitList.section4.ariaLabel": "Image carousel",
  "tasks.waitList.sectionEnd.headline": "Ready to get things done?",
  "tasks.waitList.sectionEnd.subtitle":
    "Join the waitlist to be among the first to try Copilot Tasks.",
  "tasks.waitList.sectionEnd.legal":
    "By joining the waitlist, you agree to receive communications from Microsoft about Copilot Tasks.",
  "tasks.waitList.sectionEnd.ariaLabel": "Join waitlist",
  "tasks.waitList.footer.ctaJoin": "Join the waitlist",
  "tasks.waitList.footer.ctaJoinConfirmation": "You're on the list!",
  "tasks.waitList.footer.ctaReturning": "You're on the list",
  "tasks.waitList.footer.ctaSignIn": "Sign in to join",
  "tasks.waitList.footer.scrollIndicator": "Scroll",
  "tasks.waitList.footer.title": "Copilot Tasks",
  "tasks.waitList.play": "Play animation",
  "tasks.waitList.pause": "Pause animation",
  "tasks.waitList.skipToContent": "Skip to content",
};

export function useTranslation() {
  return {
    t: useCallback((key: string): string => MOCK_TRANSLATIONS[key] ?? key, []),
  };
}
