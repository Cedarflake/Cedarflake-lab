/**
 * Mock: cn() utility - merges class names, filtering out falsy values.
 * In production this would be clsx + tailwind-merge.
 */
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}
