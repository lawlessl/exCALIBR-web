import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import {
  type CategoryData,
  type ChartDimensions,
  type CalibrationResult,
  DEFAULT_CHART_DIMS,
} from "./chartTypes";
import {
  buildXScale,
  buildBins,
  buildYScale,
  adaptiveBinCount,
  parseIntervals,
} from "./chartUtils";
import { SAMPLE_LABELS, SAMPLE_COLORS } from "../../types";
import {
  type BootstrapIteration,
  type LrCurve,
  sampleDensityMatrix,
  componentDensityMatrices,
  percentileBands,
  linspace,
  lrCurveFromFits,
} from "./densityUtils";

import './index.css'

// ── Constants ─────────────────────────────────────────────────────────────────
const DISPLAY_ORDER = [0, 1, 2, 3];
const N_PTS = 600;

const INTERVAL_STROKE_WIDTH = 1;
const INTERVAL_DASH = "4,3";
const COLOR_POSITIVE = "#ff4c4c";
const COLOR_NEGATIVE = "#4c4cff";

const ML = DEFAULT_CHART_DIMS.marginLeft;
const MR = 16;
const MT = DEFAULT_CHART_DIMS.marginTop;
const MB = DEFAULT_CHART_DIMS.marginBottom;
const ROW_H = 105;
const ROW_GAP = DEFAULT_CHART_DIMS.rowGap;

// ── Types ─────────────────────────────────────────────────────────────────────
interface TooltipState {
  visible: boolean;
  x: number;
  flipLeft: boolean;
  score: number;
  hoverCounts: Record<number, number>; // sampleId → bin count at cursor x
  intervalKey: string | null;
  intervalColor: string | null;
  lrP5: number | null;
  lrP95: number | null;
  postP5: number | null;
  postP95: number | null;
}

interface StackedHistogramProps {
  categories: CategoryData[];
  result?: CalibrationResult;
  bootstrapFits?: BootstrapIteration[]; // json_output from backend
  modelKey?: string; // e.g. "2c" or "3c" — defaults to result.n_c
  showCurve?: boolean; // show aggregate median line + confidence band
  showComponents?: boolean; // overlay individual weighted component curves
  dims?: Partial<Pick<ChartDimensions, "rowHeight" | "rowGap">>;
}

const POINTS_TO_CODE: Record<string, string> = {
  "+1": "+1 (PS3 Supporting)",
  "+2": "+2 (PS3 Moderate)",
  "+3": "+3 (PS3 Moderate+)",
  "+4": "+4 (PS3 Strong)",
  "+5": "+5 (PS3 Strong)",
  "+6": "+6 (PS3 Strong)",
  "+7": "+7 (PS3 Strong)",
  "+8": "+8 (PS3 Very Strong)",
  "0":  "0 (No evidence)",
  "-1": "-1 (BS3 Supporting)",
  "-2": "-2 (BS3 Moderate)",
  "-3": "-3 (BS3 Moderate+)",
  "-4": "-4 (BS3 Strong)",
  "-5": "-5 (BS3 Strong)",
  "-6": "-6 (BS3 Strong)",
  "-7": "-7 (BS3 Strong)",
  "-8": "-8 (BS3 Very Strong)",
};

