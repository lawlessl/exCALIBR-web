import * as d3 from "d3";
import { type ChartDimensions } from "./chartTypes";

/** Compute a shared x-scale from all scores across all categories */
export function buildXScale(
  allScores: number[],
  dims: ChartDimensions,
): d3.ScaleLinear<number, number> {
  const innerW = dims.width - dims.marginLeft - dims.marginRight;
  const [min, max] = d3.extent(allScores) as [number, number];
  const pad = (max - min) * 0.04 || 0.5;
  return d3
    .scaleLinear()
    .domain([min - pad, max + pad])
    .range([0, innerW])
    .nice();
}

/** Compute histogram bins for one category using the shared x-scale */
export function buildBins(
  scores: number[],
  xScale: d3.ScaleLinear<number, number>,
  binCount: number,
): d3.Bin<number, number>[] {
  return d3
    .bin()
    .domain(xScale.domain() as [number, number])
    .thresholds(xScale.ticks(binCount))(scores);
}

/** Adaptive bin count based on sample size */
export function adaptiveBinCount(n: number): number {
  if (n < 30) return 15;
  if (n < 100) return 25;
  if (n < 500) return 40;
  return 60;
}

/** Y-scale for a single histogram row */
export function buildYScale(
  bins: d3.Bin<number, number>[],
  rowHeight: number,
): d3.ScaleLinear<number, number> {
  return d3
    .scaleLinear()
    .domain([0, d3.max(bins, (b) => b.length) ?? 1])
    .nice()
    .range([rowHeight, 0]);
}

/** Parse raw point_ranges from the backend JSON into a flat list of intervals */
import { type CalibrationResult, type ParsedInterval } from "./chartTypes";

export function parseIntervals(result: CalibrationResult): ParsedInterval[] {
  const intervals: ParsedInterval[] = [];

  for (const [key, ranges] of Object.entries(result.point_ranges)) {
    if (ranges.length === 0) continue;
    const level = parseInt(key, 10);
    for (const [start, end] of ranges) {
      intervals.push({
        evidenceKey: key,
        level,
        start,
        end,
        isPathogenic: level > 0,
      });
    }
  }

  return intervals.sort((a, b) => a.start - b.start);
}

/**
 * Clamp ±Infinity to just outside the visible x-domain so
 * boundary lines still render at the axis edge.
 */
export function clampToDomain(
  value: number,
  domain: [number, number],
  margin = 0.01,
): number {
  if (!isFinite(value)) {
    return value === Infinity ? domain[1] + margin : domain[0] - margin;
  }
  return value;
}
