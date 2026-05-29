import type { VariantRow } from "../types";

export interface ParseResult {
  data: VariantRow[];
  errors: string[];
}

export function parseCSV(text: string): ParseResult {
  const errors: string[] = [];
  const lines = text.trim().split(/\r?\n/);

  if (lines.length < 2) {
    return {
      data: [],
      errors: ["`CSV` file appears to be empty or has no data rows."],
    };
  }

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));

  const scoreIdx = headers.indexOf("score");
  const sampleIdx = headers.indexOf("sample_assignments");

  if (scoreIdx === -1) errors.push('Missing required column: "score"');
  if (sampleIdx === -1) errors.push('Missing required column: "sample_assignments"');

  if (errors.length > 0) return { data: [], errors };

  const datasetIdx = headers.indexOf("dataset");
  const data: VariantRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted fields
    const cols = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) ?? line.split(",");
    const clean = cols.map((c) => c.trim().replace(/^"|"$/g, ""));

    const score = parseFloat(clean[scoreIdx]);
    const sample_assignments = (clean[sampleIdx] ?? "").trim();

    if (isNaN(score) || !sample_assignments) continue;
    
    const row: VariantRow = { score, sample_assignments };

    if (datasetIdx !== -1 && clean[datasetIdx]) {
      row.Dataset = clean[datasetIdx];
    }
    data.push(row);
  }

  if (data.length === 0) {
    errors.push("No valid data rows found after parsing.");
  }

  return { data, errors };
}

export function groupBySample(rows: VariantRow[]): Record<number, number[]> {
  const groups: Record<number, number[]> = {};
  for (const row of rows) {
    const ids = String(row.sample_assignments)
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    for (const id of ids) {
      if (!groups[id]) groups[id] = [];
      groups[id].push(row.score);
    }
  }
  return groups;
}
