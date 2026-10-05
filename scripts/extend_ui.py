"""Apply scoped integration edits to the initial prototype."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'frontend/src/App.tsx'
source=p.read_text(encoding='utf-8')
def replace(old,new):
    global source
    if old not in source:raise RuntimeError('Missing integration anchor: '+old[:100])
    source=source.replace(old,new,1)

replace("import ImportWizard from './ImportWizard';", """import ImportWizard from './ImportWizard';
import DisastersPage from './DisastersPage';
import DisasterImport from './DisasterImport';
import DisasterDetail from './DisasterDetail';
import {type DisasterCatalog,type DisasterAnalysis,type DisasterEvent} from './disasterTypes';""")
replace(" const [mapMode,setMapMode]", """ const [catalogs,setCatalogs]=useState<DisasterCatalog[]>([]),[emdatModal,setEmdatModal]=useState(false),[showEvents,setShowEvents]=useState(true);
 const [overlay,setOverlay]=useState<DisasterAnalysis|null>(null),[pickedEvent,setPickedEvent]=useState<DisasterEvent|null>(null);
 async function refreshCatalogs(){setCatalogs(await api<DisasterCatalog[]>('/disaster-datasets'));}
 const [mapMode,setMapMode]""")
replace("Promise.all([api<Metadata>('/metadata'),refresh()])", "Promise.all([api<Metadata>('/metadata'),refresh(),refreshCatalogs()])")
replace(" async function sample(){", """ useEffect(()=>{if(!catalogs[0]||!start||!end||!cursor||!showEvents){setOverlay(null);return;}const controller=new AbortController();setOverlay(null);setPickedEvent(null);
   const a=mapMode==='frame'?[cursor+'-01',start].sort().at(-1)!:start;
   const b=mapMode==='frame'?[monthEnd(cursor),end].sort()[0]:end;
   const timer=setTimeout(()=>api<DisasterAnalysis>(`/disaster-datasets/${catalogs[0].id}/analysis?`+new URLSearchParams({start:a,end:b}),{signal:controller.signal}).then(setOverlay).catch(e=>{if(e.name!=='AbortError')setError(e.message);}),100);
   return()=>{clearTimeout(timer);controller.abort();};
 },[catalogs,start,end,cursor,mapMode,showEvents]);
 async function sample(){""")
replace("<button className={page==='method'?'nav-active':''}", "<button className={page==='disasters'?'nav-active':''} onClick={()=>setPage('disasters')}><FlaskConical size={17}/>Катастрофи<span className=\"nav-count\">{catalogs.reduce((sum,c)=>sum+c.report.count,0)}</span></button><button className={page==='method'?'nav-active':''}")
replace("page==='datasets'?'Простір ваших даних.':'Від даних до висновків.'", "page==='datasets'?'Простір ваших даних.':page==='disasters'?'Катастрофи: місце, час, наслідки.':'Від даних до висновків.'")
replace("page==='datasets'?'Завантажуйте, перевіряйте та досліджуйте власні набори.':'Походження даних, правила розрахунків і межі першої версії.'", "page==='datasets'?'Завантажуйте, перевіряйте та досліджуйте власні набори.':page==='disasters'?'Карта реальних подій, часовий ряд і відомі наслідки з вашого EM-DAT.':'Походження даних, правила розрахунків і межі першої версії.'")
replace('<button className="primary" onClick={()=>setModal(true)}><Plus size={18}/>Завантажити CSV</button></div>', '<div className="button-row page-actions"><button className="secondary" onClick={()=>setEmdatModal(true)}><Upload size={17}/>EM-DAT Excel</button><button className="primary" onClick={()=>setModal(true)}><Plus size={18}/>Завантажити CSV</button></div></div>')
replace('реальний приклад ERA5 за 2024 рік: 6 міст, температура, опади, вологість і вітер.', 'реальні погодні дані ERA5: усі області, температура, опади, вологість і вітер.')
replace('<div className="filter-note"><Info size={16}/><p>{dataset.spatial_kind', '<label className="checkbox weather-event-toggle"><input type="checkbox" checked={showEvents} onChange={e=>setShowEvents(e.target.checked)}/>Шар катастроф · {overlay?.stats.count??0}</label><button className="text-btn" onClick={()=>setPage(\'disasters\')}>Метрики катастроф <ArrowRight size={14}/></button><div className="filter-note"><Info size={16}/><p>{dataset.spatial_kind')
replace('unit={unit} scale={scale}/>', 'unit={unit} scale={scale} events={overlay?.events||[]} onEventSelect={setPickedEvent}/>')
replace('<span className="nodata"><i/>Немає даних</span></div></section>', '<span className="nodata"><i/>Немає даних</span><span className="event-legend">● Катастрофи: {overlay?.stats.count??0}</span></div></section>')
replace('<section className="timeline-panel">', "{pickedEvent&&<DisasterDetail event={pickedEvent} regions={meta?.regions||{}} onClose={()=>setPickedEvent(null)}/>}<section className=\"timeline-panel\">")
replace(" {page==='datasets'&&", " {page==='disasters'&&<DisastersPage catalogs={catalogs} regions={meta?.regions||{}} onUpload={()=>setEmdatModal(true)}/>}\n {page==='datasets'&&")
replace('ERA5 · 2024 · 6 міст України.<br/>2 196 добових записів із джерелом і метаданими.', 'ERA5 · усі 27 територій України.<br/>Історичні погодні ряди з джерелом і метаданими.')
replace('ECMWF ERA5 через Open-Meteo, 2024 рік, доба UTC. Це реаналіз для точок біля Львова, Києва, Одеси, Харкова, Дніпра та Сімферополя.', 'ECMWF ERA5 через Open-Meteo, доба UTC. Нові набори охоплюють 27 територій України; кожна територія представлена точкою біля міста. Дати та координати збережено в метаданих кожного набору.')
replace('до 20 МБ та 100 000 рядків', 'до 20 МБ та 1 000 000 рядків')
replace('Каталог катастроф, E-OBS/NetCDF, зважування погодних сіток по площі, прогнозування та облікові записи заплановані наступними етапами.', 'Катастрофи імпортуються з Excel EM-DAT: кількість, загиблі, постраждалі та збитки. Порожні наслідки невідомі; загальний підсумок рахує подію один раз навіть за кількох областей. Номінальні збитки різних років показуються окремо від скоригованих. NetCDF, просторове зважування й прогнозування — наступні етапи.')
replace(' </main>{modal&&', ' </main>{emdatModal&&<DisasterImport onClose={()=>setEmdatModal(false)} onImported={()=>{setEmdatModal(false);refreshCatalogs().then(()=>setPage(\'disasters\')).catch(e=>setError(e.message));}}/>}{modal&&')
p.write_text(source,encoding='utf-8')
print('Integrated disasters into app')
