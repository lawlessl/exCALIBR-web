import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import StackedHistogram from "../../components/histogram/StackedHistogram";
import {
  type CalibrationResult,
  type CategoryData,
} from "../../components/histogram/chartTypes";
import {
  type BootstrapIteration,
  normaliseBootstrapFits,
} from "../../components/histogram/densityUtils";
import { type VariantRow } from "../../types";
import { groupBySample, parseCSV } from "../../utils/csvParser";
import "./Results.css";

const API_BASE = "https://excalibr.org";
const POLL_INTERVAL_MS = 3000;

// ── JSON parsing (handles Python's bare Infinity/-Infinity) ───────────────────
function parseJSON(text: string): unknown {
  const clean = text
    .replace(/-Infinity/g, "-1e308")
    .replace(/Infinity/g, "1e308");
  return JSON.parse(clean);
}

function readJSONFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(parseJSON(e.target?.result as string));
      } catch {
        reject(new Error("Invalid JSON file"));
      }
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsText(file);
  });
}

// ── JSON file picker (local mode only) ───────────────────────────────────────
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

// ── CSV rows from sessionStorage (shared by both modes) ──────────────────────
function loadCategoriesFromSession(): CategoryData[] {
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
}

// ── Main component ────────────────────────────────────────────────────────────
type PageStatus = "polling" | "upload" | "ready" | "failed" | "notfound";

