"""Worldwide point weather and the separate historical GDIS catalogue."""
import csv
import hashlib
import json
import math
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

ROOT = Path(__file__).resolve().parents[1]
FIELDS = {'temperature': 'temperature_2m_mean', 'precipitation': 'precipitation_sum',
          'humidity': 'relative_humidity_2m_mean', 'wind': 'wind_speed_10m_mean'}
TYPE_LABELS = {'flood': 'Повінь', 'storm': 'Шторм', 'earthquake': 'Землетрус',
               'drought': 'Посуха', 'landslide': 'Зсув', 'volcanic activity': 'Вулканічна активність',
               'extreme temperature': 'Екстремальна температура', 'mass movement (dry)': 'Сухий зсув'}


def validate_weather(raw, start, end):
    """Validate cached and network responses identically; null stays null."""
    daily = raw.get('daily', {}) if isinstance(raw, dict) else {}
    days = daily.get('time', [])
    expected = [(start+timedelta(days=i)).isoformat() for i in range((end-start).days+1)]
    if days != expected or any(not isinstance(daily.get(field), list) or len(daily[field]) != len(days) for field in FIELDS.values()):
        raise HTTPException(502, 'Джерело повернуло некоректні дати або неповну структуру погодних даних')
    for key in ('latitude', 'longitude'):
        value = raw.get(key)
        limit = 90 if key == 'latitude' else 180
        if not isinstance(value, (float, int)) or isinstance(value, bool) or not math.isfinite(value) or not -limit <= value <= limit:
            raise HTTPException(502, 'Некоректні координати сітки у відповіді джерела')
    for metric, field in FIELDS.items():
        for value in daily[field]:
            if value is None:
                continue
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
                raise HTTPException(502, 'Нечислове значення у погодних даних')
            if (metric == 'humidity' and not 0 <= value <= 100) or (metric in ('precipitation', 'wind') and value < 0) or (metric == 'temperature' and value < -273.15):
                raise HTTPException(502, 'Значення джерела поза фізичним діапазоном')
    return raw


