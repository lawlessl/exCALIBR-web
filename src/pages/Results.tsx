import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import StackedHistogram from "../components/histogram/StackedHistogram";
import {
  type CalibrationResult,
  type CategoryData,
} from "../components/histogram/chartTypes";
import {
  type BootstrapIteration,
  normaliseBootstrapFits,
} from "../components/histogram/densityUtils";
import { type VariantRow } from "../types";
import { groupBySample } from "../utils/csvParser";

// ── File loader helper ────────────────────────────────────────────────────────
function readJSONFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // Python json.dump writes bare Infinity/-Infinity which is invalid JSON.
        // Replace with large finite sentinels before parsing; downstream code
        // already handles isFinite() checks on interval boundaries.
        const raw = (e.target?.result as string)
          .replace(/-Infinity/g, "-1e308")
          .replace(/Infinity/g, "1e308");
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON file"));
      }
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsText(file);
  });
}

// ── JSON file picker sub-component ───────────────────────────────────────────
interface JSONPickerProps {
  label: string;
  hint: string;
  loaded: boolean;
  error: string | null;
  onChange: (file: File) => void;
}

function JSONPicker({ label, hint, loaded, error, onChange }: JSONPickerProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="json-picker">
      <div className="json-picker-label">{label}</div>
      <div className="json-picker-hint">{hint}</div>
      <button
        className={`json-picker-btn ${loaded ? "loaded" : ""}`}
        onClick={() => ref.current?.click()}
      >
        {loaded ? "✓ Loaded — click to replace" : "Choose file…"}
      </button>
      <input
        ref={ref}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
        }}
      />
      {error && <div className="json-picker-error">⚠ {error}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
type PageStatus = "upload" | "ready" | "error";

export default function Results() {
  const [status, setStatus] = useState<PageStatus>("upload");
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [fits, setFits] = useState<BootstrapIteration[]>([]);
  const [categories] = useState<CategoryData[]>(() => {
    try {
      const raw = sessionStorage.getItem("excalibr_csv_rows");
      if (!raw) return [];
      const rows: VariantRow[] = JSON.parse(raw);
      const groups = groupBySample(rows);
      return Object.entries(groups).map(([id, scores]) => ({
        sampleId: Number(id),
        scores,
      }));
    } catch {
      return [];
    }
  });

  const [resultError, setResultError] = useState<string | null>(null);
  const [fitsError, setFitsError] = useState<string | null>(null);
  const [resultLoaded, setResultLoaded] = useState(false);
  const [fitsLoaded, setFitsLoaded] = useState(false);

  const [showCurve, setShowCurve] = useState(true);
  const [showComponents, setShowComponents] = useState(false);

  // ── Recover CSV rows from sessionStorage (computed once at mount) ───────
  // useState initialiser runs once — avoids setState-in-effect lint error
  // while still reading sessionStorage on the first render.

  // ── File handlers ─────────────────────────────────────────────────────────
  async function handleResultFile(file: File) {
    setResultError(null);
    try {
      const data = (await readJSONFile(file)) as CalibrationResult;
      if (!data.point_ranges || !data.dataset)
        throw new Error("Missing expected fields");
      setResult(data);
      setResultLoaded(true);
      setStatus("ready");
    } catch (e) {
      setResultError((e as Error).message);
      setResultLoaded(false);
    }
  }

  async function handleFitsFile(file: File) {
    setFitsError(null);
    try {
      const data = await readJSONFile(file);
      const normalised = normaliseBootstrapFits(data);
      if (normalised.length === 0)
        throw new Error("No bootstrap iterations found in file");
      setFits(normalised);
      setFitsLoaded(true);
    } catch (e) {
      setFitsError((e as Error).message);
      setFitsLoaded(false);
    }
  }

  // ── Download helper ───────────────────────────────────────────────────────
  function downloadJSON(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filename = sessionStorage.getItem("excalibr_csv_filename") ?? "dataset";

  return (
    <div className="results-page">
      {/* ── Header ── */}
      <header className="results-header">
        <Link to="/" className="results-back">
          ← New calibration
        </Link>
        <span className="results-wordmark">ExCALIBR</span>
      </header>

      <main className="results-main">
        {/* ── Upload panel (always visible until result loaded) ── */}
        {status === "upload" && (
          <div className="results-upload-panel">
            <div className="results-upload-title">Load pipeline output</div>
            <p className="results-upload-desc">
              Upload the two JSON files produced by the calibration pipeline.
              The calibration result is required; bootstrap fits are optional
              (needed for the fitted curve overlay).
            </p>
            <div className="results-upload-slots">
              <JSONPicker
                label="Calibration result"
                hint="*_calibration.json — contains point_ranges, prior, dataset"
                loaded={resultLoaded}
                error={resultError}
                onChange={handleResultFile}
              />
              <JSONPicker
                label="Bootstrap fits"
                hint="*_bootstrap_fits.json — contains the json_output array"
                loaded={fitsLoaded}
                error={fitsError}
                onChange={handleFitsFile}
              />
            </div>
            {resultLoaded && !fitsLoaded && (
              <p className="results-upload-skip">
                Calibration result loaded.{" "}
                <button
                  className="results-skip-btn"
                  onClick={() => setStatus("ready")}
                >
                  Continue without fits →
                </button>
              </p>
            )}
          </div>
        )}

        {/* ── Chart view ── */}
        {status === "ready" && result && (
          <>
            {/* Meta bar */}
            <div className="results-meta-bar">
              <div className="results-meta-item">
                <span className="results-meta-label">Dataset</span>
                <span className="results-meta-value">{result.dataset}</span>
              </div>
              <div className="results-meta-item">
                <span className="results-meta-label">CSV</span>
                <span className="results-meta-value">{filename}</span>
              </div>
              <div className="results-meta-item">
                <span className="results-meta-label">Model</span>
                <span className="results-meta-value">{result.n_c}</span>
              </div>
              <div className="results-meta-item">
                <span className="results-meta-label">Prior</span>
                <span className="results-meta-value">
                  {result.prior.toFixed(4)}
                </span>
              </div>
              <div className="results-meta-item">
                <span className="results-meta-label">Benign method</span>
                <span className="results-meta-value">
                  {result.benign_method}
                </span>
              </div>
              <div className="results-meta-item">
                <span className="results-meta-label">Score direction</span>
                <span className="results-meta-value">
                  {result.scoreset_flipped ? "Flipped" : "Standard"}
                </span>
              </div>
            </div>

            {/* Chart panel */}
            <div className="results-chart-panel">
              <div className="results-chart-header">
                <div className="results-chart-header-left">
                  <span className="results-chart-title">
                    Calibrated score distributions
                  </span>
                  <span className="results-chart-sub">
                    Dashed lines indicate ACMG/AMP evidence thresholds
                  </span>
                </div>
                <div className="results-chart-toolbar">
                  <label className="results-toolbar-toggle">
                    <input
                      type="checkbox"
                      checked={showCurve}
                      onChange={(e) => setShowCurve(e.target.checked)}
                      className="toggle-input"
                    />
                    <span>Fitted curve</span>
                  </label>
                  <label className="results-toolbar-toggle">
                    <input
                      type="checkbox"
                      checked={showComponents}
                      onChange={(e) => setShowComponents(e.target.checked)}
                      className="toggle-input"
                    />
                    <span>Components</span>
                  </label>
                  <button
                    className="results-toolbar-btn"
                    onClick={() =>
                      downloadJSON(result, `${result.dataset}_calibration.json`)
                    }
                    title="Download calibration result JSON"
                  >
                    ↓ Results
                  </button>
                  <button
                    className="results-toolbar-btn"
                    onClick={() =>
                      downloadJSON(
                        fits,
                        `${result.dataset}_bootstrap_fits.json`,
                      )
                    }
                    disabled={fits.length === 0}
                    title="Download bootstrap fits JSON"
                  >
                    ↓ Fits
                  </button>
                  <button
                    className="results-toolbar-btn"
                    onClick={() => {
                      setStatus("upload");
                    }}
                    title="Load different files"
                  >
                    ↑ Change files
                  </button>
                </div>
              </div>
              <div className="results-chart-body">
                <StackedHistogram
                  categories={categories}
                  result={result}
                  bootstrapFits={fits}
                  modelKey={result.n_c}
                  showCurve={showCurve}
                  showComponents={showComponents}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
