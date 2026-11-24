import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, Calculation, ConfigPayload, RangeRow } from "./types";

export const PASSWORD_SALT = "runar-calc-v1";
const LOCAL_KEY = "runar-calculator-config-v1";

export const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  passwordHash:
    "sha256:runar-calc-v1:7402c17c40cfc97fced8fe7851d3afc932d35169cb6e24891f501a9ef7fce25b",
  roundingStep: 100,
  resultRoundingStep: 100,
  delivery: [
    { id: "d1", min: 0, max: 500, value: 100 },
    { id: "d2", min: 501, max: 1000, value: 200 },
    { id: "d3", min: 1001, max: 3000, value: 300 },
    { id: "d4", min: 3001, max: 8000, value: 400 },
    { id: "d5", min: 8001, max: 11000, value: 500 },
    { id: "d6", min: 11001, max: null, value: 500 },
  ],
  markup: [
    { id: "m1", min: 0, max: 400, value: 80 },
    { id: "m2", min: 401, max: 600, value: 70 },
    { id: "m3", min: 601, max: 700, value: 60 },
    { id: "m4", min: 701, max: 1000, value: 50 },
    { id: "m5", min: 1001, max: 2000, value: 35 },
    { id: "m6", min: 2001, max: 5000, value: 30 },
    { id: "m7", min: 5001, max: 19000, value: 20 },
    { id: "m8", min: 19001, max: 50000, value: 15 },
    { id: "m9", min: 50001, max: 100000, value: 30 },
    { id: "m10", min: 100001, max: null, value: 30 },
  ],
  breakdownVisible: {
    rounded: false,
    delivery: false,
    withDelivery: false,
    markup: false,
  },
};

export function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${PASSWORD_SALT}${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${PASSWORD_SALT}:${hex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Если пользователь сам записал пароль открытым текстом в JSON — тоже поддерживаем.
  if (!stored.startsWith("sha256:")) return password === stored;
  return (await hashPassword(password)) === stored;
}

/**
 * Приводит диапазоны к непрерывному списку без дыр и пересечений:
 * сортирует по min, первый начинается с 0, последний всегда до бесконечности.
 */
export function normalizeRanges(rows: RangeRow[]): RangeRow[] {
  const sorted = rows
    .map((row) => ({
      id: row.id || makeId(),
      min: Math.max(0, round2(Number(row.min) || 0)),
      max:
        row.max === null || !Number.isFinite(Number(row.max))
          ? null
          : Math.max(0, round2(Number(row.max))),
      value: Math.max(0, round2(Number(row.value) || 0)),
    }))
    .filter((row) => Number.isFinite(row.min) && Number.isFinite(row.value))
    .sort((a, b) => a.min - b.min);

  if (sorted.length === 0) {
    return [{ id: makeId(), min: 0, max: null, value: 0 }];
  }

  const result: RangeRow[] = [];

  sorted.forEach((row, index) => {
    let min = index === 0 ? 0 : round2((result[index - 1].max ?? result[index - 1].min) + 0.01);

    // Если пользователь сдвинул границу вправо — расширяем предыдущий диапазон,
    // чтобы между диапазонами не оставалось «дыр».
    if (row.min > min) {
      if (result[index - 1]) {
        result[index - 1].max = round2(row.min - 0.01);
      }
      min = row.min;
    }

    let max: number | null;
    if (index === sorted.length - 1) {
      max = null;
    } else {
      max = row.max === null ? null : Math.max(0, round2(row.max));
      if (max === null || max <= min) max = round2(min + 0.01);
    }

    result.push({ ...row, min, max });
  });

  return result;
}

/** Возвращает текст ошибки, если диапазоны пересекаются или имеют некорректные границы. */
export function validateRanges(rows: RangeRow[]): string | null {
  const sorted = [...rows].sort((a, b) => a.min - b.min);

  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index];
    if (!Number.isFinite(row.min) || !Number.isFinite(row.value) || row.min < 0 || row.value < 0) {
      return `Диапазон ${index + 1}: значения не могут быть отрицательными`;
    }

    if (index === sorted.length - 1) continue;

    if (row.max === null || row.max <= row.min) {
      return `Диапазон ${index + 1}: «До» должен быть больше «От»`;
    }
    if (round2(row.max + 0.01) > sorted[index + 1].min) {
      return `Диапазоны ${index + 1} и ${index + 2} пересекаются`;
    }
  }

  return null;
}

