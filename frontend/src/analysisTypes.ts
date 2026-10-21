import type { Metric } from "./api";
export type View =
  "climate" | "statistics" | "forecast" | "comparison" | "history" | "hazards";
export const views: Record<View, string> = {
  climate: "Аномалії",
  statistics: "Зв’язки",
  forecast: "Прогноз",
  comparison: "Порівняння",
  history: "Історія",
  hazards: "Небезпека",
};
export const viewTitles: Record<View, string> = {
  climate: "Кліматичні аномалії",
  statistics: "Статистичні зв’язки",
  forecast: "Прогнозування та перевірка моделей",
  comparison: "Порівняння територій",
  history: "Історія клімату території",
  hazards: "Історична небезпека природних катастроф",
};

export const metrics: Record<Metric, { label: string; unit: string }> = {
  temperature: { label: "Температура", unit: "°C" },
  precipitation: { label: "Опади", unit: "мм" },
  humidity: { label: "Вологість", unit: "%" },
  wind: { label: "Вітер", unit: "м/с" },
};
export const coefficient = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 3 }).format(n);
export type Source = {
  id: string;
  name: string;
  source: string;
  kind: string;
  start: string;
  end: string;
  retrieved_at: string;
  variables: Metric[];
  locations: { id: string; name: string }[];
};
export type Filters = {
  source: string;
  location: string;
  start: string;
  end: string;
  metric: Metric;
  baseline_start: number;
  baseline_end: number;
  level: "monthly" | "seasonal" | "yearly";
  rolling: number;
  season: string;
  variables: Metric[];
  transform: "raw" | "deseasonalized";
};
export type Stats = {
  count: number;
  mean: number | null;
  median: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
  q1: number | null;
  q3: number | null;
  outliers: number;
};
export type Fit = {
  n: number;
  slope: number | null;
  intercept: number | null;
  r2: number | null;
  pearson: number | null;
};
export type Meta = {
  source: string;
  location: string;
  spatial_kind: string;
  source_url: string;
  retrieved_at: string;
  note: string;
};
export type ClimateRow = {
  date: string;
  year: number;
  key: number | string;
  value: number | null;
  normal: number | null;
  anomaly: number | null;
  precipitation_pct: number | null;
  z: number | null;
  rolling: number | null;
  yoy: number | null;
  baseline_count: number;
};
export type Report = {
  rows: ClimateRow[];
  stats: Stats;
  trend: Fit;
  normals: Record<string, { mean: number; sd: number; count: number }>;
  baseline: {
    start: number;
    end: number;
    standard_30_year: boolean;
    expected: number;
  };
  extreme: ClimateRow | null;
  missing: number;
  meta: Meta;
  filters: Filters;
  unit: string;
  correlations: (Fit & { x: Metric; y: Metric; spearman: number | null })[];
  aligned: ({ date: string } & Record<Metric, number | null>)[];
  descriptions: Record<Metric, Stats>;
  annual: {
    year: number;
    temperature: number | null;
    precipitation: number | null;
  }[];
  annual_trend: Fit;
  annual_change: number | null;
  quality: {
    months: number;
    complete: number;
    available_start: string;
    available_end: string;
  };
};
export type Forecast = {
  history: { date: string; actual: number }[];
  validation: {
    date: string;
    actual: number;
    predicted: number;
    baseline: number;
    error: number;
  }[];
  future: {
    date: string;
    predicted: number;
    low: number | null;
    high: number | null;
    calibration_n: number;
  }[];
  accuracy: { mae: number; rmse: number; n: number };
  baseline_accuracy: { mae: number; rmse: number; n: number };
  training_start: string;
  training_end: string;
  test_start: string;
  test_end: string;
  final_training_end: string;
  interval_note: string;
  meta: Meta;
  unit: string;
};
export type Compare = {
  locations: { id: string; meta: Meta; stats: Stats; trend: Fit }[];
  rows: ({ date: string } & Record<string, string | number>)[];
  common_months: number;
  unit: string;
};
export type HazardRegion = {
  code: string;
  name: string;
  count: number;
  frequency: number;
  severity: number | null;
  known: number;
  coverage: number;
  frequency_score: number;
  severity_score: number | null;
  score: number | null;
};
export type Hazards = {
  regions: HazardRegion[];
  events: {
    id: string;
    type: string;
    type_label: string;
    regions: string[];
    year: number;
  }[];
  count: number;
  unlocated: number;
  series: { year: number; count: number }[];
  weights: { frequency: number; severity: number };
  source: string;
  note: string;
};
