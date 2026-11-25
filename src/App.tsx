import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import FormulaEditor from "./components/FormulaEditor";
import HistoryModal from "./components/HistoryModal";
import IconButton from "./components/IconButton";
import PasswordModal from "./components/PasswordModal";
import {
  calculate,
  copyText,
  DEFAULT_CONFIG,
  formatMoney,
  hashPassword,
  loadConfig,
  loadHistory,
  makeId,
  normalizeConfig,
  pruneHistory,
  saveConfig,
  saveHistory,
  validateRanges,
  verifyPassword,
} from "./lib/config";
import type { AppConfig, ConfigPayload, HistoryEntry } from "./lib/types";

const cloneConfig = (config: AppConfig): AppConfig => JSON.parse(JSON.stringify(config)) as AppConfig;

type HistoryUndo = {
  entries: HistoryEntry[];
  label: string;
  expiresAt: number;
};

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
  const [comment, setComment] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyLoadedRef = useRef(false);
  const loadingHistoryRef = useRef<Promise<boolean> | null>(null);
  const configRef = useRef<AppConfig>(DEFAULT_CONFIG);
  const configPromiseRef = useRef<Promise<void> | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<AppConfig | null>(null);
  const [authError, setAuthError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [undo, setUndo] = useState<HistoryUndo | null>(null);
  const [undoSeconds, setUndoSeconds] = useState(5);
  const undoTimerRef = useRef<number | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = window.localStorage.getItem("runar-calculator-theme");
    if (stored === "light" || stored === "dark") return stored;
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  });

  const applyHistory = useCallback((entries: HistoryEntry[]) => {
    const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
    historyRef.current = sorted;
    setHistory(sorted);
  }, []);

  const rememberUndo = useCallback((entries: HistoryEntry[], label: string) => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    const expiresAt = Date.now() + 5000;
    setUndo({ entries: [...entries], label, expiresAt });
    setUndoSeconds(5);
    undoTimerRef.current = window.setTimeout(() => setUndo(null), 5000);
  }, []);

  const cancelUndo = useCallback(() => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setUndo(null);
    setUndoSeconds(5);
  }, []);

  useEffect(() => {
    let alive = true;
    const promise = loadConfig()
      .then((loaded) => {
        if (!alive) return;
        configRef.current = loaded.config;
        setConfig(loaded.config);
        setPayload(loaded);
        setDraft(cloneConfig(loaded.config));
      })
      .catch((error: unknown) => {
        if (alive) setToast(`Не удалось загрузить формулы: ${String(error)}`);
      })
      .finally(() => {
        if (alive) configPromiseRef.current = null;
      });
    configPromiseRef.current = promise;
    return () => {
      alive = false;
    };
  }, []);

  /** История читается из файла только при первом открытии или сохранении. */
  const ensureHistory = useCallback(async (): Promise<boolean> => {
    if (historyLoadedRef.current) return true;
    if (loadingHistoryRef.current) return loadingHistoryRef.current;

    if (configPromiseRef.current) await configPromiseRef.current;
    const days = configRef.current.historyDays;

    const promise = loadHistory()
      .then((stored) => {
        const pruned = pruneHistory(stored.entries, days);
        applyHistory(pruned);
        historyLoadedRef.current = true;
        if (pruned.length !== stored.entries.length) {
          void saveHistory(pruned).catch(() => undefined);
        }
        return true;
      })
      .catch((error: unknown) => {
        setToast(`Не удалось загрузить историю: ${String(error)}`);
        return false;
      })
      .finally(() => {
        loadingHistoryRef.current = null;
      });
    loadingHistoryRef.current = promise;
    return promise;
  }, [applyHistory]);

  /** Подгружаем историю в фоне сразу после запуска — открывать модалку не нужно. */
  useEffect(() => {
    const timer = window.setTimeout(() => void ensureHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [ensureHistory]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("runar-calculator-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!undo) return;
    const tick = () => {
      setUndoSeconds(Math.max(0, Math.ceil((undo.expiresAt - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [undo]);

  useEffect(
    () => () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    },
    [],
  );

  const requestEditor = useCallback(() => {
    if (editorOpen) return;
    setAuthError("");
    setPasswordOpen(true);
  }, [editorOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // event.code не зависит от раскладки: на русской F физически та же клавиша.
      const isFKey = event.code === "KeyF" || event.key.toLowerCase() === "f";
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && isFKey) {
        event.preventDefault();
        requestEditor();
      }
      if (event.key === "Escape") {
        setHistoryOpen(false);
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
      await copyText(String(result.total));
      setToast("Цена скопирована");
    } catch (error) {
      setToast(`Не удалось скопировать: ${String(error)}`);
    }
  };

  const handleSaveToHistory = async () => {
    if (parsedAmount <= 0) {
      setToast("Введите сумму, чтобы сохранить расчёт");
      return;
    }

    cancelUndo();
    if (!(await ensureHistory())) return;
    const next: HistoryEntry = {
      id: makeId(),
      createdAt: Date.now(),
      input: parsedAmount,
      total: result.total,
      comment: comment.trim() || undefined,
    };
    const updated = pruneHistory([next, ...historyRef.current], config.historyDays);
    applyHistory(updated);
    try {
      await saveHistory(updated);
      setComment("");
      setToast("Расчёт сохранён в историю");
    } catch (error) {
      setToast(`Не удалось сохранить историю: ${String(error)}`);
    }
  };

  const handleCommentKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;

    if (event.metaKey || event.ctrlKey) {
      // WebView по-разному обрабатывает ⌘/Ctrl + Enter — вставляем перевод строки сами.
      event.preventDefault();
      const field = event.currentTarget;
      const start = field.selectionStart;
      const end = field.selectionEnd;
      const caret = start + 1;
      setComment(`${comment.slice(0, start)}\n${comment.slice(end)}`);
      window.requestAnimationFrame(() => {
        field.focus();
        field.setSelectionRange(caret, caret);
      });
      return;
    }

    event.preventDefault();
    void handleSaveToHistory();
  };

  const handleHistoryDelete = (id: string) => {
    const before = historyRef.current;
    const updated = before.filter((entry) => entry.id !== id);
    applyHistory(updated);
    rememberUndo(before, "Запись удалена");
    void saveHistory(updated).catch((error: unknown) => {
      setToast(`Не удалось обновить историю: ${String(error)}`);
    });
  };

  const handleHistoryClear = () => {
    const before = historyRef.current;
    applyHistory([]);
    rememberUndo(before, "История очищена");
    void saveHistory([]).catch((error: unknown) => {
      setToast(`Не удалось очистить историю: ${String(error)}`);
    });
  };

  const handleHistoryUndo = () => {
    if (!undo) return;
    cancelUndo();
    applyHistory(undo.entries);
    void saveHistory(undo.entries).catch((error: unknown) => {
      setToast(`Не удалось восстановить историю: ${String(error)}`);
    });
    setToast("История восстановлена");
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    await ensureHistory();
    setHistoryLoading(false);
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
      configRef.current = saved.config;
      setConfig(saved.config);
      setPayload(saved);
      if (historyLoadedRef.current) {
        const pruned = pruneHistory(historyRef.current, saved.config.historyDays);
        if (pruned.length !== historyRef.current.length) {
          applyHistory(pruned);
          await saveHistory(pruned);
        }
      }
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
          </div>
        </div>
        <div className="header-actions">
          <IconButton
            label="Открыть историю расчётов"
            title="История расчётов"
            className="theme-toggle"
            onClick={() => void openHistory()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M12 9v4l2.5 2M9 2h6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </IconButton>
          <IconButton
            label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
            title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "☀" : "☾"}
          </IconButton>
        </div>
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

          <label className="field history-save">
            <span>Комментарий к расчёту</span>
            <div className="history-save__row">
              <textarea
                value={comment}
                placeholder="Например: клиент Иван, заказ №12"
                rows={3}
                onChange={(event) => setComment(event.target.value)}
                onKeyDown={handleCommentKeyDown}
              />
              <small className="history-save__hint">
                Enter — сохранить · ⌘/Ctrl + Enter — перенос строки
              </small>
              <button
                type="button"
                className="btn btn--primary btn--small history-save__btn"
                onClick={() => void handleSaveToHistory()}
              >
                Сохранить в историю
              </button>
            </div>
          </label>

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

      </main>

      {historyOpen && (
        <HistoryModal
          entries={history}
          loading={historyLoading}
          historyDays={config.historyDays}
          onClose={() => setHistoryOpen(false)}
          onDelete={handleHistoryDelete}
          onClear={handleHistoryClear}
        />
      )}

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

      {undo && (
        <div className="undo-toast" role="status" aria-live="polite">
          <span>
            {undo.label} · <strong className="undo-toast__timer">{undoSeconds} с</strong>
          </span>
          <button type="button" className="undo-toast__btn" onClick={handleHistoryUndo}>
            Отменить
          </button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
