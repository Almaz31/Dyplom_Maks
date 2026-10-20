import {useEffect,useMemo,useRef,useState} from 'react';
import L from 'leaflet';
import type {FeatureCollection,Polygon,MultiPolygon} from 'geojson';
import type {Metric} from './api';
import {weatherColor} from './weatherPalette';

export type EuropeSample={id:string;iso:string;lat:number;lon:number;label:string;value:number;valueLabel:string};
const bounds=L.latLngBounds([34,-26],[81,60]),view=L.latLngBounds([34,-25],[72,50]);
const largeCountries=new Set(['RUS','UKR','FRA','ESP','SWE','NOR','FIN','DEU','POL','ITA']);
export function countryMarkers(samples:EuropeSample[]){
 const groups=new Map<string,EuropeSample[]>();
 for(const p of samples){const group=groups.get(p.iso)||[];group.push(p);groups.set(p.iso,group);}
 return [...groups.values()].flatMap(group=>{
  const lat=group.reduce((v,p)=>v+p.lat,0)/group.length,lon=group.reduce((v,p)=>v+p.lon,0)/group.length;
  const distance=(a:EuropeSample,b:{lat:number;lon:number})=>(a.lat-b.lat)**2+((a.lon-b.lon)*Math.cos(lat*Math.PI/180))**2;
  const first=[...group].sort((a,b)=>distance(a,{lat,lon})-distance(b,{lat,lon}))[0];
  if(!largeCountries.has(first.iso)||group.length<2)return [first];
  const second=group.filter(p=>p.id!==first.id).sort((a,b)=>distance(b,first)-distance(a,first))[0];
  return [first,second];
 });
}

