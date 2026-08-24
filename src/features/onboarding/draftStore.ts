import { create } from 'zustand';

import type {
  BowelPatternKey,
  GoalKey,
  SymptomKey,
  TrackingStyleKey,
} from '@/domain/onboarding/options';

/**
 * Onboarding answers, held while the user is still moving through the flow.
 *
 * This is exactly the ephemeral client state Zustand is for (CLAUDE.md §10): a draft that has
 * no server representation until the user finishes. Nothing is written to Postgres until the
 * final step, so abandoning onboarding leaves no half-formed profile behind.
 *
 * Deliberately in memory only. Persisting a partial draft would mean writing answers about
 * symptoms and suspected foods to disk before the user has an account or has agreed to
 * anything — for a few screens of re-typing, that is a bad trade in a health app.
 */

export type SuspectedFactorDraft = {
  /** Catalogue key, or `custom:<slug>` for the user's own. */
  key: string;
  /** Present only for custom factors, in the user's own words. */
  label?: string;
};

export type OnboardingDraft = {
  goals: GoalKey[];
  symptoms: SymptomKey[];
  bowelPattern: BowelPatternKey | null;
  suspectedFactors: SuspectedFactorDraft[];
  trackingStyle: TrackingStyleKey;
  acknowledgedNonDiagnostic: boolean;
};

type DraftStore = OnboardingDraft & {
  toggleGoal: (key: GoalKey) => void;
  toggleSymptom: (key: SymptomKey) => void;
  setBowelPattern: (key: BowelPatternKey) => void;
  toggleFactor: (factor: SuspectedFactorDraft) => void;
  addCustomFactor: (factor: SuspectedFactorDraft) => void;
  setTrackingStyle: (key: TrackingStyleKey) => void;
  acknowledge: () => void;
  reset: () => void;
};

const initialDraft: OnboardingDraft = {
  goals: [],
  symptoms: [],
  bowelPattern: null,
  suspectedFactors: [],
  // Balanced is the default so a user who skips this screen still gets a sane experience.
  trackingStyle: 'balanced',
  acknowledgedNonDiagnostic: false,
};

const toggle = <T>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

export const useOnboardingDraft = create<DraftStore>((set) => ({
  ...initialDraft,

  toggleGoal: (key) => set((state) => ({ goals: toggle(state.goals, key) })),

  toggleSymptom: (key) => set((state) => ({ symptoms: toggle(state.symptoms, key) })),

  setBowelPattern: (key) => set({ bowelPattern: key }),

  toggleFactor: (factor) =>
    set((state) => ({
      suspectedFactors: state.suspectedFactors.some((item) => item.key === factor.key)
        ? state.suspectedFactors.filter((item) => item.key !== factor.key)
        : [...state.suspectedFactors, factor],
    })),

  addCustomFactor: (factor) =>
    set((state) =>
      state.suspectedFactors.some((item) => item.key === factor.key)
        ? state
        : { suspectedFactors: [...state.suspectedFactors, factor] }
    ),

  setTrackingStyle: (key) => set({ trackingStyle: key }),

  acknowledge: () => set({ acknowledgedNonDiagnostic: true }),

  reset: () => set(initialDraft),
}));

/** Plain snapshot for saving. Keeps the persistence layer free of store types. */
export const draftSnapshot = (state: OnboardingDraft): OnboardingDraft => ({
  goals: [...state.goals],
  symptoms: [...state.symptoms],
  bowelPattern: state.bowelPattern,
  suspectedFactors: state.suspectedFactors.map((factor) => ({ ...factor })),
  trackingStyle: state.trackingStyle,
  acknowledgedNonDiagnostic: state.acknowledgedNonDiagnostic,
});
