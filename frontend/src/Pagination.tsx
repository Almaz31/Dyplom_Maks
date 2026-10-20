import {useEffect,useState} from 'react';

export function usePagination<T>(items:T[],resetKey:string){
 const [state,setState]=useState({key:resetKey,page:1,size:10});
 useEffect(()=>setState(old=>old.key===resetKey?old:{...old,key:resetKey,page:1}),[resetKey]);
 const total=items.length,pages=Math.max(1,Math.ceil(total/state.size));
 const page=state.key===resetKey?Math.min(state.page,pages):1;
 const offset=(page-1)*state.size;
 return {rows:items.slice(offset,offset+state.size),total,pages,page,size:state.size,
  setPage:(next:number)=>setState({key:resetKey,page:Math.max(1,Math.min(pages,next)),size:state.size}),
  setSize:(size:number)=>setState({key:resetKey,page:1,size})};
}
type Props={total:number;pages:number;page:number;size:number;setPage:(page:number)=>void;setSize:(size:number)=>void};
export default function Pagination({total,pages,page,size,setPage,setSize}:Props){
 const numbers=Array.from(new Set([1,...Array.from({length:5},(_,i)=>page+i-2).filter(n=>n>0&&n<=pages),pages])).sort((a,b)=>a-b);
 return <div className="pagination"><span className="pagination-summary" role="status">{total?`${(page-1)*size+1}–${Math.min(page*size,total)}`:'0'} із {total} записів</span><label>Рядків на сторінці<select aria-label="Рядків на сторінці" value={size} onChange={e=>setSize(+e.target.value)}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select></label><nav aria-label="Сторінки списку подій"><button aria-label="Попередня сторінка" disabled={page===1} onClick={()=>setPage(page-1)}>‹</button>{numbers.map((n,i)=><span key={n}>{i>0&&n-numbers[i-1]>1&&<span className="pagination-gap">…</span>}<button aria-label={`Сторінка ${n}`} aria-current={page===n?'page':undefined} className={page===n?'current':''} onClick={()=>setPage(n)}>{n}</button></span>)}<button aria-label="Наступна сторінка" disabled={page===pages} onClick={()=>setPage(page+1)}>›</button></nav></div>;
}
