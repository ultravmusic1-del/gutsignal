import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { Text } from '@/components/ui';
import { SEVERITY_MAX, SEVERITY_MIN } from '@/domain/logs/symptom';
import { formatLocalDate } from '@/domain/patterns/findingDetail';
import type { TrendPoint, TrendSeries } from '@/domain/patterns/trends';
import { useTheme } from '@/theme';

/**
 * One trend series, drawn (spec §49).
 *
 * **Bars, not a line, and that is the whole design.** A line is continuous, so it interpolates
 * across a week the user did not log — it would draw a health trajectory through days that were
 * never recorded. Bars are discrete: a missing week is simply an absent bar, and it cannot be
 * misread as a value. `CLAUDE.md` §59's distinction between "no observation" and "an observation"
 * has to survive all the way to the pixels, and this is how it does.
 *
 * **The axis is fixed, never fitted to the data.** A rate is drawn against 0–100% and a severity
 * against 1–10, whatever range the values happen to occupy. Auto-scaling is the classic way to
 * make a chart lie: three weeks drifting between 40% and 45% become a dramatic climb the moment
 * the axis shrinks to fit them.
 *
 * Built with `react-native-svg`, which the icon set already uses. A charting library would bring
 * an auto-scaling default, a tooltip layer and an accessibility story written for the web
 * (`CLAUDE.md` §38) — none of which is cheaper than forty lines of rectangles.
 */

type Props = {
  series: TrendSeries;
};

const CHART_HEIGHT = 88;
const BAR_GAP = 3;
const MIN_VISIBLE_BAR = 2;

/** Where a value sits on its fixed axis, 0–1. */
function fractionOf(value: number, unit: TrendSeries['unit']): number {
  if (unit === 'severity') {
    return (value - SEVERITY_MIN) / (SEVERITY_MAX - SEVERITY_MIN);
  }

  return Math.min(1, Math.max(0, value));
}

function formatValue(value: number, unit: TrendSeries['unit']): string {
  return unit === 'severity' ? value.toFixed(1) : `${Math.round(value * 100)}%`;
}

/**
 * The series read aloud (`CLAUDE.md` §36 — charts must be accessible).
 *
 * Every point, including the gaps, because "not recorded" is the information a blind reader most
 * needs and the one a bar chart conveys purely by absence.
 */
function spokenSummary(series: TrendSeries): string {
  const points = series.points
    .map((point) => {
      const when = formatLocalDate(point.end);
      return point.value === null
        ? `week ending ${when}, not recorded`
        : `week ending ${when}, ${formatValue(point.value, series.unit)}`;
    })
    .join('; ');

  return `${series.label}. ${series.description} ${points}.`;
}

function TrendChartComponent({ series }: Props) {
  const theme = useTheme();

  const missing = series.points.filter((point) => point.value === null).length;

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ gap: 2 }}>
        <Text variant="cardTitle">{series.label}</Text>
        <Text variant="caption" color="secondary">
          {series.description}
        </Text>
      </View>

      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={spokenSummary(series)}
        style={{ height: CHART_HEIGHT }}
      >
        <Bars points={series.points} unit={series.unit} />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color="tertiary">
          {formatLocalDate(series.points[0]?.start ?? '')}
        </Text>
        <Text variant="caption" color="tertiary">
          {formatLocalDate(series.points[series.points.length - 1]?.end ?? '')}
        </Text>
      </View>

      {/* Absence explained in words, because a missing bar explains nothing on its own. */}
      {missing > 0 ? (
        <Text variant="caption" color="tertiary">
          {missing} {missing === 1 ? 'week has' : 'weeks have'} no bar — nothing was recorded then,
          which is not the same as nothing happening.
        </Text>
      ) : null}
    </View>
  );
}

function Bars({ points, unit }: { points: TrendPoint[]; unit: TrendSeries['unit'] }) {
  const theme = useTheme();

  // A viewBox one unit wide per point, so the SVG scales to whatever width it is given without
  // any measurement pass. Bars keep their proportions at any container size.
  const width = Math.max(points.length, 1) * 10;

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${width} 100`} preserveAspectRatio="none">
      {/* The baseline, so an empty slot reads as a gap in a chart rather than a broken render. */}
      <Line
        x1={0}
        y1={99.5}
        x2={width}
        y2={99.5}
        stroke={theme.colors.border.subtle}
        strokeWidth={1}
      />

      {points.map((point, index) => {
        if (point.value === null) return null;

        const height = Math.max(MIN_VISIBLE_BAR, fractionOf(point.value, unit) * 100);

        return (
          <Rect
            key={point.start}
            x={index * 10 + BAR_GAP / 2}
            y={100 - height}
            width={10 - BAR_GAP}
            height={height}
            rx={1}
            fill={theme.colors.accent.solid}
          />
        );
      })}
    </Svg>
  );
}

export const TrendChart = memo(TrendChartComponent);
