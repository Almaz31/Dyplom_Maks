import { useEffect, useMemo, useState } from "react";
import { Download, RotateCcw, Share2 } from "lucide-react";
import { api, downloadBlob, post, type Metric } from "./api";
import { type DisasterCatalog } from "./disasterTypes";
import {
  metrics,
  views,
  viewTitles,
  type View,
  type Source,
  type Filters,
  type Report,
  type Compare,
  type Forecast,
  type Hazards,
} from "./analysisTypes";
import ClimateAnalysis, { ClimateHistory } from "./ClimateAnalysis";
import StatisticalAnalysis from "./StatisticalAnalysis";
import ForecastAnalysis from "./ForecastAnalysis";
import RegionComparison from "./RegionComparison";
import HazardAnalysis from "./HazardAnalysis";
import FilterPanel from "./FilterPanel";
import TerritorySearch from "./TerritorySearch";
import { useQueryState, updateQuery } from "./navigation";

const defaults: Filters = {
  source: "nasa",
  location: "country:UKR",
  start: "2000-01",
  end: "2025-12",
  metric: "temperature",
  baseline_start: 1991,
  baseline_end: 2020,
  level: "monthly",
  rolling: 12,
  season: "all",
  variables: ["temperature", "precipitation", "humidity", "wind"],
  transform: "deseasonalized",
};
function initial() {
  const q = new URLSearchParams(location.search);
  const f = { ...defaults };
  for (const key of [
    "source",
    "location",
    "start",
    "end",
    "metric",
    "level",
    "season",
    "transform",
  ] as const) {
    const v = q.get("a_" + key);
    if (v) (f as Record<string, unknown>)[key] = v;
  }
  for (const key of ["baseline_start", "baseline_end", "rolling"] as const) {
    const v = q.get("a_" + key);
    if (v && Number.isFinite(+v)) f[key] = +v;
  }
  const raw = q
    .get("a_variables")
    ?.split(",")
    .filter((k) => k in metrics) as Metric[] | undefined;
  if (raw && raw.length >= 2) f.variables = raw;
  if (!(f.metric in metrics)) f.metric = "temperature";
  if (!["monthly", "seasonal", "yearly"].includes(f.level)) f.level = "monthly";
  if (!["all", "Зима", "Весна", "Літо", "Осінь"].includes(f.season))
    f.season = "all";
  if (!["raw", "deseasonalized"].includes(f.transform))
    f.transform = "deseasonalized";
  return f;
}
const initialView = () => {
  const value = new URLSearchParams(location.search).get("a_view");
  return value && value in views ? (value as View) : "climate";
};
type Loaded = {
  report?: Report;
  comparison?: Compare;
  forecast?: Forecast;
  hazards?: Hazards;
};

