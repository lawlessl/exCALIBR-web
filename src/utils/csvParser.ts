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
  const sampleIdx = headers.indexOf("sample");

  if (scoreIdx === -1) errors.push('Missing required column: "score"');
  if (sampleIdx === -1) errors.push('Missing required column: "sample"');

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
    const sample = parseInt(clean[sampleIdx], 10);

    if (isNaN(score) || isNaN(sample)) continue;
    if (sample < 0 || sample > 3) continue;

    const row: VariantRow = { score, sample };
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
    if (!groups[row.sample]) groups[row.sample] = [];
    groups[row.sample].push(row.score);
  }
  return groups;
}
