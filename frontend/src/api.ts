export type Metric = 'temperature' | 'precipitation' | 'humidity' | 'wind';
export type Metadata = {regions: Record<string,string>; variables: Record<Metric,{label:string;unit:string}>};
export type Report = {total:number; valid:number; invalid:number; missing:Record<string,number>; regions:string[]; start:string; end:string; variables:Metric[]; errors:{row:number;reason:string}[]};
export type Dataset = {id:string; name:string; source:string; spatial_kind:string; created:string; report:Report};
export type Preview = {token:string;headers:string[];preview:Record<string,string>[];total:number;filename:string;mapping:Record<string,string>};
export type Config = {name:string;source:string;spatial_kind:string;mapping:Record<string,string>;units:Record<string,string>;date_format:string;skip_invalid:boolean};
export type Analysis = {series:{date:string;value:number|null}[];resolution:string;stats:{mean:number|null;min:number|null;max:number|null;sum:number|null;count:number;expected:number;coverage:number}};
export async function api<T>(path:string, options:RequestInit = {}):Promise<T> {
  const response = await fetch('/api'+path, options);
  if (!response.ok) { const error = await response.json().catch(()=>({detail:'Сервер недоступний'})); throw new Error(typeof error.detail === 'string' ? error.detail : 'Перевірте введені параметри'); }
  return response.json();
}
export const post = (data:unknown):RequestInit => ({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
export function downloadBlob(blob:Blob,name:string) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
export const format = (n:number|null|undefined) => n == null ? '—' : new Intl.NumberFormat('uk-UA',{maximumFractionDigits:1}).format(n);
