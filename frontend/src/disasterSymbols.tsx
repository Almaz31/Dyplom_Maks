import type {CSSProperties} from 'react';

// Shared SVGs keep the map and its legend identical. Unknown imported types
// receive a warning symbol rather than an invented classification.
const symbols:Record<string,{color:string;path:string}>={
 'Flood':{color:'#287ca8',path:'M2 8q3-4 6 0t6 0t6 0M2 14q3-4 6 0t6 0t6 0M2 20q3-4 6 0t6 0t6 0'},
 'Storm':{color:'#6471a6',path:'M2 8h14a3 3 0 1 0-3-3M2 12h18a3 3 0 1 1-3 3M2 17h8a3 3 0 1 1-3 3'},
 'Extreme temperature':{color:'#c44949',path:'M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0M12 8v10M18 5h3M18 9h3'},
 'Drought':{color:'#bb8424',path:'M12 2v2M3 5l2 2M21 5l-2 2M2 12h2M20 12h2M7 13a5 5 0 1 1 10 0M2 17h20M10 17l-2 3 4 2 2-5'},
 'Wildfire':{color:'#d05e2e',path:'M12 2c0 7-7 7-7 13a7 7 0 0 0 14 0c0-4-3-6-3-6s0 5-3 5c-3 0 1-7-1-12Z'},
 'Air':{color:'#3979b7',path:'m2 12 8-2V4l2-2 2 2v6l8 2v3l-8-1v5l3 2H7l3-2v-5l-8 1Z'},
 'Road':{color:'#816448',path:'m4 9 2-5h12l2 5M3 9h18v10H3ZM7 19v3M17 19v3M6 13h2M16 13h2'},
 'Rail':{color:'#596575',path:'M6 3h12v14H6ZM6 10h12M9 6h6M8 14h1M15 14h1M8 17l-4 5M16 17l4 5M6 20h12'},
 'Water':{color:'#297e8a',path:'M9 3h6v5h4v5M5 13V8h4M2 13l10 3 10-3-4 7H6ZM2 22q3-3 6 0t6 0t6 0'},
 'Fire (Industrial)':{color:'#b85438',path:'M3 22V12l6 3v-5l6 4V8h6v14ZM18 5c-4-3 3-3 0-5M6 19h2M12 19h2M18 19h1'},
 'Fire (Miscellaneous)':{color:'#b56b38',path:'M12 2c0 7-7 7-7 13a7 7 0 0 0 14 0c0-4-3-6-3-6s0 5-3 5c-3 0 1-7-1-12ZM10 19h4'},
 'Explosion (Industrial)':{color:'#aa4762',path:'m12 2 2 6 6-4-2 7 5 2-6 3 2 6-7-3-5 3 1-7-6-2 7-3-2-6ZM10 11h4v5h-4Z'},
 'Explosion (Miscellaneous)':{color:'#a0528f',path:'m12 2 2 6 6-4-2 7 5 2-6 3 2 6-7-3-5 3 1-7-6-2 7-3-2-6Z'},
 'Collapse (Industrial)':{color:'#77705e',path:'M3 22V10l6 3V8l5 3 7-5v16ZM13 11l-3 5 5 2-2 4M3 5h5M5 3v4'},
 'Chemical spill':{color:'#7b59a5',path:'M8 2h8M10 2v7L3 20l2 2h14l2-2-7-11V2M7 15h10M10 18h1M15 20h1'},
 'Gas leak':{color:'#579173',path:'M7 17a5 5 0 1 1 0-10 6 6 0 0 1 11 0 5 5 0 1 1 0 10ZM6 21h2M11 20v3M16 21h2'},
};
const fallback={color:'#8a7546',path:'m12 3 10 18H2ZM12 9v5M12 17v1'};
export function disasterSymbol(type:string){return symbols[type]||fallback;}
export function symbolSvg(type:string){return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${disasterSymbol(type).path}"/></svg>`;}
export function DisasterSymbol({type}:{type:string}){return <span className="disaster-symbol" style={{'--symbol-color':disasterSymbol(type).color} as CSSProperties} dangerouslySetInnerHTML={{__html:symbolSvg(type)}}/>;}
export function mapSymbol(type:string,count?:number){
 const badge=document.createElement('div');badge.className='disaster-symbol map-disaster-symbol';badge.style.setProperty('--symbol-color',disasterSymbol(type).color);badge.dataset.disasterType=type;badge.innerHTML=symbolSvg(type);
 if(count!=null){const number=document.createElement('b');number.className='symbol-count';number.textContent=String(count);badge.append(number);}
 return badge;
}
