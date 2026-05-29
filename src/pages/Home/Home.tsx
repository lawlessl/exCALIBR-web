import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CSVUploader from "../../components/upload/CSVUploader/CSVUploader";
import ParamPanel from "../../components/upload/ParamPanel/ParamPanel";
import SampleHistogram from "../../components/histogram/SampleHistogram";
import {
  type VariantRow,
  type PipelineParams,
  DEFAULT_PARAMS,
  SAMPLE_LABELS,
  SAMPLE_COLORS,
} from "../../types";
import { groupBySample } from "../../utils/csvParser";
import ContributorCarousel from "../../components/carousel/contributorCarousel";
import "./Home.css";

const API_BASE = "https://excalibr.org";

const GitHubIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="currentColor"
    aria-label="GitHub"
  >
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

export default function Home() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [params, setParams] = useState<PipelineParams>({ ...DEFAULT_PARAMS });
  const [showDist, setShowDist] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const groups = groupBySample(rows);
  const sampleIds = Object.keys(groups).map(Number).sort();
  const hasData = sampleIds.length > 0;

  const allScores = rows.map((r) => r.score);
  const globalMin = allScores.length ? Math.min(...allScores) : 0;
  const globalMax = allScores.length ? Math.max(...allScores) : 1;

  const handleSubmit = async () => {
    if (!rawFile) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const formData = new FormData();
      formData.append("file", rawFile);
      formData.append("params", JSON.stringify({
        components: params.components,
        nBootstraps: params.nBootstraps,
        fitsPerBootstrap: params.fitsPerBootstrap,
        benignMethod: params.benignMethod,
        conservativeMonotonicity: params.conservativeMonotonicity,
        manualPrior: params.manualPrior,
      }));
      if (email.trim()) {
        formData.append("email", email.trim());
      }

      const res = await fetch(`${API_BASE}/api/jobs`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? `Server error ${res.status}`);
      }

      const { job_id } = await res.json();

      // Persist CSV rows for the results page
      sessionStorage.setItem("excalibr_csv_rows", JSON.stringify(rows));
      sessionStorage.setItem("excalibr_csv_filename", filename);

      navigate(`/results/${job_id}`);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="home">
      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-left">
            <div className="hero-title-row">
              <h1 className="hero-title">exCALIBR</h1>
              <div className="hero-inline-links">
                <a
                  href="https://doi.org/10.1101/2025.04.29.651326"
                  target="_blank"
                  rel="noreferrer"
                  className="hero-meta-link"
                >
                  Preprint ↗
                </a>
                <a
                  href="https://github.com/rosstewart/exCALIBR"
                  target="_blank"
                  rel="noreferrer"
                  className="hero-meta-link hero-github-link"
                  aria-label="GitHub repository"
                >
                  <GitHubIcon />
                </a>
                <Link to="/support" className="hero-meta-link">
                  Support
                </Link>
              </div>
            </div>
            <p className="hero-subtitle">
              Calibrate variant effect scores from functional assays to ACMG/AMP
              clinical evidence levels using bootstrap skew-normal mixture
              modeling and Bayesian likelihood ratios.
            </p>
          </div>
        </div>
        <ContributorCarousel />
      </section>

      {/* ── Upload ── */}
      <section className="upload-section">
        <div className="section-inner">
          <h2 className="section-title">Upload your dataset</h2>
          <p className="section-desc">
            Provide a CSV with variant effect scores. Each row requires a{" "}
            <code>score</code> and <code>sample_assignments</code> column. Sample 
            indices 0 (P/LP) and 2 (population) are required along with at least 
            one of index 1 (B/LB) or 3 (synonymous). Use comma-separated indices (e.g.{" "}
            <code>"1,2"</code>) to assign a row to multiple samples.
          </p>

          <div className="sample-key">
            {Object.entries(SAMPLE_LABELS).map(([id, meta]) => (
              <div key={id} className="sample-key-item">
                <span
                  className="sample-key-dot"
                  style={{ background: SAMPLE_COLORS[Number(id)] }}
                />
                <span className="sample-key-id">index {id}</span>
                <span className="sample-key-label">{meta.label}</span>
              </div>
            ))}
          </div>
          

          <CSVUploader
            onData={(data, name, file) => {
              setRows(data);
              setFilename(name);
              setRawFile(file);
              setShowDist(false);
            }}
          />
        </div>
      </section>

      {/* ── Score distributions ── */}
      {hasData && (
        <div className="dist-section">
          <button
            className="disclosure-trigger"
            onClick={() => setShowDist((v) => !v)}
          >
            <span>Score distributions</span>
            <span className="disclosure-right">
              <span className="disclosure-meta">
                {rows.length.toLocaleString()} variants · {sampleIds.length}{" "}
                groups · {filename}
              </span>
              <span className="disclosure-chevron">{showDist ? "▲" : "▼"}</span>
            </span>
          </button>

          {showDist && (
            <div className="disclosure-body">
              <div className="section-inner">
                <div className="histogram-stack">
                  {sampleIds.map((id) => (
                    <SampleHistogram
                      key={id}
                      sampleId={id}
                      scores={groups[id]}
                      globalMin={globalMin}
                      globalMax={globalMax}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Parameters + submit ── */}
      {hasData && (
        <section className="params-section">
          <div className="section-inner params-layout">
            <div className="params-left">
              <h2 className="section-title">Configure pipeline</h2>
              <p className="section-desc">
                Adjust model and bootstrap parameters. Defaults are appropriate
                for most datasets.
              </p>

              <div className="submit-area">
                <div className="submit-row">
                  <button
                    className="run-btn"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? "Submitting…" : "Run calibration →"}
                  </button>
                  <input
                    type="email"
                    className="email-input"
                    placeholder="Email for results link (optional)"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                {submitError && (
                  <p className="submit-error">{submitError}</p>
                )}
                <p className="submit-note">
                  {params.nBootstraps.toLocaleString()} bootstraps ×{" "}
                  {params.fitsPerBootstrap} fits ·{" "}
                  {params.components.join(", ")} components
                </p>
              </div>
            </div>

            <ParamPanel params={params} onChange={setParams} />
          </div>
        </section>
      )}

      {/* ── Citation ── */}
      <section className="citation-section">
        <div className="section-inner">
          <div className="citation-label">Citation</div>
          <p className="citation-title">
            Gene-based calibration of high-throughput functional assays for
            clinical variant classification
          </p>
          <p className="citation-authors">
            Daniel Zeiberg, Ross Stewart, Shantanu Jain, Malvika Tejura, Abbye
            E. McEwen, Shawn Fayer, Yuriy Sverchkov, Mark Craven, Vikas Pejaver,
            Alan F. Rubin, Lea M. Starita, Douglas M. Fowler, Anne
            O'Donnell-Luria, Predrag Radivojac
          </p>
          <a
            className="citation-doi"
            href="https://doi.org/10.1101/2025.04.29.651326"
            target="_blank"
            rel="noreferrer"
          >
            bioRxiv 2025.04.29.651326 · doi.org/10.1101/2025.04.29.651326
          </a>
        </div>
      </section>
    </div>
  );
}