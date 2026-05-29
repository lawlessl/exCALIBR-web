export interface VariantRow {
  score: number;
  sample_assignments: string;
  Dataset?: string;
}

export const SAMPLE_LABELS: Record<
  number,
  { label: string; description: string }
> = {
  0: { label: "P / LP", description: "ClinVar P/LP variants" },
  1: { label: "B / LB", description: "ClinVar B/LB variants" },
  2: { label: "Population", description: "Population variants" },
  3: { label: "Synonymous", description: "Synonymous variants" },
};

export const SAMPLE_COLORS: Record<number, string> = {
  0: "#d19aa2",
  1: "#5b9cbe",
  2: "#b6b6b6",
  3: "#92bd99",
};

export interface PipelineParams {
  components: number[];
  nBootstraps: number;
  fitsPerBootstrap: number;
  benignMethod: "benign" | "avg" | "synonymous";
  conservativeMonotonicity: boolean;
  manualPrior: number | null;
}

export const DEFAULT_PARAMS: PipelineParams = {
  components: [3],
  nBootstraps: 20,
  fitsPerBootstrap: 8,
  benignMethod: "avg",
  conservativeMonotonicity: false,
  manualPrior: null,
};
