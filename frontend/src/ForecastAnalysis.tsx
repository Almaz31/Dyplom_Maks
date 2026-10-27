import Pagination, { usePagination } from "./Pagination";
import {
  Area,
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
import { format } from "./api";
import { type Forecast } from "./analysisTypes";
import AnalyticalChart from "./AnalyticalChart";
import { KPIs } from "./ClimateAnalysis";
import Summary from "./Summary";

export default function ForecastAnalysis({ data }: { data: Forecast }) {
  const chart = [
    ...data.history.map((r) => ({ ...r, predicted: null, range: null })),
    ...data.future.map((r) => ({
      ...r,
      actual: null,
      range: r.low != null && r.high != null ? [r.low, r.high] : null,
    })),
  ];
  const better = data.accuracy.mae < data.baseline_accuracy.mae;
  const note = `Навчання для перевірки: ${data.training_start} — ${data.training_end}. Контрольний період: ${data.test_start} — ${data.test_end}; його значення не використовуються під час прогнозування цього блоку. MAE: ${format(data.accuracy.mae)} ${data.unit}; сезонний наївний метод: ${format(data.baseline_accuracy.mae)} ${data.unit}. Обрана модель ${better ? "має меншу" : "не має меншої"} MAE на цьому інтервалі.`;
  const pagination = usePagination(data.future, JSON.stringify(data));
  return (
    <>
      <Summary
        title="Якість прогнозу на контрольному періоді"
        source={`${data.meta.source} · ${data.meta.location} · перевірка ${data.test_start} — ${data.test_end}`}
      >
        MAE моделі: {format(data.accuracy.mae)} {data.unit}; сезонного наївного
        методу: {format(data.baseline_accuracy.mae)} {data.unit}. Обрана модель{" "}
        {better ? "має меншу" : "не має меншої"} помилку на цій перевірці. Це не
        гарантія майбутньої точності.
      </Summary>
      <KPIs
        items={[
          [`MAE · ${data.unit}`, format(data.accuracy.mae)],
          ["RMSE", `${format(data.accuracy.rmse)} ${data.unit}`],
          [
            "MAE сезонного наївного",
            `${format(data.baseline_accuracy.mae)} ${data.unit}`,
          ],
          ["Перевірочні місяці", String(data.accuracy.n)],
        ]}
      />
      <div className="analysis-report">
        <h3>Часове розділення даних</h3>
        <p>{note}</p>
        <p>
          Метод: окрема лінійна регресія для кожного календарного місяця за
          останніми 20 роками або сезонний наївний прогноз (останній відомий
          однойменний місяць). Після перевірки модель повторно оцінено до{" "}
          {data.final_training_end} для майбутнього горизонту. Це статистичні
          місячні оцінки реаналізу, не оперативний прогноз погоди.
        </p>
        <p>
          {data.interval_note} За недостатньої калібрувальної вибірки межі не
          показуються.
        </p>
      </div>
      <AnalyticalChart
        title="Історичні значення та майбутній прогноз"
        description={`Історія завершується ${data.final_training_end}. Прогноз: ${data.future[0]?.date} — ${data.future.at(-1)?.date}. ${data.meta.location}; ${data.meta.source}. Затінення — емпіричний діапазон, коли доступний.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" minTickGap={50} />
            <YAxis width={55} unit={` ${data.unit}`} />
            <Tooltip
              formatter={(v) =>
                Array.isArray(v)
                  ? `${format(Number(v[0]))} — ${format(Number(v[1]))} ${data.unit}`
                  : `${format(Number(v))} ${data.unit}`
              }
            />
            <Legend />
            <Area
              dataKey="range"
              name="Емпіричний діапазон"
              stroke="none"
              fill="#ddb47c"
              fillOpacity={0.3}
              isAnimationActive={false}
            />
            <Line
              dataKey="actual"
              name="Історичні дані"
              stroke="#37765c"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="predicted"
              name="Майбутня оцінка"
              stroke="#b47b33"
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceLine x={data.final_training_end} />
          </ComposedChart>
        </ResponsiveContainer>
      </AnalyticalChart>
      <AnalyticalChart
        title="Прогноз проти фактичних даних на контрольному періоді"
        description={note}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.validation}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" minTickGap={35} />
            <YAxis width={55} unit={` ${data.unit}`} />
            <Tooltip formatter={(v) => `${format(Number(v))} ${data.unit}`} />
            <Legend />
            <Line
              dataKey="actual"
              name="Фактичні дані"
              stroke="#347459"
              dot={false}
            />
            <Line
              dataKey="predicted"
              name="Обрана модель"
              stroke="#b47d39"
              dot={false}
            />
            <Line
              dataKey="baseline"
              name="Сезонний наївний"
              stroke="#738c9c"
              strokeDasharray="3 3"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </AnalyticalChart>
      <AnalyticalChart
        title="Помилки прогнозу на контрольному періоді"
        description={`Помилка = факт − прогноз. Додатне значення означає недооцінювання моделлю. RMSE = ${format(data.accuracy.rmse)} ${data.unit}; метрики стосуються лише показаного контрольного блоку.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.validation}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" minTickGap={35} />
            <YAxis width={55} unit={` ${data.unit}`} />
            <Tooltip formatter={(v) => `${format(Number(v))} ${data.unit}`} />
            <ReferenceLine y={0} />
            <Bar
              dataKey="error"
              name="Факт − прогноз"
              fill="#7ba18c"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </AnalyticalChart>
      <div className="analysis-table">
        <table>
          <caption className="analysis-insight">
            Майбутні оцінки · {data.unit}
          </caption>
          <thead>
            <tr>
              <th>Місяць</th>
              <th>Прогноз</th>
              <th>Нижня межа</th>
              <th>Верхня межа</th>
              <th>Помилок калібрування</th>
            </tr>
          </thead>
          <tbody>
            {pagination.rows.map((r) => (
              <tr key={r.date}>
                <td>{r.date}</td>
                <td>{format(r.predicted)}</td>
                <td>{format(r.low)}</td>
                <td>{format(r.high)}</td>
                <td>{r.calibration_n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...pagination} />
      <p className="analysis-meta">
        {data.meta.source} · {data.meta.location}. {data.meta.note}
      </p>
    </>
  );
}
