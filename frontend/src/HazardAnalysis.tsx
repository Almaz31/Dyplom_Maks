import Pagination, { usePagination } from "./Pagination";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { UkraineMap } from "./UkraineMap";
import { format } from "./api";
import type { Hazards } from "./analysisTypes";
import AnalyticalChart from "./AnalyticalChart";
import { KPIs } from "./ClimateAnalysis";
import Summary from "./Summary";

export default function HazardAnalysis({
  data,
  regions,
}: {
  data: Hazards;
  regions: Record<string, string>;
}) {
  const [region, setRegion] = useState("UA-46");
  const chosen = data.regions.find((r) => r.code === region);
  const sorted = [...data.regions].sort(
    (a, b) => (b.score ?? -1) - (a.score ?? -1),
  );
  const map = Object.fromEntries(
    data.regions
      .filter((r) => r.score != null)
      .map((r) => [r.code, { value: r.score!, coverage: 100 }]),
  );
  const types = Object.values(
    data.events.reduce<Record<string, { type: string; count: number }>>(
      (acc, e) => {
        acc[e.type] ??= { type: e.type_label, count: 0 };
        acc[e.type].count++;
        return acc;
      },
      {},
    ),
  );
  const pagination = usePagination(sorted, JSON.stringify(data));
  return (
    <>
      <Summary
        title="Історичний індикатор природної небезпеки"
        source={data.source}
      >
        {data.count} унікальних природних подій. Вага частоти —{" "}
        {format(data.weights.frequency * 100)}%, тяжкості —{" "}
        {format(data.weights.severity * 100)}%. {data.unlocated} подій без
        визначеної області. Індекс порівнює лише поточну вибірку, не вимірює
        повний ризик.
      </Summary>
      <p className="analysis-status warning">{data.note}</p>
      <KPIs
        items={[
          [`Природні події`, String(data.count), "Унікальні записи каталогу"],
          [
            "Без визначеної області",
            String(data.unlocated),
            "Не включено в обласний індекс",
          ],
          ["Вибрана область", chosen?.name || "—"],
          [
            "Індикатор області",
            format(chosen?.score),
            "0–100, лише відносно поточної вибірки",
          ],
        ]}
      />
      <div className="analysis-map">
        <div className="panel-heading">
          <h3>Історична небезпека · оберіть область</h3>
        </div>
        <UkraineMap
          values={map}
          selected={region}
          onSelect={setRegion}
          regions={regions}
          unit="балів"
          scale={[0, 100]}
        />
        <p className="analysis-insight">
          Шкала 0–100; відсутній індекс не означає безпеку. Значення області
          також наведено в таблиці. {chosen?.name}: {chosen?.count ?? 0} подій,
          частота {format(chosen?.frequency)} / рік; тяжкість відома для{" "}
          {chosen?.known ?? 0} подій.
        </p>
      </div>
      <div className="analysis-chart-grid">
        <AnalyticalChart
          title="Частота природних катастроф за роками"
          description={`${data.count} унікальних подій за роком початку. Відсутність запису не доводить відсутності катастрофи; часові зміни реєстрації можуть впливати на тренд.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.series}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="year" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar
                dataKey="count"
                name="Події"
                fill="#b68b51"
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </AnalyticalChart>
        <AnalyticalChart
          title="Структура природних подій"
          description="Показано тільки типи, наявні у відфільтрованому каталозі. Кожна подія враховується один раз."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={types} layout="vertical">
              <CartesianGrid horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis dataKey="type" type="category" width={120} />
              <Tooltip />
              <Bar
                dataKey="count"
                name="Події"
                fill="#719a80"
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </AnalyticalChart>
      </div>
      <h3 className="analysis-section-title">Порівняння областей</h3>
      <div className="analysis-table">
        <table>
          <thead>
            <tr>
              <th>Область</th>
              <th>Події</th>
              <th>Частота / рік</th>
              <th>Відомі наслідки</th>
              <th>Середнє загиблих у пов’язаних подіях</th>
              <th>Індикатор</th>
            </tr>
          </thead>
          <tbody>
            {pagination.rows.map((r) => (
              <tr key={r.code}>
                <th>
                  <button
                    className="text-btn"
                    onClick={() => setRegion(r.code)}
                  >
                    {r.name}
                  </button>
                </th>
                <td>{r.count}</td>
                <td>{format(r.frequency)}</td>
                <td>
                  {r.known} / {r.count}
                </td>
                <td>{format(r.severity)}</td>
                <td>{format(r.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...pagination} />
      <p className="analysis-meta">
        {data.source}. Ваги до нормування: частота{" "}
        {format(data.weights.frequency)}, тяжкість{" "}
        {format(data.weights.severity)}. Ваги є дослідницьким вибором, не
        науково валідованою оцінкою. Багатообласні події можуть входити до
        кількох областей, тому обласні підсумки не додаються.
      </p>
    </>
  );
}
