import {useEffect,useMemo,useState} from 'react';
import {Area,CartesianGrid,ComposedChart,Line,ReferenceLine,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {X,Download,Sparkles} from 'lucide-react';
import {api,post,format,downloadBlob,type Metric} from './api';
import {worldMetrics} from './WorldWeather';
import EuropeMap from './EuropeClimateMap';
import Pagination,{usePagination} from './Pagination';
import {WeatherLegend} from './weatherPalette';
import './Prediction.css';

type Value={year:number;value:number;low:number;high:number;anomaly:number};
type Summary={normal:number;model_label:string;evaluation_mae:number;estimate:Value};
type Model=Summary&{rmse:number;history:{year:number;value:number;anomaly:number;trend:number}[];future:Value[]};
type Point={id:string;iso:string;lat:number;lon:number;country:string;metrics:Record<Metric,Summary>};
type Result={year:number;month:number;cutoff:number;point_count:number;country_count:number;regional:Record<Metric,Model>;points:Point[]};
const months=['Увесь рік','Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const forecastNumber=new Intl.NumberFormat('uk-UA',{minimumFractionDigits:2,maximumFractionDigits:2});
const cache=new Map<string,Promise<unknown>>();
function request<T>(year:number,month:number,method:string,point_id?:string){
 const key=`${year}:${month}:${method}:${point_id||'region'}`;
 let promise=cache.get(key);
 if(!promise){promise=api<T>('/world/prediction',post({year,month,method,cutoff:2018,compact:true,point_id}));cache.set(key,promise);promise.catch(()=>cache.delete(key));if(cache.size>20)cache.delete(cache.keys().next().value!);}
 return promise as Promise<T>;
}

export default function Prediction({onClose}:{onClose:()=>void}){
 const [month,setMonth]=useState(0),[year,setYear]=useState(2026),[metric,setMetric]=useState<Metric>('temperature'),[point,setPoint]=useState('region'),[method,setMethod]=useState('temporal');
 const [run,setRun]=useState<{year:number;month:number;method:string}|null>(null);
 const [result,setResult]=useState<Result|null>(null),[detail,setDetail]=useState<{key:string;metrics:Record<Metric,Model>}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setRun(null);setResult(null);setDetail(null);setBusy(false);setError('');},[year,month,method]);
 useEffect(()=>{if(!run)return;let active=true;setBusy(true);setError('');setResult(null);request<Result>(run.year,run.month,run.method).then(r=>{if(active)setResult(r);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[run]);
 useEffect(()=>{if(!run||point==='region')return;let active=true;setDetail(null);request<{metrics:Record<Metric,Model>}>(run.year,run.month,run.method,point).then(r=>{if(active)setDetail({key:`${run.year}:${run.month}:${run.method}:${point}`,metrics:r.metrics});}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[run,point]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',key);const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=previous;};},[onClose]);
 const chosen=result?.points.find(p=>p.id===point),models=chosen?.metrics||result?.regional;
 const model=point==='region'?result?.regional[metric]:detail?.key===`${year}:${month}:${method}:${point}`?detail.metrics[metric]:undefined;
 const {label,unit}=worldMetrics[metric];
 function chart(anomalies:boolean){
  const chartUnit=anomalies&&metric==='humidity'?'в. п.':unit,offset=anomalies?(model?.normal||0):0;
  const rows=model?[
   ...model.history.map(r=>({year:r.year,actual:r.value-offset,prediction:r.year===2018?r.value-offset:null,range:null})),
   ...model.future.map(r=>({year:r.year,actual:null,prediction:r.value-offset,range:[r.low-offset,r.high-offset]}))
  ]:[];
  return <section className="chart-panel"><div className="panel-heading"><h3>{label} · {anomalies?'аномалії':'історія та оцінка'}</h3></div>{model?<><div className="chart prediction-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows}><CartesianGrid vertical={false}/><XAxis dataKey="year" minTickGap={35}/><YAxis unit={` ${chartUnit}`}/><Tooltip formatter={(v,name)=>[Array.isArray(v)?`${forecastNumber.format(Number(v[0]))}–${forecastNumber.format(Number(v[1]))} ${chartUnit}`:`${forecastNumber.format(Number(v))} ${chartUnit}`,name]}/><Area dataKey="range" name="Діапазон помилок" fill="#e7b878" fillOpacity={.25} stroke="none" isAnimationActive={false}/><Line dataKey="actual" name={anomalies?'Історичні аномалії':'Історія'} stroke="#609b87" dot={false} isAnimationActive={false}/><Line dataKey="prediction" name={anomalies?'Прогноз аномалій':'Прогноз'} stroke="#c18a42" strokeWidth={2} strokeDasharray="5 3" dot={{r:3}} isAnimationActive={false}/><ReferenceLine y={anomalies?0:model.normal} stroke="#718b91" strokeDasharray="3 3"/><ReferenceLine x={2018} stroke="#8f9c92"/></ComposedChart></ResponsiveContainer></div><div className="prediction-method prediction-chart-caption"><span>{chosen?.country||'Європа'} · {model.model_label}</span><span>MAE: {format(model.evaluation_mae)} {unit} · RMSE: {format(model.rmse)} {unit}</span><span>{anomalies?'Норма 1981–2010':'Історія до 2018 · пунктир — прогноз'}</span></div></>:<p role="status" className="analytics-note">Завантаження графіка…</p>}</section>;
 }
 const scale=useMemo<[number,number]>(()=>metric==='temperature'?[-15,35]:metric==='humidity'?[0,100]:metric==='wind'?[0,15]:[0,Math.max(200,...(result?.points.map(p=>p.metrics.precipitation.estimate.high)||[]))],[metric,result]);
 const samples=useMemo(()=>result?.points.map(p=>({id:p.id,iso:p.iso,lat:p.lat,lon:p.lon,label:p.country,value:p.metrics[metric].estimate.value,valueLabel:`${format(p.metrics[metric].estimate.value)} ${unit}`}))||[],[result,metric,unit]);
 const pagination=usePagination(result?.points||[],`${year}:${month}:${metric}`);
 function exportCsv(){if(!result)return;const rows=[['country','latitude','longitude','year','month','metric','estimate','normal_1981_2010','anomaly','low','high','held_out_mae','model','training_end'],...result.points.map(p=>{const m=p.metrics[metric];return [p.country,p.lat,p.lon,year,month,metric,m.estimate.value,m.normal,m.estimate.anomaly,m.estimate.low,m.estimate.high,m.evaluation_mae,m.model_label,2018];})];downloadBlob(new Blob(['\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),`europe-prediction-${year}${month?'-'+String(month).padStart(2,'0'):''}-${metric}.csv`);}
 return <div className="modal-backdrop"><section className="modal prediction-modal" role="dialog" aria-modal="true" aria-labelledby="prediction-title">
  <div className="modal-heading"><div><span className="eyebrow">ЄВРОПА · НАВЧАННЯ 1981–2018</span><h2 id="prediction-title">Передбачення на {year} рік{month?` · ${months[month]}`:''}</h2></div><button className="icon-btn" aria-label="Закрити передбачення" onClick={onClose}><X size={20}/></button></div>
  <div className="prediction-controls">
   <label>Рік<select aria-label="Рік передбачення" value={year} onChange={e=>setYear(+e.target.value)}>{Array.from({length:12},(_,i)=>2019+i).map(y=><option key={y}>{y}</option>)}</select></label>
   <label>Місяць<select aria-label="Місяць передбачення" value={month} onChange={e=>setMonth(+e.target.value)}>{months.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></label>
   <label>Показник<select aria-label="Показник передбачення" value={metric} onChange={e=>setMetric(e.target.value as Metric)}>{Object.entries(worldMetrics).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label>
   <label>Територія<select aria-label="Точка передбачення" value={point} onChange={e=>setPoint(e.target.value)}><option value="region">Європа</option>{result?.points.map(p=><option key={p.id} value={p.id}>{p.country} · {p.lat}°, {p.lon}°</option>)}</select></label>
   <label>Модель<select aria-label="Модель передбачення" value={method} onChange={e=>setMethod(e.target.value)}><option value="temporal">Тренд і коливання</option><option value="trend">Лінійний тренд</option><option value="auto">Автовибір за MAE</option></select></label>
   <button className="secondary" disabled={!result} onClick={exportCsv}><Download size={16}/>CSV оцінок</button>
  </div>
  <div className="prediction-start"><button className="primary prediction-magic" disabled={busy} onClick={()=>setRun({year,month,method})}><Sparkles size={17}/>{busy?'Передбачаємо…':'Почати магію'}</button>{busy&&<span role="status" className="prediction-loading"><i className="prediction-spinner" aria-hidden="true"/>Розраховуємо прогноз…</span>}</div>{error&&<div role="alert" className="error">{error}</div>}
  {result&&models&&<>
   <div className="calculation-grid prediction-values">{Object.entries(worldMetrics).map(([key,v])=>{const m=models[key as Metric];return <article key={key}><span>{v.label}</span><strong>{format(m.estimate.value)}<small>{v.unit}</small></strong><small>{format(m.estimate.low)}–{format(m.estimate.high)} {v.unit}</small></article>;})}</div>
   <div className="prediction-method"><span>Навчання: <b>1981–2018</b></span><span>{result.point_count} точок · {result.country_count} країн і територій</span><span>NASA POWER / MERRA-2</span></div>
   <EuropeMap samples={samples} metric={metric} scale={scale} selected={point} onSelect={setPoint}/>
   <div className="map-legend weather-map-legend"><WeatherLegend metric={metric} scale={scale} unit={unit} label={`${label} · ${month?months[month]+' · ':''}${year}`}/></div>
   {chart(false)}{chart(true)}
   {model&&<section className="chart-panel prediction-year-table"><div className="panel-heading"><h3>Прогноз за роками · {label}</h3></div><div className="table-scroll"><table><thead><tr><th>Рік</th><th>Оцінка, {unit}</th><th>Діапазон, {unit}</th><th>Аномалія, {metric==='humidity'?'в. п.':unit}</th></tr></thead><tbody>{model.future.map(r=><tr key={r.year}><td>{r.year}</td><td>{forecastNumber.format(r.value)}</td><td>{forecastNumber.format(r.low)}–{forecastNumber.format(r.high)}</td><td>{r.anomaly>0?'+':''}{forecastNumber.format(r.anomaly)}</td></tr>)}</tbody></table></div></section>}
   <p className="analytics-note prediction-disclaimer">{month?'Місячні середні':'Річні середні'}; опади — сума. Статистична оцінка, не прогноз щоденної погоди.</p>
   <section className="events-table-panel"><div className="panel-heading"><h3>Оцінки за точками</h3></div><div className="table-scroll"><table><thead><tr><th>Країна / точка</th><th>Оцінка</th><th>Аномалія</th><th>Діапазон</th><th>MAE</th></tr></thead><tbody>{pagination.rows.map(p=>{const m=p.metrics[metric];return <tr key={p.id}><td><button className="text-btn" onClick={()=>setPoint(p.id)}>{p.country} · {p.lat}°, {p.lon}°</button></td><td>{format(m.estimate.value)} {unit}</td><td>{m.estimate.anomaly>0?'+':''}{format(m.estimate.anomaly)}</td><td>{format(m.estimate.low)}–{format(m.estimate.high)}</td><td>{format(m.evaluation_mae)}</td></tr>;})}</tbody></table></div><Pagination {...pagination}/></section>
  </>}
 </section></div>;
}
