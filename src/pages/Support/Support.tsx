import { useState } from "react";
import { Link } from "react-router-dom";
import "./Support.css";

// ── FAQ data ──────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "What CSV format does exCALIBR expect?",
    a: `Your CSV must contain at minimum two columns: score and sample_assignments. The score column holds the numeric variant effect score. The sample_assignments column holds an integer index indicating which reference sample a variant belongs to: 0 = Pathogenic/LP, 1 = Benign/LB, 2 = Population (gnomAD), 3 = Synonymous. Sample index 0 is required along with at least one of index 1 or 3. Rows can belong to multiple samples using comma-separated indices, e.g. "1,2". Additional columns are ignored.`,
  },
  {
    q: "How long does a calibration job take?",
    a: `Runtime depends primarily on the number of bootstrap iterations and fits per bootstrap you select. With the default settings (20 bootstraps, 8 fits per bootstrap), most datasets complete in 5–15 minutes. Increasing bootstraps to 1000 with 100 fits per bootstrap can take 6.5 days. The pipeline runs in parallel across available CPU cores, so runtime scales well. You will receive an email when your job finishes.`,
  },
  {
    q: "How do I interpret the evidence levels?",
    a: `exCALIBR maps calibrated scores to ACMG/AMP evidence levels following the points-based system introduced in Tavtigian et al. (PMID: 32720330). Positive points represent pathogenic functional evidence (PS3), and negative points represent benign functional evidence (BS3), with strength increasing with the absolute point value: Supporting (±1), Moderate (±2–3), Strong (±4–7), and Very Strong (±8). The dashed lines on the chart indicate the score thresholds for each evidence level. Hovering over the chart shows the evidence level at any score.`,
  },
  {
    q: "What do the two LR+ and posterior probability values mean?",
    a: `To ensure robust and sufficiently conservative evidence assignments, exCALIBR uses the 5th and 9th percentiles of the LR+ across bootstraps to assign pathogenic and benign evidence, respectively. Use LR^+_p / Pr_p to compute pathogenic evidence, and LR^+_b / Pr_b to compute benign evidence.`
  },
  {
    q: "What is the prior probability and should I override it?",
    a: `In this case, the prior probability represents the probability that a variant (in your gene of interest) sampled from the population is pathogenic. By default exCALIBR estimates this empirically from your dataset. In most cases the default is appropriate. You should only override it if you have an independent, well-justified estimate from population genetics or clinical databases. An incorrect prior will shift all evidence thresholds and can lead to miscalibrated results.`,
  },
  {
    q: "How long are my results stored?",
    a: `Job results are stored on our server for 7 days from the time of submission. After that the data is automatically deleted. If you provided an email address, the link in your notification email will stop working after 7 days. We recommend downloading the calibration JSON and bootstrap fits files before then if you need them for downstream analysis.`,
  },
  {
    q: "What should I do if my job fails?",
    a: `First check that your CSV meets the format requirements — the most common cause of failure is missing required columns or insufficient data in one of the sample groups. If your file looks correct, try reducing the number of bootstrap iterations and fits per bootstrap to rule out a timeout. If the problem persists, contact us at bugs@excalibr.org with your job ID (visible on the results page) and a description of your dataset.`,
  },
  {
    q: "Can I run exCALIBR locally?",
    a: `Yes. The pipeline is open source and available on GitHub. Clone the repository, install the dependencies listed in the README, and run run_pipeline.py directly from the command line. The local version exposes additional options not available through the web interface, including SLURM cluster execution and out-of-bag evidence computation.`,
  },
  {
    q: "How do I cite exCALIBR?",
    a: `Zeiberg D, Stewart R, Jain S, et al. Gene-based calibration of high-throughput functional assays for clinical variant classification. bioRxiv 2025.04.29.651326. doi.org/10.1101/2025.04.29.651326`,
  }
];

// ── FAQ item ──────────────────────────────────────────────────────────────────

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`faq-item ${open ? "faq-item--open" : ""}`}>
      <button
        className="faq-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="faq-question">{q}</span>
        <span className="faq-chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="faq-answer">
          <p>{a}</p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Support() {
  return (
    <div className="support-page">
      {/* ── Header ── */}
      <header className="results-header">
        <Link to="/" className="results-back">
          ← Home
        </Link>
        <span className="results-wordmark">exCALIBR</span>
      </header>

      <main className="support-main">
        <div className="support-inner">

          {/* ── Title ── */}
          <div className="support-title-block">
            <h1 className="support-title">Support</h1>
            <p className="support-subtitle">
              Get help with exCALIBR or reach out with questions.
            </p>
          </div>

          {/* ── Contact cards ── */}
          <div className="support-contacts">
            <div className="support-contact-card">
              <div className="support-contact-label">General support &amp; methodology</div>
              <p className="support-contact-desc">
                Questions about the calibration approach, interpreting results,
                or using exCALIBR for your dataset.
              </p>
              <a
                href="mailto:support@excalibr.org"
                className="support-contact-email"
              >
                support@excalibr.org
              </a>
            </div>

            <div className="support-contact-card">
              <div className="support-contact-label">Bug reports &amp; website issues</div>
              <p className="support-contact-desc">
                Problems with the website, unexpected errors, or issues with
                job submission or results. Include your job ID if applicable.
              </p>
              <a
                href="mailto:bugs@excalibr.org"
                className="support-contact-email"
              >
                bugs@excalibr.org
              </a>
            </div>
          </div>

          {/* ── FAQ ── */}
          <div className="support-faq-block">
            <h2 className="support-faq-title">Frequently asked questions</h2>
            <div className="support-faq-list">
              {FAQS.map((item, i) => (
                <FAQItem key={i} q={item.q} a={item.a} />
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}