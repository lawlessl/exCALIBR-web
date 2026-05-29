/**
 * densityUtils.ts
 *
 * JS port of the Python density computation used to render fitted mixture curves.
 *
 * Skew-normal distribution:
 *   f(x; a, loc, scale) = (2 / scale) * φ((x - loc) / scale) * Φ(a * (x - loc) / scale)
 *   where φ = standard normal PDF, Φ = standard normal CDF
 */

// ── Standard normal helpers ───────────────────────────────────────────────────

const SQRT_2PI = Math.sqrt(2 * Math.PI);
const SQRT_2 = Math.sqrt(2);

/** Standard normal PDF */
function phi(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

/** Standard normal CDF via error function approximation */
function Phi(x: number): number {
  return 0.5 * (1 + erf(x / SQRT_2));
}

/** Error function — Abramowitz & Stegun approximation, max error < 1.5e-7 */
function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly =
    t *
    (0.254829592 +
      t *
        (-0.284496736 +
          t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - poly * Math.exp(-x * x));
}

// ── Skew-normal PDF ───────────────────────────────────────────────────────────

/**
 * Skew-normal PDF at x given shape (a), location (loc), scale.
 * Matches scipy.stats.skewnorm.pdf(x, a, loc, scale).
 */
export function skewNormPdf(
  x: number,
  a: number,
  loc: number,
  scale: number,
): number {
  if (scale <= 0) return 0;
  const z = (x - loc) / scale;
  return (2 / scale) * phi(z) * Phi(a * z);
}

// ── Types matching the backend JSON structure ─────────────────────────────────

/** [a, loc, scale] for one mixture component */
export type ComponentParams = [number, number, number];

/** One bootstrap fit for one model (e.g. "2c") */
export interface BootstrapFit {
  component_params: ComponentParams[]; // shape: [n_components, 3]
  weights: number[][]; // shape: [n_samples, n_components]
}

/**
 * One bootstrap iteration — maps model key ("2c", "3c", …) → { fit: BootstrapFit }.
 * The full fits file is either:
 *   - An array:  BootstrapIteration[]   (json_output list form)
 *   - A dict:    Record<string, BootstrapIteration>  (index-keyed form)
 * normaliseBootstrapFits() converts both to BootstrapIteration[].
 */
export type BootstrapIteration = Record<string, { fit: BootstrapFit }>;

/**
 * Accept either the array form or the index-keyed dict form of the fits file
 * and return a consistent BootstrapIteration[] for downstream use.
 */
export function normaliseBootstrapFits(raw: unknown): BootstrapIteration[] {
  if (Array.isArray(raw)) return raw as BootstrapIteration[];
  if (raw && typeof raw === "object") {
    return Object.values(raw) as BootstrapIteration[];
  }
  return [];
}

// ── Density computation ───────────────────────────────────────────────────────

/**
 * Weighted mixture PDF for one sample at one x value.
 * Returns an array of per-component weighted densities (sum them for total density).
 * Matches joint_densities() in Python.
 */
export function jointDensities(
  x: number,
  params: ComponentParams[],
  weights: number[],
): number[] {
  return params.map(
    ([a, loc, scale], k) => weights[k] * skewNormPdf(x, a, loc, scale),
  );
}

/**
 * Compute the total mixture density at every x in xArr for one sample,
 * across all bootstrap iterations.
 *
 * Returns a 2D array: shape [n_bootstraps, n_x]
 * Matches sample_density() in Python (without the xlims masking — handled by caller).
 *
 * @param xArr        Score range (e.g. 500–1000 evenly spaced points)
 * @param iterations  Full bootstrap array from json_output
 * @param modelKey    e.g. "2c" or "3c"
 * @param sampleIdx   0 = P/LP, 1 = B/LB, 2 = gnomAD, 3 = synonymous
 */
export function sampleDensityMatrix(
  xArr: number[],
  iterations: BootstrapIteration[],
  modelKey: string,
  sampleIdx: number,
): number[][] {
  return iterations
    .filter((iter) => iter[modelKey] !== undefined)
    .map((iter) => {
      const { component_params, weights } = iter[modelKey].fit;
      const sampleWeights = weights[sampleIdx];
      return xArr.map((x) =>
        jointDensities(x, component_params, sampleWeights).reduce(
          (s, v) => s + v,
          0,
        ),
      );
    });
}

/**
 * From a 2D density matrix [n_bootstraps, n_x], compute the
 * 5th, 50th, and 95th percentile at each x position.
 *
 * Returns { p5, p50, p95 } — each an array of length n_x.
 */
export function percentileBands(matrix: number[][]): {
  p5: number[];
  p50: number[];
  p95: number[];
} {
  const nX = matrix[0]?.length ?? 0;
  const p5 = new Array<number>(nX);
  const p50 = new Array<number>(nX);
  const p95 = new Array<number>(nX);

  for (let xi = 0; xi < nX; xi++) {
    // Collect all bootstrap values at this x position
    const col = matrix
      .map((row) => row[xi])
      .filter(isFinite)
      .sort((a, b) => a - b);
    if (col.length === 0) {
      p5[xi] = p50[xi] = p95[xi] = 0;
      continue;
    }
    p5[xi] = quantile(col, 0.05);
    p50[xi] = quantile(col, 0.5);
    p95[xi] = quantile(col, 0.95);
  }

  return { p5, p50, p95 };
}

/**
 * Linear interpolation quantile on a pre-sorted array.
 * Matches numpy.percentile default interpolation.
 */
function quantile(sorted: number[], q: number): number {
  const n = sorted.length;
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * Build an evenly spaced array of n points from start to end (inclusive).
 * Equivalent to numpy.linspace(start, end, n).
 */
export function linspace(start: number, end: number, n: number): number[] {
  if (n <= 1) return [start];
  const step = (end - start) / (n - 1);
  return Array.from({ length: n }, (_, i) => start + i * step);
}

// ── LR+ and posterior curve ───────────────────────────────────────────────────

export interface LrCurve {
  xArr: number[];
  lrP5: number[];   // 5th-percentile LR+ across bootstraps (used for pathogenic thresholds)
  lrP95: number[];  // 95th-percentile LR+ across bootstraps (used for benign thresholds)
  postP5: number[]; // Bayes posterior from lrP5 and prior
  postP95: number[]; // Bayes posterior from lrP95 and prior
}

/**
 * Compute LR+(x) = f_pathogenic(x) / f_benign(x) for each bootstrap, then
 * return the 5th/95th percentile bands and their Bayes posteriors.
 *
 * Mirrors process_component_fits in visualize.py:
 *   log_lr_plus = log_fp - log_fb  per bootstrap
 *   nanpercentile(log_lr_plus, 5|95, axis=0)
 *   posterior = lr * prior / ((lr - 1) * prior + 1)
 *
 * Weight-array indices must account for absent samples exactly as the Python
 * pipeline does (indices shift down for each empty sample with a lower position).
 * Pass the position of each sample type in the sorted list of present sampleIds:
 *   presentIds = ordered.map(c => c.sampleId).sort()
 *   pathIdx  = presentIds.indexOf(0)  // -1 → null
 *   benignIdx = presentIds.indexOf(1) // -1 → null
 *   synIdx   = presentIds.indexOf(3)  // -1 → null
 *
 * @param xArr        Score positions to evaluate (e.g. linspace output)
 * @param iterations  Bootstrap fits array
 * @param modelKey    "2c" | "3c" | "4c"
 * @param pathIdx     Weight-array index for pathogenic sample, or null if absent
 * @param benignIdx   Weight-array index for B/LB sample, or null if absent
 * @param synIdx      Weight-array index for synonymous sample, or null if absent
 * @param benignMethod "benign" | "avg" | "synonymous"  — matches pipeline config
 * @param prior       Median prior probability from calibration result
 */
export function lrCurveFromFits(
  xArr: number[],
  iterations: BootstrapIteration[],
  modelKey: string,
  pathIdx: number | null,
  benignIdx: number | null,
  synIdx: number | null,
  benignMethod: string,
  prior: number,
): LrCurve {
  const nan = (): number[] => new Array<number>(xArr.length).fill(NaN);

  const valid = iterations.filter((iter) => iter[modelKey] !== undefined);
  const hasBenign = benignIdx !== null;
  const hasSyn = synIdx !== null;

  if (valid.length === 0 || pathIdx === null || (!hasBenign && !hasSyn)) {
    return { xArr, lrP5: nan(), lrP95: nan(), postP5: nan(), postP95: nan() };
  }

  // Compute LR+(x) per bootstrap: [n_valid, n_x]
  const lrMatrix: number[][] = valid.map((iter) => {
    const { component_params, weights } = iter[modelKey].fit;

    // f_pathogenic at each x
    const fpW = weights[pathIdx];
    const fp = xArr.map((x) =>
      jointDensities(x, component_params, fpW).reduce((s, v) => s + v, 0),
    );

    // Effective benign weight vector — "avg" averages the two weight vectors
    // element-wise, matching Python's (w_b + w_s) / 2 before density evaluation.
    let fbW: number[];
    if (benignMethod === "avg" && hasBenign && hasSyn) {
      fbW = weights[benignIdx!].map((w, k) => (w + weights[synIdx!][k]) / 2);
    } else if (benignMethod === "synonymous" && hasSyn) {
      fbW = weights[synIdx!];
    } else if (hasBenign) {
      fbW = weights[benignIdx!];
    } else {
      fbW = weights[synIdx!];
    }

    const fb = xArr.map((x) =>
      jointDensities(x, component_params, fbW).reduce((s, v) => s + v, 0),
    );

    return fp.map((fpi, xi) => (fb[xi] > 0 ? fpi / fb[xi] : NaN));
  });

  // 5th / 95th percentile at each x position, matching np.nanpercentile
  const nX = xArr.length;
  const lrP5 = new Array<number>(nX);
  const lrP95 = new Array<number>(nX);

  for (let xi = 0; xi < nX; xi++) {
    const col = lrMatrix
      .map((row) => row[xi])
      .filter(isFinite)
      .sort((a, b) => a - b);
    if (col.length === 0) {
      lrP5[xi] = lrP95[xi] = NaN;
    } else {
      lrP5[xi] = quantile(col, 0.05);
      lrP95[xi] = quantile(col, 0.95);
    }
  }

  // Bayes posterior: lr * prior / ((lr - 1) * prior + 1)
  const posterior = (lr: number): number =>
    isFinite(lr) ? (lr * prior) / ((lr - 1) * prior + 1) : NaN;

  return {
    xArr,
    lrP5,
    lrP95,
    postP5: lrP5.map(posterior),
    postP95: lrP95.map(posterior),
  };
}

/**
 * Compute the weighted density for each individual component separately,
 * across all bootstrap iterations, for one sample.
 *
 * Returns an array of matrices — one per component:
 *   result[k] = [n_bootstraps × n_x] density matrix for component k
 *
 * Component count is inferred from the first valid iteration.
 */
export function componentDensityMatrices(
  xArr: number[],
  iterations: BootstrapIteration[],
  modelKey: string,
  sampleIdx: number,
): number[][][] {
  const valid = iterations.filter((iter) => iter[modelKey] !== undefined);
  if (valid.length === 0) return [];

  const nComponents = valid[0][modelKey].fit.component_params.length;
  // result[k][bootstrapIdx][xi]
  const matrices: number[][][] = Array.from({ length: nComponents }, () => []);

  for (const iter of valid) {
    const { component_params, weights } = iter[modelKey].fit;
    const sampleWeights = weights[sampleIdx];

    for (let k = 0; k < nComponents; k++) {
      const [a, loc, scale] = component_params[k];
      const w = sampleWeights[k];
      matrices[k].push(xArr.map((x) => w * skewNormPdf(x, a, loc, scale)));
    }
  }

  return matrices;
}
