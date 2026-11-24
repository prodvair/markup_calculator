import { useCallback, useEffect, useMemo, useState } from "react";
import FormulaEditor from "./components/FormulaEditor";
import PasswordModal from "./components/PasswordModal";
import {
  calculate,
  copyText,
  DEFAULT_CONFIG,
  formatMoney,
  hashPassword,
  loadConfig,
  normalizeConfig,
  saveConfig,
  validateRanges,
  verifyPassword,
} from "./lib/config";
import type { AppConfig, ConfigPayload } from "./lib/types";

const cloneConfig = (config: AppConfig): AppConfig => JSON.parse(JSON.stringify(config)) as AppConfig;

/** Оставляет только цифры и одну запятую; минус и буквы просто не попадают в поле. */
function sanitizeAmount(raw: string): { value: string; rejectedNegative: boolean } {
  const rejectedNegative = raw.includes("-");
  const cleaned = raw.replace(/[^\d,]/g, "").replace(/,+/g, ",");
  const parts = cleaned.split(",");
  const value = parts.length > 1 ? `${parts[0]},${parts.slice(1).join("")}` : parts[0];
  return { value, rejectedNegative };
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [payload, setPayload] = useState<ConfigPayload | null>(null);
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<AppConfig | null>(null);
  const [authError, setAuthError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let alive = true;
    loadConfig()
      .then((loaded) => {
        if (!alive) return;
        setConfig(loaded.config);
        setPayload(loaded);
        setDraft(cloneConfig(loaded.config));
      })
      .catch((error: unknown) => {
        if (alive) setToast(`Не удалось загрузить формулы: ${String(error)}`);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const requestEditor = useCallback(() => {
    if (editorOpen) return;
    setAuthError("");
    setPasswordOpen(true);
  }, [editorOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === "f") {
        event.preventDefault();
        requestEditor();
      }
      if (event.key === "Escape") {
        setPasswordOpen(false);
        setEditorOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestEditor]);

  const parsedAmount = useMemo(() => {
    const normalized = amount.replace(/\s/g, "").replace(",", ".");
    const value = Number(normalized);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }, [amount]);

  const result = useMemo(() => calculate(parsedAmount, config), [parsedAmount, config]);
  const hasBreakdown = Object.values(config.breakdownVisible).some(Boolean);

  const handleAmountChange = (raw: string) => {
    const { value, rejectedNegative } = sanitizeAmount(raw);
    setAmount(value);
    setAmountError(
      rejectedNegative
        ? "Отрицательная сумма запрещена"
        : /[^\d,\s]/.test(raw)
          ? "Можно вводить только цифры"
          : "",
    );
  };

  const handleCopy = async () => {
    try {
      await copyText(formatMoney(result.total));
      setToast("Цена скопирована");
    } catch (error) {
      setToast(`Не удалось скопировать: ${String(error)}`);
    }
  };

  const handleUnlock = async (password: string) => {
    setBusy(true);
    setAuthError("");
    try {
      const valid = await verifyPassword(password, config.passwordHash);
      if (!valid) {
        setAuthError("Неверный пароль");
        return;
      }
      setDraft(cloneConfig(config));
      setPasswordOpen(false);
      setEditorOpen(true);
    } catch (error) {
      setAuthError(`Ошибка проверки: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (newPassword: string) => {
    if (!draft) return;
    setBusy(true);
    try {
      let next = normalizeConfig(draft);
      if (newPassword.trim()) {
        next = { ...next, passwordHash: await hashPassword(newPassword) };
      }

      const rangeError = validateRanges(next.delivery) ?? validateRanges(next.markup);
      if (rangeError) {
        setToast(rangeError);
        return;
      }

      const saved = await saveConfig(next);
      setConfig(saved.config);
      setPayload(saved);
      setEditorOpen(false);
      setDraft(null);
      setToast("Формулы сохранены");
    } catch (error) {
      setToast(`Не удалось сохранить: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="app__header">
        <div className="brand">
          <span className="brand__mark">₽</span>
          <div>
            <h1>Калькулятор наценки</h1>
            <p>Округление → доставка → наценка</p>
          </div>
        </div>
        <button
          type="button"
          className="secret-hotspot"
          aria-hidden="true"
          tabIndex={-1}
          onClick={requestEditor}
        />
      </header>

      <main className="card">
        <label className="field field--amount">
          <span>Исходная сумма</span>
          <div className="amount-input">
            <span className="amount-input__sign">₽</span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              placeholder="0"
              value={amount}
              aria-invalid={!!amountError}
              onChange={(event) => handleAmountChange(event.target.value)}
            />
          </div>
          {amountError && <small className="field-error">{amountError}</small>}
        </label>

        <section className="result" aria-live="polite">
          <div className="result__total">
            <span>Итого к оплате</span>
            <div className="result__total-row">
              <strong>{formatMoney(result.total)}</strong>
              <button
                type="button"
                className="btn btn--small btn--copy"
                onClick={() => void handleCopy()}
                title="Скопировать цену"
              >
                Копировать
              </button>
            </div>
          </div>

          {hasBreakdown && (
            <dl className="breakdown">
              {config.breakdownVisible.rounded && (
                <div>
                  <dt>Округлённая сумма</dt>
                  <dd>{formatMoney(result.rounded)}</dd>
                </div>
              )}
              {config.breakdownVisible.delivery && (
                <div>
                  <dt>Доставка</dt>
                  <dd className="breakdown__plus">+ {formatMoney(result.delivery)}</dd>
                </div>
              )}
              {config.breakdownVisible.withDelivery && (
                <div>
                  <dt>Сумма с доставкой</dt>
                  <dd>{formatMoney(result.withDelivery)}</dd>
                </div>
              )}
              {config.breakdownVisible.markup && (
                <div>
                  <dt>Наценка</dt>
                  <dd className="breakdown__plus">+ {formatMoney(result.markupAmount)}</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        <p className="footer-note">Формулы и пароль хранятся в JSON рядом с программой.</p>
      </main>

      {passwordOpen && (
        <PasswordModal
          error={authError}
          busy={busy}
          onSubmit={(password) => void handleUnlock(password)}
          onCancel={() => setPasswordOpen(false)}
        />
      )}

      {editorOpen && draft && (
        <FormulaEditor
          draft={draft}
          payload={payload}
          busy={busy}
          onChange={setDraft}
          onSave={(newPassword) => void handleSave(newPassword)}
          onCancel={() => setEditorOpen(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
