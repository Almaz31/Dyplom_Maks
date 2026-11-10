import {useEffect, useState} from 'react';
import {LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, ReferenceLine} from 'recharts';
import {api, post, format, downloadBlob, type Metric} from './api';
import {metrics, coefficient} from './analysisTypes';
import {UkraineMap} from './UkraineMap';
import TerritorySearch from './TerritorySearch';
import {ChartCard} from './Analytics';
import {useQueryState, updateQuery} from './navigation';

type Row={date:string;value:number|null;trend:number|null;seasonal:number|null;cycle:number|null;residual:number|null};
type Result={rows:Row[];per_decade:number|null;residual_sd:number|null;complete:number;total:number;
 residual_acf:{lag:number;value:number|null;pairs:number}[];
 monthly:{month:number;count:number;mean:number|null;early:number|null;late:number|null;change:number|null;per_decade:number|null}[];
 early_period:number[];late_period:number[];meta:{location:string;spatial_kind:string;latitude:number;longitude:number};
 filters:{region:string;metric:Metric;start:string;end:string}};
const monthNames=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
export default function TimeSeriesAnalysis(){
 const [options,setOptions]=useState<{regions:Record<string,string>;start:string;end:string}|null>(null);
 const [region,setRegion]=useQueryState('ts_region',()=>new URLSearchParams(location.search).get('ts_region')||'UA-46');
 const [metricChoice,setMetric]=useQueryState('ts_metric',()=>new URLSearchParams(location.search).get('ts_metric')||'temperature');
 const metric:Metric=Object.hasOwn(metrics,metricChoice)?metricChoice as Metric:'temperature';
 const [start,setStart]=useQueryState('ts_start',()=>new URLSearchParams(location.search).get('ts_start')||'1960-01');
 const [end,setEnd]=useQueryState('ts_end',()=>new URLSearchParams(location.search).get('ts_end')||'2025-12');
 const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();api<typeof options>('/time-series/options',{signal:c.signal}).then(setOptions).catch(e=>{if(e.name!=='AbortError')setError(e.message)});return()=>c.abort()},[]);
 const key=JSON.stringify({region,metric,start,end});
 useEffect(()=>updateQuery({ts_region:region,ts_metric:metric,ts_start:start,ts_end:end}),[region,metric,start,end]);
 useEffect(()=>{setResult(null);setError('');setBusy(false)},[key]);
 const [request,setRequest]=useState({key:'',nonce:0});
 useEffect(()=>{
  if(!request.nonce || request.key!==key)return;
  const c=new AbortController();setBusy(true);setResult(null);setError('');
  api<Result>('/time-series/report',{...post({region,metric,start,end}),signal:c.signal}).then(setResult)
   .catch(e=>{if(e.name!=='AbortError')setError(e.message)}).finally(()=>{if(!c.signal.aborted)setBusy(false)});
  return()=>c.abort();
 // A changed selection cancels the old request; calculation requires the button.
 },[request,key]);
 const unit=metrics[metric].unit;
 function exportCsv(){if(!result)return;const fields=['date','value','trend','seasonal','cycle','residual'] as const;
  downloadBlob(new Blob(['\uFEFF'+[fields.join(','),...result.rows.map(r=>fields.map(k=>r[k]??'').join(','))].join('\n')],{type:'text/csv;charset=utf-8'}),`decomposition-${region}-${metric}.csv`)}
 return <section className="time-series-analysis">
  <h2>Тренд і складові часового ряду</h2>
  <p className="analysis-insight">Температура, опади та інші показники по областях України від 1960 року. Виберіть область на карті й натисніть «Розрахувати розклад».</p>
  <div className="disaster-filters">
   <label>Область<TerritorySearch label="Область часового ряду" options={Object.entries(options?.regions||{}).map(([id,name])=>({id,name}))} value={region} onChange={setRegion}/></label>
   <label>Показник<select aria-label="Показник часового ряду" value={metric} onChange={e=>setMetric(e.target.value as Metric)}>{Object.entries(metrics).map(([id,m])=><option key={id} value={id}>{m.label}</option>)}</select></label>
   <label>Від<input aria-label="Початок часового ряду" type="month" min="1960-01" max={end} value={start} onChange={e=>setStart(e.target.value)}/></label>
   <label>До<input aria-label="Кінець часового ряду" type="month" min={start} max={options?.end} value={end} onChange={e=>setEnd(e.target.value)}/></label>
   <button className="primary" disabled={busy||!options} onClick={()=>setRequest(r=>({key,nonce:r.nonce+1}))}>Розрахувати розклад</button>
  </div>
  {options&&<UkraineMap values={{}} selected={region} onSelect={setRegion} regions={options.regions} unit={unit} scale={[0,1]} metric={metric}/>}
  {busy&&<p role="status" className="analysis-status">Завантажуємо історію ERA5 та обчислюємо складові. Перше завантаження області може тривати кілька хвилин; десятиліття кешуються.</p>}
  {error&&<div role="alert" className="error"><p>{error}</p><button className="secondary" onClick={()=>{setStart('2000-01');setEnd('2025-12')}}>Обрати локальний період 2000–2025</button></div>}
  {result&&<>
   <div className="analysis-report"><h3>{result.meta.location} · {metrics[metric].label} · {start} — {end}</h3>
    <p>Тенденція: {format(result.per_decade)} {unit} за десятиліття. {result.per_decade==null?'Недостатньо даних.':result.per_decade>0?'Зростання.':result.per_decade<0?'Зниження.':'Сталий рівень.'} Це описова оцінка, без перевірки статистичної значущості.</p>
    <p>{result.complete} із {result.total} повних місяців. Стандартне відхилення залишку: {format(result.residual_sd)} {unit}.</p>
    <p>ERA5 / Open-Meteo, CC BY 4.0. {result.meta.spatial_kind}: {result.meta.latitude}°, {result.meta.longitude}°. Температура — середня за місяць; опади — сума за місяць.</p>
   </div>
   <button className="secondary" onClick={exportCsv}>Завантажити складові CSV</button>
   {([['value','Початковий ряд і тренд'],['seasonal','Сезонна компонента · період 12 місяців'],['cycle','Циклічна компонента'],['residual','Випадкова компонента · залишкові коливання']] as const).map(([field,title])=><ChartCard key={field} title={title} note={field==='cycle'?'Відхилення згладженого ряду від лінійного тренду; не доказ регулярного природного циклу.':field==='residual'?'Залишок обчислено з даних; випадкові числа не додаються. Перші й останні 6 місяців не мають центрованого згладжування.':'Адитивна модель Y = T + S + C + E.'}>
    <ResponsiveContainer width="100%" height="100%"><LineChart data={result.rows}><CartesianGrid vertical={false}/><XAxis dataKey="date" minTickGap={60}/><YAxis width={65}/><Tooltip formatter={v=>`${format(Number(v))} ${unit}`}/><Legend/><Line dataKey={field} name={title} stroke="#488576" dot={false} connectNulls={false} isAnimationActive={false}/>{field==='value'&&<Line dataKey="trend" name="Лінійний тренд" stroke="#c18345" strokeWidth={3} dot={false} isAnimationActive={false}/>}</LineChart></ResponsiveContainer>
   </ChartCard>)}
   <ChartCard title="Автокореляція випадкової компоненти" note="Лаги 1–24 місяці. Діагностика залишкової залежності за поняттями §4.1 Айвазяна та Фантацціні (2014). Графік не є формальним тестом білого шуму; пропуски не стискають календарну вісь.">
    <ResponsiveContainer width="100%" height="100%"><BarChart data={result.residual_acf}><CartesianGrid vertical={false}/><XAxis dataKey="lag"/><YAxis domain={[-1,1]}/><Tooltip formatter={v=>coefficient(Number(v))}/><ReferenceLine y={0}/><Bar dataKey="value" name="Автокореляція" fill="#83a89a"/></BarChart></ResponsiveContainer>
   </ChartCard>
   <ChartCard title="Порівняння календарних місяців" note={`Середні місячні значення: ${result.early_period.join('–')} та ${result.late_period.join('–')}. Періоди не перекриваються; для опадів порівнюються середні місячні суми.`}>
    <ResponsiveContainer width="100%" height="100%"><BarChart data={result.monthly.map(r=>({...r,name:monthNames[r.month-1]}))}><CartesianGrid vertical={false}/><XAxis dataKey="name" tickFormatter={v=>v.slice(0,3)}/><YAxis/><Tooltip/><Legend/><Bar dataKey="early" name={result.early_period.join('–')} fill="#83a89a"/><Bar dataKey="late" name={result.late_period.join('–')} fill="#c99758"/></BarChart></ResponsiveContainer>
   </ChartCard>
   <div className="analysis-table"><table><caption>Порівняння місяців · {unit}; тенденція окремо для кожного календарного місяця</caption><thead><tr><th>Місяць</th><th>Кількість років</th><th>Середнє</th><th>Ранній період</th><th>Пізній період</th><th>Різниця</th><th>За десятиліття</th></tr></thead><tbody>{result.monthly.map(r=><tr key={r.month}><th>{monthNames[r.month-1]}</th><td>{r.count}</td><td>{format(r.mean)}</td><td>{format(r.early)}</td><td>{format(r.late)}</td><td>{format(r.change)}</td><td>{format(r.per_decade)}</td></tr>)}</tbody></table></div>
  </>}
 </section>
}
