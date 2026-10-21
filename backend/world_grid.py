"""Coarse, real ERA5 samples for a global overview, independent of city data."""
import gzip
import hashlib
import json
import math
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
STEP = 15
LATITUDES = [float(v) + STEP/2 for v in range(-90, 90, STEP)]
LONGITUDES = [float(v) + STEP/2 for v in range(-180, 180, STEP)]
COORDINATES = [(lat, lon) for lat in LATITUDES for lon in LONGITUDES]
_lock = threading.Lock()


def fetch_snapshot(start: date, end: date, progress=None, batch_cache: Path | None = None):
    from .world import FIELDS, validate_weather

    def batch(coordinates):
        params = dict(latitude=','.join(str(p[0]) for p in coordinates),
                      longitude=','.join(str(p[1]) for p in coordinates),
                      start_date=start.isoformat(), end_date=end.isoformat(),
                      daily=','.join(FIELDS.values()), models='era5', timezone='GMT',
                      wind_speed_unit='ms', elevation=','.join('nan' for _ in coordinates), cell_selection='nearest')
        url = 'https://archive-api.open-meteo.com/v1/archive?' + urllib.parse.urlencode(params)
        saved = batch_cache/(hashlib.sha256(url.encode()).hexdigest()+'.json.gz') if batch_cache else None
        try:
            if saved and saved.exists():
                with gzip.open(saved, 'rt', encoding='utf-8') as file:
                    raw=json.load(file)
            else:
                for attempt in range(5):
                    try:
                        with urllib.request.urlopen(url, timeout=90) as response:
                            raw = json.load(response)
                        break
                    except urllib.error.HTTPError as exc:
                        if exc.code!=429 or attempt==4: raise
                        if progress: print('Source rate limit: retrying in 40 seconds', flush=True)
                        time.sleep(40)
        except Exception as exc:
            raise HTTPException(502, 'Глобальний шар ERA5 тимчасово недоступний. Спробуйте пізніше.') from exc
        if not isinstance(raw, list) or len(raw) != len(coordinates):
            raise HTTPException(502, 'Неповна відповідь джерела глобальної сітки')
        points = []
        for (lat, lon), item in zip(coordinates, raw):
            validate_weather(item, start, end)
            # Prevent shifted/duplicated response coordinates from colouring the wrong cell.
            delta_lon = abs((item['longitude']-lon+180) % 360-180)
            if abs(item['latitude']-lat) > 1 or delta_lon > 1:
                raise HTTPException(502, 'Координати відповіді не відповідають вузлам сітки')
            points.append(dict(lat=lat, lon=lon, daily=item['daily']))
        if saved and not saved.exists():
            saved.parent.mkdir(parents=True,exist_ok=True)
            with gzip.open(saved,'wt',encoding='utf-8') as file:
                json.dump(raw,file,separators=(',',':'))
        if progress:
            progress(len(points))
        return points, url

    chunks = [COORDINATES[i:i+24] for i in range(0, len(COORDINATES), 24)]
    with ThreadPoolExecutor(max_workers=1) as executor:
        results = list(executor.map(batch, chunks))
    return dict(start=start.isoformat(), end=end.isoformat(), step=STEP,
                latitudes=LATITUDES, longitudes=LONGITUDES,
                points=[p for points, _ in results for p in points],
                urls=[url for _, url in results], source='Open-Meteo / ECMWF ERA5',
                license='CC BY 4.0', retrieved_at=datetime.now(timezone.utc).isoformat())


@lru_cache(maxsize=3)
def read_snapshot(path: str, version: int):
    with gzip.open(path, 'rt', encoding='utf-8') as file:
        return json.load(file)


def aggregate_snapshot(snapshot, start: date, end: date):
    from .world import FIELDS
    first = date.fromisoformat(snapshot['start'])
    offset = (start-first).days
    length = (end-start).days+1
    points = []
    for point in snapshot['points']:
        metrics, coverage = {}, {}
        for metric, field in FIELDS.items():
            values = point['daily'][field][offset:offset+length]
            valid = [v for v in values if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)]
            coverage[metric] = len(valid)/length
            # Partial sums/means must not masquerade as full-period map values.
            metrics[metric] = ((sum(valid) if metric == 'precipitation' else sum(valid)/length)
                               if len(valid) == length else None)
        points.append(dict(lat=point['lat'], lon=point['lon'], metrics=metrics, coverage=coverage))
    return dict(points=points, latitudes=snapshot['latitudes'], longitudes=snapshot['longitudes'],
                step=snapshot['step'], start=start.isoformat(), end=end.isoformat(),
                source=snapshot['source'], license=snapshot['license'],
                retrieved_at=snapshot['retrieved_at'], method='bilinear',
                note='Оглядова інтерполяція між вузлами 15°. Не локальна деталізація реаналізу.')


def weather_grid(start: date, end: date, cache: Path):
    if start > end or start < date(1940, 1, 1) or end > date.today()-timedelta(days=7) or (end-start).days > 365:
        raise HTTPException(400, 'Для глобального шару оберіть завершений період до 366 днів після 1940 року. Деталі точки доступні до 5 років.')
    bundled = ROOT/'samples/world-weather-grid-2024.json.gz'
    if bundled.exists() and date(2024,1,1) <= start <= end <= date(2024,12,31):
        snapshot = read_snapshot(str(bundled), bundled.stat().st_mtime_ns)
    else:
        cache.mkdir(parents=True, exist_ok=True)
        key = hashlib.sha256(f'era5-15-{start}-{end}'.encode()).hexdigest()
        path = cache/(key+'.json.gz')
        with _lock:
            if not path.exists():
                snapshot = fetch_snapshot(start, end, batch_cache=cache/'batches')
                temporary = path.with_suffix('.tmp')
                with gzip.open(temporary, 'wt', encoding='utf-8') as file:
                    json.dump(snapshot, file, separators=(',', ':'))
                temporary.replace(path)
        snapshot = read_snapshot(str(path), path.stat().st_mtime_ns)
    return aggregate_snapshot(snapshot, start, end)
