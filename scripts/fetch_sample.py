"""Download a reproducible real ERA5 sample. No generated weather values."""
import csv
import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'samples'
root.mkdir(exist_ok=True)
points = [('UA-46','Львів',49.84,24.03), ('UA-30','Київ',50.45,30.52), ('UA-51','Одеса',46.48,30.73), ('UA-63','Харків',49.99,36.23), ('UA-12','Дніпро',48.46,35.04), ('UA-43','Сімферополь',44.95,34.10)]
params = {'latitude': ','.join(str(p[2]) for p in points), 'longitude': ','.join(str(p[3]) for p in points), 'start_date':'2024-01-01', 'end_date':'2024-12-31', 'models':'era5', 'daily':'temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean,wind_speed_10m_mean', 'timezone':'GMT', 'wind_speed_unit':'ms'}
url = 'https://archive-api.open-meteo.com/v1/archive?' + urllib.parse.urlencode(params)
with urllib.request.urlopen(url, timeout=120) as response:
    result = json.load(response)
(root / 'raw-open-meteo.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
assert isinstance(result, list) and len(result) == len(points)
with (root / 'era5_2024.csv').open('w', encoding='utf-8-sig', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(['date','region','temperature','precipitation','humidity','wind'])
    for point, data in zip(points, result):
        daily = data['daily']
        for i, day in enumerate(daily['time']):
            writer.writerow([day, point[0], *(daily[key][i] for key in ['temperature_2m_mean','precipitation_sum','relative_humidity_2m_mean','wind_speed_10m_mean'])])
(root / 'source.json').write_text(json.dumps({'source':'Open-Meteo Historical Weather API / ECMWF ERA5', 'url':url, 'retrieved_at':datetime.now(timezone.utc).isoformat(), 'license':'CC BY 4.0', 'documentation':'https://open-meteo.com/en/docs/historical-weather-api', 'spatial_kind':'Representative grid points near cities, NOT oblast area averages', 'timezone':'UTC', 'points':[{'region':p[0],'city':p[1],'latitude':p[2],'longitude':p[3]} for p in points]}, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Saved {len(points)*366} real daily records')
