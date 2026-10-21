import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "./api";
import type { Compare } from "./analysisTypes";
import AnalyticalChart from "./AnalyticalChart";
import Summary from "./Summary";

const colors = ["#2e7559", "#be7e3e", "#5988ab", "#93678c"];
export default function RegionComparison({ data }: { data: Compare }) {
  if (!data.common_months)
    return (
      <p className="analysis-empty">
        Для вибраних територій немає спільних повних місяців. Змініть період або
        набір.
      </p>
    );
  const ranked = [...data.locations].sort(
    (a, b) => (b.stats.mean ?? 0) - (a.stats.mean ?? 0),
  );
  const difference = ranked[0].stats.mean! - ranked.at(-1)!.stats.mean!;
  const note = `Порівнюються ${data.common_months} однакових повних календарних місяців з одного джерела. Різниця між найбільшим і найменшим середнім: ${format(difference)} ${data.unit}. Це середні місячні значення (для опадів — середнє місячних сум), не річні суми.`;
  return (
    <>
      <Summary
        title="Порівняння за спільним періодом"
        source={data.locations[0].meta.source}
      >
        {note}
      </Summary>
      <div className="analysis-kpis">
        {data.locations.map((p) => (
          <article key={p.id}>
            <span>{p.meta.location}</span>
            <strong>
              {format(p.stats.mean)} {data.unit}
            </strong>
            <small>
              Медіана: {format(p.stats.median)} · n={p.stats.count}
            </small>
          </article>
        ))}
      </div>
      <AnalyticalChart title="Порівняння місячних рядів" description={note}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.rows}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" minTickGap={45} />
            <YAxis width={55} unit={` ${data.unit}`} />
            <Tooltip formatter={(v) => `${format(Number(v))} ${data.unit}`} />
            <Legend />
            {data.locations.map((p, i) => (
              <Line
                dataKey={p.id}
                key={p.id}
                name={p.meta.location}
                stroke={colors[i]}
                strokeDasharray={i % 2 ? "5 3" : undefined}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </AnalyticalChart>
      <div className="analysis-table">
        <table>
          <thead>
            <tr>
              <th>Територія</th>
              <th>Середнє, {data.unit}</th>
              <th>Мінімум місяця</th>
              <th>Максимум місяця</th>
              <th>Тренд за 10 років</th>
              <th>Спільних місяців</th>
            </tr>
          </thead>
          <tbody>
            {data.locations.map((p) => (
              <tr key={p.id}>
                <th>{p.meta.location}</th>
                <td>{format(p.stats.mean)}</td>
                <td>{format(p.stats.min)}</td>
                <td>{format(p.stats.max)}</td>
                <td>
                  {format(p.trend.slope == null ? null : p.trend.slope * 10)}
                </td>
                <td>{p.stats.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="analysis-meta">
        {data.locations[0].meta.source}. Сезонний склад для всіх територій
        однаковий. Тренд місячних значень описовий; за короткого періоду або
        неповного сезонного складу він може бути нестійким. Порівняння аномалій
        доступне через кліматичний розділ для тієї самої бази.
      </p>
    </>
  );
}