export default function AnalyticsCenter({
  catalogs,
  regions,
  onOpenPrediction,
}: {
  catalogs: DisasterCatalog[];
  regions: Record<string, string>;
  onOpenPrediction: () => void;
}) {
  const [sources, setSources] = useState<Source[]>([]),
    [filters, setFilters] = useQueryState<Filters>("a_filters", initial),
    [view, setView] = useQueryState<View>("a_view", initialView);
  const [loaded, setLoaded] = useState<Loaded>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [locations, setLocations] = useQueryState<string[]>(
    "a_locations",
    () => ["country:UKR", "country:POL"],
  );
  const [horizon, setHorizon] = useQueryState(
    "a_horizon",
    () => +(new URLSearchParams(location.search).get("a_horizon") || 12),
  );
  const [testMonths, setTestMonths] = useQueryState(
    "a_test_months",
    () => +(new URLSearchParams(location.search).get("a_test_months") || 24),
  );
  const [method, setMethod] = useQueryState("a_model", () =>
    new URLSearchParams(location.search).get("a_model") === "naive"
      ? "naive"
      : "trend",
  );
  const [catalog, setCatalog] = useQueryState(
    "a_catalog",
    () =>
      new URLSearchParams(location.search).get("a_catalog") ||
      catalogs[0]?.id ||
      "",
  );
  const selectedCatalog = catalogs.find((c) => c.id === catalog) || catalogs[0];
  const [hazardStart, setHazardStart] = useQueryState(
    "a_hazard_start",
    () =>
      new URLSearchParams(location.search).get("a_hazard_start") ||
      selectedCatalog?.report.start ||
      "",
  );
  const [hazardEnd, setHazardEnd] = useQueryState(
    "a_hazard_end",
    () =>
      new URLSearchParams(location.search).get("a_hazard_end") ||
      selectedCatalog?.report.end ||
      "",
  );
  const [disasterType, setDisasterType] = useQueryState(
    "a_disaster_type",
    () => new URLSearchParams(location.search).get("a_disaster_type") || "",
  );
  const [fw, setFw] = useQueryState(
    "a_fw",
    () => +(new URLSearchParams(location.search).get("a_fw") || 0.7),
  );
  const [sw, setSw] = useQueryState(
    "a_sw",
    () => +(new URLSearchParams(location.search).get("a_sw") || 0.3),
  );
  const [run, setRun] = useState(""),
    [retry, setRetry] = useState(0);
  const source = sources.find((s) => s.id === filters.source);
  useEffect(() => {
    const c = new AbortController();
    api<{ sources: Source[] }>("/analytics/sources", { signal: c.signal })
      .then((r) => setSources(r.sources))
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (selectedCatalog && !hazardStart) {
      setCatalog(selectedCatalog.id);
      setHazardStart(selectedCatalog.report.start);
      setHazardEnd(selectedCatalog.report.end);
    }
  }, [selectedCatalog?.id]);
  const payload = useMemo(
    () =>
      view === "hazards"
        ? {
            catalog: selectedCatalog?.id || "",
            start: hazardStart,
            end: hazardEnd,
            event_type: disasterType,
            frequency_weight: fw,
            severity_weight: sw,
          }
        : {
            ...filters,
            ...(view === "history"
              ? { season: "all", level: "monthly", metric: "temperature" }
              : {}),
            locations: locations.filter(Boolean),
            horizon,
            test_months: testMonths,
            method,
          },
    [
      view,
      filters,
      locations,
      horizon,
      testMonths,
      method,
      selectedCatalog?.id,
      hazardStart,
      hazardEnd,
      disasterType,
      fw,
      sw,
    ],
  );
  const requestKey = JSON.stringify({ view, payload });
  const auto = ["climate", "statistics", "history"].includes(view);
  useEffect(() => {
    const c = new AbortController();
    setLoaded({});
    setError("");
    setNotice("");
    setBusy(false);
    if (!sources.length || (!auto && run !== requestKey))
      return () => c.abort();
    setBusy(true);
    const timer = setTimeout(() => {
      const endpoint =
        view === "comparison"
          ? "compare"
          : view === "forecast"
            ? "forecast"
            : view === "hazards"
              ? "hazards"
              : "report";
      api<Report | Compare | Forecast | Hazards>("/analytics/" + endpoint, {
        ...post(payload),
        signal: c.signal,
      })
        .then((result) => {
          if (c.signal.aborted) return;
          if (endpoint === "report") setLoaded({ report: result as Report });
          else if (endpoint === "compare")
            setLoaded({ comparison: result as Compare });
          else if (endpoint === "forecast")
            setLoaded({ forecast: result as Forecast });
          else setLoaded({ hazards: result as Hazards });
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!c.signal.aborted) setBusy(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [requestKey, run, retry, sources.length]);
  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((old) => ({ ...old, [key]: value }));
  }
  function changeSource(id: string) {
    const s = sources.find((s) => s.id === id);
    if (!s) return;
    setFilters((old) => ({
      ...old,
      source: id,
      location: s.locations[0]?.id || "",
      start: s.start,
      end: s.end,
      metric: s.variables.includes(old.metric) ? old.metric : s.variables[0],
    }));
    setLocations(s.locations.slice(0, 2).map((l) => l.id));
  }
  function calculate() {
    setRun(requestKey);
    setRetry((n) => n + 1);
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      setNotice("Посилання на поточні фільтри скопійовано.");
    } catch {
      setNotice(
        "Посилання з усіма фільтрами доступне в адресному рядку браузера.",
      );
    }
  }
  async function exportData(kind: "csv" | "xlsx") {
    setNotice("Готуємо експорт…");
    try {
      const endpoint =
        view === "hazards"
          ? `/api/analytics/hazards/export/${kind}`
          : `/api/analytics/export/${kind}?view=${view}`;
      const response = await fetch(endpoint, post(payload));
      if (!response.ok) {
        const e = await response.json();
        throw Error(
          typeof e.detail === "string"
            ? e.detail
            : "Не вдалося експортувати дані",
        );
      }
      downloadBlob(await response.blob(), `obrii-${view}.${kind}`);
      setNotice("Експорт сформовано з поточними фільтрами та метаданими.");
    } catch (e) {
      setError((e as Error).message);
      setNotice("");
    }
  }
  const ready = Object.keys(loaded).length > 0;
  const naturalLabels: Record<string, string> = {
    Flood: "Повінь",
    Storm: "Шторм",
    "Extreme temperature": "Екстремальна температура",
    Drought: "Посуха",
    Wildfire: "Природна пожежа",
    Earthquake: "Землетрус",
  };
  return (
    <section className="analytics-center">
      <nav className="analysis-tabs" aria-label="Розділи аналітики">
        {Object.entries(views).map(([key, label]) => (
          <button
            key={key}
            aria-current={view === key ? "page" : undefined}
            onClick={() => setView(key as View)}
          >
            {label}
          </button>
        ))}
      </nav>
      {view === "forecast" && (
        <div className="forecast-alternative">
          <p>
            Для просторового прогнозу на карті Європи відкрийте окрему модель.
          </p>
          <button className="secondary" onClick={onOpenPrediction}>
            Прогноз на карті Європи
          </button>
        </div>
      )}
      <h2 className="analysis-section-title">{viewTitles[view]}</h2>
      <FilterPanel summary="Фільтри та параметри аналізу">
        {view === "hazards" ? (
          !selectedCatalog ? (
            <p className="analysis-empty">
              Спочатку імпортуйте каталог EM-DAT у розділі «Дані».
            </p>
          ) : (
            <div className="analysis-filters">
              <label className="wide">
                Каталог
                <select
                  aria-label="Каталог індикатора небезпеки"
                  value={selectedCatalog.id}
                  onChange={(e) => {
                    const c = catalogs.find((c) => c.id === e.target.value)!;
                    setCatalog(c.id);
                    setHazardStart(c.report.start);
                    setHazardEnd(c.report.end);
                  }}
                >
                  {catalogs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Від
                <input
                  type="date"
                  aria-label="Початок індикатора"
                  value={hazardStart}
                  min={selectedCatalog.report.start}
                  max={hazardEnd}
                  onChange={(e) => setHazardStart(e.target.value)}
                />
              </label>
              <label>
                До
                <input
                  type="date"
                  aria-label="Кінець індикатора"
                  value={hazardEnd}
                  min={hazardStart}
                  max={selectedCatalog.report.end}
                  onChange={(e) => setHazardEnd(e.target.value)}
                />
              </label>
              <label className="wide">
                Тип природної катастрофи
                <select
                  aria-label="Тип індикатора небезпеки"
                  value={disasterType}
                  onChange={(e) => setDisasterType(e.target.value)}
                >
                  <option value="">Усі наявні природні типи</option>
                  {Object.keys(selectedCatalog.report.types)
                    .filter((t) => t in naturalLabels)
                    .map((t) => (
                      <option key={t} value={t}>
                        {naturalLabels[t]}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Вага частоти
                <input
                  type="number"
                  aria-label="Вага частоти"
                  min="0"
                  max="1"
                  step="0.1"
                  value={fw}
                  onChange={(e) => setFw(+e.target.value)}
                />
              </label>
              <label>
                Вага тяжкості
                <input
                  type="number"
                  aria-label="Вага тяжкості"
                  min="0"
                  max="1"
                  step="0.1"
                  value={sw}
                  onChange={(e) => setSw(+e.target.value)}
                />
              </label>
            </div>
          )
        ) : (
          <>
            <div className="analysis-filters">
              <label className="wide">
                Джерело
                <select
                  aria-label="Аналітичне джерело"
                  value={filters.source}
                  onChange={(e) => changeSource(e.target.value)}
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.start}–{s.end}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                Територія
                <TerritorySearch
                  label="Аналітична територія"
                  options={source?.locations || []}
                  value={filters.location}
                  onChange={(id) => update("location", id)}
                />
              </label>
              <label>
                Початковий місяць
                <input
                  type="month"
                  aria-label="Аналітичний початок"
                  min={source?.start}
                  max={filters.end}
                  value={filters.start}
                  onChange={(e) => update("start", e.target.value)}
                />
              </label>
              <label>
                Кінцевий місяць
                <input
                  type="month"
                  aria-label="Аналітичний кінець"
                  min={filters.start}
                  max={source?.end}
                  value={filters.end}
                  onChange={(e) => update("end", e.target.value)}
                />
              </label>
              {view !== "history" && (
                <label>
                  Показник
                  <select
                    aria-label="Аналітичний показник"
                    value={filters.metric}
                    onChange={(e) => update("metric", e.target.value as Metric)}
                  >
                    {(
                      source?.variables || (Object.keys(metrics) as Metric[])
                    ).map((k) => (
                      <option key={k} value={k}>
                        {metrics[k].label} · {metrics[k].unit}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <FilterPanel advanced summary="Додаткові налаштування">
                <div className="analysis-filters advanced-grid">
                  {" "}
                  {view !== "history" && (
                    <label>
                      Сезон
                      <select
                        aria-label="Аналітичний сезон"
                        value={filters.season}
                        onChange={(e) => update("season", e.target.value)}
                      >
                        {["all", "Зима", "Весна", "Літо", "Осінь"].map((s) => (
                          <option key={s} value={s}>
                            {s === "all" ? "Усі сезони" : s}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {view === "climate" && (
                    <>
                      <label>
                        Агрегація
                        <select
                          aria-label="Аналітична агрегація"
                          value={filters.level}
                          onChange={(e) =>
                            update("level", e.target.value as Filters["level"])
                          }
                        >
                          <option value="monthly">За місяцями</option>
                          <option value="seasonal">За сезонами</option>
                          <option value="yearly">За роками</option>
                        </select>
                      </label>
                      <label>
                        Ковзне вікно, місяців
                        <input
                          aria-label="Ковзне вікно"
                          type="number"
                          min="2"
                          max="60"
                          value={filters.rolling}
                          onChange={(e) => update("rolling", +e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {(view === "climate" || view === "history") && (
                    <>
                      <label>
                        Початок бази
                        <input
                          aria-label="Початок кліматичної бази"
                          type="number"
                          min="1900"
                          max="2090"
                          value={filters.baseline_start}
                          onChange={(e) =>
                            update("baseline_start", +e.target.value)
                          }
                        />
                      </label>
                      <label>
                        Кінець бази
                        <input
                          aria-label="Кінець кліматичної бази"
                          type="number"
                          min={filters.baseline_start + 9}
                          max="2100"
                          value={filters.baseline_end}
                          onChange={(e) =>
                            update("baseline_end", +e.target.value)
                          }
                        />
                      </label>
                    </>
                  )}
                  {view === "statistics" && (
                    <label className="wide">
                      Сезонність
                      <select
                        aria-label="Обробка сезонності"
                        value={filters.transform}
                        onChange={(e) =>
                          update(
                            "transform",
                            e.target.value as Filters["transform"],
                          )
                        }
                      >
                        <option value="deseasonalized">
                          Відхилення від календарних середніх
                        </option>
                        <option value="raw">Вихідні місячні значення</option>
                      </select>
                    </label>
                  )}
                  {view === "forecast" && (
                    <>
                      <label className="wide">
                        Модель
                        <select
                          aria-label="Аналітична модель"
                          value={method}
                          onChange={(e) => setMethod(e.target.value)}
                        >
                          <option value="trend">
                            Сезонна лінійна регресія
                          </option>
                          <option value="naive">
                            Сезонний наївний прогноз
                          </option>
                        </select>
                      </label>
                      <label>
                        Горизонт, місяців
                        <input
                          aria-label="Горизонт прогнозу"
                          type="number"
                          min="1"
                          max="36"
                          value={horizon}
                          onChange={(e) => setHorizon(+e.target.value)}
                        />
                      </label>
                      <label>
                        Контрольний блок, місяців
                        <select
                          aria-label="Контрольний блок"
                          value={testMonths}
                          onChange={(e) => setTestMonths(+e.target.value)}
                        >
                          {[12, 24, 36, 48, 60].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                </div>
              </FilterPanel>
              {view === "comparison" &&
                [0, 1, 2, 3].map((i) => (
                  <label key={i}>
                    Територія {i + 1}
                    {i > 1 ? " (за бажанням)" : ""}
                    <TerritorySearch
                      label={`Порівняння: територія ${i + 1}`}
                      options={source?.locations || []}
                      value={locations[i] || ""}
                      optional={i > 1}
                      onChange={(id) => {
                        const next = [...locations];
                        next[i] = id;
                        setLocations(next);
                      }}
                    />
                  </label>
                ))}
            </div>
            {view === "statistics" && (
              <fieldset className="analysis-variable-select">
                <legend>Показники для матриці (щонайменше два)</legend>
                {Object.entries(metrics).map(([key, v]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={filters.variables.includes(key as Metric)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...filters.variables, key as Metric]
                          : filters.variables.filter((k) => k !== key);
                        if (next.length >= 2) update("variables", next);
                      }}
                    />
                    {v.label}
                  </label>
                ))}
              </fieldset>
            )}
          </>
        )}
      </FilterPanel>
      <div className="analysis-actions">
        {auto ? (
          <span className="auto-update-status" role="status">
            {busy ? "Оновлюємо результат…" : "Зміни застосовуються автоматично"}
          </span>
        ) : (
          <>
            {" "}
            <button
              className="primary"
              onClick={calculate}
              disabled={
                busy ||
                (!source && view !== "hazards") ||
                (view === "hazards" && !selectedCatalog)
              }
            >
              {busy ? "Обчислюємо…" : "Розрахувати"}
            </button>
          </>
        )}
        <button
          className="secondary"
          onClick={() => {
            setFilters({ ...defaults });
            setLocations(["country:UKR", "country:POL"]);
            setHorizon(12);
            setTestMonths(24);
            setMethod("trend");
            setFw(0.7);
            setSw(0.3);
            setDisasterType("");
            if (selectedCatalog) {
              setHazardStart(selectedCatalog.report.start);
              setHazardEnd(selectedCatalog.report.end);
            }
          }}
        >
          <RotateCcw size={15} />
          Скинути фільтри
        </button>
        <button className="secondary" onClick={share}>
          <Share2 size={15} />
          Поділитися
        </button>
        {(["csv", "xlsx"] as const).map((kind) => (
          <button
            key={kind}
            className="secondary"
            disabled={!ready || busy}
            onClick={() => exportData(kind)}
          >
            <Download size={15} />
            {kind.toUpperCase()}
          </button>
        ))}
        {ready && (
          <button className="text-btn" onClick={() => window.print()}>
            Друк звіту
          </button>
        )}
      </div>
      {notice && (
        <p className="analysis-status" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="view-loading" role="status">
          Перевіряємо повноту даних та обчислюємо статистику…
        </p>
      )}
      {!auto && !ready && !busy && !error && (
        <p className="analysis-empty">
          Налаштуйте фільтри й натисніть «Розрахувати». Прогноз та індикатор не
          обчислюються автоматично.
        </p>
      )}
      {loaded.report && view === "climate" && (
        <ClimateAnalysis data={loaded.report} />
      )}
      {loaded.report && view === "statistics" && (
        <StatisticalAnalysis data={loaded.report} />
      )}
      {loaded.report && view === "history" && (
        <ClimateHistory data={loaded.report} />
      )}
      {loaded.forecast && <ForecastAnalysis data={loaded.forecast} />}
      {loaded.comparison && <RegionComparison data={loaded.comparison} />}
      {loaded.hazards && (
        <HazardAnalysis data={loaded.hazards} regions={regions} />
      )}
    </section>
  );
}
