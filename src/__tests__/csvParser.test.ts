import { describe, it, expect } from "vitest";
import { parseCSV, groupBySample } from "../utils/csvParser";

// ── parseCSV ─────────────────────────────────────────────────────────────────

describe("parseCSV", () => {
  describe("valid input", () => {
    it("parses a minimal valid CSV", () => {
      const csv = "score,sample_assignments\n1.5,0\n-1.5,1";
      const { data, errors } = parseCSV(csv);
      expect(errors).toHaveLength(0);
      expect(data).toHaveLength(2);
      expect(data[0]).toEqual({ score: 1.5, sample_assignments: "0" });
      expect(data[1]).toEqual({ score: -1.5, sample_assignments: "1" });
    });

    it("parses headers case-insensitively", () => {
      const csv = "Score,Sample_Assignments\n1.5,0";
      const { data, errors } = parseCSV(csv);
      expect(errors).toHaveLength(0);
      expect(data).toHaveLength(1);
    });

    it("handles extra columns without error", () => {
      const csv = "score,sample_assignments,gene\n1.5,0,BRCA1";
      const { data, errors } = parseCSV(csv);
      expect(errors).toHaveLength(0);
      expect(data[0].score).toBe(1.5);
    });

    it("reads Dataset column when present", () => {
      const csv = "score,sample_assignments,Dataset\n1.5,0,MSH2_2021";
      const { data } = parseCSV(csv);
      expect(data[0].Dataset).toBe("MSH2_2021");
    });

    it("skips empty lines", () => {
      const csv = "score,sample_assignments\n1.5,0\n\n-1.5,1\n";
      const { data } = parseCSV(csv);
      expect(data).toHaveLength(2);
    });

    it("handles Windows line endings (CRLF)", () => {
      const csv = "score,sample_assignments\r\n1.5,0\r\n-1.5,1";
      const { data, errors } = parseCSV(csv);
      expect(errors).toHaveLength(0);
      expect(data).toHaveLength(2);
    });

    it("handles quoted fields", () => {
      const csv = 'score,sample_assignments\n1.5,"0"\n-1.5,"1"';
      const { data, errors } = parseCSV(csv);
      expect(errors).toHaveLength(0);
      expect(data).toHaveLength(2);
    });

    it("skips rows with non-numeric scores", () => {
      const csv = "score,sample_assignments\nfoo,0\n1.5,0";
      const { data } = parseCSV(csv);
      expect(data).toHaveLength(1);
      expect(data[0].score).toBe(1.5);
    });

    it("skips rows with empty sample_assignments", () => {
      const csv = "score,sample_assignments\n1.5,\n-1.5,1";
      const { data } = parseCSV(csv);
      expect(data).toHaveLength(1);
    });

    it("parses negative scores correctly", () => {
      const csv = "score,sample_assignments\n-3.14,0";
      const { data } = parseCSV(csv);
      expect(data[0].score).toBe(-3.14);
    });
  });

  describe("multilabel sample_assignments", () => {
    it("parses quoted multilabel value", () => {
      const csv = 'score,sample_assignments\n1.5,"1,2"';
      const { data, errors } = parseCSV(csv);
      expect(errors).toHaveLength(0);
      expect(data[0].sample_assignments).toBe("1,2");
    });

    it("preserves multilabel string as-is", () => {
      const csv = 'score,sample_assignments\n1.5,"0,3"';
      const { data } = parseCSV(csv);
      expect(data[0].sample_assignments).toBe("0,3");
    });

    it("handles three-way multilabel", () => {
      const csv = 'score,sample_assignments\n1.5,"0,1,3"';
      const { data } = parseCSV(csv);
      expect(data[0].sample_assignments).toBe("0,1,3");
    });
  });

  describe("missing or invalid columns", () => {
    it("returns error when score column is missing", () => {
      const csv = "sample_assignments\n0";
      const { data, errors } = parseCSV(csv);
      expect(errors).toContain('Missing required column: "score"');
      expect(data).toHaveLength(0);
    });

    it("returns error when sample_assignments column is missing", () => {
      const csv = "score\n1.5";
      const { data, errors } = parseCSV(csv);
      expect(errors).toContain('Missing required column: "sample_assignments"');
      expect(data).toHaveLength(0);
    });

    it("returns error when both required columns are missing", () => {
      const csv = "gene\nBRCA1";
      const { errors } = parseCSV(csv);
      expect(errors).toHaveLength(2);
    });

    it("returns error for empty file", () => {
      const { errors } = parseCSV("");
      expect(errors).toHaveLength(1);
    });

    it("returns error for header-only file", () => {
      const csv = "score,sample_assignments";
      const { data, errors } = parseCSV(csv);
      expect(data).toHaveLength(0);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("returns error when all rows are invalid", () => {
      const csv = "score,sample_assignments\nfoo,\nbar,";
      const { errors } = parseCSV(csv);
      expect(errors).toContain("No valid data rows found after parsing.");
    });
  });
});

// ── groupBySample ─────────────────────────────────────────────────────────────

describe("groupBySample", () => {
  it("groups scores by integer sample index", () => {
    const rows = [
      { score: 1.5, sample_assignments: "0" },
      { score: -1.5, sample_assignments: "1" },
      { score: 0.5, sample_assignments: "0" },
    ];
    const groups = groupBySample(rows);
    expect(groups[0]).toEqual([1.5, 0.5]);
    expect(groups[1]).toEqual([-1.5]);
  });

  it("splits multilabel rows into all referenced groups", () => {
    const rows = [{ score: 1.0, sample_assignments: "1,2" }];
    const groups = groupBySample(rows);
    expect(groups[1]).toEqual([1.0]);
    expect(groups[2]).toEqual([1.0]);
  });

  it("handles three-way multilabel correctly", () => {
    const rows = [{ score: 0.5, sample_assignments: "0,1,3" }];
    const groups = groupBySample(rows);
    expect(groups[0]).toEqual([0.5]);
    expect(groups[1]).toEqual([0.5]);
    expect(groups[3]).toEqual([0.5]);
  });

  it("does not create NaN group for multilabel strings", () => {
    const rows = [{ score: 1.0, sample_assignments: "1,2" }];
    const groups = groupBySample(rows);
    expect(Object.keys(groups).map(Number).every((k) => !isNaN(k))).toBe(true);
  });

  it("returns empty object for empty input", () => {
    expect(groupBySample([])).toEqual({});
  });

  it("handles whitespace around indices", () => {
    const rows = [{ score: 1.0, sample_assignments: "1, 2" }];
    const groups = groupBySample(rows);
    expect(groups[1]).toEqual([1.0]);
    expect(groups[2]).toEqual([1.0]);
  });

  it("skips non-numeric indices", () => {
    const rows = [{ score: 1.0, sample_assignments: "foo" }];
    const groups = groupBySample(rows);
    expect(Object.keys(groups)).toHaveLength(0);
  });

  it("accumulates multiple rows into the same group", () => {
    const rows = [
      { score: 1.0, sample_assignments: "0" },
      { score: 2.0, sample_assignments: "0" },
      { score: 3.0, sample_assignments: "0" },
    ];
    const groups = groupBySample(rows);
    expect(groups[0]).toHaveLength(3);
    expect(groups[0]).toContain(2.0);
  });
});