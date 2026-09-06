import { analyse } from '../engine';
import {
  deletionChangesFinding,
  retrospectiveEdit,
  SCENARIOS,
  type Scenario,
} from '../fixtures/scenarios';
import type { Finding } from '../types';

/**
 * The pattern engine's acceptance criterion (CLAUDE.md §42).
 *
 * Each fixture is a synthetic diary encoding a situation the engine must handle correctly. A
 * change that breaks one of these is a change that would mislead a real person about their own
 * body, so the failure message names what the fixture was defending.
 */

const NOW = new Date('2026-06-01T09:00:00.000Z');

function findingFor(scenario: Scenario): Finding | undefined {
  return analyse({ logs: scenario.logs, range: scenario.range, now: NOW }).find(
    (candidate) =>
      candidate.factor.key === scenario.factorKey &&
      candidate.outcome.kind === scenario.outcome.kind &&
      candidate.outcome.symptomType === scenario.outcome.symptomType
  );
}

describe('the fixture suite', () => {
  /**
   * §42 names fifteen scenarios, which is a floor rather than a target.
   *
   * Asserted as a minimum on purpose: an exact count turns every new fixture into a failing test,
   * which teaches people to stop adding them. The corpus should grow as real diaries suggest new
   * ways to be wrong — the adversarial set added after the 2026-09 review is exactly that.
   */
  it('covers at least every scenario CLAUDE.md §42 requires', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(SCENARIOS.map((s) => s.name)).size).toBe(SCENARIOS.length);
  });

  it('explains what every fixture is defending', () => {
    // A fixture nobody can explain is a fixture nobody will maintain correctly.
    for (const scenario of SCENARIOS) {
      expect(scenario.why.length).toBeGreaterThan(40);
    }
  });
});

describe.each(SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
  'fixture: %s',
  (_name, scenario) => {
    const finding = findingFor(scenario);

    // Jest shows the test name on failure, so the reason the fixture exists travels with the
    // failure rather than sitting in a file nobody opens when something breaks.
    const defends = `— defends: ${scenario.why}`;

    if (scenario.expect.absent) {
      it(`is not examined at all ${defends}`, () => {
        expect(finding).toBeUndefined();
      });
      return;
    }

    it(`is examined ${defends}`, () => {
      expect(finding).toBeDefined();
    });

    if (scenario.expect.status) {
      it(`is classified as one of [${scenario.expect.status.join(', ')}] ${defends}`, () => {
        expect(scenario.expect.status).toContain(finding?.status);
      });
    }

    if (scenario.expect.notStatus) {
      it(`is never classified as [${scenario.expect.notStatus.join(', ')}] ${defends}`, () => {
        expect(scenario.expect.notStatus).not.toContain(finding?.status);
      });
    }

    if (scenario.expect.maxConfidence !== undefined) {
      it(`does not exceed the confidence this evidence supports ${defends}`, () => {
        expect(finding?.confidence).toBeLessThanOrEqual(scenario.expect.maxConfidence!);
      });
    }

    if (scenario.expect.hasConfounder) {
      it(`notices what travelled with it ${defends}`, () => {
        expect(finding?.confounders.length).toBeGreaterThan(0);
      });
    }

    if (scenario.expect.limitation) {
      it(`tells the user what is limiting this ${defends}`, () => {
        expect(finding?.limitations.join(' ')).toMatch(scenario.expect.limitation!);
      });
    }
  }
);

describe('fixture: retrospective log edit', () => {
  it('follows the data as corrected, not as first entered', () => {
    const run = (logs: typeof retrospectiveEdit.before) =>
      analyse({ logs, range: retrospectiveEdit.range, now: NOW }).find(
        (f) =>
          f.factor.key === retrospectiveEdit.factorKey && f.outcome.kind === 'symptom_occurrence'
      );

    const before = run(retrospectiveEdit.before);
    const after = run(retrospectiveEdit.after);

    expect(before?.metrics.exposedOutcomeRate).toBeGreaterThan(0.8);
    expect(after?.metrics.exposedOutcomeRate).toBeLessThan(before!.metrics.exposedOutcomeRate);
  });

  it('withdraws the finding when the correction removes its basis', () => {
    const after = analyse({
      logs: retrospectiveEdit.after,
      range: retrospectiveEdit.range,
      now: NOW,
    }).find((f) => f.factor.key === 'caffeinated' && f.outcome.kind === 'symptom_occurrence');

    expect(after?.status).not.toBe('stronger_recurring_signal');
  });
});

describe('fixture: log deletion changing a finding', () => {
  it('stops counting logs the user deleted', () => {
    // A tombstoned record is one the user took back. Continuing to count it would mean the app
    // is using data about them that they have withdrawn.
    const before = analyse({
      logs: deletionChangesFinding.before,
      range: deletionChangesFinding.range,
      now: NOW,
    }).find((f) => f.factor.key === 'caffeinated' && f.outcome.kind === 'symptom_occurrence');

    const after = analyse({
      logs: deletionChangesFinding.after,
      range: deletionChangesFinding.range,
      now: NOW,
    }).find((f) => f.factor.key === 'caffeinated');

    expect(before).toBeDefined();
    expect(after).toBeUndefined();
  });
});
