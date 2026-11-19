"""Monthly ERA5 histories and an explicitly defined additive decomposition."""
import calendar
import csv
import gzip
import json
import statistics
import urllib.parse
import urllib.request
import urllib.error
import uuid
from datetime import date, timedelta, datetime, timezone
from pathlib import Path
from functools import lru_cache

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .analytics_stats import finite, month_index, month_label, regression
from .regions import REGIONS
from scripts.fetch_weather import POINTS

ROOT = Path(__file__).resolve().parents[1]
METRICS = ('temperature', 'precipitation', 'humidity', 'wind')
FIELDS = ('temperature_2m_mean', 'precipitation_sum', 'relative_humidity_2m_mean', 'wind_speed_10m_mean')


def latest_month():
    # ERA5 has a publication delay; include only complete, published months.
    available = date.today() - timedelta(days=7)
    return (available.replace(day=1) - timedelta(days=1)).strftime('%Y-%m')


def aggregate_daily(daily):
    groups = {}
    for i, day in enumerate(daily['time']):
        row = groups.setdefault(day[:7], {k: [] for k in METRICS})
        for metric, field in zip(METRICS, FIELDS):
            row[metric].append(daily[field][i])
    rows = []
    for month, values in sorted(groups.items()):
        days = calendar.monthrange(int(month[:4]), int(month[5:7]))[1]
        item = {'date': month}
        for metric, v in values.items():
            item[metric] = (sum(v) if metric == 'precipitation' else statistics.mean(v)) if len(v) == days and all(finite(x) for x in v) else None
        rows.append(item)
    return rows


