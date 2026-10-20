"""Download monthly NASA POWER for a 2-degree grid across European land."""
import calendar
import gzip
import hashlib
import json
import math
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
from pathlib import Path
from threading import Lock

from fetch_europe_forecast import country_at,COUNTRIES

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'samples/europe_monthly_raw';CACHE.mkdir(exist_ok=True)
FIELDS={'temperature':'T2M','precipitation':'PRECTOTCORR','humidity':'RH2M','wind':'WS10M'}
COUNTRIES.update({'KOS','CYP'})
ANCHORS=[('AND','Андорра',42.51,1.52),('LIE','Ліхтенштейн',47.14,9.52),('MCO','Монако',43.74,7.42),
         ('SMR','Сан-Марино',43.94,12.45),('VAT','Ватикан',41.90,12.45),('MLT','Мальта',35.90,14.51),
         ('LUX','Люксембург',49.61,6.13),('CYP','Кіпр',35.17,33.36),
         ('BEL','Бельгія',50.85,4.35),('KOS','Косово',42.66,21.16),('MNE','Чорногорія',42.44,19.26)]
lock=Lock();last_request=0.


def grid():
    features=json.loads((ROOT/'frontend/public/world-countries.geojson').read_text(encoding='utf-8'))['features']
    points=[]
    for lat in range(34,81,2):
        for lon in range(-26,61,2):
            country=country_at(features,lon,lat)
            if country:
                points.append({'id':f'{lat}:{lon}','lat':lat,'lon':lon,'country':country['name'],'iso':country['id'],'weight':math.cos(math.radians(lat)),'kind':'grid'})
    present={p['iso'] for p in points}
    # Zero area-weight: anchors give small states a selectable forecast without
    # pretending that one small state occupies an entire 2-degree grid cell.
    for iso,name,lat,lon in ANCHORS:
        if iso not in present:
            points.append({'id':f'{lat}:{lon}','lat':lat,'lon':lon,'country':name,'iso':iso,'weight':0.,'kind':'anchor'})
    return points


def fetch(point):
    global last_request
    params={'latitude':point['lat'],'longitude':point['lon'],'start':1981,'end':2018,'parameters':','.join(FIELDS.values()),'community':'AG','format':'JSON','time-standard':'UTC'}
    url='https://power.larc.nasa.gov/api/temporal/monthly/point?'+urllib.parse.urlencode(params)
    path=CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.json.gz')
    if not path.exists():
        for attempt in range(5):
            try:
                with lock:
                    delay=max(0,.35-(time.monotonic()-last_request))
                    if delay:time.sleep(delay)
                    last_request=time.monotonic()
                with urllib.request.urlopen(url,timeout=60) as r:raw=r.read()
                data=json.loads(raw)
                if 'parameter' not in data.get('properties',{}):raise ValueError('Invalid NASA response')
                with gzip.open(path,'wb') as f:f.write(raw)
                break
            except Exception:
                if attempt==4:raise
                time.sleep(3*(attempt+1))
    with gzip.open(path,'rt',encoding='utf-8') as f:data=json.load(f)
    values=data['properties']['parameter'];fill=data['header']['fill_value'];monthly=[]
    for year in range(1981,2019):
        for month in range(1,13):
            key=f'{year}{month:02d}';row={'year':year,'month':month}
            for metric,field in FIELDS.items():
                v=values[field].get(key)
                v=None if v is None or v==fill or not math.isfinite(v) else v
                if metric=='precipitation' and v is not None:v*=calendar.monthrange(year,month)[1]
                row[metric]=v
            monthly.append(row)
    if any(r[m] is None for r in monthly for m in FIELDS):raise ValueError(f'Incomplete point {point["id"]}')
    annual=[]
    for year in range(1981,2019):
        rows=[r for r in monthly if r['year']==year];days=366 if calendar.isleap(year) else 365
        annual.append({'year':year,**{m:sum(r[m] for r in rows) if m=='precipitation' else sum(r[m]*calendar.monthrange(year,r['month'])[1] for r in rows)/days for m in FIELDS}})
    return {**point,'monthly':monthly,'series':annual}, {'url':url,'raw_file':str(path.relative_to(ROOT)),'retrieved_at':datetime.fromtimestamp(path.stat().st_mtime,timezone.utc).isoformat()}


def main():
    points=grid();print(f'Fetching {len(points)} points / {len(set(p["iso"] for p in points))} countries',flush=True)
    saved=[];provenance=[]
    with ThreadPoolExecutor(max_workers=3) as pool:
        for i,(p,meta) in enumerate(pool.map(fetch,points),1):
            saved.append(p);provenance.append(meta)
            if i%20==0 or i==len(points):print(f'{i}/{len(points)} downloaded',flush=True)
    total=sum(p['weight'] for p in saved)
    def aggregate(key):
        rows=[]
        for i,row in enumerate(saved[0][key]):
            rows.append({**{k:row[k] for k in ('year','month') if k in row},**{m:sum(p['weight']*p[key][i][m] for p in saved)/total for m in FIELDS}})
        return rows
    output={'source':'NASA POWER / MERRA-2','start':1981,'end':2018,'points':saved,'monthly':aggregate('monthly'),'series':aggregate('series'),'provenance':provenance,
            'country_count':len(set(p['iso'] for p in saved)),'grid_degrees':2,'spatial_method':'2-degree land grid across European countries, 34–80 N / 26 W–60 E; cos(latitude) weights. Microstate anchors have zero regional area-weight. Finite-resolution land-grid index.'}
    with gzip.open(ROOT/'samples/europe-weather-full.json.gz','wt',encoding='utf-8') as f:json.dump(output,f,ensure_ascii=False,separators=(',',':'))
    print('Full European dataset saved',flush=True)


if __name__=='__main__':main()
