import { useCallback, useState, useRef } from "react";
import { parseCSV, groupBySample } from "../../../utils/csvParser";
import type { VariantRow } from "../../../types";
import "./CSVUploader.css"

interface CSVUploaderProps {
  onData: (rows: VariantRow[], filename: string, file: File) => void;
}

export default function CSVUploader({ onData }: CSVUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) {
        setErrors(["Please upload a .csv file."]);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const { data, errors } = parseCSV(text);

        if (errors.length > 0) {
          setErrors(errors);
          setFilename(null);
          return;
        }

        const groups = groupBySample(data);
        const sampleIds = Object.keys(groups).map(Number);

        if (sampleIds.length < 2) {
          setErrors([
            "At least 2 sample groups are required (e.g. sample 0 and sample 2 or 3).",
          ]);
          return;
        }

        const hasPath = sampleIds.includes(0);
        const hasPop = sampleIds.includes(2);
        const hasBenignOrSyn = sampleIds.includes(1) || sampleIds.includes(3);

        if (!hasPath || !hasPop) {
          setErrors(["Sample indices 0 (P/LP) and 2 (population) are required."]);
          return;
        }
        if (!hasBenignOrSyn) {
          setErrors([
            "At least one of sample index 1 (B/LB) or 3 (synonymous) is required.",
          ]);
          return;
        }

        setErrors([]);
        setFilename(file.name);
        onData(data, file.name, file);
      };
      reader.readAsText(file);
    },
    [onData]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="uploader-wrapper">
      <div
        className={`drop-zone ${dragging ? "dragging" : ""} ${
          filename ? "loaded" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={handleChange}
          style={{ display: "none" }}
        />

        {filename ? (
          <div className="drop-loaded">
            <span className="drop-icon">✓</span>
            <span className="drop-filename">{filename}</span>
            <span className="drop-change">Click to replace</span>
          </div>
        ) : (
          <div className="drop-prompt">
            <span className="drop-icon-large">⬆</span>
            <p className="drop-title">Drop your CSV file here</p>
            <p className="drop-subtitle">or click to browse</p>
            <div className="drop-requirements">
              <span>Required columns:</span>
              <code>score</code>
              <code>sample_assignments</code>
            </div>
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="upload-errors">
          {errors.map((e, i) => (
            <div key={i} className="upload-error">
              ⚠ {e}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
