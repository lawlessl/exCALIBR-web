// ── Shared chart types ──────────────────────────────────────

/** One category's worth of raw scores */
export interface CategoryData {
  sampleId: number; // 0 | 1 | 2 | 3
  scores: number[];
}

/**
 * Backend JSON response shape.
 *
 * point_ranges keys are evidence level strings:
 *   positive = pathogenic-direction  ("1" .. "8")
 *   negative = benign-direction      ("-1" .. "-8")
 * Each value is an array of [start, end] pairs (may be empty [],
 * or contain Infinity / -Infinity as boundary values).
 */
export interface CalibrationResult {
  prior: number;
  point_ranges: Record<string, Array<[number, number]>>;
  dataset: string;
  relax: boolean;
  n_c: string;
  benign_method: string;
  clinvar_2018: boolean;
  scoreset_flipped: boolean;
  uncalibratable_reason: string | null;
}

/**
 * A single parsed interval derived from point_ranges.
 * Infinity boundaries are clamped to the data domain before rendering.
 */
export interface ParsedInterval {
  evidenceKey: string; // e.g. "1", "-3"
  level: number; // numeric: 1..8 or -1..-8
  start: number; // may be -Infinity
  end: number; // may be +Infinity
  isPathogenic: boolean; // level > 0
}

/** Layout constants shared across the stacked chart */
export interface ChartDimensions {
  width: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  rowHeight: number;
  rowGap: number;
}

export const DEFAULT_CHART_DIMS: ChartDimensions = {
  width: 700,
  marginLeft: 80, // extra space for rotated category labels on left
  marginRight: 24,
  marginTop: 12,
  marginBottom: 36,
  rowHeight: 110,
  rowGap: 12,
};
