import { useMemo, useState } from "react";
import { formatMoney, formatNumber } from "../lib/config";
import type { HistoryEntry } from "../lib/types";
import IconButton from "./IconButton";

type Props = {
  entries: HistoryEntry[];
  loading?: boolean;
  historyDays: number;
  onClose: () => void;
  onDelete: (id: string) => void;
  onClear: () => void;
};

const PAGE_SIZE = 30;

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Приводит «1 234,50 ₽», «1234.5» и «1234» к одному виду для поиска. */
function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\u00a0\u202f₽]/g, "")
    .replace(",", ".")
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

function daysLabel(days: number): string {
  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod10 === 1 && mod100 !== 11) return `${days} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${days} дня`;
  return `${days} дней`;
}

export default function HistoryModal({
  entries,
  loading = false,
  historyDays,
  onClose,
  onDelete,
  onClear,
}: Props) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query.trim());
    if (!needle) return entries;

    return entries.filter((entry) => {
      const haystacks = [
        entry.comment ?? "",
        String(entry.input),
        String(entry.total),
        formatNumber(entry.input),
        formatNumber(entry.total),
        formatMoney(entry.input),
        formatMoney(entry.total),
      ];
      return haystacks.some((value) => normalizeSearch(value).includes(needle));
    });
  }, [entries, query]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="История расчётов">
      <div className="modal modal--wide">
        <div className="modal__head">
          <div>
            <h2>История расчётов</h2>
            <p className="hint">Записи хранятся {daysLabel(historyDays)}.</p>
          </div>
          <IconButton label="Закрыть" onClick={onClose}>
            ×
          </IconButton>
        </div>

        <label className="field history-search">
          <span>Поиск по комментарию или сумме</span>
          <input
            type="search"
            value={query}
            placeholder="Например: Иван или 2200"
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          />
        </label>
        {query.trim() && <p className="history-count">Найдено: {filtered.length}</p>}

        <div className="history-scroll">
          {loading && entries.length === 0 ? (
            <p className="history-empty">Загружаем историю…</p>
          ) : filtered.length === 0 ? (
            <p className="history-empty">
              {entries.length === 0 ? "История пуста." : "Ничего не найдено."}
            </p>
          ) : (
            <div className="history-list">
              {visible.map((entry) => (
                <div className="history-item" key={entry.id}>
                  <div className="history-item__main">
                    <span className="history-item__meta">
                      <span className="history-item__date">
                        {dateFormatter.format(new Date(entry.createdAt))}
                      </span>
                      {entry.comment && (
                        <span className="history-item__comment">{entry.comment}</span>
                      )}
                    </span>
                    <span className="history-item__values">
                      {formatMoney(entry.input)}
                      <span className="history-item__arrow">→</span>
                      <strong>{formatMoney(entry.total)}</strong>
                    </span>
                  </div>
                  <IconButton
                    label="Удалить запись"
                    className="history-delete"
                    onClick={() => onDelete(entry.id)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </IconButton>
                </div>
              ))}
              {filtered.length > visibleCount && (
                <button
                  type="button"
                  className="btn history-more"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                  Показать ещё {Math.min(PAGE_SIZE, filtered.length - visibleCount)} из{" "}
                  {filtered.length}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="modal__footer modal__footer--split">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Закрыть
          </button>
          <button
            type="button"
            className="btn"
            disabled={entries.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            Очистить историю
          </button>
        </div>
      </div>

      {confirmClear && (
        <div
          className="overlay overlay--confirm"
          role="alertdialog"
          aria-modal="true"
          aria-label="Подтверждение очистки истории"
        >
          <div className="modal modal--small">
            <div className="modal__head">
              <div>
                <h2>Очистить историю?</h2>
                <p className="hint">
                  Все сохранённые расчёты будут удалены. Восстановить их можно в течение 5 секунд.
                </p>
              </div>
            </div>
            <div className="modal__footer modal__footer--split">
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmClear(false)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setConfirmClear(false);
                  onClear();
                }}
              >
                Очистить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