export function normalizeConfig(config: Partial<AppConfig>): AppConfig {
  const step = Number(config.roundingStep);
  const resultStep = Number(config.resultRoundingStep);
  return {
    version: 1,
    passwordHash: config.passwordHash?.trim() || DEFAULT_CONFIG.passwordHash,
    roundingStep: Number.isFinite(step) && step > 0 ? round2(step) : 100,
    resultRoundingStep: Number.isFinite(resultStep) && resultStep > 0 ? round2(resultStep) : 100,
    delivery: normalizeRanges(config.delivery ?? DEFAULT_CONFIG.delivery),
    markup: normalizeRanges(config.markup ?? DEFAULT_CONFIG.markup),
    breakdownVisible: {
      rounded: config.breakdownVisible?.rounded === true,
      delivery: config.breakdownVisible?.delivery === true,
      withDelivery: config.breakdownVisible?.withDelivery === true,
      markup: config.breakdownVisible?.markup === true,
    },
  };
}

function pickValue(rows: RangeRow[], value: number): number {
  const range = rows.find((row) => value >= row.min && (row.max === null || value <= row.max));
  return (range ?? rows[rows.length - 1])?.value ?? 0;
}

export function calculate(input: number, config: AppConfig): Calculation {
  const safeInput = Number.isFinite(input) ? Math.max(0, input) : 0;
  const step = config.roundingStep > 0 ? config.roundingStep : 100;
  const rounded = Math.ceil(safeInput / step - 1e-9) * step;

  const delivery = pickValue(config.delivery, rounded);
  const withDelivery = round2(rounded + delivery);
  const markupPercent = pickValue(config.markup, withDelivery);
  const markupAmount = round2((withDelivery * markupPercent) / 100);
  // Итог округляется вверх отдельным шагом, не влияющим на расчёт наценки.
  const rawTotal = round2(withDelivery + markupAmount);
  const totalStep = config.resultRoundingStep > 0 ? config.resultRoundingStep : 100;
  const total = round2(Math.ceil(rawTotal / totalStep - 1e-9) * totalStep);

  return {
    input: safeInput,
    rounded: round2(rounded),
    delivery: round2(delivery),
    withDelivery,
    markupPercent: round2(markupPercent),
    markupAmount,
    total,
  };
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w;
}

export async function loadConfig(): Promise<ConfigPayload> {
  if (isTauri()) {
    const loaded = await invoke<ConfigPayload>("load_config");
    return { ...loaded, config: normalizeConfig(loaded.config) };
  }

  const raw = localStorage.getItem(LOCAL_KEY);
  const config = raw ? normalizeConfig(JSON.parse(raw) as AppConfig) : DEFAULT_CONFIG;
  return {
    config,
    path: "localStorage (предпросмотр в браузере)",
    source: "app_config",
  };
}

export async function saveConfig(config: AppConfig): Promise<ConfigPayload> {
  const normalized = normalizeConfig(config);
  if (isTauri()) {
    return invoke<ConfigPayload>("save_config", { config: normalized });
  }

  localStorage.setItem(LOCAL_KEY, JSON.stringify(normalized, null, 2));
  return {
    config: normalized,
    path: "localStorage (предпросмотр в браузере)",
    source: "app_config",
  };
}

export async function revealConfig(): Promise<void> {
  if (isTauri()) {
    await invoke("reveal_config");
  }
}

export async function copyText(text: string): Promise<void> {
  if (isTauri()) {
    await invoke("copy_to_clipboard", { text });
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("Буфер обмена недоступен");
}
