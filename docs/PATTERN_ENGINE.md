# GutSignal — Pattern Engine

Required by `CLAUDE.md` §21 and spec §53. This documents what the engine does, every threshold
it uses, and why each was chosen.

**Engine version 1.0.0** · `src/domain/pattern-engine/`

---

## 1. What the engine is for, and what it must never do

GutSignal's promise is "stop guessing what affects your gut". The engine is how that promise is
kept — and the single place where breaking it would do the most harm.

It reports **associations in one person's own records**. It never reports a cause, never names a
condition, and never tells anyone what to eat. The distinction is not pedantry: a diary can show
that symptoms followed dairy more often than not, and cannot show that dairy did anything.

```text
structured logs → deterministic analytics → structured finding → (optional) LLM explanation
```

**An LLM may explain a finding. It may never produce one.** Everything in this directory is
deterministic arithmetic with no model in the loop (`CLAUDE.md` §18).

### The three ideas everything else follows from

1. **A blank day is not a good day.** Missing data and an explicit good-day entry are completely
   different evidence. Collapsing them would invent a control group out of the days someone was
   too busy to log.
2. **Confidence is limited by its weakest link.** A large sample cannot compensate for two
   factors that were never apart, and a well-tracked month cannot compensate for four
   observations.
3. **Saying nothing is a valid answer, and often the right one.** A false negative costs the user
   one insight. A false positive costs them a food they never needed to give up.

---

## 2. The pipeline

| Step | Module                | What it does                                                           |
| ---- | --------------------- | ---------------------------------------------------------------------- |
| 1    | `observations.ts`     | Buckets logs into the user's local calendar days, including empty ones |
| 2    | `exposures.ts`        | Decides which factors are worth testing at all                         |
| 3    | `observations.ts`     | Builds one observation per day: was the factor present, what was seen  |
| 4    | `comparisons.ts`      | Counts, rates, severity means, uncertainty, week-to-week consistency   |
| 5    | `confounders.ts`      | Finds factors that were distributed unevenly across the two groups     |
| 6    | `confidence.ts`       | Combines everything into a confidence score and its limitations        |
| 7    | `scoring.ts`          | Maps that to one of five statuses                                      |
| 8    | `multiple-testing.ts` | Shrinks confidence for the breadth of the scan, then re-scores         |
| —    | `engine.ts`           | Runs all of it: `analyse({ logs, range }) → Finding[]`                 |

**Determinism is structural.** No clock, no randomness, no iteration over unordered structures.
The same logs and the same engine version always produce byte-identical findings in the same
order. Tests assert both identity and order-independence, because §62's promise — that a finding
can be reproduced and interrogated later — is otherwise only an intention.

---

## 3. Observability: what a day can tell us

The most consequential rule in the engine (spec §59).

| State                 | Means                                                                            |
| --------------------- | -------------------------------------------------------------------------------- |
| `no_data`             | Nothing was recorded that speaks to this outcome. **Never a control.**           |
| `explicit_good_state` | The user said they felt fine. A real observation that the outcome did not occur. |
| `symptom_logged`      | The outcome, or something comparable, was recorded.                              |

**Observability is outcome-specific.** A wellbeing entry proves a symptom did not occur; it says
nothing about what a stool looked like, which only a bowel log can answer.

| Outcome          | Observed when                                                                         |
| ---------------- | ------------------------------------------------------------------------------------- |
| Symptom outcomes | any symptom recorded (`symptom_logged`), or a wellbeing entry (`explicit_good_state`) |
| Bowel outcomes   | a bowel log exists. A good day does not make stool type observable                    |
| Wellbeing        | either a symptom or a wellbeing entry                                                 |

Two consequences worth stating plainly:

- **A day with only a meal on it is `no_data`.** Logging lunch says nothing about whether
  symptoms happened.
- **Recording a different symptom still counts as an observation.** Someone who logged nausea was
  tracking symptoms that day, so the absence of bloating is evidence rather than silence.

Days with an unknown outcome are **kept and counted**, never dropped, so the engine can report
how much was unknown instead of presenting a self-selected sample as a whole picture.

---

## 4. Factors

Until `factor_catalog` arrives (a later milestone), factors come from what the app already
records in a structured way.

