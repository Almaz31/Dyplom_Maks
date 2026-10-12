"""Prepare compact Natural Earth country geometry for the globe.

One-time asset preparation requires shapely; the application itself does not.
"""
import json
import urllib.request
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
with urllib.request.urlopen(URL, timeout=40) as response:
    data = json.load(response)

# Keep Ukraine's territorial coverage consistent with the existing Ukraine map.
# Natural Earth's default de facto view puts the separate Crimea polygon in Russia.
russia = next(f for f in data['features'] if f['properties']['ADM0_A3'] == 'RUS')
ukraine = next(f for f in data['features'] if f['properties']['ADM0_A3'] == 'UKR')
parts = list(shape(russia['geometry']).geoms)
crimea = [p for p in parts if 31 < p.bounds[0] < p.bounds[2] < 37 and 43 < p.bounds[1] < p.bounds[3] < 47]
assert len(crimea) == 1, 'Natural Earth geometry changed; review Crimea attribution'
russia['geometry'] = mapping(unary_union([p for p in parts if p not in crimea]))
ukraine['geometry'] = mapping(unary_union([shape(ukraine['geometry']), *crimea]))

for feature in data['features']:
    geometry = shape(feature['geometry'])
    polygons = list(geometry.geoms) if geometry.geom_type == 'MultiPolygon' else [geometry]
    # D3 spherical polygons use clockwise exterior rings.
    polygons = [orient(p, sign=-1) for p in polygons]
    feature['geometry'] = {'type': 'MultiPolygon', 'coordinates': [mapping(p)['coordinates'] for p in polygons]}
    props = feature['properties']
    feature['properties'] = {'id': props['ADM0_A3'], 'name': props.get('NAME_UK') or props.get('NAME_EN') or props['NAME'], 'iso2': props['ISO_A2_EH']}

path = Path(__file__).resolve().parents[1] / 'frontend/public/world-countries.geojson'
path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Saved {len(data["features"])} country geometries')
