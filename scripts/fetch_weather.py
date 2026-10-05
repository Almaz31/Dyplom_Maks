"""Download real daily ERA5 for 27 representative points, with cached raw responses."""
import csv
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / 'samples'
CACHE = SAMPLES / 'weather_raw'
CACHE.mkdir(exist_ok=True)
POINTS = [
 ('UA-05','Вінниця',49.23,28.47), ('UA-07','Луцьк',50.75,25.34),
 ('UA-09','Луганськ',48.57,39.31), ('UA-12','Дніпро',48.46,35.04),
 ('UA-14','Донецьк',48.02,37.80), ('UA-18','Житомир',50.25,28.66),
 ('UA-21','Ужгород',48.62,22.30), ('UA-23','Запоріжжя',47.84,35.14),
 ('UA-26','Івано-Франківськ',48.92,24.71), ('UA-30','Київ',50.45,30.52),
 ('UA-32','Біла Церква',49.80,30.12), ('UA-35','Кропивницький',48.51,32.26),
 ('UA-40','Севастополь',44.62,33.53), ('UA-43','Сімферополь',44.95,34.10),
 ('UA-46','Львів',49.84,24.03), ('UA-48','Миколаїв',46.97,32.00),
 ('UA-51','Одеса',46.48,30.73), ('UA-53','Полтава',49.59,34.55),
 ('UA-56','Рівне',50.62,26.25), ('UA-59','Суми',50.91,34.80),
 ('UA-61','Тернопіль',49.55,25.59), ('UA-63','Харків',49.99,36.23),
 ('UA-65','Херсон',46.64,32.62), ('UA-68','Хмельницький',49.42,26.99),
 ('UA-71','Черкаси',49.44,32.06), ('UA-74','Чернігів',51.50,31.29),
 ('UA-77','Чернівці',48.29,25.94),
]
KEYS = ['temperature_2m_mean','precipitation_sum','relative_humidity_2m_mean','wind_speed_10m_mean']

def download(start, end, filename):
    results, provenance = [], []
    for offset in range(0, len(POINTS), 9):
        points = POINTS[offset:offset+9]
        params = {'latitude':','.join(str(p[2]) for p in points), 'longitude':','.join(str(p[3]) for p in points),
                  'start_date':start, 'end_date':end, 'models':'era5', 'daily':','.join(KEYS), 'timezone':'GMT', 'wind_speed_unit':'ms'}
        url = 'https://archive-api.open-meteo.com/v1/archive?' + urllib.parse.urlencode(params)
        path = CACHE / (hashlib.sha256(url.encode()).hexdigest() + '.json')
        if not path.exists():
            for attempt in range(12):
                try:
                    with urllib.request.urlopen(url, timeout=60) as response:
                        raw = response.read()
                    parsed = json.loads(raw)
                    if not isinstance(parsed,list) or len(parsed)!=len(points):
                        raise RuntimeError(str(parsed)[:300])
                    path.write_bytes(raw)
                    break
                except urllib.error.HTTPError as exc:
                    detail=exc.read().decode('utf-8',errors='replace')
                    if exc.code not in [429,502,503,504] or attempt==11:
                        raise
                    wait=45 if 'Hourly' in detail else min(30,5*(attempt+1))
                    print(f'API {exc.code}: {detail[:130]}; retry in {wait}s',flush=True)
                    time.sleep(wait)
            time.sleep(1)
        data = json.loads(path.read_text(encoding='utf-8'))
        for point, item in zip(points, data):
            daily = item['daily']
            for i, day in enumerate(daily['time']):
                results.append([day,point[0],*(daily[key][i] for key in KEYS)])
        provenance.append({'url':url,'raw_file':str(path.relative_to(ROOT))})
        print(f'{start}..{end}: {offset+len(points)}/27 territories', flush=True)
    results.sort(key=lambda x:(x[0],x[1]))
    with (SAMPLES / filename).open('w',encoding='utf-8-sig',newline='') as file:
        writer=csv.writer(file);writer.writerow(['date','region','temperature','precipitation','humidity','wind']);writer.writerows(results)
    metadata = {'source':'ECMWF ERA5 via Open-Meteo','license':'CC BY 4.0','retrieved_at':datetime.now(timezone.utc).isoformat(),
                'documentation':'https://open-meteo.com/en/docs/historical-weather-api','timezone':'UTC', 'start':start,'end':end,
                'rows':len(results),'spatial_kind':'point','note':'Representative grid points near cities; NOT area averages',
                'points':[{'region':p[0],'city':p[1],'latitude':p[2],'longitude':p[3]} for p in POINTS],'requests':provenance}
    (SAMPLES / filename.replace('.csv','.source.json')).write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Saved {filename}: {len(results)} rows',flush=True)

if __name__=='__main__':
    if '--historical' in sys.argv:
        download('1950-01-01','1950-12-31','era5_1950_all_regions.csv')
    else:
        download('2000-01-01','2025-12-31','era5_2000_2025_all_regions.csv')
