import { cubicBezier } from "framer-motion";

/**
 * Shared easing used by the original waitlist storyboard bundle.
 * Matches Framer Motion cubic-bezier(0, 0, 0.58, 1), i.e. `easeOut`.
 */

export const defaultEasing = cubicBezier(0, 0, 0.58, 1);