| Source      | Examples                                                           |
| ----------- | ------------------------------------------------------------------ |
| `meal_tag`  | caffeinated, alcoholic, spicy, rich_high_fat, restaurant, homemade |
| `meal_size` | small, large (medium is the norm, not a signal)                    |
| `meal_item` | the user's own words — "kombucha", "oat milk"                      |
| `context`   | high_stress, low_stress, poor_sleep, good_sleep, exercise          |

### Context factors are thresholded

"Stress was logged" is not a factor. A stress level of 1 and a level of 5 are opposite
observations, and counting both as exposure would compare a group against itself.

| Constant                 | Value | Why                             |
| ------------------------ | ----- | ------------------------------- |
| `CONTEXT_HIGH_THRESHOLD` | 4     | Top two points of the 1–5 scale |
| `CONTEXT_LOW_THRESHOLD`  | 2     | Bottom two points               |

**The middle of the scale is in neither group.** A day rated 3 is not evidence of stress or of
calm, and forcing it to one side would put ambiguous days where they do not belong.

### Meal items keep the user's words

Grouped case-insensitively so `Coffee` and `coffee` are one factor; the label keeps the most
frequent original spelling. The raw value is never destroyed (spec §54). Counts are **per day**,
not per mention — three coffees on one day is one observation of coffee.

### Same-measurement factors never confound each other

`poor_sleep` and `good_sleep` are one question answered once, not two things that travel
together. `factors.ts` exposes `measurementOf()`, and confounding skips candidates that share a
measurement. Without this the engine was structurally incapable of ever reporting a sleep or
stress finding — a flaw the fixture suite caught while every unit test passed.

---

## 5. Choosing what to examine

Filtering candidates is part of the multiple-comparison defence, not an optimisation: every
factor admitted is another chance for a coincidence to look like a signal.

| Constant          | Value | Why                                                                |
| ----------------- | ----- | ------------------------------------------------------------------ |
| `minExposedDays`  | 4     | Below this a comparison is not possible, whatever the numbers show |
| `minControlDays`  | 4     | **A factor present on nearly every day has no control group**      |
| `minItemMentions` | 3     | Distinct days a typed item must appear on to become a factor       |

The control-days rule matters more than it looks. Someone who drinks coffee every morning cannot
learn anything about coffee from their own diary. Saying so is honest; manufacturing a comparison
is not.

---

## 6. The statistics

Spec §57. Reported per factor–outcome pair.

- Exposed / control / **unknown** counts
- Outcome rate in each group, and the absolute difference
- Relative risk — **null** when the control rate is zero, because "infinitely more likely" is not
  a statement this product may make
- Mean severity per group, and the difference
- A 95% uncertainty band on the difference
- Week-to-week consistency

### Uncertainty

**Wilson score intervals** per group, combined by **Newcombe's method** for the difference.

Wilson rather than the normal approximation because the normal interval runs outside 0–1 at the
extremes, and a rate of "−8%" on a health screen is indefensible. Newcombe rather than a pooled
approximation because it stays honest on the small, lopsided samples a real diary produces.

**There are no p-values anywhere.** Spec §57 forbids a single p-value as user-facing truth, and
an interval that visibly crosses zero communicates uncertainty better than a threshold the reader
must take on faith.

> ### ⚠ The interval is not a sample-size guard
>
> Newcombe's method is liberal at the extremes. On a 2-of-2 against 0-of-2 table it **excludes
> zero** and looks conclusive, while Fisher's exact test on the same table gives roughly p = 0.17.
>
> That is a known property of the method, not a defect, and the interval is still the right thing
> to report. What follows from it is that **sample-size safety cannot live in the interval**:
> `scoring.ts` gates on observation counts directly and never treats "the interval excludes zero"
> as sufficient evidence. There are tests named for this in both `comparisons.test.ts` and
> `scoring.test.ts`.

### Consistency

A week counts as **comparable** only when it contains observed days on both sides. Weeks where
the user only ate the thing, or only avoided it, cannot speak to a difference.

With no overall direction there is nothing for a week to agree with, so the agreement rate is
`null` rather than a meaningless 100%.

---

## 7. Confounding

Spec §60. The measure is **imbalance, not similarity**:

```text
overlap = | P(other | target) − P(other | not target) |
```

