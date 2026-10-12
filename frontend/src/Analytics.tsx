import {useMemo} from 'react';
import {BarChart,Bar,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer,ReferenceLine} from 'recharts';
import {format} from './api';

export type Observation={x:number;value:number};
export function summarize(rows:Observation[]){
 const n=rows.length;if(!n)return null;
 const sorted=rows.map(r=>r.value).sort((a,b)=>a-b),mean=sorted.reduce((a,b)=>a+b,0)/n;
 const quantile=(p:number)=>{const i=(n-1)*p,lo=Math.floor(i);return sorted[lo]+(sorted[Math.ceil(i)]-sorted[lo])*(i-lo);};
 const mx=rows.reduce((s,r)=>s+r.x,0)/n,sxx=rows.reduce((s,r)=>s+(r.x-mx)**2,0),sxy=rows.reduce((s,r)=>s+(r.x-mx)*(r.value-mean),0);
 const slope=sxx?sxy/sxx:0,variance=rows.reduce((s,r)=>s+(r.value-mean)**2,0),r2=sxx&&variance?sxy*sxy/(sxx*variance):null;
 const min=sorted[0],max=sorted[n-1],step=(max-min||1)/8;
 const bins=Array.from({length:8},(_,i)=>({label:`${format(min+i*step)}…${format(min+(i+1)*step)}`,count:0}));
 rows.forEach(r=>bins[Math.min(7,Math.floor((r.value-min)/step))].count++);
 return {mean,median:quantile(.5),q1:quantile(.25),q3:quantile(.75),sd:Math.sqrt(variance/n),slope,r2,bins,trend:rows.map(r=>({...r,trend:mean+slope*(r.x-mx)}))};
}
export function ChartCard({title,note,children}:{title:string;note:string;children:React.ReactNode}){return <section className="chart-panel analytics-card"><div className="panel-heading"><h3>{title}</h3></div><div className="chart">{children}</div><p className="analytics-note">{note}</p></section>;}
export default function Analytics({rows,unit,stepLabel='рік',trendFactor=10,note=''}:{rows:Observation[];unit:string;stepLabel?:string;trendFactor?:number;note?:string}){
 const s=useMemo(()=>summarize(rows),[rows]);if(!s)return null;
 return <section className="extended-analytics"><div className="section-title"><h2>Статистичний аналіз</h2><span className="tag">{rows.length} значень</span></div><div className="calculation-grid">{[['Медіана',format(s.median),unit],['Стандартне відхилення',format(s.sd),unit],['Міжквартильний розмах',format(s.q3-s.q1),unit],['Лінійний тренд',format(s.slope*trendFactor),`${unit} / ${trendFactor} ${stepLabel}`],['R² тренду',s.r2==null?'—':s.r2.toFixed(3),''],['Середнє',format(s.mean),unit]].map(([label,value,u])=><article key={label}><span>{label}</span><strong>{value}<small>{u}</small></strong></article>)}</div><div className="analytics-grid"><ChartCard title="Розподіл значень" note={`Частоти у 8 рівних інтервалах. σ — стандартне відхилення сукупності. ${note}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={s.bins}><CartesianGrid vertical={false}/><XAxis dataKey="label" interval={1}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="count" name="Кількість" fill="#609b87"/></BarChart></ResponsiveContainer></ChartCard><ChartCard title="Лінійна регресія" note={`Метод найменших квадратів; R² — частка поясненої варіації. Це опис тренду, а не прогноз. ${note}`}><ResponsiveContainer width="100%" height="100%"><LineChart data={s.trend}><CartesianGrid vertical={false}/><XAxis dataKey="x" tickFormatter={v=>format(v)} minTickGap={45}/><YAxis/><Tooltip formatter={v=>`${format(Number(v))} ${unit}`}/><ReferenceLine y={s.mean} stroke="#9caa91" strokeDasharray="3 3"/><Line dataKey="value" name="Спостереження" dot={false} stroke="#a9cbbd" isAnimationActive={false}/><Line dataKey="trend" name="Тренд" dot={false} stroke="#bd8040" strokeWidth={2} isAnimationActive={false}/></LineChart></ResponsiveContainer></ChartCard></div></section>;
}
