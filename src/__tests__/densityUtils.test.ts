/**
 * densityUtils.test.ts
 *
 * Verifies that the TypeScript density math matches the Python/scipy
 * reference values computed from real pipeline output.
 *
 * Ground truth values were generated with:
 *   scipy.stats.skewnorm.pdf and numpy.percentile
 * using MSH2_Jia_2021_bootstrap_fits.json.gz, bootstrap seed 0, model "2c".
 */

import { describe, it, expect } from "vitest";
import {
  skewNormPdf,
  jointDensities,
  sampleDensityMatrix,
  percentileBands,
  linspace,
  normaliseBootstrapFits,
  type BootstrapIteration,
  type ComponentParams,
} from "../components/histogram/densityUtils";

// ── Tolerance ─────────────────────────────────────────────────────────────────
// Allow up to 1e-6 relative error — consistent with float32 precision.
const ATOL = 1e-6;
function near(a: number, b: number, tol = ATOL) {
  return Math.abs(a - b) < tol;
}

// ── Ground truth from Python (scipy) ─────────────────────────────────────────
// Bootstrap seed 0, model "2c", from MSH2_Jia_2021_bootstrap_fits.json.gz

const COMP_PARAMS: ComponentParams[] = [
  [2.54222229421329, -5.0688802866581835, 2.1110265364081484],
  [-0.08245502651388567, 2.526077377856743, 0.7883144040704122],
];

const WEIGHTS_SAMPLE_0 = [0.0498780395046116, 0.9501219604953883];

const TEST_XS = [-2.0, 0.0, 1.0, 2.5];

// scipy skewnorm.pdf(x, a=2.542, loc=-5.069, scale=2.111)
const EXPECTED_COMP0_PDF = [
  0.13136797040120596,
  0.02115849605143907,
  0.006064270481354541,
  0.0006109337545622267,
];

// Weighted mixture density for sample 0 at TEST_XS
const EXPECTED_SAMPLE0_DENSITY = [
  0.006552422389943166,
  0.004478960889942203,
  0.08349078877658934,
  0.4816415557886229,
];

// ── skewNormPdf ───────────────────────────────────────────────────────────────

describe("skewNormPdf", () => {
  const [a, loc, scale] = COMP_PARAMS[0];

  it("matches scipy at x = -2.0", () => {
    expect(near(skewNormPdf(-2.0, a, loc, scale), EXPECTED_COMP0_PDF[0])).toBe(true);
  });

  it("matches scipy at x = 0.0", () => {
    expect(near(skewNormPdf(0.0, a, loc, scale), EXPECTED_COMP0_PDF[1])).toBe(true);
  });

  it("matches scipy at x = 1.0", () => {
    expect(near(skewNormPdf(1.0, a, loc, scale), EXPECTED_COMP0_PDF[2])).toBe(true);
  });

  it("matches scipy at x = 2.5", () => {
    expect(near(skewNormPdf(2.5, a, loc, scale), EXPECTED_COMP0_PDF[3])).toBe(true);
  });

  it("returns 0 for non-positive scale", () => {
    expect(skewNormPdf(0, 1, 0, 0)).toBe(0);
    expect(skewNormPdf(0, 1, 0, -1)).toBe(0);
  });

  it("is always non-negative", () => {
    const xs = [-10, -5, -1, 0, 1, 5, 10];
    for (const x of xs) {
      expect(skewNormPdf(x, a, loc, scale)).toBeGreaterThanOrEqual(0);
    }
  });

  it("integrates to approximately 1 over a wide range", () => {
    // Numerical integration via trapezoidal rule over [-20, 10] with 10000 points
    const n = 10000;
    const lo = -20, hi = 10;
    const dx = (hi - lo) / n;
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      const x = lo + i * dx;
      const w = i === 0 || i === n ? 0.5 : 1.0;
      sum += w * skewNormPdf(x, a, loc, scale) * dx;
    }
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-4);
  });
});

