import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { SAMPLE_LABELS, SAMPLE_COLORS } from "../../types";

interface SampleHistogramProps {
  sampleId: number;
  scores: number[];
  globalMin: number;
  globalMax: number;
  height?: number;
}

export default function SampleHistogram({
  sampleId,
  scores,
  globalMin,
  globalMax,
  height = 150,
}: SampleHistogramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);

  const meta = SAMPLE_LABELS[sampleId];
  const color = SAMPLE_COLORS[sampleId] ?? "#b6b6b6";

  // Observe container width and update state on resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Redraw whenever width, data, or scale changes
  useEffect(() => {
    if (!svgRef.current || scores.length === 0 || width === 0) return;

    const margin = { top: 10, right: 14, bottom: 28, left: 38 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const pad = (globalMax - globalMin) * 0.04 || 0.1;
    const xMin = globalMin - pad;
    const xMax = globalMax + pad;

    const x = d3.scaleLinear().domain([xMin, xMax]).range([0, innerW]);

    const binCount = scores.length < 30 ? 10 : scores.length < 100 ? 15 : 20;
    const bins = d3.bin().domain([xMin, xMax]).thresholds(x.ticks(binCount))(
      scores
    );

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(bins, (b) => b.length) ?? 1])
      .nice()
      .range([innerH, 0]);

    // Horizontal grid lines
    g.append("g")
      .call(
        d3
          .axisLeft(y)
          .tickSize(-innerW)
          .tickFormat(() => "")
          .ticks(3)
      )
      .call((axis) => {
        axis.select(".domain").remove();
        axis.selectAll("line").attr("stroke", "#ebe8e3");
      });

    // Bars
    g.selectAll("rect")
      .data(bins)
      .join("rect")
      .attr("x", (b) => x(b.x0!) + 0.5)
      .attr("y", (b) => y(b.length))
      .attr("width", (b) => Math.max(0, x(b.x1!) - x(b.x0!) - 1))
      .attr("height", (b) => innerH - y(b.length))
      .attr("fill", color)
      .attr("fill-opacity", 0.45)
      .attr("stroke", color)
      .attr("stroke-opacity", 0.8)
      .attr("stroke-width", 1)
      .attr("rx", 1.5);

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(3))
      .call((axis) => {
        axis.select(".domain").attr("stroke", "#ddd9d2");
        axis
          .selectAll("text")
          .attr("fill", "#9e9890")
          .attr("font-size", "9px")
          .attr("font-family", "'JetBrains Mono', monospace");
        axis.selectAll("line").attr("stroke", "#ddd9d2");
      });

    // Y axis
    g.append("g")
      .call(d3.axisLeft(y).ticks(3).tickSize(3))
      .call((axis) => {
        axis.select(".domain").attr("stroke", "#ddd9d2");
        axis
          .selectAll("text")
          .attr("fill", "#9e9890")
          .attr("font-size", "9px")
          .attr("font-family", "'JetBrains Mono', monospace");
        axis.selectAll("line").attr("stroke", "#ddd9d2");
      });

    // n count
    g.append("text")
      .attr("x", innerW)
      .attr("y", -1)
      .attr("text-anchor", "end")
      .attr("fill", "#bab5ad")
      .attr("font-size", "8.5px")
      .attr("font-family", "'JetBrains Mono', monospace")
      .text(`n = ${scores.length.toLocaleString()}`);
  }, [scores, width, height, globalMin, globalMax, color]);

  return (
    <div className="histogram-card" style={{ borderLeftColor: color }}>
      <div className="histogram-header">
        <span className="sample-dot" style={{ background: color }} />
        <div>
          <div className="sample-label">{meta.label}</div>
          <div className="sample-desc">{meta.description}</div>
        </div>
      </div>
      {/* containerRef measures available width; svg fills it exactly */}
      <div ref={containerRef} style={{ width: "100%" }}>
        <svg ref={svgRef} width={width} height={height} display="block" />
      </div>
    </div>
  );
}
