/**
 * The pattern engine's vocabulary (spec §53–§62, CLAUDE.md §§18–21).
 *
 * The engine is the product's core intellectual property and the one place where being wrong is
 * worse than being silent. Everything here is deterministic: the same logs and the same engine
 * version always produce the same finding, and an LLM may never produce one (CLAUDE.md §18).
 *
 * Three ideas run through all of it and are worth stating once, here:
 *
 *  1. **Associations, never causes.** Nothing this engine emits may claim that a factor caused
 *     an outcome, and nothing may name a condition. It reports how often things co-occurred in
 *     one person's own records (§17).
 *
 *  2. **A blank day is not a good day.** Missing data and an explicit good-state observation are
 *     completely different pieces of evidence, and collapsing them would silently invent a
 *     control group out of the days someone was too busy to log (§59, CLAUDE.md §19).
 *
 *  3. **Confidence must survive scrutiny.** Small samples, poor tracking coverage, confounded
 *     factors and wide scans across many factors all make a difference less trustworthy, and
 *     each has to visibly reduce confidence rather than being quietly ignored (§58, §60, §61).
 */

import type { PatternStatus } from '@/domain/patterns/status';

/**
 * Bumped whenever a change could alter a finding for unchanged logs.
 *
 * Stored on every finding, because "why does this say something different from last week?" must
 * be answerable (§62). A pure refactor does not bump it; a threshold change does.
 */
export const ENGINE_VERSION = '1.0.0';

// --- What is being examined -------------------------------------------------

/**
 * A canonical analytical category — `coffee`, `dairy`, `poor_sleep`.
 *
 * Distinct from the raw text the user typed, which is never destroyed (§54). At this milestone
 * factors are derived from what is already structured: meal tags, context types and meal item
 * names. `factor_catalog` and its hierarchy arrive with normalisation.
 */
export type FactorKey = string;

export type Factor = {
  key: FactorKey;
  /** How the factor is named to the user. */
  label: string;
  /** Where the factor came from, which decides how much it can be trusted. */
  source: 'meal_tag' | 'meal_item' | 'context' | 'meal_size';
};

// --- What is being measured -------------------------------------------------

/**
 * The outcomes the engine can compare against (§55).
 *
 * Symptom-specific and whole-day outcomes are kept separate on purpose: "bloating happened" and
 * "the day was bad overall" are different questions, and merging them would let one bad symptom
 * speak for an entire day.
 */
export const OUTCOME_KINDS = [
  /** A specific symptom was recorded at all. */
  'symptom_occurrence',
  /** How strongly that symptom was reported, 1–10. */
  'symptom_severity',
  /** Any symptom at all was recorded. */
  'any_symptom',
  /** Bowel urgency was strong or urgent. */
  'bowel_urgency',
  /** Stool fell outside the middle of the Bristol range. */
  'stool_consistency',
  /** The user explicitly said they felt good. */
  'wellbeing',
] as const;

export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export type Outcome = {
  kind: OutcomeKind;
  /** Set only for symptom-specific outcomes, e.g. `bloating`. */
  symptomType?: string;
};

// --- How much of the record exists ------------------------------------------

/**
 * What is known about one observation period (§59).
 *
 * The distinction between the first two is the single most important thing in this file. Only
 * `explicit_good_state` is evidence that things were fine; `no_data` is evidence of nothing at
 * all, and must never be counted as a control.
 */
export const TRACKING_STATES = ['no_data', 'explicit_good_state', 'symptom_logged'] as const;
export type TrackingState = (typeof TRACKING_STATES)[number];

/** How completely the user was tracking over the analysed range. Drives confidence (§59). */
export type TrackingCompleteness = {
  /** Days in the analysed range. */
  totalDays: number;
  /** Days carrying any log at all. */
  daysWithAnyLog: number;
  /** Days carrying an explicit good-state observation. */
  daysWithGoodState: number;
  /** Days carrying a symptom observation. */
  daysWithSymptom: number;
  /** `daysWithAnyLog / totalDays`, 0–1. */
  coverage: number;
};

// --- The comparison itself --------------------------------------------------

/**
 * One period compared by the engine: was the factor present, and what happened after.
 *
 * An observation with `outcomeState: 'no_data'` is deliberately kept rather than dropped, so
 * that how much was unknown can be reported honestly instead of silently shrinking the sample.
 */
export type Observation = {
  /** The user's local calendar day this belongs to. Never a UTC date (risk R-02). */
  localDate: string;
  /** The instant the exposure happened, when there was one. */
  exposedAt: string | null;
  exposed: boolean;
  outcomeState: TrackingState;
  /** Present only when the outcome was actually observed. */
  outcomeValue: number | null;
  /** True when the outcome occurred at all, for occurrence-style outcomes. */
  outcomeOccurred: boolean;
};

/** The counts behind a comparison. Reported as-is so a user can check the arithmetic (§57). */
export type ComparisonMetrics = {
  /** Observations where the factor was present and the outcome was known. */
  exposedCount: number;
  /** Observations where it was absent and the outcome was known. */
  controlCount: number;
  /** Observations dropped because the outcome was never recorded. */
  unknownCount: number;

  exposedOutcomeRate: number;
  controlOutcomeRate: number;
  /** `exposedOutcomeRate - controlOutcomeRate`. */
  absoluteDifference: number;
  /** `exposedOutcomeRate / controlOutcomeRate`, null when the control rate is zero. */
  relativeRisk: number | null;

  /** Mean severity in each group, for severity outcomes. Null when not applicable. */
  exposedMeanSeverity: number | null;
  controlMeanSeverity: number | null;
  meanSeverityDifference: number | null;

  /** Wilson interval on the difference in rates, as a coarse uncertainty band. */
  confidenceInterval: { low: number; high: number } | null;
};

/** How consistently the association held week to week (§57, §61). */
export type ConsistencyMetrics = {
  /** Weeks with enough observations in both groups to compare at all. */
  comparableWeeks: number;
  /** Weeks where the difference pointed the same way as the overall difference. */
  agreeingWeeks: number;
  /** `agreeingWeeks / comparableWeeks`, null when nothing was comparable. */
  agreementRate: number | null;
};

/** A factor that travelled with this one often enough to muddy the comparison (§60). */
export type Confounder = {
  factor: Factor;
  /** How often the two appeared together, 0–1. */
  overlap: number;
};

// --- The output -------------------------------------------------------------

/**
 * A reproducible finding (§62).
 *
 * Every field needed to recompute or explain it is stored, because a finding a user cannot
 * interrogate is a claim rather than evidence.
 */
export type Finding = {
  engineVersion: string;
  factor: Factor;
  outcome: Outcome;
  /** Inclusive local-date bounds of the analysed range. */
  analysisStart: string;
  analysisEnd: string;
  window: ObservationWindowKey;

  metrics: ComparisonMetrics;
  consistency: ConsistencyMetrics;
  confounders: Confounder[];
  trackingCompleteness: TrackingCompleteness;

  status: PatternStatus;
  /** 0–1. Not a probability — a deliberately conservative composite (see confidence.ts). */
  confidence: number;
  /** Every reason the status was held back, in plain language, for the detail screen. */
  limitations: string[];

  generatedAt: string;
};

/** Keys of the observation windows. Defined in `windows.ts`. */
export type ObservationWindowKey = 'shortly_after' | 'later_same_day' | 'next_morning' | 'next_day';
