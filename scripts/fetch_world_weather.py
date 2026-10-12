"""Fetch an offline ERA5 reference sample for cities on different continents."""
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

POINTS = [('Київ', 50.45, 30.52), ('Лондон', 51.51, -0.13), ('Нью-Йорк', 40.71, -74.01),
          ('Токіо', 35.68, 139.69), ('Сідней', -33.87, 151.21), ('Каїр', 30.04, 31.24),
          ('Ріо-де-Жанейро', -22.91, -43.17), ('Кейптаун', -33.92, 18.42)]
params = {'latitude': ','.join(str(p[1]) for p in POINTS), 'longitude': ','.join(str(p[2]) for p in POINTS),
          'start_date': '2024-01-01', 'end_date': '2024-12-31', 'models': 'era5', 'timezone': 'GMT',
          'daily': 'temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean,wind_speed_10m_mean', 'wind_speed_unit': 'ms'}
url = 'https://archive-api.open-meteo.com/v1/archive?' + urllib.parse.urlencode(params)
with urllib.request.urlopen(url, timeout=120) as response:
    result = json.load(response)
assert isinstance(result, list) and len(result) == len(POINTS)
output = {'start': '2024-01-01', 'end': '2024-12-31', 'source': 'Open-Meteo / ECMWF ERA5', 'url': url,
          'retrieved_at': datetime.now(timezone.utc).isoformat(), 'license': 'CC BY 4.0',
          'points': [{'name': name, 'lat': lat, 'lon': lon, 'data': raw} for (name, lat, lon), raw in zip(POINTS, result)]}
(Path(__file__).resolve().parents[1] / 'samples/world-weather.json').write_text(json.dumps(output, ensure_ascii=False), encoding='utf-8')
print('Saved real daily weather for 8 reference cities, 2024')
