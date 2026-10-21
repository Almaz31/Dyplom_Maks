"""Fetch the real 2024 global overview; no generated or climatological values."""
import gzip
import json
import sys
from datetime import date
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
from backend.world_grid import fetch_snapshot

if __name__ == '__main__':
    snapshot = fetch_snapshot(date(2024,1,1), date(2024,12,31),
                              progress=lambda count: print(f'Fetched {count} real grid nodes', flush=True),
                              batch_cache=root/'data/world_weather_grid/batches')
    target = root/'samples/world-weather-grid-2024.json.gz'
    with gzip.open(target, 'wt', encoding='utf-8') as file:
        json.dump(snapshot, file, separators=(',', ':'))
    print(f'Saved {len(snapshot["points"])} ERA5 nodes: {target}', flush=True)
