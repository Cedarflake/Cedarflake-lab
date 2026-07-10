/**
 * Mock: Telemetry.
 * Logs to console instead of sending events.
 */

export function trackPageView(page: string): void {
  console.log(`[telemetry] Page view: ${page}`);
}
