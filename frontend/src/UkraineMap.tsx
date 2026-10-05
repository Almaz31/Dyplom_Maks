import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {format,type Metric} from './api';
import {weatherColor} from './weatherPalette';
import {mapSymbol} from './disasterSymbols';
import type {DisasterEvent} from './disasterTypes';
export type MapValues = Record<string,{value:number;coverage:number}>;
export function UkraineMap({values,selected,onSelect,regions,unit,scale,events=[],disasterMode=false,metric='temperature',onEventSelect}:{values:MapValues;selected:string;onSelect:(id:string)=>void;regions:Record<string,string>;unit:string;scale:[number,number];events?:DisasterEvent[];disasterMode?:boolean;metric?:Metric;onEventSelect?:(event:DisasterEvent)=>void}) {
  const node=useRef<HTMLDivElement>(null); const layer=useRef<L.GeoJSON|null>(null); const map=useRef<L.Map|null>(null); const [error,setError]=useState('');
  const markers=useRef<L.LayerGroup|null>(null);
  const current=useRef({values,selected,onSelect,regions,unit,scale,events,disasterMode,metric,onEventSelect});current.current={values,selected,onSelect,regions,unit,scale,events,disasterMode,metric,onEventSelect};
  function update(){layer.current?.eachLayer(raw=>{const part=raw as L.Path & {feature:any};const code=part.feature.properties.shapeISO;part.options.className='weather-region';const c=current.current;const v=c.values[code];const range=c.scale[1]-c.scale[0];const bin=v?Math.min(5,Math.max(0,Math.floor((v.value-c.scale[0])/(range||1)*5))):0;
    const palette=c.disasterMode?['#f7eee0','#efdab7','#e4bd83','#dba354','#bb7f32','#8c5920']:[];
    part.setStyle({fillColor:v?(c.disasterMode?palette[bin]:weatherColor(c.metric,v.value,c.scale)):'#e7e9e5',fillOpacity:v?.9:.5,color:c.selected===code?'#d48b3a':'#fff',weight:c.selected===code?3:1.4});
    const involved=c.events.filter(e=>e.regions.includes(code));
    const tip=document.createElement('div');tip.textContent=`${c.regions[code]||code} · ${v?format(v.value)+' '+c.unit:'Немає даних'}${involved.length&&!c.disasterMode?' · '+involved.length+' катастроф':''}`;part.unbindTooltip();part.bindTooltip(tip,{sticky:true,className:'map-tooltip'});
  });
    markers.current?.clearLayers();
    if(layer.current&&markers.current){const c=current.current;
      layer.current.eachLayer(raw=>{const part=raw as L.Polygon & {feature:any};const code=part.feature.properties.shapeISO;const involved=c.events.filter(e=>e.regions.includes(code));if(!involved.length)return;
        if(c.disasterMode){
          const types=[...new Set(involved.map(e=>e.type))].sort();
          const columns=Math.min(3,types.length),rows=Math.ceil(types.length/columns);
          types.forEach((type,index)=>{
            const matching=involved.filter(e=>e.type===type);
            const dx=(index%columns-(columns-1)/2)*34,dy=(Math.floor(index/columns)-(rows-1)/2)*34;
            const marker=L.marker(part.getBounds().getCenter(),{icon:L.divIcon({className:'disaster-region-marker disaster-type-marker',html:mapSymbol(type,matching.length),iconSize:[30,30],iconAnchor:[15-dx,15-dy]})});
            const tip=document.createElement('div');tip.textContent=`${c.regions[code]} · ${matching[0].type_label}: ${matching.length}. Умовна позначка в центрі області, не точне місце події.`;
            marker.bindTooltip(tip,{className:'map-tooltip'});marker.on('click',()=>c.onEventSelect?.(matching[0]));marker.addTo(markers.current!);
          });
          return;
        }
        const marker=L.marker(part.getBounds().getCenter(),{icon:L.divIcon({className:'disaster-region-marker',html:`<span>${involved.length}</span>`,iconSize:[25,25],iconAnchor:[12,12]})});
        const tip=document.createElement('div');tip.textContent=`${c.regions[code]}: ${involved.length} подій. Позначка в центрі області, а не місце катастрофи.`;marker.bindTooltip(tip,{className:'map-tooltip'});marker.on('click',()=>c.onSelect(code));marker.addTo(markers.current!);
      });
      for(const event of c.events){if(event.latitude==null||event.longitude==null)continue;const marker=c.disasterMode?L.marker([event.latitude,event.longitude],{icon:L.divIcon({className:'disaster-coordinate-marker',html:mapSymbol(event.type),iconSize:[30,30],iconAnchor:[15,15]})}):L.circleMarker([event.latitude,event.longitude],{radius:5,color:'#9d4f23',fillColor:'#e6a357',fillOpacity:1,weight:2});const tip=document.createElement('div');tip.textContent=`${event.type_label} · ${event.id} · координати з EM-DAT`;marker.bindTooltip(tip,{className:'map-tooltip'});marker.on('click',()=>c.onEventSelect?.(event));marker.addTo(markers.current);}
    }
  }
  useEffect(()=>{if(!node.current)return; const m=L.map(node.current,{zoomControl:false,attributionControl:true,scrollWheelZoom:false,minZoom:4,maxZoom:9,zoomSnap:.1});map.current=m;markers.current=L.layerGroup().addTo(m);L.control.zoom({position:'bottomright'}).addTo(m);m.attributionControl.addAttribution('<a href="https://www.geoboundaries.org/">geoBoundaries</a> · OpenStreetMap / Wambacher · ODbL');const controller=new AbortController();
    fetch('/ukraine.geojson',{signal:controller.signal}).then(r=>r.json()).then(data=>{layer.current=L.geoJSON(data,{style:{className:'weather-region'},onEachFeature:(f,l)=>{l.on('click',()=>current.current.onSelect(f.properties.shapeISO));}}).addTo(m);m.fitBounds(layer.current.getBounds(),{padding:[20,20]});update();}).catch(e=>{if(e.name!=='AbortError')setError('Не вдалося завантажити межі областей');});
    const resize=new ResizeObserver(()=>m.invalidateSize());resize.observe(node.current);return()=>{controller.abort();resize.disconnect();m.remove();map.current=null;layer.current=null;markers.current=null;};
  },[]);
  useEffect(update,[values,selected,unit,regions,scale,events,disasterMode,metric]);
  return <div className="map-host"><div className="leaflet-map" ref={node}/>{error&&<div className="map-error">{error}</div>}<button className="map-reset" onClick={()=>{if(layer.current)map.current?.fitBounds(layer.current.getBounds(),{padding:[20,20]});}}>Вся Україна</button></div>;
}
