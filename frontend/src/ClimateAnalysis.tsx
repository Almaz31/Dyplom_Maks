import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, type Metric } from "./api";
import AnalyticalChart from "./AnalyticalChart";
import Summary from "./Summary";
import { metrics, type Report } from "./analysisTypes";

const months = [
  "Січ",
  "Лют",
  "Бер",
  "Кві",
  "Тра",
  "Чер",
  "Лип",
  "Сер",
  "Вер",
  "Жов",
  "Лис",
  "Гру",
];
export function KPIs({ items }: { items: [string, string, string?][] }) {
  return (
    <div className="analysis-kpis">
      {items.map(([label, value, note]) => (
        <article key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          {note && <small>{note}</small>}
        </article>
      ))}
    </div>
  );
}
export function SourceNote({ data }: { data: Report }) {
  return (
    <div className="analysis-meta">
      <b>
        {data.meta.source} · {data.meta.location}
      </b>
      <p>
        {data.meta.spatial_kind}. {data.meta.note}
      </p>
      <p>
        Дата основного знімка / імпорту:{" "}
        {data.meta.retrieved_at
          ? new Date(data.meta.retrieved_at).toLocaleDateString("uk-UA")
          : "не вказана"}
        . Доступні місяці: {data.quality.available_start} —{" "}
        {data.quality.available_end}.
      </p>
    </div>
  );
}
export function BaselineNote({ data }: { data: Report }) {
  return (
    <p
      className={`analysis-status ${!data.baseline.standard_30_year ? "warning" : ""}`}
    >
      {data.baseline.standard_30_year
        ? `Підтверджена 30-річна база ${data.baseline.start}–${data.baseline.end}.`
        : `База ${data.baseline.start}–${data.baseline.end}: повну стандартну 30-річну норму не підтверджено. Для кожної календарної групи потрібні всі ${data.baseline.expected} років; інакше аномалія не обчислюється.`}{" "}
      Це розрахована норма локального набору, а не сертифікована станційна норма
      ВМО.
    </p>
  );
}

