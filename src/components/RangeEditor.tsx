import { useMemo } from "react";
import { makeId, normalizeRanges } from "../lib/config";
import type { RangeRow } from "../lib/types";
import IconButton from "./IconButton";

type Props = {
  title: string;
  valueLabel: string;
  rows: RangeRow[];
  onChange: (rows: RangeRow[]) => void;
};

const toNumber = (value: string): number => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

export default function RangeEditor({ title, valueLabel, rows, onChange }: Props) {
  // Каждое изменение проходит через normalizeRanges: границы сортируются,
  // отрицательные значения отбрасываются, пересечения становятся невозможными.
  const sorted = useMemo(() => normalizeRanges(rows), [rows]);
  const lastId = sorted[sorted.length - 1]?.id;

  const commit = (next: RangeRow[]) => onChange(normalizeRanges(next));

  const patchRow = (id: string, patch: Partial<RangeRow>) => {
    commit(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    commit(rows.filter((row) => row.id !== id));
  };

  const addRow = () => {
    const last = sorted[sorted.length - 1];
    const start = last ? round2((last.max ?? last.min) + 1) : 0;
    commit([
      ...rows,
      { id: makeId(), min: start, max: round2(start + 999), value: last?.value ?? 0 },
    ]);
  };

  return (
    <section className="range-editor">
      <div className="range-editor__head">
        <h3>{title}</h3>
        <div className="range-editor__actions">
          <button type="button" className="btn btn--ghost btn--small" onClick={() => commit(rows)}>
            Отсортировать
          </button>
          <button type="button" className="btn btn--small" onClick={addRow}>
            + Добавить
          </button>
        </div>
      </div>

      <div className="range-table">
        <div className="range-row range-row--head">
          <span>От</span>
          <span>До</span>
          <span>{valueLabel}</span>
          <span />
        </div>
        {sorted.map((row) => (
          <div className="range-row" key={row.id}>
            <input
              aria-label={`${title}: от`}
              type="number"
              min="0"
              step="0.01"
              value={row.min}
              onChange={(event) => patchRow(row.id, { min: toNumber(event.target.value) })}
            />
            <input
              aria-label={`${title}: до`}
              type="number"
              min={round2(row.min + 0.01)}
              step="0.01"
              placeholder="∞"
              disabled={row.id === lastId}
              value={row.max ?? ""}
              onChange={(event) =>
                patchRow(row.id, {
                  max: event.target.value === "" ? null : toNumber(event.target.value),
                })
              }
            />
            <input
              aria-label={`${title}: ${valueLabel}`}
              type="number"
              min="0"
              step="0.01"
              value={row.value}
              onChange={(event) => patchRow(row.id, { value: toNumber(event.target.value) })}
            />
            <IconButton
              label="Удалить диапазон"
              disabled={rows.length <= 1}
              onClick={() => removeRow(row.id)}
            >
              ×
            </IconButton>
          </div>
        ))}
      </div>
      <p className="hint">
        Границы входят в диапазон. Последний — до бесконечности. Пересечения исключаются
        автоматически.
      </p>
    </section>
  );
}