What ruins a comparison is the other factor being distributed _unevenly_ between the groups — not
how often the two things co-occur. A factor on half the coffee days and half the other days
explains nothing about the difference between them, however much it overlaps. One on every coffee
day and no others explains all of it. A Jaccard-style similarity score gets both cases backwards.

| Constant               | Value | Why                                                                                            |
| ---------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| `CONFOUNDER_THRESHOLD` | 0.6   | Where a difference in prevalence is large enough that crediting one factor alone would mislead |

The user is told in spec §60's own framing: the two things happened at the same time and are
therefore harder to separate. **Never that one caused the other.**

---

## 8. Confidence

`confidence.ts`. **Not a probability** — a deliberately conservative composite, reported
alongside the counts rather than instead of them.

It is the **minimum** of five components, not their average. A chain is as strong as its weakest
link, and averaging lets a well-tracked month paper over a sample of four. Taking the minimum
also makes the explanation free: whichever component is lowest _is_ the answer to "why isn't this
more certain?", and every weak component contributes a line the user reads.

| Component     | How it scores                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| `sample`      | smaller group ÷ `FULL_SAMPLE` (20) — a hundred exposed days against three controls is a sample of three |
| `coverage`    | proportion of days in the range carrying any log                                                        |
| `consistency` | week-to-week agreement rate, or `UNMEASURED_CONSISTENCY` (0.5) when too few weeks were comparable       |
| `precision`   | how narrow the uncertainty band is                                                                      |
| `confounding` | 1 − strongest overlap with another factor                                                               |

| Constant                 | Value | Why                                                                                         |
| ------------------------ | ----- | ------------------------------------------------------------------------------------------- |
| `FULL_SAMPLE`            | 20    | Group size at which sample stops limiting confidence                                        |
| `WEAK_COMPONENT`         | 0.6   | At or below this, a component earns a plain-language limitation                             |
| `UNMEASURED_CONSISTENCY` | 0.5   | Too few comparable weeks is the _absence_ of evidence about consistency, not evidence of it |
| `PRECISE_WIDTH`          | 0.3   | Band no wider than twice the smallest meaningful difference — full marks                    |
| `USELESS_WIDTH`          | 1.0   | Band spanning 100 percentage points — no marks                                              |

The precision anchors are worth explaining. The band is on a _difference_ of two rates and can
span up to 2.0, so normalising against 1.0 scored a genuinely informative result — a difference
somewhere between 25 and 70 percentage points — as vague. The anchors are what the width _means_
instead.

---

## 9. Status

`scoring.ts`. The five values come from `domain/patterns/status.ts`, the product-safety
vocabulary shared by every surface. **There is deliberately no "confirmed trigger".**

| Constant                      | Value |
| ----------------------------- | ----- |
| `MIN_GROUP_FOR_ANY_CLAIM`     | 5     |
| `MIN_GROUP_FOR_MODERATE`      | 10    |
| `MIN_GROUP_FOR_STRONG`        | 15    |
| `MIN_MEANINGFUL_DIFFERENCE`   | 0.15  |
| `MIN_WEEKS_FOR_STRONG`        | 3     |
| `MIN_AGREEMENT_FOR_STRONG`    | 0.7   |
| `MIN_CONFIDENCE_FOR_MODERATE` | 0.5   |
| `MIN_CONFIDENCE_FOR_STRONG`   | 0.7   |

Decided in this order, gated on the **smaller** group:

1. Fewer than 5 comparable days either side → `insufficient_data`
2. Difference below 15 percentage points → `no_clear_pattern`
3. ≥15 each side, confidence ≥0.7, and ≥3 comparable weeks agreeing ≥70% → `stronger_recurring_signal`
4. ≥10 each side and confidence ≥0.5 → `moderate`
5. Otherwise → `emerging`

**Direction is irrelevant to strength.** An association with _fewer_ symptoms is as real a finding
as the reverse, and the user deserves both.

**15 percentage points, however large the sample.** Reporting every measurable wobble is how a
scan across dozens of factors turns noise into findings.

---

## 10. The breadth of the scan

Spec §61. `analyse()` compares every candidate factor against every outcome, so a diary with half
a dozen factors produces dozens of comparisons in one pass. A finding that would be interesting
alone is much less interesting as the most extreme of thirty attempts.