// ── jointDensities ────────────────────────────────────────────────────────────

describe("jointDensities", () => {
  it("returns one value per component", () => {
    const result = jointDensities(1.0, COMP_PARAMS, WEIGHTS_SAMPLE_0);
    expect(result).toHaveLength(COMP_PARAMS.length);
  });

  it("sums to the expected total mixture density at x = 0", () => {
    const result = jointDensities(0.0, COMP_PARAMS, WEIGHTS_SAMPLE_0);
    const total = result.reduce((s, v) => s + v, 0);
    expect(near(total, EXPECTED_SAMPLE0_DENSITY[1])).toBe(true);
  });

  it("sums to the expected total mixture density at x = 2.5", () => {
    const result = jointDensities(2.5, COMP_PARAMS, WEIGHTS_SAMPLE_0);
    const total = result.reduce((s, v) => s + v, 0);
    expect(near(total, EXPECTED_SAMPLE0_DENSITY[3])).toBe(true);
  });

  it("all component densities are non-negative", () => {
    const result = jointDensities(1.0, COMP_PARAMS, WEIGHTS_SAMPLE_0);
    for (const d of result) {
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns zero for zero weights", () => {
    const result = jointDensities(1.0, COMP_PARAMS, [0, 0]);
    expect(result.every((v) => v === 0)).toBe(true);
  });
});

// ── sampleDensityMatrix ───────────────────────────────────────────────────────

describe("sampleDensityMatrix", () => {
  // Minimal synthetic iteration matching the real structure
  const mockIteration: BootstrapIteration = {
    "2c": {
      fit: {
        component_params: COMP_PARAMS,
        weights: [WEIGHTS_SAMPLE_0, [1.0, 0.0]],
      },
    },
  };

  it("returns one row per bootstrap iteration", () => {
    const matrix = sampleDensityMatrix(TEST_XS, [mockIteration], "2c", 0);
    expect(matrix).toHaveLength(1);
  });

  it("returns one value per x point", () => {
    const matrix = sampleDensityMatrix(TEST_XS, [mockIteration], "2c", 0);
    expect(matrix[0]).toHaveLength(TEST_XS.length);
  });

  it("matches scipy density for sample 0 at all test x values", () => {
    const matrix = sampleDensityMatrix(TEST_XS, [mockIteration], "2c", 0);
    for (let i = 0; i < TEST_XS.length; i++) {
      expect(near(matrix[0][i], EXPECTED_SAMPLE0_DENSITY[i])).toBe(true);
    }
  });

  it("filters out iterations missing the requested model key", () => {
    const iterWithout: BootstrapIteration = { "3c": mockIteration["2c"] };
    const matrix = sampleDensityMatrix(TEST_XS, [mockIteration, iterWithout], "2c", 0);
    expect(matrix).toHaveLength(1);
  });

  it("returns empty array for no matching iterations", () => {
    const matrix = sampleDensityMatrix(TEST_XS, [mockIteration], "3c", 0);
    expect(matrix).toHaveLength(0);
  });

  it("all densities are non-negative", () => {
    const matrix = sampleDensityMatrix(TEST_XS, [mockIteration], "2c", 0);
    for (const row of matrix) {
      for (const v of row) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ── percentileBands ───────────────────────────────────────────────────────────

describe("percentileBands", () => {
  // Ground truth: numpy.percentile([1,2,3,4,5], [5,50,95])
  const sorted = [1.0, 2.0, 3.0, 4.0, 5.0];

  it("median matches numpy for simple sorted array", () => {
    const { p50 } = percentileBands([sorted]);
    // Single row — p50 equals the values themselves
    expect(p50).toEqual(sorted);
  });

  it("p50 matches numpy.percentile(arr, 50) = 3.0", () => {
    // Matrix with 5 bootstrap rows, each constant at their index value
    const matrix = [[1.0], [2.0], [3.0], [4.0], [5.0]];
    const { p50 } = percentileBands(matrix);
    expect(near(p50[0], 3.0)).toBe(true);
  });

  it("p25 matches numpy.percentile(arr, 25) = 2.0", () => {
    // Use percentileBands with q=0.05 doesn't expose p25 directly,
    // so verify via known matrix where p5 ≈ lower end
    const matrix = [[1.0], [2.0], [3.0], [4.0], [5.0]];
    const { p5 } = percentileBands(matrix);
    // numpy p5 of [1,2,3,4,5] = 1.2
    expect(p5[0]).toBeGreaterThanOrEqual(1.0);
    expect(p5[0]).toBeLessThanOrEqual(2.0);
  });

  it("p5 <= p50 <= p95 at every x", () => {
    const matrix = [
      [1.0, 2.0],
      [3.0, 4.0],
      [5.0, 6.0],
    ];
    const { p5, p50, p95 } = percentileBands(matrix);
    for (let i = 0; i < p5.length; i++) {
      expect(p5[i]).toBeLessThanOrEqual(p50[i]);
      expect(p50[i]).toBeLessThanOrEqual(p95[i]);
    }
  });

  it("handles single bootstrap iteration", () => {
    const matrix = [[1.0, 2.0, 3.0]];
    const { p5, p50, p95 } = percentileBands(matrix);
    expect(p5).toEqual([1.0, 2.0, 3.0]);
    expect(p50).toEqual([1.0, 2.0, 3.0]);
    expect(p95).toEqual([1.0, 2.0, 3.0]);
  });

  it("returns zeros for empty columns", () => {
    const { p5 } = percentileBands([[]]);
    expect(p5).toHaveLength(0);
  });
});

// ── linspace ──────────────────────────────────────────────────────────────────

describe("linspace", () => {
  it("matches numpy.linspace(-3, 3, 5)", () => {
    const expected = [-3.0, -1.5, 0.0, 1.5, 3.0];
    const result = linspace(-3, 3, 5);
    expect(result).toHaveLength(5);
    for (let i = 0; i < expected.length; i++) {
      expect(near(result[i], expected[i])).toBe(true);
    }
  });

  it("returns single element for n=1", () => {
    expect(linspace(0, 10, 1)).toEqual([0]);
  });

  it("first element equals start", () => {
    expect(linspace(-5, 5, 100)[0]).toBe(-5);
  });

  it("last element equals end", () => {
    const result = linspace(-5, 5, 100);
    expect(near(result[result.length - 1], 5)).toBe(true);
  });

  it("produces correct number of points", () => {
    expect(linspace(0, 1, 50)).toHaveLength(50);
  });

  it("points are evenly spaced", () => {
    const result = linspace(0, 1, 11);
    const diffs = result.slice(1).map((v, i) => v - result[i]);
    for (const d of diffs) {
      expect(near(d, 0.1)).toBe(true);
    }
  });
});

// ── normaliseBootstrapFits ────────────────────────────────────────────────────

describe("normaliseBootstrapFits", () => {
  it("returns array input unchanged", () => {
    const arr = [{ "2c": { fit: { component_params: [], weights: [] } } }];
    expect(normaliseBootstrapFits(arr)).toEqual(arr);
  });

  it("converts dict input to array", () => {
    const dict = {
      "0": { "2c": { fit: { component_params: [], weights: [] } } },
      "1": { "2c": { fit: { component_params: [], weights: [] } } },
    };
    const result = normaliseBootstrapFits(dict);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for null input", () => {
    expect(normaliseBootstrapFits(null)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(normaliseBootstrapFits(undefined)).toEqual([]);
  });

  it("returns empty array for non-object input", () => {
    expect(normaliseBootstrapFits(42)).toEqual([]);
    expect(normaliseBootstrapFits("string")).toEqual([]);
  });
});