function findInterval(
  score: number,
  intervals: ReturnType<typeof parseIntervals>,
): { key: string; color: string } | null {
  for (const iv of intervals) {
    const lo = isFinite(iv.start) ? iv.start : -Infinity;
    const hi = isFinite(iv.end) ? iv.end : Infinity;
    if (score >= lo && score < hi) {
      const pointKey = iv.isPathogenic
        ? `+${Math.abs(iv.level)}`
        : `-${Math.abs(iv.level)}`;
      return {
        key: POINTS_TO_CODE[pointKey] ?? pointKey,
        color: iv.isPathogenic ? COLOR_POSITIVE : COLOR_NEGATIVE,
      };
    }
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function StackedHistogram({
  categories,
  result,
  bootstrapFits,
  modelKey,
  showCurve = true,
  showComponents = false,
  dims: dimOverrides = {},
}: StackedHistogramProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const overlayRef = useRef<SVGGElement | null>(null);
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
  const binsMapRef = useRef<Record<number, d3.Bin<number, number>[]>>({});
  const lrCurveRef = useRef<LrCurve | null>(null);
  const xArrRef = useRef<number[]>([]);

  const [containerWidth, setContainerWidth] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    flipLeft: false,
    score: 0,
    hoverCounts: {},
    intervalKey: null,
    intervalColor: null,
    lrP5: null,
    lrP95: null,
    postP5: null,
    postP95: null,
  });

  // ── Resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowHeight = dimOverrides.rowHeight ?? ROW_H;
  const rowGap = dimOverrides.rowGap ?? ROW_GAP;

  const dims = useMemo<ChartDimensions>(
    () => ({
      width: containerWidth,
      marginLeft: ML,
      marginRight: MR,
      marginTop: MT,
      marginBottom: MB,
      rowHeight,
      rowGap,
    }),
    [containerWidth, rowHeight, rowGap],
  );

  const ordered = useMemo(
    () =>
      DISPLAY_ORDER.map((id) =>
        categories.find((c) => c.sampleId === id),
      ).filter((c): c is CategoryData => !!c),
    [categories],
  );

  // Score grid for LR+ computation — derived from data extent only, not pixel width,
  // so the LR curve doesn't recompute on every container resize.
  const xArr = useMemo(() => {
    if (ordered.length === 0) return [];
    const allScores = ordered.flatMap((c) => c.scores);
    const [mn, mx] = d3.extent(allScores) as [number, number];
    const pad = (mx - mn) * 0.04 || 0.5;
    return linspace(mn - pad, mx + pad, N_PTS);
  }, [ordered]);

  // Precomputed LR+ and posterior percentile curves across all bootstraps.
  // Mirrors visualize.py: f_p / f_b per bootstrap → 5th/95th pct → Bayes posterior.
  const lrCurve = useMemo<LrCurve | null>(() => {
    const activeModel = modelKey ?? result?.n_c ?? null;
    if (!bootstrapFits || !result || !activeModel || xArr.length === 0) return null;

    // Weight-array index = position in sorted list of present sampleIds.
    // This matches the Python pipeline's index adjustment for absent samples.
    const presentIds = ordered.map((c) => c.sampleId).sort((a, b) => a - b);
    const indexOf = (id: number) => {
      const i = presentIds.indexOf(id);
      return i === -1 ? null : i;
    };

    return lrCurveFromFits(
      xArr,
      bootstrapFits,
      activeModel,
      indexOf(0), // pathogenic
      indexOf(1), // benign/LP
      indexOf(3), // synonymous
      result.benign_method,
      result.prior,
    );
  }, [bootstrapFits, result, modelKey, xArr, ordered]);

  // Keep refs in sync so the D3 mousemove closure can access current values
  // without being recreated on every render.
  lrCurveRef.current = lrCurve;
  xArrRef.current = xArr;

  const n = ordered.length;
  const totalInnerH = n * rowHeight + (n - 1) * rowGap;
  const svgHeight = MT + totalInnerH + MB;

  // ── Chart render ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || ordered.length === 0 || containerWidth === 0) return;

    const innerW = containerWidth - ML - MR;
    const allScores = ordered.flatMap((c) => c.scores);
    const xScale = buildXScale(allScores, dims);
    xScaleRef.current = xScale;

    const intervals = result ? parseIntervals(result) : [];

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const root = svg.append("g").attr("transform", `translate(${ML},${MT})`);

    // ── Shaded interval regions (drawn first, behind bars) ──────
    const domain = xScale.domain() as [number, number];

    // Opacity scale: absolute level 1 → lightest, 8 → darkest.
    // Uses a fixed range anchored to the full 1–8 scale so opacity is
    // consistent regardless of how many levels are actually present.
    // min opacity 0.03 (level 1), max opacity 0.18 (level 8).
    const opacityScale = d3
      .scaleLinear()
      .domain([1, 8])
      .range([0.03, 0.18])
      .clamp(true);

    intervals.forEach(({ start, end, level }) => {
      const rc = level > 0 ? COLOR_POSITIVE : COLOR_NEGATIVE;
      const opacity = opacityScale(Math.abs(level));

      // Clamp ±Infinity to the domain edge
      const x0 = xScale(isFinite(start) ? start : domain[0]);
      const x1 = xScale(isFinite(end) ? end : domain[1]);

      const left = Math.max(0, Math.min(x0, x1));
      const right = Math.min(innerW, Math.max(x0, x1));
      if (right <= left) return;

      root
        .append("rect")
        .attr("x", left)
        .attr("y", 0)
        .attr("width", right - left)
        .attr("height", totalInnerH)
        .attr("fill", rc)
        .attr("fill-opacity", opacity)
        .attr("pointer-events", "none");
    });

    // ── Per-row histograms ─────────────────────────────────────────────────
    ordered.forEach((cat, i) => {
      const yOffset = i * (rowHeight + rowGap);
      const binCount = adaptiveBinCount(cat.scores.length);
      const bins = buildBins(cat.scores, xScale, binCount);
      binsMapRef.current[cat.sampleId] = bins;
      const yScale = buildYScale(bins, rowHeight);
      const row = root.append("g").attr("transform", `translate(0,${yOffset})`);

      // Bars
      const barColor = SAMPLE_COLORS[cat.sampleId] ?? "#b6b6b6";
      const barGroup = row.append("g").attr("class", "bars");
      barGroup
        .selectAll<SVGRectElement, d3.Bin<number, number>>("rect.bar")
        .data(bins)
        .join("rect")
        .attr("class", "bar")
        .attr("x", (b) => xScale(b.x0!))
        .attr("y", (b) => yScale(b.length))
        .attr("width", (b) => Math.max(0, xScale(b.x1!) - xScale(b.x0!)))
        .attr("height", (b) => rowHeight - yScale(b.length))
        .attr("fill", barColor)
        .attr("fill-opacity", 0.8)
        .attr("stroke", "none");

      // Silhouette outline
      const pts: [number, number][] = [];
      bins.forEach((b) => {
        pts.push(
          [xScale(b.x0!), yScale(b.length)],
          [xScale(b.x1!), yScale(b.length)],
        );
      });
      const lineGen = d3
        .line<[number, number]>()
        .x((d) => d[0])
        .y((d) => d[1]);
      barGroup
        .append("path")
        .attr("d", lineGen(pts) ?? "")
        .attr("fill", "none")
        .attr("stroke", barColor)
        .attr("stroke-width", 1.5)
        .attr("stroke-linejoin", "round");

      // ── Fitted density curve + confidence band ────────────────
      const activeModel = modelKey ?? result?.n_c ?? null;
      if (bootstrapFits && activeModel) {
        // Build x range from the shared scale domain
        const [xMin, xMax] = xScale.domain() as [number, number];
        const xArr = linspace(xMin, xMax, N_PTS);

        const matrix = sampleDensityMatrix(
          xArr,
          bootstrapFits,
          activeModel,
          cat.sampleId,
        );
        if (matrix.length > 0) {
          const { p5, p50, p95 } = percentileBands(matrix);

          // Y-scale for density: independent of histogram counts
          const densityMax = d3.max(p95) ?? 1;
          const yDensity = d3
            .scaleLinear()
            .domain([0, densityMax * 1.1])
            .range([rowHeight, 0]);

          const bandData = xArr.map((_, xi) => xi);

          // Confidence band — area between p5 and p95
          if (showCurve) {
            const bandArea = d3
              .area<number>()
              .x((xi) => xScale(xArr[xi]))
              .y0((xi) => yDensity(p5[xi]))
              .y1((xi) => yDensity(p95[xi]))
              .defined((xi) => isFinite(p5[xi]) && isFinite(p95[xi]))
              .curve(d3.curveCatmullRom);

            row
              .append("path")
              .datum(bandData)
              .attr("d", bandArea)
              .attr("fill", "#404040")
              .attr("fill-opacity", 0.1)
              .attr("stroke", "none")
              .attr("pointer-events", "none");

            // Median line (50th percentile)
            const lineGen = d3
              .line<number>()
              .x((xi) => xScale(xArr[xi]))
              .y((xi) => yDensity(p50[xi]))
              .defined((xi) => isFinite(p50[xi]))
              .curve(d3.curveCatmullRom);

            row
              .append("path")
              .datum(bandData)
              .attr("d", lineGen)
              .attr("fill", "none")
              .attr("stroke", "#1a1a18")
              .attr("stroke-width", 2)
              .attr("stroke-opacity", 0.45)
              .attr("pointer-events", "none");
          } // end showCurve

          // ── Individual component curves ─────────────────────
          if (showComponents) {
            const compMatrices = componentDensityMatrices(
              xArr,
              bootstrapFits,
              activeModel,
              cat.sampleId,
            );

            // Components share yDensity so weights are visually comparable
            // and the curves sum to the aggregate line.
            compMatrices.forEach((compMatrix) => {
              if (compMatrix.length === 0) return;
              const { p50: compP50 } = percentileBands(compMatrix);

              const compLine = d3
                .line<number>()
                .x((xi) => xScale(xArr[xi]))
                .y((xi) => yDensity(compP50[xi]))
                .defined((xi) => isFinite(compP50[xi]))
                .curve(d3.curveCatmullRom);

              row
                .append("path")
                .datum(bandData)
                .attr("d", compLine)
                .attr("fill", "none")
                .attr("stroke", "#1a1a18")
                .attr("stroke-width", 1)
                .attr("stroke-opacity", 0.3)
                .attr("stroke-dasharray", "3,3")
                .attr("pointer-events", "none");
            });
          }
        }
      }
      // Min/max count labels
      const maxCount = d3.max(bins, (b) => b.length) ?? 0;
      const labelX = -10;
      const padY = 8;

      row
        .append("text")
        .attr("x", labelX)
        .attr("y", 0)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "hanging")
        .attr("fill", "#999999")
        .attr("font-size", "14px")
        .attr("font-family", "'JetBrains Mono', monospace")
        .text(maxCount);

      row
        .append("text")
        .attr("x", labelX)
        .attr("y", rowHeight - padY)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "auto")
        .attr("fill", "#999999")
        .attr("font-size", "14px")
        .attr("font-family", "'JetBrains Mono', monospace")
        .text(0);

      // Hover count label — centred vertically between min and max, updated by D3
      row
        .append("text")
        .attr("class", `hover-count-${cat.sampleId}`)
        .attr("x", labelX)
        .attr("y", rowHeight / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("fill", barColor)
        .attr("font-size", "14px")
        .attr("font-weight", "600")
        .attr("font-family", "'JetBrains Mono', monospace")
        .attr("opacity", 0)
        .text("");

      // Rotated label
      const label = SAMPLE_LABELS[cat.sampleId];
      const labelColor = SAMPLE_COLORS[cat.sampleId] ?? "#999999";
      svg
        .append("text")
        .attr(
          "transform",
          `translate(${ML - 50}, ${MT + yOffset + rowHeight / 2}) rotate(-90)`,
        )
        .attr("text-anchor", "middle")
        .attr("fill", labelColor)
        .attr("font-size", "14px")
        .attr("font-family", "'JetBrains Mono', monospace")
        .attr("font-weight", "500")
        .attr("letter-spacing", "0.04em")
        .text(label?.label ?? `sample ${cat.sampleId}`);

      // Row separator
      if (i < n - 1) {
        root
          .append("line")
          .attr("x1", -ML / 3)
          .attr("x2", 0)
          .attr("y1", yOffset + rowHeight)
          .attr("y2", yOffset + rowHeight)
          .attr("stroke", "#e8e8e8")
          .attr("stroke-width", 1);
      }
    });

    // ── Full-height interval boundary lines ──────────────────
    intervals.forEach(({ start, end, level }) => {
      const lc = level > 0 ? COLOR_POSITIVE : COLOR_NEGATIVE;
      [start, end].forEach((bx) => {
        if (!isFinite(bx)) return;
        const px = xScale(bx);
        if (px < 0 || px > innerW) return;
        root
          .append("line")
          .attr("x1", px)
          .attr("x2", px)
          .attr("y1", 0)
          .attr("y2", totalInnerH)
          .attr("stroke", lc)
          .attr("stroke-width", INTERVAL_STROKE_WIDTH)
          .attr("stroke-dasharray", INTERVAL_DASH)
          .attr("pointer-events", "none");
      });
    });

    // ── Left spine ────────────────────────────────────────────
    root
      .append("line")
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", 0)
      .attr("y2", totalInnerH)
      .attr("stroke", "#e8e8e8")
      .attr("stroke-width", 1);

    // ── Right spine ───────────────────────────────────────────
    root
      .append("line")
      .attr("x1", innerW)
      .attr("x2", innerW)
      .attr("y1", 0)
      .attr("y2", totalInnerH)
      .attr("stroke", "#e8e8e8")
      .attr("stroke-width", 1);

    // ── Top cap ───────────────────────────────────────────────
    root
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", 0)
      .attr("y2", 0)
      .attr("stroke", "#e8e8e8")
      .attr("stroke-width", 1);

    // ── X-axis ────────────────────────────────────────────────
    root
      .append("g")
      .attr("transform", `translate(0,${totalInnerH})`)
      .call(d3.axisBottom(xScale).ticks(8).tickSize(4))
      .call((g) => {
        g.select(".domain").attr("stroke", "#e8e8e8");
        g.selectAll("line").attr("stroke", "#e8e8e8");
        g.selectAll("text")
          .attr("fill", "#999999")
          .attr("font-size", "11px")
          .attr("font-family", "'JetBrains Mono', monospace");
      });

    root
      .append("text")
      .attr("x", innerW / 2)
      .attr("y", totalInnerH + 28)
      .attr("text-anchor", "middle")
      .attr("fill", "#999999")
      .attr("font-size", "14px")
      .attr("font-family", "'JetBrains Mono', monospace")
      .text("score");

    // ── Crosshair overlay ─────────────────────────────────────
    const overlay = root.append("g").attr("class", "crosshair-overlay");
    overlayRef.current = overlay.node();

    overlay
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", innerW)
      .attr("height", totalInnerH)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .style("cursor", "crosshair")
      .on("mousemove", (event: MouseEvent) => {
        const [mx] = d3.pointer(event);
        const score = xScale.invert(mx);
        const ivMatch = findInterval(score, intervals);

        // Look up bin count at cursor position for each category
        const hoverCounts: Record<number, number> = {};
        for (const [sid, catBins] of Object.entries(binsMapRef.current)) {
          const hit = catBins.find((b) => score >= b.x0! && score < b.x1!);
          hoverCounts[Number(sid)] = hit?.length ?? 0;
        }

        // Look up LR+ and posterior at cursor score via nearest-index lookup.
        // xArr is evenly spaced so index = round((score - x0) / step).
        let lrP5: number | null = null;
        let lrP95: number | null = null;
        let postP5: number | null = null;
        let postP95: number | null = null;
        const lc = lrCurveRef.current;
        const xa = xArrRef.current;
        if (lc && xa.length > 1) {
          const step = (xa[xa.length - 1] - xa[0]) / (xa.length - 1);
          const xi = Math.max(
            0,
            Math.min(xa.length - 1, Math.round((score - xa[0]) / step)),
          );
          if (isFinite(lc.lrP5[xi])) lrP5 = lc.lrP5[xi];
          if (isFinite(lc.lrP95[xi])) lrP95 = lc.lrP95[xi];
          if (isFinite(lc.postP5[xi])) postP5 = lc.postP5[xi];
          if (isFinite(lc.postP95[xi])) postP95 = lc.postP95[xi];
        }

        overlay
          .select(".crosshair-line")
          .attr("x1", mx)
          .attr("x2", mx)
          .attr("opacity", 1);

        // Update per-row hover count labels directly (no React re-render)
        for (const [sid, count] of Object.entries(hoverCounts)) {
          root.select(`.hover-count-${sid}`).attr("opacity", 1).text(count);
        }

        setTooltip({
          visible: true,
          x: mx + ML,
          flipLeft: mx > innerW / 2,
          score,
          hoverCounts,
          intervalKey: ivMatch?.key ?? null,
          intervalColor: ivMatch?.color ?? null,
          lrP5,
          lrP95,
          postP5,
          postP95,
        });
      })
      .on("mouseleave", () => {
        overlay.select(".crosshair-line").attr("opacity", 0);
        root.selectAll("[class^='hover-count-']").attr("opacity", 0);
        setTooltip((t) => ({ ...t, visible: false }));
      });

    overlay
      .append("line")
      .attr("class", "crosshair-line")
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", 0)
      .attr("y2", totalInnerH)
      .attr("stroke", "#1a1a18")
      .attr("stroke-width", 1)
      .attr("pointer-events", "none")
      .attr("opacity", 0);
  }, [
    ordered,
    result,
    bootstrapFits,
    modelKey,
    showCurve,
    showComponents,
    dims,
    containerWidth,
    rowHeight,
    rowGap,
    totalInnerH,
    n,
  ]);

  if (ordered.length === 0) return null;

  return (
    <div ref={wrapperRef} style={{ width: "100%", position: "relative" }}>
      {containerWidth > 0 && (
        <>
          <svg
            ref={svgRef}
            width={containerWidth}
            height={svgHeight}
            style={{ display: "block" }}
          />

          {tooltip.visible && (
            <div
              className="chart-tooltip"
              style={{
                ...(tooltip.flipLeft
                  ? { right: containerWidth - tooltip.x + 12 }
                  : { left: tooltip.x + 12 }),
                top: -28,
              }}
            >
              <div className="chart-tooltip-top-row">
                <div className="chart-tooltip-score">{tooltip.score.toFixed(4)}</div>
                {tooltip.intervalKey ? (
                  <div className="chart-tooltip-interval" style={{ color: tooltip.intervalColor ?? undefined }}>
                    {tooltip.intervalKey}
                  </div>
                ) : (
                  <div className="chart-tooltip-interval chart-tooltip-none">—</div>
                )}
              </div>
              {(tooltip.lrP5 !== null || tooltip.lrP95 !== null) && (
                <div className="chart-tooltip-lr-table">
                  {tooltip.lrP5 !== null && (
                    <div className="chart-tooltip-lr">
                      <span className="chart-tooltip-lr-label">LR⁺ p5</span>
                      <span className="chart-tooltip-lr-value">{Number(tooltip.lrP5.toPrecision(3)).toString()}</span>
                      <span className="chart-tooltip-lr-label">Post</span>
                      <span className="chart-tooltip-lr-value">{((tooltip.postP5 ?? 0) * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  {tooltip.lrP95 !== null && (
                    <div className="chart-tooltip-lr">
                      <span className="chart-tooltip-lr-label">LR⁺ p95</span>
                      <span className="chart-tooltip-lr-value">{Number(tooltip.lrP95.toPrecision(3)).toString()}</span>
                      <span className="chart-tooltip-lr-label">Post</span>
                      <span className="chart-tooltip-lr-value">{((tooltip.postP95 ?? 0) * 100).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
