import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, type Metric } from "./api";
import { coefficient, metrics, type Report } from "./analysisTypes";
import AnalyticalChart from "./AnalyticalChart";
import { SourceNote } from "./ClimateAnalysis";
import Summary from "./Summary";

export default function StatisticalAnalysis({ data }: { data: Report }) {
  const variables = data.filters.variables;
  const [chosen, setChosen] = useState<[Metric, Metric]>([
    variables[0],
    variables[1],
  ]);
  const x = variables.includes(chosen[0]) ? chosen[0] : variables[0],
    y = variables.includes(chosen[1]) ? chosen[1] : variables[1];
  const fit = data.correlations.find((r) => r.x === x && r.y === y)!;
  const pairs = data.aligned
    .filter((r) => r[x] != null && r[y] != null)
    .map((r) => ({ x: r[x]!, y: r[y]!, date: r.date }))
    .sort((a, b) => a.x - b.x);
  const chart = pairs.map((r) => ({
    ...r,
    trend:
      fit.slope != null && fit.intercept != null
        ? fit.intercept + fit.slope * r.x
        : null,
  }));
  const variableStats = data.descriptions[x];
  const range =
    variableStats.max != null && variableStats.min != null
      ? variableStats.max - variableStats.min
      : 0;
  const raw = data.aligned
    .map((r) => r[x])
    .filter((v): v is number => v != null);
  const min = raw.length ? Math.min(...raw) : 0,
    max = raw.length ? Math.max(...raw) : 0;
  const step = (max - min || 1) / 8;
  const bins = Array.from({ length: 8 }, (_, i) => ({
    label: `${format(min + i * step)}…${format(min + (i + 1) * step)}`,
    count: 0,
  }));
  raw.forEach((v) => bins[Math.min(7, Math.floor((v - min) / step))].count++);
  const direction =
    fit.pearson == null
      ? "Коефіцієнт не визначено: замало пар або стала змінна."
      : `Кореляція ${fit.pearson > 0 ? "додатна" : fit.pearson < 0 ? "від’ємна" : "нульова"}: r = ${coefficient(fit.pearson)}, ρ = ${coefficient(fit.spearman)}; ${fit.n} сумісних місячних пар. Універсальних порогів «сильного» зв’язку не застосовано.`;
  return (
    <>
      <Summary
        title={`${metrics[x].label} та ${metrics[y].label}`}
        source={`${data.meta.source} · ${data.meta.location} · ${data.filters.start} — ${data.filters.end}`}
      >
        {direction} Кореляція не доводить причинності.
      </Summary>
      <p className="analysis-status">
        {data.filters.transform === "deseasonalized"
          ? "Перед аналізом від кожного показника віднято середнє відповідного календарного місяця у вибраній вибірці. Це послаблює спільну сезонність, але не усуває автокореляцію чи тренд."
          : "Аналізуються сирі місячні значення. Спільна сезонність може суттєво впливати на кореляцію."}{" "}
        Кореляція не доводить причинності. p-значення без моделі часової
        залежності не подаються.
      </p>
      <h3 className="analysis-section-title">Матриця кореляцій Пірсона</h3>
      <p className="analysis-insight">
        Виберіть комірку, щоб змінити пару на діаграмі. Для кожної пари
        використано лише спільні місяці.
      </p>
      <div className="analysis-matrix">
        <table>
          <thead>
            <tr>
              <th>Показник</th>
              {variables.map((k) => (
                <th key={k}>{metrics[k].label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variables.map((a) => (
              <tr key={a}>
                <th>{metrics[a].label}</th>
                {variables.map((b) => {
                  const r = data.correlations.find(
                    (r) => r.x === a && r.y === b,
                  )!;
                  return (
                    <td key={b}>
                      <button
                        aria-pressed={x === a && y === b}
                        onClick={() => setChosen([a, b])}
                        aria-label={`${metrics[a].label} та ${metrics[b].label}`}
                        title={`n=${r.n}; Спірмен=${coefficient(r.spearman)}`}
                      >
                        {coefficient(r.pearson)}
                        <small> · n={r.n}</small>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="analysis-filters">
        <label>
          Показник X
          <select
            aria-label="Показник X"
            value={x}
            onChange={(e) => setChosen([e.target.value as Metric, y])}
          >
            {variables.map((k) => (
              <option key={k} value={k}>
                {metrics[k].label} · {metrics[k].unit}
              </option>
            ))}
          </select>
        </label>
        <label>
          Показник Y
          <select
            aria-label="Показник Y"
            value={y}
            onChange={(e) => setChosen([x, e.target.value as Metric])}
          >
            {variables.map((k) => (
              <option key={k} value={k}>
                {metrics[k].label} · {metrics[k].unit}
              </option>
            ))}
          </select>
        </label>
      </div>
      <AnalyticalChart
        title="Зв’язок показників і лінійна регресія"
        description={
          direction +
          ` Нахил: ${coefficient(fit.slope)}; вільний член: ${coefficient(fit.intercept)}; R²: ${coefficient(fit.r2)}. Викиди не вилучено.`
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart}>
            <CartesianGrid />
            <XAxis
              dataKey="x"
              type="number"
              name={metrics[x].label}
              unit={` ${metrics[x].unit}`}
            />
            <YAxis
              dataKey="y"
              name={metrics[y].label}
              unit={` ${metrics[y].unit}`}
              width={60}
            />
            <Tooltip
              labelFormatter={() => `${metrics[x].label} / ${metrics[y].label}`}
              formatter={(v) => format(Number(v))}
            />
            <Scatter
              dataKey="y"
              name={metrics[y].label}
              fill="#377b60"
              isAnimationActive={false}
            />
            <Line
              dataKey="trend"
              name="Регресія"
              dot={false}
              stroke="#bd823c"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </AnalyticalChart>
      <AnalyticalChart
        title={`Розподіл: ${metrics[x].label}`}
        description={`8 рівних інтервалів ${data.filters.transform === "deseasonalized" ? "відхилень від календарних середніх" : "сирих значень"}. ${raw.length} значень. Вихідний діапазон показника: ${format(range)} ${metrics[x].unit}. Викиди позначаються правилом 1,5 IQR у таблиці, без автоматичного вилучення.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bins}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" interval={1} minTickGap={20} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar
              dataKey="count"
              name="Кількість місяців"
              fill="#7a9f83"
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </AnalyticalChart>
      <div className="analysis-table">
        <table>
          <caption className="analysis-insight">
            Описова статистика вихідних повних місячних значень; σ має дільник
            n.
          </caption>
          <thead>
            <tr>
              <th>Показник</th>
              <th>n</th>
              <th>Середнє</th>
              <th>Медіана</th>
              <th>σ</th>
              <th>Мінімум</th>
              <th>Максимум</th>
              <th>Викиди 1,5 IQR</th>
            </tr>
          </thead>
          <tbody>
            {variables.map((k) => {
              const s = data.descriptions[k];
              return (
                <tr key={k}>
                  <th>
                    {metrics[k].label} · {metrics[k].unit}
                  </th>
                  <td>{s.count}</td>
                  <td>{format(s.mean)}</td>
                  <td>{format(s.median)}</td>
                  <td>{format(s.sd)}</td>
                  <td>{format(s.min)}</td>
                  <td>{format(s.max)}</td>
                  <td>{s.outliers}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SourceNote data={data} />
    </>
  );
}
