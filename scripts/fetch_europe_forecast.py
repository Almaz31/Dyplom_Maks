"""Build a reproducible European land-grid index from NASA POWER / MERRA-2."""
import calendar
import gzip
import hashlib
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'samples/europe_forecast_raw'
CACHE.mkdir(exist_ok=True)
FIELDS = {'temperature': 'T2M', 'precipitation': 'PRECTOTCORR', 'humidity': 'RH2M', 'wind': 'WS10M'}
# Regular 8-degree grid, masked to land in Europe using the shipped country geometry.
# A coarse land-grid index, not an exhaustive continental reanalysis raster.
COUNTRIES = {'ALB','AUT','BEL','BGR','BIH','BLR','CHE','CZE','DEU','DNK','ESP','EST','FIN','FRA','GBR','GRC','HRV','HUN','IRL','ISL','ITA','LTU','LUX','LVA','MDA','MKD','MNE','NLD','NOR','POL','PRT','ROU','RUS','SRB','SVK','SVN','SWE','UKR'}


def ring_contains(ring, x, y):
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            inside = not inside
    return inside


def country_at(features, lon, lat):
    for feature in features:
        if feature['properties']['id'] not in COUNTRIES:
            continue
        geometry = feature['geometry']
        polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
        if any(ring_contains(p[0], lon, lat) and not any(ring_contains(h, lon, lat) for h in p[1:]) for p in polygons):
            return feature['properties']


def main():
    features = json.loads((ROOT / 'frontend/public/world-countries.geojson').read_text(encoding='utf-8'))['features']
    points = []
    for lat in range(38, 71, 8):
        for lon in range(-8, 41, 8):
            country = country_at(features, lon, lat)
            if country:
                points.append({'lat': lat, 'lon': lon, 'country': country['name'], 'id': f'{lat}:{lon}', 'weight': math.cos(math.radians(lat))})
    provenance = []
    annual_points = []
    for offset in range(0, len(points)):
        batch = points[offset:offset+1]
        params = {'latitude': batch[0]['lat'], 'longitude': batch[0]['lon'], 'start': '19810101', 'end': '20181231',
                  'parameters': ','.join(FIELDS.values()), 'community': 'AG', 'format': 'JSON', 'time-standard': 'UTC'}
        url = 'https://power.larc.nasa.gov/api/temporal/daily/point?' + urllib.parse.urlencode(params)
        path = CACHE / (hashlib.sha256(url.encode()).hexdigest()+'.json.gz')
        if not path.exists():
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(url, timeout=90) as response:
                        raw = response.read()
                    data = json.loads(raw)
                    if not isinstance(data, list):
                        data = [data]
                    assert len(data) == len(batch)
                    with gzip.open(path, 'wb') as f:
                        f.write(raw)
                    break
                except urllib.error.HTTPError as exc:
                    if exc.code not in (429,502,503,504) or attempt == 3:
                        raise
                    print(f'API {exc.code}, retrying in 30s', flush=True)
                    time.sleep(30)
        with gzip.open(path, 'rt', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, list):
            data = [data]
        for point, item in zip(batch, data):
            daily = item['properties']['parameter']
            groups = {year: [] for year in range(1981,2019)}
            for day in daily['T2M']:
                groups[int(day[:4])].append(day)
            series = []
            for year, indexes in groups.items():
                expected = 366 if calendar.isleap(year) else 365
                row = {'year': year}
                for metric, field in FIELDS.items():
                    values = [daily[field].get(day) for day in indexes]
                    values = [v for v in values if v is not None and math.isfinite(v) and v != item['header']['fill_value']]
                    # Reject incomplete years, especially incomplete rainfall totals.
                    row[metric] = (sum(values) if metric == 'precipitation' else sum(values)/len(values)) if len(values) == expected else None
                series.append(row)
            monthly = []
            for year in range(1981,2019):
                for month in range(1,13):
                    days = [day for day in groups[year] if int(day[4:6]) == month]
                    row = {'year': year, 'month': month}
                    for metric, field in FIELDS.items():
                        values = [daily[field].get(day) for day in days]
                        values = [v for v in values if v is not None and math.isfinite(v) and v != item['header']['fill_value']]
                        row[metric] = (sum(values) if metric == 'precipitation' else sum(values)/len(values)) if len(values) == calendar.monthrange(year,month)[1] else None
                    monthly.append(row)
            annual_points.append({**point, 'series': series, 'monthly': monthly})
        provenance.append({'url': url, 'raw_file': str(path.relative_to(ROOT)), 'retrieved_at': datetime.fromtimestamp(path.stat().st_mtime,timezone.utc).isoformat()})
        print(f'Aggregated {offset+1}/{len(points)} European land-grid points', flush=True)
    regional = []
    for year in range(1981,2019):
        row = {'year': year}
        for metric in FIELDS:
            available = [(p['weight'], next(r for r in p['series'] if r['year']==year)[metric]) for p in annual_points]
            # Use a fixed spatial sample; never silently change geography between years.
            row[metric] = sum(w*v for w,v in available)/sum(w for w,v in available) if all(v is not None for w,v in available) else None
        regional.append(row)
    monthly_regional = []
    for index in range(38*12):
        first = annual_points[0]['monthly'][index]
        row = {'year': first['year'], 'month': first['month']}
        for metric in FIELDS:
            available = [(p['weight'],p['monthly'][index][metric]) for p in annual_points]
            row[metric] = sum(w*v for w,v in available)/sum(w for w,v in available) if all(v is not None for w,v in available) else None
        monthly_regional.append(row)
    output = {'source': 'NASA POWER / MERRA-2', 'license': 'NASA open data; cite NASA POWER', 'start':1981, 'end':2018,
              'spatial_method':'8-degree regular land grid, 38–70 N / 8 W–40 E; cosine-latitude weights; coarse European land-grid index, not exact continental mean',
              'points': annual_points, 'series': regional, 'monthly': monthly_regional, 'provenance': provenance}
    (ROOT / 'samples/europe-weather-1981-2018.json').write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f'Saved 38 years, {len(points)} fixed grid points, all 4 metrics', flush=True)


if __name__ == '__main__':
    main()
