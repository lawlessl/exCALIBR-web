import { useEffect, useState } from "react";
import { type PipelineParams, DEFAULT_PARAMS } from "../../../types";
import "./ParamPanel.css";

interface ParamPanelProps {
  params: PipelineParams;
  onChange: (params: PipelineParams) => void;
}

export default function ParamPanel({ params, onChange }: ParamPanelProps) {
  const set = <K extends keyof PipelineParams>(
    key: K,
    value: PipelineParams[K],
  ) => onChange({ ...params, [key]: value });

  function NumericInput({
    value,
    min,
    max,
    step = 1,
    onChange,
  }: {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (n: number) => void;
  }) {
    const [raw, setRaw] = useState(String(value));
    const [focused, setFocused] = useState(false);
  
    useEffect(() => {
      if (!focused) setRaw(String(value));
    }, [value, focused]);
  
    return (
      <input
        type="number"
        className="param-input"
        min={min}
        max={max}
        step={step}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          const n = step === 1 ? parseInt(raw, 10) : parseFloat(raw);
          if (!isNaN(n) && n >= min && n <= max) {
            onChange(n);
            setRaw(String(n));
          } else {
            setRaw(String(value));
          }
        }}
      />
    );
  }

  return (
    <div className="param-panel">
      {/* Number of components */}
      <div className="param-group">
        <label className="param-label">Number of components</label>
        <p className="param-desc">
          Controls flexibility in modeling score distributions. Select which
          component counts to fit; the best model is chosen automatically.
        </p>
        <div className="component-toggles">
          {[2, 3, 4].map((c) => {
            const active = params.components.includes(c);
            return (
              <button
                key={c}
                className={`component-btn ${active ? "active" : ""}`}
                onClick={() => {
                  const next = active
                    ? params.components.filter((x) => x !== c)
                    : [...params.components, c].sort();
                  if (next.length > 0) set("components", next);
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bootstrap iterations */}
      <div className="param-group">
        <label className="param-label">
          Bootstrap iterations
          <span className="param-hint-inline">1 – 1000</span>
        </label>
        <p className="param-desc">
          Higher values improve the quality of evidence assignments at the cost
          of longer runtime.
        </p>
        <NumericInput
          value={params.nBootstraps}
          min={1}
          max={1000}
          onChange={(n) => set("nBootstraps", n)}
        />
      </div>

      {/* Fits per bootstrap */}
      <div className="param-group">
        <label className="param-label">
          Fits per bootstrap
          <span className="param-hint-inline">1 – 100</span>
        </label>
        <p className="param-desc">
          Higher values improve the quality of the selected fit within each
          bootstrap iteration.
        </p>
        <NumericInput
          value={params.fitsPerBootstrap}
          min={1}
          max={100}
          onChange={(n) => set("fitsPerBootstrap", n)}
        />
      </div>

      {/* Benign density computation */}
      <div className="param-group">
        <label className="param-label">Benign density computation</label>
        <p className="param-desc">
          Determines how the benign reference distribution is estimated.{" "}
          <em>Average</em> uses average benign and synonymous mixture weights
          when both sample types are present.
        </p>
        <select
          className="param-select"
          value={params.benignMethod}
          onChange={(e) =>
            set(
              "benignMethod",
              e.target.value as PipelineParams["benignMethod"],
            )
          }
        >
          <option value="avg">Average</option>
          <option value="benign">Benign only</option>
          <option value="synonymous">Synonymous only</option>
        </select>
      </div>

      {/* Conservative monotonicity */}
      <div className="param-group">
        <div className="check-row">
          <label className="check-label">
            <input
              type="checkbox"
              checked={params.conservativeMonotonicity}
              onChange={(e) =>
                set("conservativeMonotonicity", e.target.checked)
              }
              className="check-input"
            />
            <span className="check-text">Conservative monotonicity</span>
          </label>
        </div>
        <p className="param-desc">
          Removes evidence assignments that are not monotonic across the score
          range. Reduces unwanted evidence but cannot model datasets with both
          loss-of-function and gain-of-function pathomechanisms.
        </p>
      </div>

      {/* Manual prior */}
      <div className="param-group">
        <div className="check-row">
          <label className="check-label">
            <input
              type="checkbox"
              checked={params.manualPrior !== null}
              onChange={(e) =>
                set("manualPrior", e.target.checked ? 0.044 : null)
              }
              className="check-input"
            />
            <span className="check-text">Override prior probability</span>
          </label>
        </div>
        {params.manualPrior !== null && (
          <NumericInput
            value={params.manualPrior}
            min={0.001}
            max={0.999}
            step={0.001}
            onChange={(v) => set("manualPrior", v)}
          />
        )}
        <p className="param-desc">
          Manually set the prior probability of pathogenicity instead of
          estimating it from the data. Must be between 0 and 1.
        </p>
      </div>

      <button
        className="reset-btn"
        onClick={() => onChange({ ...DEFAULT_PARAMS })}
      >
        Reset defaults
      </button>
    </div>
  );
}
