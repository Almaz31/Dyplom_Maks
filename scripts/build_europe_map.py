"""Ship European geometry clipped to the historical grid's coverage."""
import gzip
import json
from pathlib import Path
from shapely.geometry import box, mapping, shape

ROOT=Path(__file__).resolve().parents[1]
data=json.load(gzip.open(ROOT/'samples/europe-weather-full.json.gz','rt',encoding='utf-8'))
ids={p['iso'] for p in data['points']}
world=json.loads((ROOT/'frontend/public/world-countries.geojson').read_text(encoding='utf-8'))
features=[]
for f in world['features']:
    if f['properties']['id'] not in ids:continue
    geometry=shape(f['geometry']).intersection(box(-26,34,60,81))
    if not geometry.is_empty:features.append({**f,'geometry':mapping(geometry)})
(ROOT/'frontend/public/europe-countries.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(f'Saved {len(features)} European country geometries')