Confidence is shrunk by scan breadth, the status re-scored from the shrunk value — so breadth can
**demote a finding but never promote one** — and the user is told how many combinations were
compared.

| Constant              | Value | Why                                                                     |
| --------------------- | ----- | ----------------------------------------------------------------------- |
| `FREE_COMPARISONS`    | 10    | A handful of comparisons is ordinary analysis, not a fishing expedition |
| `MIN_BREADTH_PENALTY` | 0.25  | Floor, so a broad scan cannot silence a diary entirely                  |

Shrinkage is `√(FREE_COMPARISONS ÷ scanSize)`. Comparisons where a group was empty are not
counted: they were never a chance for a coincidence.

### Why this is not a false-discovery-rate procedure

A proper FDR control needs per-comparison p-values. Spec §57 rules those out as user-facing
truth, and computing them privately to drive a visible status would put the product's most
consequential decision behind a number it has decided not to show. Spec §61 explicitly sanctions
"shrinkage/down-weighting" as an alternative, and that is what this is.

---

## 11. Observation windows

Spec §56. **Analysis windows, not validated physiological latencies.** No user-facing copy derived
from them may imply a mechanism, and a test asserts the labels contain no causal language.

| Window           | From | To  |
| ---------------- | ---- | --- |
| `shortly_after`  | 0h   | 4h  |
| `later_same_day` | 4h   | 12h |
| `next_morning`   | 12h  | 24h |
| `next_day`       | 24h  | 48h |

Half-open and exactly tiling, so adjacent windows cannot double-count one outcome. Versioned
(`WINDOWS_VERSION`): changing a bound makes old findings incomparable to new ones.

Default: `later_same_day`.

> **Current limitation.** The engine compares at **whole-day** granularity; the window is recorded
> on each finding but does not yet narrow which outcomes count. Day-level comparison is the right
> default for sparse diary data, but exposure-level windowing is a real refinement and is listed
> in §14 below.

---

## 12. Reproducibility

Spec §62. Every finding stores everything needed to recompute or explain it: engine version,
factor, outcome, analysis range, window, all metrics, consistency, confounders, tracking
completeness, status, confidence, limitations and generation time.

`ENGINE_VERSION` moves whenever a change could alter a finding for unchanged logs. A pure
refactor does not bump it; a threshold change does.

**The scan returns its negatives.** "We looked and found nothing" is a much stronger statement
than "we never looked", and a user cannot tell them apart if the engine drops what came to
nothing.

---

## 13. The fixture suite

`CLAUDE.md` §42, in `src/domain/pattern-engine/fixtures/`. Fifteen synthetic diaries plus two
paired scenarios, each carrying a sentence saying what it defends — and that sentence travels
into the test name, so a failure explains itself.

obvious association · no association · tiny sample · missing-data-heavy history · explicit
good-state controls · strong confounding · cross-week consistency · one-off anomaly ·
contradictory periods · midnight and timezone boundary · multiple simultaneous food exposures ·
custom factor in the user's own spelling · factor present every day · thresholded context factor ·
range too short · retrospective edit · deletion changing a finding

**Any change to the engine must run this suite.** It has already earned its place: it caught the
same-measurement confounding flaw described in §4 while every unit test passed.

---

## 14. Open items

Honest limitations, recorded rather than hidden.

1. **Every threshold in this document is a judgement, not a measurement.** They were chosen to be
   conservative and have never been tuned against a real diary. They need review against beta
   data before release, and probably clinical sanity-checking of the language around them.
2. **The breadth shrinkage curve is the least principled part of the engine.** Its _direction_ is
   not in doubt — more comparisons must mean less confidence — but the specific curve is a
   judgement.
3. **Comparison is day-level; windows are recorded but not yet applied** (see §11).
4. **No normalisation.** `latte`, `espresso` and `coffee` are three separate factors until
   `factor_catalog` and `factor_aliases` land (spec §54, §85).
5. **Findings are not persisted.** `pattern_findings` (spec §62, §86) does not exist yet, so
   nothing is stored or compared over time.
6. **Nothing has run on a device.** The engine is verified by tests on Windows only.

---

## 15. Change log

| Date       | Change                                                              |
| ---------- | ------------------------------------------------------------------- |
| 2026-09-06 | Engine 1.0.0: pipeline, thresholds, fifteen fixtures, this document |
