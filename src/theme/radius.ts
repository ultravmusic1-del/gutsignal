/**
 * Radius family extracted from the UI reference: small controls ~12, cards 16–22,
 * hero cards 28, and fully rounded pills.
 */
export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export type Radius = typeof radius;