@lru_cache(maxsize=1)
def gdis_events():
    path = ROOT / 'samples/gdis/original.csv'
    if not path.exists():
        raise HTTPException(404, 'Світовий набір GDIS відсутній')
    events = {}
    with path.open(encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            key = row['id']
            event = events.setdefault(key, {'id': key, 'emdat_id': row['disasterno'],
                'country': row['country'], 'iso': row['iso3'], 'year': int(row['year']),
                'type': row['disastertype'], 'type_label': TYPE_LABELS.get(row['disastertype'], row['disastertype']),
                'locations': []})
            lat, lon = float(row['latitude']), float(row['longitude'])
            if math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180:
                event['locations'].append({'lat': lat, 'lon': lon, 'name': row['geolocation']})
    return list(events.values())


def create_world_router(data):
    from .world_grid import weather_grid
    router = APIRouter(prefix='/api/world')
    cache = data / 'world_weather'
    cache.mkdir(exist_ok=True)

    @router.get('/weather-grid')
    def global_weather_grid(start: date = date(2024, 1, 1), end: date = date(2024, 12, 31)):
        return weather_grid(start, end, data / 'world_weather_grid')

    @router.get('/weather-reference')
    def weather_reference(start: date = date(2024, 1, 1), end: date = date(2024, 12, 31)):
        if start > end:
            raise HTTPException(400, 'Початок після кінця')
        path = ROOT / 'samples/world-weather.json'
        if not path.exists():
            return {'points': []}
        sample = json.loads(path.read_text(encoding='utf-8'))
        if start.isoformat() < sample['start'] or end.isoformat() > sample['end']:
            return {'points': []}
        points = []
        for point in sample['points']:
            daily = point['data']['daily']
            indexes = [i for i, day in enumerate(daily['time']) if start.isoformat() <= day <= end.isoformat()]
            metrics = {}
            for metric, field in FIELDS.items():
                values = [daily[field][i] for i in indexes if daily[field][i] is not None]
                metrics[metric] = (sum(values) if metric == 'precipitation' else sum(values)/len(values)) if values else None
            points.append({'lat': point['lat'], 'lon': point['lon'], 'name': point['name'], 'metrics': metrics})
        return {'points': points}

    @router.get('/disasters')
    def disasters(start: int = Query(2018, ge=1960, le=2018), end: int = Query(2018, ge=1960, le=2018),
                  country: str = '', event_type: str = ''):
        if start > end:
            raise HTTPException(400, 'Початок після кінця')
        all_events = gdis_events()
        selected = [e for e in all_events if start <= e['year'] <= end
                    and (not country or e['iso'] == country) and (not event_type or e['type'] == event_type)]
        country_codes = {}
        for event in all_events:
            country_codes.setdefault(event['country'], set()).add(event['iso'])
        countries = [{'iso': 'name:' + name, 'name': name, 'codes': sorted(codes)}
                     for name, codes in country_codes.items()]
        if country.startswith('name:'):
            selected = [e for e in all_events if start <= e['year'] <= end
                        and e['country'] == country[5:]
                        and (not event_type or e['type'] == event_type)]
        counts = Counter(e['year'] for e in selected)
        types = Counter(e['type'] for e in selected)
        return {'events': selected, 'count': len(selected), 'locations': sum(len(e['locations']) for e in selected),
                'countries': sorted(countries, key=lambda c: c['name']),
                'types': [{'type': t, 'label': TYPE_LABELS.get(t, t)} for t in sorted({e['type'] for e in all_events})],
                'type_counts': [{'label': TYPE_LABELS.get(t, t), 'count': n} for t, n in types.most_common()],
                'series': [{'year': y, 'count': counts[y]} for y in range(start, end + 1)],
                'source': 'GDIS / EM-DAT · 1960–2018', 'catalog_count': len(all_events)}

    @router.get('/weather')
    def weather(latitude: float = Query(ge=-90, le=90), longitude: float = Query(ge=-180, le=180),
                start: date = date(2024, 1, 1), end: date = date(2024, 12, 31)):
        if not math.isfinite(latitude) or not math.isfinite(longitude):
            raise HTTPException(400, 'Некоректні координати')
        if start > end or start < date(1940, 1, 1) or end > date.today() - timedelta(days=7) or (end-start).days > 1826:
            raise HTTPException(400, 'Оберіть завершений період після 1940 року, до 5 років; затримка даних — 7 днів')
        lat, lon = round(latitude, 2), round(longitude, 2)
        params = {'latitude': lat, 'longitude': lon, 'start_date': start.isoformat(), 'end_date': end.isoformat(),
                  'daily': ','.join(FIELDS.values()), 'models': 'era5', 'timezone': 'GMT', 'wind_speed_unit': 'ms'}
        url = 'https://archive-api.open-meteo.com/v1/archive?' + urllib.parse.urlencode(params)
        path = cache / (hashlib.sha256(url.encode()).hexdigest() + '.json')
        if path.exists():
            raw = json.loads(path.read_text(encoding='utf-8'))
        else:
            # Ship a real offline reference sample; other points are cached on demand.
            sample = ROOT / 'samples/world-weather.json'
            raw = None
            if sample.exists():
                saved = json.loads(sample.read_text(encoding='utf-8'))
                if start.isoformat() == saved['start'] and end.isoformat() == saved['end']:
                    raw = next((p['data'] for p in saved['points'] if p['lat'] == lat and p['lon'] == lon), None)
            if raw is None:
                try:
                    with urllib.request.urlopen(url, timeout=40) as response:
                        raw = json.load(response)
                except Exception as exc:
                    raise HTTPException(502, 'Не вдалося отримати ERA5. Спробуйте знову або виберіть місто за 2024 рік.') from exc
            validate_weather(raw, start, end)
            path.write_text(json.dumps(raw), encoding='utf-8')
        validate_weather(raw, start, end)
        daily = raw['daily']
        series = [{'date': day, **{key: daily[field][i] for key, field in FIELDS.items()}}
                  for i, day in enumerate(daily['time'])]
        return {'series': series, 'latitude': lat, 'longitude': lon, 'grid_latitude': raw['latitude'],
                'grid_longitude': raw['longitude'], 'source': 'Open-Meteo / ECMWF ERA5', 'url': url}

    return router
