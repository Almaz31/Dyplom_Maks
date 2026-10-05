import type {Metric} from './api';

type Stop={at:number;color:string};
export const weatherPalettes:Record<Metric,Stop[]>={
 temperature:[{at:0,color:'#2454b8'},{at:.2,color:'#3ea6d5'},{at:.5,color:'#54b66a'},{at:.8,color:'#f5a13b'},{at:1,color:'#d83335'}],
 precipitation:[{at:0,color:'#e1f3f8'},{at:.25,color:'#91d1e0'},{at:.5,color:'#3f9fc8'},{at:.75,color:'#3564b8'},{at:1,color:'#443189'}],
 humidity:[{at:0,color:'#e78a38'},{at:.25,color:'#e8cc6a'},{at:.5,color:'#69b883'},{at:.75,color:'#3ea9b8'},{at:1,color:'#2858b6'}],
 wind:[{at:0,color:'#b7ddbf'},{at:.25,color:'#63b890'},{at:.5,color:'#e3cd59'},{at:.75,color:'#f19a3b'},{at:1,color:'#ce3b42'}],
};
export function weatherColor(metric:Metric,value:number,scale:[number,number]){
 const t=Math.min(1,Math.max(0,(value-scale[0])/(scale[1]-scale[0]||1)));
 const stops=weatherPalettes[metric];const right=stops.findIndex(s=>s.at>=t);
 if(right<=0)return stops[0].color;
 const a=stops[right-1],b=stops[right],fraction=(t-a.at)/(b.at-a.at);
 const rgb=[1,3,5].map(offset=>Math.round(parseInt(a.color.slice(offset,offset+2),16)*(1-fraction)+parseInt(b.color.slice(offset,offset+2),16)*fraction));
 return `rgb(${rgb.join(',')})`;
}
export function WeatherLegend({metric,scale,unit,label}:{metric:Metric;scale:[number,number];unit:string;label:string}){
 const stops=weatherPalettes[metric];
 return <div className="weather-color-legend" aria-label="Погодна колірна шкала" data-metric={metric}>
  <span>{label}, {unit}</span>
  <div className="weather-gradient" style={{background:`linear-gradient(90deg,${stops.map(s=>`${s.color} ${s.at*100}%`).join(',')})`}}/>
  <div className="weather-scale-ticks">{stops.map((s,i)=><span key={s.at} style={{left:`${s.at*100}%`}}>{i===0?'≤ ':i===stops.length-1?'≥ ':''}{Number((scale[0]+s.at*(scale[1]-scale[0])).toFixed(1))}</span>)}</div>
 </div>;
}