export default function Results() {
  // jobId present  → API mode  (/results/:jobId)
  // jobId absent   → local mode (/results/local)
  const { jobId } = useParams<{ jobId?: string }>();
  const isApiMode = Boolean(jobId && jobId !== "local");

  const [status, setStatus] = useState<PageStatus>(
    isApiMode ? "polling" : "upload"
  );
  const [pollMessage, setPollMessage] = useState("Submitting job…");
  const [progress, setProgress] = useState<{
  stage_label: string;
  fits_done: number;
  fits_total: number;
  bootstraps_total: number;
  percent: number;
  elapsed: string | null;
  remaining: string | null;
  dataset: { n_variants: number; n_samples: number } | null;
  results: Record<string, unknown>;
} | null>(null);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [fits, setFits] = useState<BootstrapIteration[]>([]);
  const [jobMeta, setJobMeta] = useState<{
    n_bootstraps: number | null;
    fits_per_bootstrap: number | null;
  } | null>(null);
  const [categories, setCategories] = useState<CategoryData[]>(loadCategoriesFromSession);
  const [apiError, setApiError] = useState<string | null>(null);

  // Local-mode state
  const [resultError, setResultError] = useState<string | null>(null);
  const [fitsError, setFitsError] = useState<string | null>(null);
  const [resultLoaded, setResultLoaded] = useState(false);
  const [fitsLoaded, setFitsLoaded] = useState(false);

  const [showCurve, setShowCurve] = useState(true);
  const [showComponents, setShowComponents] = useState(false);

  const filename =
    sessionStorage.getItem("excalibr_csv_filename") ?? "dataset";

  // ── API mode: poll status then fetch results ──────────────────────────────
  useEffect(() => {
    if (!isApiMode || !jobId) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function fetchText(url: string): Promise<string> {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    }

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/api/jobs/${jobId}/status`);
        if (res.status === 404) {
          if (!cancelled) setStatus("notfound");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { status: jobStatus, error } = await res.json();

        if (cancelled) return;

        if (jobStatus === "pending") {
          setPollMessage("Job queued — waiting for a free slot…");
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        } else if (jobStatus === "running") {
          setPollMessage("Pipeline running…");
          try {
            const progRes = await fetch(`${API_BASE}/api/jobs/${jobId}/progress`);
            if (progRes.ok) {
              const data = await progRes.json();
              console.log("setting progress:", data);
              setProgress(data);
              console.log("progress set");
            }
            if (progRes.ok) setProgress(await progRes.json());
          } catch {}
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        } else if (jobStatus === "complete") {
          setPollMessage("Pipeline complete — loading results…");

          // Fetch results manifest
          const manifestRes = await fetch(
            `${API_BASE}/api/jobs/${jobId}/results`
          );
          if (!manifestRes.ok) throw new Error("Could not fetch results manifest");
          const manifest = await manifestRes.json();

          // Load first calibration file
          const calibText = await fetchText(
            `${API_BASE}${manifest.calibration[0]}`
          );
          const calibData = parseJSON(calibText) as CalibrationResult;

          // Load fits (decompressed by backend)
          const fitsText = await fetchText(`${API_BASE}/api/jobs/${jobId}/fits`);
          const fitsData = normaliseBootstrapFits(parseJSON(fitsText));

          if (!cancelled) {
            setResult(calibData);
            setFits(fitsData);
          
            // Always fetch job meta (bootstraps, fits_per_bootstrap, filename)
            const metaRes = await fetch(`${API_BASE}/api/jobs/${jobId}/meta`);
            const metaData = await metaRes.json();
            setJobMeta({
              n_bootstraps: metaData.n_bootstraps,
              fits_per_bootstrap: metaData.fits_per_bootstrap,
            });
          
            // Load CSV from API if sessionStorage is empty (e.g. returning via email link)
            const sessionRows = sessionStorage.getItem("excalibr_csv_rows");
            if (!sessionRows) {
              const csvText = await fetchText(`${API_BASE}/api/jobs/${jobId}/csv`);
              const { data } = parseCSV(csvText);
              const groups = groupBySample(data);
              const cats = Object.entries(groups).map(([id, scores]) => ({
                sampleId: Number(id),
                scores,
              }));
              setCategories(cats);
              sessionStorage.setItem("excalibr_csv_filename", metaData.original_filename);
            }
          
            setStatus("ready");
          }
        } else if (jobStatus === "failed") {
          if (!cancelled) {
            setApiError(error ?? "The pipeline encountered an error.");
            setStatus("failed");
          }
        }
      } catch (e) {
        if (!cancelled) {
          setApiError((e as Error).message);
          setStatus("failed");
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [jobId, isApiMode]);

  // ── Local mode file handlers ──────────────────────────────────────────────
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
  function downloadJSON(data: unknown, name: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="results-page">
      {/* ── Header ── */}
      <header className="results-header">
        <Link to="/" className="results-back">
          ← New calibration
        </Link>
        <span className="results-wordmark">exCALIBR</span>
      </header>

      <main className="results-main">

        {/* ── Polling state ── */}
        {status === "polling" && (
          <div className="results-state">
            <div className="results-spinner" />
            <span>{pollMessage}</span>

            {progress && (
              <div className="results-progress">

                {/* Stage + fit count */}
                <div className="results-progress-label">
                  <span>{progress.stage_label}</span>
                  {progress.fits_total > 0 && progress.fits_done > 0 && (
                    <span className="results-progress-count">
                      {progress.fits_done.toLocaleString()} / {progress.fits_total.toLocaleString()} fits
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="results-progress-bar-track">
                  <div
                    className="results-progress-bar-fill"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>

                {/* Elapsed / remaining */}
                {(progress.elapsed || progress.remaining) && (
                  <div className="results-progress-timing">
                    {progress.elapsed && <span>{progress.elapsed} elapsed</span>}
                    {progress.elapsed && progress.remaining && <span> · </span>}
                    {progress.remaining && <span>~{progress.remaining} remaining</span>}
                  </div>
                )}

                {/* Dataset info — shown once available */}
                {progress.dataset && (
                  <div className="results-progress-timing" style={{ marginTop: "0.1rem" }}>
                    <span>
                      {progress.dataset.n_variants.toLocaleString()} variants · {progress.dataset.n_samples} samples
                    </span>
                  </div>
                )}

                {/* Progressive results — appear as pipeline stages complete */}
                {progress.results && Object.keys(progress.results).length > 0 && (
                  <div className="results-progress-info">
                    {progress.results.prior != null && (
                      <span>Prior: {Number(progress.results.prior).toFixed(4)}</span>
                    )}
                    {progress.results.scoreset_flipped != null && (
                      <span>
                        Score direction: {progress.results.scoreset_flipped ? "Flipped" : "Standard"}
                      </span>
                    )}
                    {progress.results.valid_fits != null && (
                      <span>
                        Valid fits: {progress.results.valid_fits as number} / {progress.results.total_fits as number}
                      </span>
                    )}
                    {progress.results.selected_model != null && (
                      <span>Selected model: {progress.results.selected_model as string}</span>
                    )}
                  </div>
                )}

              </div>
            )}

            {jobId && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--text-faint)" }}>
                Job {jobId}
              </span>
            )}
          </div>
        )}

        {/* ── Failed state ── */}
        {status === "failed" && (
          <div className="results-state">
            <span className="results-error">Job failed</span>
            {apiError && (
              <span className="results-error" style={{ fontSize: "0.78rem", maxWidth: 600, whiteSpace: "pre-wrap" }}>
                {apiError}
              </span>
            )}
            <Link to="/" className="results-back" style={{ marginTop: "1rem" }}>
              ← Try again
            </Link>
          </div>
        )}

        {/* ── Not found state ── */}
        {status === "notfound" && (
          <div className="results-state">
            <span className="results-error">Job not found</span>
            <span style={{ fontSize: "0.84rem", color: "var(--text-muted)", textAlign: "center", maxWidth: 480 }}>
              This job may have expired (results are kept for 7 days) or the link may be incorrect.
            </span>
            <Link to="/" className="results-back" style={{ marginTop: "1rem" }}>
              ← Submit a new job
            </Link>
          </div>
        )}

        {/* ── Local upload panel ── */}
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

        {/* ── Chart view (both modes) ── */}
        {status === "ready" && result && (
          <>
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
              {jobMeta?.n_bootstraps != null && (
                <div className="results-meta-item">
                  <span className="results-meta-label">Bootstraps</span>
                  <span className="results-meta-value">{jobMeta.n_bootstraps.toLocaleString()}</span>
                </div>
              )}
              {jobMeta?.fits_per_bootstrap != null && (
                <div className="results-meta-item">
                  <span className="results-meta-label">Fits</span>
                  <span className="results-meta-value">{jobMeta.fits_per_bootstrap}</span>
                </div>
              )}
              <div className="results-meta-item">
                <span className="results-meta-label">Prior</span>
                <span className="results-meta-value">
                  {result.prior.toFixed(4)}
                </span>
              </div>
              <div className="results-meta-item">
                <span className="results-meta-label">Benign method</span>
                <span className="results-meta-value">{result.benign_method}</span>
              </div>
              <div className="results-meta-item">
                <span className="results-meta-label">Score direction</span>
                <span className="results-meta-value">
                  {result.scoreset_flipped ? "Flipped" : "Standard"}
                </span>
              </div>
            </div>

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
                    onClick={() => downloadJSON(result, `${result.dataset}_calibration.json`)}
                    title="Download calibration result JSON"
                  >
                    Download Calibration Thresholds
                  </button>
                  <button
                    className="results-toolbar-btn"
                    onClick={() => downloadJSON(fits, `${result.dataset}_bootstrap_fits.json`)}
                    disabled={fits.length === 0}
                    title="Download bootstrap fits JSON"
                  >
                    Download Model Fits
                  </button>
                  {!isApiMode && (
                    <button
                      className="results-toolbar-btn"
                      onClick={() => setStatus("upload")}
                      title="Load different files"
                    >
                      ↑ Change files
                    </button>
                  )}
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