export default function ClimateAnalysis({ data }: { data: Report }) {
  const [heatDetail, setHeatDetail] = useState("");
  const metric = data.filters.metric,
    unit = data.unit;
  const rain = metric === "precipitation";
  const anomalyKey = rain ? "precipitation_pct" : "anomaly";
  const anomalyUnit = rain ? "%" : metric === "humidity" ? "в. п." : unit;
  const valid = data.rows.filter((r) => r.value != null);
  const sd = data.stats.sd;
  const extreme = rain
    ? [...data.rows]
        .filter((r) => r.precipitation_pct != null)
        .sort(
          (a, b) =>
            Math.abs(b.precipitation_pct!) - Math.abs(a.precipitation_pct!),
        )[0]
    : data.extreme;
  const anomalyDescription = extreme
    ? `Найбільше абсолютне відхилення: ${extreme.date}, ${format(rain ? extreme.precipitation_pct : extreme.anomaly)} ${anomalyUnit}. Відхилення обчислено від відповідної календарної норми ${data.baseline.start}–${data.baseline.end}.`
    : "Для обраного періоду немає повної бази або значень. Аномалії не підмінюються нулями.";
  const valueDescription = `${valid.length} повних агрегатів. Середнє: ${format(data.stats.mean)} ${unit}, медіана: ${format(data.stats.median)} ${unit}. ${rain ? "Кожне значення — сума за період; ковзна лінія — середнє місячних сум." : "Місячні значення — середні; сезонні й річні зважено за кількістю днів."} ${data.filters.level === "monthly" ? `Ковзне вікно: ${data.filters.rolling} неперервних місяців.` : ""}`;
  const heatYears = [...new Set(data.rows.map((r) => r.year))];
  const monthly = data.filters.level === "monthly";
  return (
    <>
      <Summary
        title="Головне за вибраний період"
        source={`${data.meta.source} · ${data.meta.location} · ${data.filters.start} — ${data.filters.end}`}
      >
        {extreme
          ? `Найбільше відхилення від календарної норми: ${format(rain ? extreme.precipitation_pct : extreme.anomaly)} ${anomalyUnit} (${extreme.date}). База ${data.baseline.start}–${data.baseline.end}.`
          : "Повної бази для відхилень немає. Змініть базовий період або джерело."}{" "}
        Покриття: {data.quality.complete} із {data.quality.months} місяців.
      </Summary>
      <details className="supporting-stats">
        <summary>Статистика та якість даних</summary>
        <BaselineNote data={data} />
        <KPIs
          items={[
            [
              `Середнє · ${unit}`,
              format(data.stats.mean),
              "За наявними повними агрегатами",
            ],
            ["Медіана", `${format(data.stats.median)} ${unit}`],
            [
              "Стандартне відхилення",
              `${format(sd)} ${unit}`,
              "Сукупність, дільник n",
            ],
            [
              "Повні місяці",
              `${data.quality.complete} / ${data.quality.months}`,
              "Пропуски не заповнюються",
            ],
          ]}
        />
      </details>
      {!valid.length ? (
        <p className="analysis-empty">
          Немає повних календарних агрегатів. Змініть період, територію або
          набір.
        </p>
      ) : (
        <>
          <AnalyticalChart
            title={`${metrics[metric].label}: спостереження та історична норма`}
            description={valueDescription}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.rows}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" minTickGap={45} />
                <YAxis width={55} unit={` ${unit}`} />
                <Tooltip formatter={(v) => `${format(Number(v))} ${unit}`} />
                <Legend />
                <Line
                  dataKey="value"
                  name="Історичні дані"
                  stroke="#276d56"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="normal"
                  name="Історична норма"
                  stroke="#8c9e92"
                  strokeDasharray="4 3"
                  dot={false}
                  connectNulls={false}
                />
                <Line
                  dataKey="rolling"
                  name="Ковзне середнє"
                  stroke="#b78039"
                  dot={false}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </AnalyticalChart>
          <AnalyticalChart
            title={
              rain
                ? "Відхилення опадів від норми"
                : "Температурні та метеорологічні аномалії"
            }
            description={anomalyDescription}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.rows}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" minTickGap={45} />
                <YAxis width={55} unit={` ${anomalyUnit}`} />
                <Tooltip
                  formatter={(v) => `${format(Number(v))} ${anomalyUnit}`}
                />
                <ReferenceLine y={0} stroke="#6a7c71" />
                {rain ? (
                  <Bar
                    dataKey={anomalyKey}
                    name="Відхилення опадів"
                    fill="#6394a8"
                    isAnimationActive={false}
                  />
                ) : (
                  <Line
                    dataKey={anomalyKey}
                    name="Аномалія"
                    stroke="#bd7a4c"
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </AnalyticalChart>
          {monthly && (
            <>
              <h3 className="analysis-section-title">
                Місячна карта аномалій · {anomalyUnit}
              </h3>
              <p className="analysis-insight">
                Число показує відхилення; теплий колір — додатне, холодний —
                від’ємне. «—» означає відсутні дані або норму. Виберіть комірку
                для пояснення.
              </p>
              <div className="analysis-heatmap">
                <table>
                  <thead>
                    <tr>
                      <th>Рік</th>
                      {months.map((m) => (
                        <th key={m}>{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatYears.map((y) => (
                      <tr key={y}>
                        <th>{y}</th>
                        {months.map((m, i) => {
                          const row = data.rows.find(
                            (r) => r.year === y && r.key === i + 1,
                          );
                          const v = row?.[anomalyKey];
                          return (
                            <td key={m}>
                              <button
                                className={
                                  v == null
                                    ? "heat-missing"
                                    : v >= 0
                                      ? "heat-positive"
                                      : "heat-negative"
                                }
                                aria-label={`${m} ${y}: ${format(v)} ${anomalyUnit}`}
                                title={`z: ${format(row?.z)}; різниця з попереднім роком: ${format(row?.yoy)} ${unit}`}
                                onClick={(e) => {
                                  const target = e.currentTarget;
                                  target.title = `${m} ${y}: ${format(v)} ${anomalyUnit}. z: ${format(row?.z)}. Різниця з попереднім роком: ${format(row?.yoy)} ${unit}`;
                                  target.setAttribute(
                                    "aria-label",
                                    target.title,
                                  );
                                  setHeatDetail(target.title);
                                }}
                              >
                                {format(v)}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <AnalyticalChart
            title="Зміна відносно попереднього року"
            description={`Порівнюються однакові календарні місяці, сезони або повні роки. Зміна в ${unit}; для опадів це абсолютна різниця сум. Пропущений попередній період залишає розрив.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.rows}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" minTickGap={45} />
                <YAxis width={55} unit={` ${unit}`} />
                <Tooltip formatter={(v) => `${format(Number(v))} ${unit}`} />
                <ReferenceLine y={0} />
                <Bar
                  dataKey="yoy"
                  name="Рік до року"
                  fill="#83a68f"
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </AnalyticalChart>
        </>
      )}
      {heatDetail && (
        <p className="analysis-status" role="status">
          {heatDetail}
        </p>
      )}
      <div className="analysis-table">
        <table>
          <caption className="analysis-insight">
            Розраховані значення · {unit}. Аномалія вологості — в. п. Повний
            набір доступний у CSV/XLSX.
          </caption>
          <thead>
            <tr>
              <th>Період</th>
              <th>Значення</th>
              <th>Норма</th>
              <th>Аномалія</th>
              <th>Опади, %</th>
              <th>z</th>
              <th>Рік до року</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.date}>
                <td>{r.date}</td>
                <td>{format(r.value)}</td>
                <td>{format(r.normal)}</td>
                <td>{format(r.anomaly)}</td>
                <td>{format(r.precipitation_pct)}</td>
                <td>{format(r.z)}</td>
                <td>{format(r.yoy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SourceNote data={data} />
    </>
  );
}

export function ClimateHistory({ data }: { data: Report }) {
  const valid = data.annual.filter((r) => r.temperature != null),
    fit = data.annual_trend;
  const slope = fit.slope;
  const summary =
    valid.length >= 2
      ? `Від ${valid[0].year} до ${valid.at(-1)!.year} різниця середньорічної температури становить ${format(data.annual_change)} °C. Це різниця кінцевих повних років, а не зміна для кожного дня.`
      : "Потрібно щонайменше два повні роки для порівняння температур.";
  const chartRows = data.annual.map((r) => ({
    ...r,
    trend:
      slope != null && fit.intercept != null
        ? fit.intercept + slope * r.year
        : null,
  }));
  return (
    <>
      <div className="analysis-report">
        <h3>Історія: {data.meta.location}</h3>
        <p>{summary}</p>
        <p>
          {slope == null
            ? "Тренд не визначено: потрібно щонайменше три повні роки."
            : `Лінійний тренд повних річних середніх: ${format(slope * 10)} °C за десятиліття; R² = ${format(fit.r2)}. Це опис вибраного інтервалу, без твердження про статистичну значущість.`}
        </p>
        <p>
          Географія: {data.meta.spatial_kind}. Точка сітки або індекс країни не
          є станційною історією конкретного міста. Добові температурні
          екстремуми неможливо відновити з місячних середніх.
        </p>
      </div>
      <KPIs
        items={[
          [`Різниця кінцевих років`, `${format(data.annual_change)} °C`],
          [
            "Тренд за 10 років",
            `${format(slope == null ? null : slope * 10)} °C`,
          ],
          ["Повних років", String(valid.length)],
          ["R² тренду", format(fit.r2)],
        ]}
      />
      <AnalyticalChart
        title="Середньорічна температура та тренд"
        description={
          summary +
          " Модель тренду оцінено за всіма доступними повними роками обраного інтервалу."
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartRows}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="year" />
            <YAxis unit=" °C" />
            <Tooltip formatter={(v) => `${format(Number(v))} °C`} />
            <Legend />
            <Line
              dataKey="temperature"
              name="Річне середнє"
              stroke="#32765b"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="trend"
              name="Лінійний тренд"
              stroke="#bb823d"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </AnalyticalChart>
      <AnalyticalChart
        title="Річні суми опадів"
        description="Лише суми 12 повних місяців. Розриви означають неповний рік, а не відсутність опадів."
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.annual}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="year" />
            <YAxis width={60} unit=" мм" />
            <Tooltip formatter={(v) => `${format(Number(v))} мм`} />
            <Bar
              dataKey="precipitation"
              name="Річні опади"
              fill="#6496a6"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </AnalyticalChart>
      <h3 className="analysis-section-title">
        Сезонний контекст, аномалії та місячні екстремуми
      </h3>
      <p className="analysis-insight">
        Мінімум і максимум нижче характеризують місячні середні, не добові
        температурні рекорди. Норма для місяців дозволяє відокремити сезонний
        цикл від відхилень.
      </p>
      <ClimateAnalysis data={data} />
    </>
  );
}
