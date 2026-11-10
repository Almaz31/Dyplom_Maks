"""Resume ERA5 monthly caches for all Ukrainian regions (real observations only)."""
import argparse
import gzip
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.time_series import FIELDS, POINTS, aggregate_daily, history
from fastapi import HTTPException


def wait_for_hour():
    now = datetime.now(timezone.utc)
    remaining = 3600-now.minute*60-now.second+10
    print(f'Hourly quota: waiting {remaining}s for the next UTC hour; cached data is safe', flush=True)
    while remaining > 0:
        pause = min(60, remaining)
        time.sleep(pause)
        remaining -= pause


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--end', default='2025-12')
    parser.add_argument('--batch', type=int, choices=range(1,6), default=3)
    parser.add_argument('--wait-for-quota', action='store_true', help='Resume automatically after an hourly API quota resets')
    args = parser.parse_args()
    cache = ROOT/'data/regional_history'
    cache.mkdir(parents=True, exist_ok=True)
    # 2000–2025 is already shipped as a daily CSV; only fetch missing earlier blocks.
    for year in range(1960, 2000, 10):
        last = f'{year+9}-12'
        missing = [p for p in POINTS if not any((cache/name).exists() for name in
                   (f'{p[0]}-{year}-01-{last}.json.gz', f'{p[0]}-{year}-{last}.json.gz'))]
        for offset in range(0, len(missing), args.batch):
            points = missing[offset:offset+args.batch]
            params = dict(latitude=','.join(str(p[2]) for p in points), longitude=','.join(str(p[3]) for p in points),
                          start_date=f'{year}-01-01', end_date=f'{year+9}-12-31', models='era5',
                          daily=','.join(FIELDS), timezone='GMT', wind_speed_unit='ms')
            url = 'https://archive-api.open-meteo.com/v1/archive?' + urllib.parse.urlencode(params)
            for attempt in range(6):
                try:
                    with urllib.request.urlopen(url, timeout=120) as response:
                        raw = json.load(response)
                    if isinstance(raw, dict) and len(points) == 1:
                        raw = [raw]
                    if not isinstance(raw, list) or len(raw) != len(points):
                        raise ValueError('Incomplete batch')
                    expected = [(date(year,1,1)+timedelta(days=i)).isoformat() for i in range((date(year+10,1,1)-date(year,1,1)).days)]
                    for p, item in zip(points, raw):
                        daily = item['daily']
                        if daily['time'] != expected or any(len(daily[k]) != len(expected) for k in FIELDS):
                            raise ValueError('Incomplete daily data')
                        block = dict(rows=aggregate_daily(daily), url=url, retrieved_at=datetime.now(timezone.utc).isoformat())
                        path = cache/f'{p[0]}-{year}-01-{last}.json.gz'
                        with gzip.open(path.with_suffix('.tmp'), 'wt', encoding='utf-8') as f:
                            json.dump(block, f, ensure_ascii=False, allow_nan=False)
                        path.with_suffix('.tmp').replace(path)
                    print(f'{year}: {offset+len(points)}/{len(missing)} missing regions saved', flush=True)
                    break
                except urllib.error.HTTPError as exc:
                    detail = exc.read().decode(errors='replace')
                    print(f'API {exc.code}: {detail[:180]}', flush=True)
                    if exc.code == 429 and 'Hourly' in detail:
                        if not args.wait_for_quota:
                            raise
                        wait_for_hour()
                        continue
                    if exc.code not in (429, 502, 503, 504) or attempt == 5:
                        raise
                    time.sleep(60 if exc.code == 429 else 10)
                except (ValueError, TimeoutError, OSError) as exc:
                    print(f'Incomplete response, retry {attempt+1}: {exc}', flush=True)
                    if attempt == 5:
                        raise
                    time.sleep(5)
            time.sleep(3)
    for p in POINTS:
        for attempt in range(6):
            try:
                rows, _ = history(p[0], args.end, cache)
                break
            except HTTPException as exc:
                if exc.status_code != 429 or attempt == 5:
                    raise
                if 'погодинний' in exc.detail:
                    if not args.wait_for_quota:
                        raise
                    wait_for_hour()
                else:
                    print('Minute quota: waiting 60s before continuing', flush=True)
                    time.sleep(60)
        print(f'{p[0]}: {len(rows)} months, {rows[0]["date"]}..{rows[-1]["date"]}', flush=True)


if __name__ == '__main__':
    main()
