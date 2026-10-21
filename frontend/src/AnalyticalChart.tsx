import {useRef,type ReactNode} from 'react';
import {Download} from 'lucide-react';
import {downloadBlob} from './api';

export default function AnalyticalChart({title,description,children}:{title:string;description:string;children:ReactNode}){
 const host=useRef<HTMLElement>(null);
 function exportSvg(){
  const original=host.current?.querySelector('svg.recharts-surface');
  if(!original)return;
  const svg=original.cloneNode(true) as SVGElement;
  const box=original.getBoundingClientRect();
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  svg.setAttribute('width',String(box.width));svg.setAttribute('height',String(box.height));
  svg.setAttribute('style','background:white;font-family:Segoe UI,Arial,sans-serif');
  const desc=document.createElementNS('http://www.w3.org/2000/svg','desc');desc.textContent=title+'. '+description;svg.prepend(desc);
  downloadBlob(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'}),'obrii-chart.svg');
 }
 return <section className="chart-panel analysis-chart" ref={host} aria-label={title}>
  <div className="panel-heading"><h3>{title}</h3><button className="text-btn" onClick={exportSvg} aria-label={`Експорт SVG: ${title}`}><Download size={14}/>SVG</button></div>
  <div className="chart" role="img" aria-label={title+'. '+description}>{children}</div>
  <p className="analysis-insight">{description}</p>
 </section>;
}
