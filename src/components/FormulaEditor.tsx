import { useState } from "react";
import { revealConfig } from "../lib/config";
import type { AppConfig, BreakdownVisibility, ConfigPayload } from "../lib/types";
import RangeEditor from "./RangeEditor";

const toStep = (value: string): number => Math.max(1, Number(value) || 1);

const VISIBILITY_OPTIONS: { key: keyof BreakdownVisibility; label: string }[] = [
  { key: "rounded", label: "Округлённая сумма" },
  { key: "delivery", label: "Доставка" },
  { key: "withDelivery", label: "Сумма с доставкой" },
  { key: "markup", label: "Наценка" },
];

type Props = {
  draft: AppConfig;
  payload: ConfigPayload | null;
  busy: boolean;
  onChange: (config: AppConfig) => void;
  onSave: (newPassword: string) => void;
  onCancel: () => void;
};

export default function FormulaEditor({
  draft,
  payload,
  busy,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const [newPassword, setNewPassword] = useState("");

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Редактор формул">
      <div className="modal modal--wide">
        <div className="modal__head">
          <div>
            <h2>Редактор формул</h2>
            <p className="hint">Изменения применяются после сохранения в JSON.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="config-path">
          <span className="config-path__label">Файл формул</span>
          <code title={payload?.path}>{payload?.path ?? "—"}</code>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => void revealConfig()}>
            Показать в папке
          </button>
        </div>

        <div className="editor-grid">
          <label className="field">
            <span>Округление исходной суммы, ₽</span>
            <input
              type="number"
              min="1"
              step="1"
              value={draft.roundingStep}
              onChange={(event) =>
                onChange({ ...draft, roundingStep: toStep(event.target.value) })
              }
            />
            <small>Вверх до выбранного шага.</small>
          </label>

          <label className="field">
            <span>Округление итога, ₽</span>
            <input
              type="number"
              min="1"
              step="1"
              value={draft.resultRoundingStep}
              onChange={(event) =>
                onChange({ ...draft, resultRoundingStep: toStep(event.target.value) })
              }
            />
            <small>Вверх после расчёта наценки.</small>
          </label>

          <label className="field">
            <span>Новый пароль</span>
            <input
              type="password"
              value={newPassword}
              placeholder="Оставьте пустым — не менять"
              autoComplete="new-password"
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <small>Хранится как SHA-256 хеш, а не открытым текстом.</small>
          </label>
        </div>

        <section className="visibility">
          <h3>Показывать в главном окне</h3>
          <div className="visibility__grid">
            {VISIBILITY_OPTIONS.map(({ key, label }) => (
              <label className="visibility__item" key={key}>
                <input
                  type="checkbox"
                  checked={draft.breakdownVisible[key]}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      breakdownVisible: {
                        ...draft.breakdownVisible,
                        [key]: event.target.checked,
                      },
                    })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p className="hint">По умолчанию все строки скрыты. Изменения вступят в силу после сохранения.</p>
        </section>

        <RangeEditor
          title="Доставка"
          valueLabel="Сумма, ₽"
          rows={draft.delivery}
          onChange={(rows) => onChange({ ...draft, delivery: rows })}
        />

        <RangeEditor
          title="Наценка"
          valueLabel="Процент, %"
          rows={draft.markup}
          onChange={(rows) => onChange({ ...draft, markup: rows })}
        />

        <div className="modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => onSave(newPassword)}
          >
            {busy ? "Сохраняем…" : "Сохранить формулы"}
          </button>
        </div>
      </div>
    </div>
  );
}
