/**
 * Every analytics event GutSignal is allowed to send (`CLAUDE.md` §29, spec risk T5).
 *
 * This file is a wall, not a catalogue. Health content reaching a product-analytics vendor is a
 * release blocker under §58, and the way that normally happens is not malice — it is a helpful
 * property added to an existing event two years from now, in a hurry, by someone who has not read
 * §29. So the shape of an event is declared here and nowhere else, and there is no way to send
 * one that is not declared.
 *
 * **What may never appear here**, from §29: symptom type, severity, Bristol type, food names,
 * meal contents, journal text, HealthKit values, Ask My Gut content, suspected factors. Not as a
 * property name, not as an enum value, not encoded in an event name. `__tests__/events.test.ts`
 * enforces that against this file directly, so adding one fails the suite rather than review.
 *
 * **Why no free-form strings anywhere.** A `z.string()` property is an open channel: whatever
 * discipline the caller has today, the type permits a meal title tomorrow. Every property here is
 * an enum or a boolean, which cannot carry content by construction. If a future event genuinely
 * needs a number, add a bucketed enum (`'1-5' | '6-20' | '20+'`) rather than the number — a raw
 * count is rarely needed and is one join away from being identifying.
 *
 * Spec §29's own example is followed for log types: separate event **names** per kind
 * (`symptom_log_completed`), never a `symptom` property.
 */

import { z } from 'zod';

import { ONBOARDING_STEPS } from '@/domain/onboarding/steps';

/** How the user reached the log sheet. Funnel state, not content. */
const entryPoint = z.enum(['today', 'timeline', 'nav']);

/** Whether an entry was newly created or an existing one changed. */
const logMode = z.object({ mode: z.enum(['created', 'edited']) }).strict();

const noProperties = z.object({}).strict();

/**
 * The allowlist.
 *
 * `.strict()` on every schema is load-bearing: it makes an undeclared property a validation
 * failure at runtime, which is the second wall behind the type system.
 */
export const ANALYTICS_EVENT_SCHEMAS = {
  // --- Lifecycle ---
  app_opened: noProperties,

  // --- Onboarding funnel ---
  onboarding_started: noProperties,
  // The step vocabulary is derived from the flow itself rather than restated, so the funnel
  // cannot drift from the screens it measures. A step is a screen name; what the user chose on
  // that screen is health content and stays on the device.
  onboarding_step_completed: z.object({ step: z.enum(ONBOARDING_STEPS) }).strict(),
  onboarding_completed: noProperties,

  // --- Account ---
  // The method matters for support and for knowing which sign-in to invest in. Which account it
  // was does not, and is not sent.
  signed_in: z.object({ method: z.enum(['apple', 'email']) }).strict(),
  signed_out: noProperties,
  account_deleted: noProperties,

  // --- Logging ---
  log_sheet_opened: z.object({ entryPoint }).strict(),
  log_sheet_dismissed: z.object({ entryPoint }).strict(),

  // Per §29's own worked example: the event name carries the kind, and nothing describes what was
  // actually recorded.
  meal_log_completed: logMode,
  symptom_log_completed: logMode,
  bowel_log_completed: logMode,
  wellbeing_log_completed: logMode,
  context_log_completed: logMode,
  log_deleted: z
    .object({ kind: z.enum(['meal', 'symptom', 'bowel', 'wellbeing', 'context']) })
    .strict(),

  // --- Timeline ---
  // That a search happened, never what was searched for. A query string is free text a user typed
  // about their own health.
  timeline_searched: noProperties,
  timeline_filtered: noProperties,

  // --- Insights ---
  // `state` is the funnel information that matters: are users reaching a populated screen at all?
  insights_viewed: z.object({ state: z.enum(['empty', 'populated']) }).strict(),

  // Deliberately property-free. A pattern status would say "this user has a moderate signal",
  // which is a statement about their health however abstract it looks.
  pattern_detail_opened: noProperties,
  pattern_calculation_expanded: noProperties,

  // --- Operational ---
  // Failure reasons are a fixed vocabulary, never an error message: messages interpolate.
  sync_failed: z.object({ reason: z.enum(['network', 'auth', 'conflict', 'unknown']) }).strict(),
} as const;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENT_SCHEMAS;

export const ANALYTICS_EVENT_NAMES = Object.keys(ANALYTICS_EVENT_SCHEMAS) as AnalyticsEventName[];

/** The properties one event takes, inferred from its schema so there is a single declaration. */
export type AnalyticsProperties<E extends AnalyticsEventName> = z.infer<
  (typeof ANALYTICS_EVENT_SCHEMAS)[E]
>;

/**
 * `track`'s remaining arguments: required for an event with properties, absent for one without.
 *
 * Expressed as `{} extends P` rather than `keyof P extends never`, because Zod's inferred type for
 * an empty strict object is not the bare `{}` that `keyof` would need — the earlier attempt
 * silently resolved to `never` and made every propertyless event uncallable.
 */
export type AnalyticsArgs<E extends AnalyticsEventName> =
  Record<string, never> extends AnalyticsProperties<E>
    ? [properties?: AnalyticsProperties<E>]
    : [properties: AnalyticsProperties<E>];
