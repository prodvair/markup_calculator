export type RangeRow = {
  id: string;
  /** Нижняя граница, включается в диапазон. */
  min: number;
  /** Верхняя граница, включается в диапазон. null = бесконечность. */
  max: number | null;
  /** Фикс для доставки или процент для наценки. */
  value: number;
};

export type BreakdownVisibility = {
  rounded: boolean;
  delivery: boolean;
  withDelivery: boolean;
  markup: boolean;
};

export type AppConfig = {
  version: number;
  /** Хранится как sha256:<salt>:<hex>, а не открытым текстом. */
  passwordHash: string;
  /** Шаг округления исходной суммы: 100, 50, 10 и т.д. Всегда вверх. */
  roundingStep: number;
  /** Шаг округления итоговой суммы. Всегда вверх. */
  resultRoundingStep: number;
  delivery: RangeRow[];
  markup: RangeRow[];
  /** Какие строки детализации показывать в основном окне. */
  breakdownVisible: BreakdownVisibility;
};

export type ConfigPayload = {
  config: AppConfig;
  path: string;
  source: "executable" | "app_config";
};

export type Calculation = {
  input: number;
  rounded: number;
  delivery: number;
  withDelivery: number;
  markupPercent: number;
  markupAmount: number;
  total: number;
};