@lru_cache(maxsize=2)
def local_history(version):
    path = ROOT/'samples/era5_2000_2025_all_regions.csv'
    by_region = {}
    with path.open(encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            daily = by_region.setdefault(row['region'], {'time': [], **{k: [] for k in FIELDS}})
            daily['time'].append(row['date'])
            for metric, field in zip(METRICS, FIELDS):
                daily[field].append(float(row[metric]) if row.get(metric) else None)
    return {region: aggregate_daily(daily) for region, daily in by_region.items()}


def history(region, end, cache, start='1960-01'):
    """Cache immutable decades independently; extend only the last partial decade."""
    point = next(p for p in POINTS if p[0] == region)
    rows, provenance = [], []
    cache.mkdir(parents=True, exist_ok=True)
    local_path = ROOT/'samples/era5_2000_2025_all_regions.csv'
    local = local_history(local_path.stat().st_mtime_ns).get(region, []) if local_path.exists() else []
    for year in range(max(1960, int(start[:4])//10*10), int(end[:4]) + 1, 10):
        last = min(end, f'{year+9}-12')
        first = f'{year}-01'
        # Reuse the project's existing immutable snapshot before making requests.
        available = [r for r in local if first <= r['date'] <= last]
        if available and available[0]['date'] == first:
            rows.extend(available)
            provenance.append(dict(url='samples/era5_2000_2025_all_regions.csv', retrieved_at=local_path.stat().st_mtime))
            if available[-1]['date'] == last:
                continue
            first = month_label(month_index(available[-1]['date'])+1)
        path = cache / f'{region}-{first}-{last}.json.gz'
        legacy = cache / f'{region}-{year}-{last}.json.gz'
        if not path.exists() and legacy.exists() and first == f'{year}-01':
            path = legacy
        block = None
        if not path.exists():
            # A narrower selection can reuse a previously downloaded full decade.
            for candidate in sorted(cache.glob(f'{region}-*.json.gz')):
                with gzip.open(candidate, 'rt', encoding='utf-8') as f:
                    saved = json.load(f)
                if saved['rows'] and saved['rows'][0]['date'] <= first and saved['rows'][-1]['date'] >= last:
                    block = {**saved, 'rows': [r for r in saved['rows'] if first <= r['date'] <= last]}
                    break
        if block is not None:
            pass
        elif path.exists():
            with gzip.open(path, 'rt', encoding='utf-8') as f:
                block = json.load(f)
        else:
            last_day = calendar.monthrange(int(last[:4]), int(last[5:7]))[1]
            params = dict(latitude=point[2], longitude=point[3], start_date=f'{first}-01',
                          end_date=f'{last}-{last_day:02d}', models='era5', daily=','.join(FIELDS),
                          timezone='GMT', wind_speed_unit='ms')
            url = 'https://archive-api.open-meteo.com/v1/archive?' + urllib.parse.urlencode(params)
            try:
                with urllib.request.urlopen(url, timeout=90) as response:
                    raw = json.load(response)
                daily = raw['daily']
                first_date = date.fromisoformat(params['start_date'])
                expected = (date.fromisoformat(params['end_date']) - first_date).days + 1
                if len(daily['time']) != expected or daily['time'][0] != params['start_date'] or daily['time'][-1] != params['end_date']:
                    raise ValueError('Incomplete dates')
                if any(len(daily[field]) != expected for field in FIELDS):
                    raise ValueError('Incomplete variables')
                if daily['time'] != [(first_date+timedelta(days=i)).isoformat() for i in range(expected)]:
                    raise ValueError('Nonconsecutive dates')
                block = dict(rows=aggregate_daily(daily), url=url, retrieved_at=datetime.now(timezone.utc).isoformat())
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode(errors='replace')
                if exc.code == 429:
                    interval = 'погодинний' if 'Hourly' in detail else 'хвилинний'
                    raise HTTPException(429, f'Open-Meteo: {interval} ліміт завантаження. Спробуйте пізніше або оберіть локальний період 2000–2025. Уже отримані роки збережено.') from exc
                raise HTTPException(502, f'Джерело ERA5 недоступне за {year}–{last}. Уже отримані роки збережено; повторіть запит.') from exc
            except Exception as exc:
                raise HTTPException(502, f'Не вдалося отримати ERA5 за {year}–{last}: {exc}. Уже завантажені десятиліття збережено; повторіть запит.') from exc
            temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
            with gzip.open(temporary, 'wt', encoding='utf-8') as f:
                json.dump(block, f, ensure_ascii=False, allow_nan=False)
            temporary.replace(path)
        rows.extend(block['rows'])
        provenance.append({k: block[k] for k in ('url', 'retrieved_at')})
    return rows, dict(source='ECMWF ERA5 / Open-Meteo', license='CC BY 4.0', region=region,
                      location=REGIONS[region], latitude=point[2], longitude=point[3],
                      spatial_kind='Опорна точка області, не середнє по всій площі', requests=provenance)


def residual_acf(values, max_lag=24):
    """Sample residual autocorrelation with a shared variance denominator.

    Calendar positions are retained when observations are missing. The same
    full-sample squared-deviation denominator is used for every lag.
    """
    observed = [v for v in values if finite(v)]
    mean = statistics.mean(observed) if observed else 0
    denominator = sum((v-mean)**2 for v in observed)
    output = []
    for lag in range(1, min(max_lag, len(values)-1)+1):
        pairs = [(values[i], values[i-lag]) for i in range(lag, len(values))
                 if finite(values[i]) and finite(values[i-lag])]
        value = sum((a-mean)*(b-mean) for a, b in pairs)/denominator if pairs and denominator > 1e-20 else None
        output.append(dict(lag=lag, value=value, pairs=len(pairs)))
    return output


def decompose(rows, metric):
    """Classical 2x12 moving average; split trend-cycle using a linear trend."""
    values = [r.get(metric) for r in rows]
    n = len(rows)
    smooth = [None] * n
    for i in range(6, n-6):
        window = values[i-6:i+7]
        if all(finite(v) for v in window):
            smooth[i] = (window[0]/2 + sum(window[1:-1]) + window[-1]/2)/12
    seasonal = []
    for month in range(1, 13):
        v = [values[i]-smooth[i] for i, r in enumerate(rows)
             if int(r['date'][5:7]) == month and smooth[i] is not None and finite(values[i])]
        seasonal.append(statistics.mean(v) if v else None)
    if any(v is None for v in seasonal):
        raise ValueError('Для розкладу потрібні щонайменше три роки з повними місяцями всіх сезонів.')
    center = statistics.mean(seasonal)
    seasonal = [v-center for v in seasonal]
    fit = regression([(i/12, smooth[i]) for i in range(n) if smooth[i] is not None])
    output = []
    for i, r in enumerate(rows):
        trend = fit['intercept']+fit['slope']*i/12 if fit['slope'] is not None else None
        season = seasonal[int(r['date'][5:7])-1]
        cycle = smooth[i]-trend if smooth[i] is not None and trend is not None else None
        residual = values[i]-smooth[i]-season if finite(values[i]) and smooth[i] is not None else None
        output.append(dict(date=r['date'], value=values[i], trend=trend, seasonal=season,
                           trend_cycle=smooth[i], cycle=cycle, residual=residual))
    monthly = []
    years = sorted({int(r['date'][:4]) for r in rows})
    # Compare disjoint early/late periods, each at most 30 years.
    width = min(30, len(years)//2)
    early, late = years[:width], years[-width:] if width else []
    for month in range(1, 13):
        members = [(int(r['date'][:4]), r.get(metric)) for r in rows if int(r['date'][5:7]) == month and finite(r.get(metric))]
        before = [v for y, v in members if y in early]
        after = [v for y, v in members if y in late]
        a, b = (statistics.mean(before) if before else None), (statistics.mean(after) if after else None)
        monthly_fit = regression(members)
        monthly.append(dict(month=month, count=len(members), mean=statistics.mean(v for _, v in members) if members else None,
                            early=a, late=b, early_count=len(before), late_count=len(after),
                            change=b-a if a is not None and b is not None else None,
                            per_decade=monthly_fit['slope']*10 if monthly_fit['slope'] is not None else None))
    residuals = [r['residual'] for r in output if r['residual'] is not None]
    return dict(rows=output, trend=fit, per_decade=fit['slope']*10 if fit['slope'] is not None else None,
                residual_sd=statistics.pstdev(residuals) if residuals else None, monthly=monthly,
                residual_acf=residual_acf([r['residual'] for r in output]),
                early_period=[early[0], early[-1]] if early else [], late_period=[late[0], late[-1]] if late else [],
                complete=sum(finite(v) for v in values), total=n,
                method='Y = T + S + C + E; M = MA(2×12); S = centered monthly mean(Y−M); T = OLS(M); C = M−T; E = Y−M−S')


class SeriesSelection(BaseModel):
    region: str = 'UA-46'
    metric: str = 'temperature'
    start: str = Field(default='1960-01', pattern=r'^\d{4}-(0[1-9]|1[0-2])$')
    end: str = Field(default='2025-12', pattern=r'^\d{4}-(0[1-9]|1[0-2])$')


def create_time_series_router(data):
    router = APIRouter(prefix='/api/time-series')

    @router.get('/options')
    def options():
        return dict(regions=REGIONS, start='1960-01', end=latest_month())

    @router.post('/report')
    def report(s: SeriesSelection):
        if s.region not in REGIONS or s.metric not in METRICS:
            raise HTTPException(400, 'Невідома область або показник')
        if not '1960-01' <= s.start <= s.end <= latest_month() or month_index(s.end)-month_index(s.start)<35:
            raise HTTPException(400, 'Оберіть щонайменше 36 місяців від 1960 року до останнього опублікованого повного місяця')
        rows, meta = history(s.region, s.end, data/'regional_history', s.start)
        selected = [r for r in rows if s.start <= r['date'] <= s.end]
        try:
            result = decompose(selected, s.metric)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        return dict(**result, meta=meta, filters=s.model_dump())

    return router
