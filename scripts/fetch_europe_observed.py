"""Fetch post-2018 observations separately, retaining complete fixed-grid months only."""
import calendar
import gzip
import hashlib
import json
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
from pathlib import Path
from threading import Lock

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'samples/europe_observed_raw';CACHE.mkdir(exist_ok=True)
FIELDS={'temperature':'T2M','precipitation':'PRECTOTCORR','humidity':'RH2M','wind':'WS10M'}
lock=Lock();last_request=0.

def fetch(p):
    global last_request
    query={'latitude':p['lat'],'longitude':p['lon'],'start':2019,'end':2026,'parameters':','.join(FIELDS.values()),'community':'AG','format':'JSON','time-standard':'UTC'}
    url='https://power.larc.nasa.gov/api/temporal/monthly/point?'+urllib.parse.urlencode(query)
    path=CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.json.gz')
    if not path.exists():
        for attempt in range(4):
            try:
                with lock:
                    delay=max(0,.35-(time.monotonic()-last_request))
                    if delay:time.sleep(delay)
                    last_request=time.monotonic()
                raw=urllib.request.urlopen(url,timeout=45).read();data=json.loads(raw)
                if 'parameter' not in data.get('properties',{}):raise ValueError('Missing parameters')
                with gzip.open(path,'wb') as f:f.write(raw)
                break
            except Exception:
                if attempt==3:raise
                time.sleep(2*(attempt+1))
    data=json.load(gzip.open(path,'rt',encoding='utf-8'));values=data['properties']['parameter'];rows=[]
    for y in range(2019,2027):
        for m in range(1,13):
            row={'year':y,'month':m}
            for metric,field in FIELDS.items():
                value=values[field].get(f'{y}{m:02d}')
                row[metric]=None if value is None or value==data['header']['fill_value'] else value*(calendar.monthrange(y,m)[1] if metric=='precipitation' else 1)
            rows.append(row)
    return {'id':p['id'],'monthly':rows},{'url':url,'raw_file':str(path.relative_to(ROOT))}

def main():
    source=json.load(gzip.open(ROOT/'samples/europe-weather-full.json.gz','rt',encoding='utf-8'));points=source['points'];saved=[];provenance=[]
    with ThreadPoolExecutor(max_workers=3) as pool:
        for i,(p,meta) in enumerate(pool.map(fetch,points),1):
            saved.append(p);provenance.append(meta)
            if i%20==0 or i==len(points):print(f'Observed {i}/{len(points)}',flush=True)
    complete=[i for i in range(96) if all(p['monthly'][i][m] is not None for p in saved for m in FIELDS)]
    total=sum(p['weight'] for p in points);monthly=[]
    for i in complete:
        first=saved[0]['monthly'][i]
        monthly.append({**{k:first[k] for k in ('year','month')},**{m:sum(p['weight']*v['monthly'][i][m] for p,v in zip(points,saved))/total for m in FIELDS}})
    for p in saved:
        p['monthly']=[p['monthly'][i] for i in complete];p['series']=[]
        for y in range(2019,2027):
            rows=[r for r in p['monthly'] if r['year']==y]
            if len(rows)!=12:continue
            days=sum(calendar.monthrange(y,r['month'])[1] for r in rows)
            p['series'].append({'year':y,**{m:sum(r[m] for r in rows) if m=='precipitation' else sum(r[m]*calendar.monthrange(y,r['month'])[1] for r in rows)/days for m in FIELDS}})
    series=[]
    for i,row in enumerate(saved[0]['series']):
        series.append({'year':row['year'],**{m:sum(p['weight']*v['series'][i][m] for p,v in zip(points,saved))/total for m in FIELDS}})
    output={'source':'NASA POWER / MERRA-2','retrieved_at':datetime.now(timezone.utc).isoformat(),'points':saved,'monthly':monthly,'series':series,'provenance':provenance,'latest':monthly[-1]}
    with gzip.open(ROOT/'samples/europe-weather-observed.json.gz','wt',encoding='utf-8') as f:json.dump(output,f,ensure_ascii=False,separators=(',',':'))
    print(f'Saved observations through {monthly[-1]["year"]}-{monthly[-1]["month"]:02d}; full years through {series[-1]["year"]}',flush=True)

if __name__=='__main__':main()
