import { type PipelineParams, DEFAULT_PARAMS } from "../../types";

interface ParamPanelProps {
  params: PipelineParams;
  onChange: (params: PipelineParams) => void;
}

export default function ParamPanel({ params, onChange }: ParamPanelProps) {
  const set = <K extends keyof PipelineParams>(
    key: K,
    value: PipelineParams[K],
  ) => onChange({ ...params, [key]: value });

  const handleInt = (key: "nBootstraps" | "fitsPerBootstrap", raw: string) => {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) set(key, n);
  };

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
        <input
          type="number"
          className="param-input"
          min={1}
          max={1000}
          value={params.nBootstraps}
          onChange={(e) => handleInt("nBootstraps", e.target.value)}
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
        <input
          type="number"
          className="param-input"
          min={1}
          max={100}
          value={params.fitsPerBootstrap}
          onChange={(e) => handleInt("fitsPerBootstrap", e.target.value)}
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

      <button
        className="reset-btn"
        onClick={() => onChange({ ...DEFAULT_PARAMS })}
      >
        Reset defaults
      </button>
    </div>
  );
}