function raster(data:FeatureCollection<Polygon|MultiPolygon>,samples:EuropeSample[],metric:Metric,scale:[number,number]){
 const width=180,height=220,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d')!,mercator=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
 const north=mercator(81),south=mercator(34),project=([lon,lat]:number[])=>[(lon+26)/86*width,(north-mercator(lat))/(north-south)*height];
 ctx.beginPath();
 for(const f of data.features){const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const polygon of polygons)for(const ring of polygon){ring.forEach((p,i)=>{const [x,y]=project(p);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.closePath();}
 }
 ctx.clip('evenodd');
 for(let y=0;y<height;y++){
  const lat=(2*Math.atan(Math.exp(north-(y+.5)/height*(north-south)))-Math.PI/2)*180/Math.PI,c=Math.cos(lat*Math.PI/180);
  for(let x=0;x<width;x++){
   const lon=-26+(x+.5)/width*86,nearest:{d:number;v:number}[]=[];
   for(const p of samples){const d=(lat-p.lat)**2+((lon-p.lon)*c)**2;
    if(nearest.length===6&&d>=nearest[5].d)continue;
    nearest.push({d,v:p.value});nearest.sort((a,b)=>a.d-b.d);if(nearest.length>6)nearest.pop();
   }
   if(!nearest.length||nearest[0].d>36)continue;
   let weighted=0,total=0;for(const p of nearest){const w=1/Math.max(.001,p.d);weighted+=p.v*w;total+=w;}
   ctx.fillStyle=weatherColor(metric,weighted/total,scale);ctx.fillRect(x,y,1,1);
  }
 }
 return canvas.toDataURL();
}

export default function EuropeClimateMap({samples,metric,scale,selected,onSelect}:{samples:EuropeSample[];metric:Metric;scale:[number,number];selected:string;onSelect:(id:string)=>void}){
 const node=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),points=useRef<L.LayerGroup|null>(null),image=useRef<L.ImageOverlay|null>(null),current=useRef({samples,onSelect});
 current.current={samples,onSelect};const [error,setError]=useState(''),[geometry,setGeometry]=useState<FeatureCollection<Polygon|MultiPolygon>|null>(null);
 const markers=useMemo(()=>{
  const representatives=countryMarkers(samples),chosen=samples.find(p=>p.id===selected);
  if(chosen&&!representatives.some(p=>p.id===chosen.id)){
   const nearest=representatives.filter(p=>p.iso===chosen.iso).sort((a,b)=>(a.lat-chosen.lat)**2+(a.lon-chosen.lon)**2-((b.lat-chosen.lat)**2+(b.lon-chosen.lon)**2))[0];
   if(nearest)representatives[representatives.indexOf(nearest)]=chosen;
  }
  return representatives;
 },[samples,selected]);
 useEffect(()=>{if(!node.current)return;
  const m=L.map(node.current,{zoomControl:false,scrollWheelZoom:true,minZoom:2,maxZoom:8,maxBounds:[[32,-29],[82,63]],maxBoundsViscosity:1,zoomSnap:.1});map.current=m;
  m.createPane('climate');m.getPane('climate')!.style.zIndex='350';m.getPane('climate')!.style.pointerEvents='none';
  m.createPane('selection');m.getPane('selection')!.style.zIndex='450';
  L.control.zoom({position:'bottomright'}).addTo(m);m.fitBounds(view,{padding:[12,12]});m.setMinZoom(m.getZoom());m.attributionControl.addAttribution('Natural Earth · NASA POWER · інтерполяція IDW');points.current=L.layerGroup().addTo(m);
  const c=new AbortController();fetch('/europe-countries.geojson',{signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then((data:FeatureCollection<Polygon|MultiPolygon>)=>{
   setGeometry(data);L.geoJSON(data,{style:{fillColor:'#dfe9d9',fillOpacity:.05,color:'#526d65',weight:1},onEachFeature:(f,l)=>{
    const tip=document.createElement('div');tip.textContent=f.properties?.name||'';l.bindTooltip(tip,{sticky:true});
    l.on('click',(e:L.LeafletMouseEvent)=>{const group=current.current.samples.filter(p=>p.iso===f.properties?.id).sort((a,b)=>(a.lat-e.latlng.lat)**2+(a.lon-e.latlng.lng)**2-((b.lat-e.latlng.lat)**2+(b.lon-e.latlng.lng)**2));if(group[0])current.current.onSelect(group[0].id);});
   }}).addTo(m);
  }).catch(e=>{if(e.name!=='AbortError')setError('Не вдалося завантажити контури Європи');});
  const resize=new ResizeObserver(()=>m.invalidateSize());resize.observe(node.current);
  return()=>{c.abort();resize.disconnect();m.remove();map.current=null;points.current=null;image.current=null;};
 },[]);
 useEffect(()=>{if(!geometry||!map.current)return;const url=raster(geometry,samples,metric,scale);
  if(image.current)image.current.setUrl(url);else image.current=L.imageOverlay(url,bounds,{pane:'climate',opacity:.92,className:'prediction-gradient'}).addTo(map.current);
 },[geometry,samples,metric,scale]);
 useEffect(()=>{if(!points.current)return;points.current.clearLayers();
  for(const p of markers){const active=p.id===selected,marker=L.circleMarker([p.lat,p.lon],{pane:'selection',radius:active?7:4,color:active?'#203c32':'#fff',weight:active?3:1.5,fillColor:'#334a40',fillOpacity:1,className:`prediction-point country-${p.iso}`});
   const tip=document.createElement('div');tip.textContent=`${p.label} · ${p.lat}°, ${p.lon}° · ${p.valueLabel}`;marker.bindTooltip(tip,{className:'map-tooltip'});marker.on('click',()=>current.current.onSelect(p.id));marker.addTo(points.current);
  }
 },[markers,selected]);
 return <div className="map-host prediction-europe-map"><div className="leaflet-map" ref={node} role="region" aria-label="Карта Європи з передбаченнями"/>{error&&<p className="map-error">{error}</p>}<button className="map-reset" onClick={()=>map.current?.fitBounds(view,{padding:[12,12]})}>Вся Європа</button></div>;
}
