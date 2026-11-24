import { useState } from "react";
import { revealConfig } from "../lib/config";
import type { AppConfig, ConfigPayload } from "../lib/types";
import RangeEditor from "./RangeEditor";

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
            <span>Шаг округления, ₽</span>
            <input
              type="number"
              min="1"
              step="1"
              value={draft.roundingStep}
              onChange={(event) =>
                onChange({ ...draft, roundingStep: Number(event.target.value) || 0 })
              }
            />
            <small>Округление всегда вверх.</small>
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
