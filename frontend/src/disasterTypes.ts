export type DisasterEvent = {
 id:string;type:string;type_label:string;group:string;name:string;location:string;regions:string[];
 region_basis:string;latitude:number|null;longitude:number|null;start:string;end:string;year:number;
 date_precision:'day'|'month'|'year';deaths:number|null;affected:number|null;damage_usd:number|null;damage_adjusted_usd:number|null;source:string;
};
export type DisasterCatalog = {id:string;name:string;report:{count:number;start:string;end:string;region_count:number;unlocated:number;incomplete_dates:number;types:Record<string,number>;filename:string}};
export type Impact = {value:number|null;known:number;unknown:number};
export type DisasterAnalysis = {events:DisasterEvent[];map:Record<string,{value:number;coverage:number;event_ids:string[]}>;
 series:{year:string;count:number;deaths:number|null}[];types:{type:string;label:string;count:number}[];
 stats:{count:number;deaths:Impact;affected:Impact;damage:Impact;located:number;unlocated:number;incomplete_dates:number};source:string};
export const eventDate=(e:DisasterEvent)=>e.date_precision==='year'?`${e.year} · рік`:e.date_precision==='month'?`${e.start.slice(0,7)} · місяць`:`${e.start}${e.end!==e.start?' — '+e.end:''}`;
