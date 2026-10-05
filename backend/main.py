import csv
import io
import json
import math
import os
import sqlite3
import statistics
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .regions import REGIONS, region_code
from .disasters import create_router

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get('CLIMATE_DATA_DIR', ROOT / 'data'))
DATA.mkdir(parents=True, exist_ok=True)
UPLOADS = DATA / 'uploads'
UPLOADS.mkdir(exist_ok=True)
DB = DATA / 'climate.sqlite'
VARIABLES = {
    'temperature': {'label': 'Температура', 'unit': '°C'},
    'precipitation': {'label': 'Опади', 'unit': 'мм'},
    'humidity': {'label': 'Вологість', 'unit': '%'},
    'wind': {'label': 'Вітер', 'unit': 'м/с'},
}

def connect():
    con = sqlite3.connect(DB, timeout=30)
    con.row_factory = sqlite3.Row
    return con

with connect() as con:
    con.executescript('''
    CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY, name TEXT, source TEXT,
      spatial_kind TEXT, filename TEXT, created TEXT, report TEXT);
    CREATE TABLE IF NOT EXISTS observations(dataset_id TEXT, date TEXT, region TEXT,
      temperature REAL, precipitation REAL, humidity REAL, wind REAL,
      PRIMARY KEY(dataset_id,date,region));
    CREATE INDEX IF NOT EXISTS obs_filter ON observations(dataset_id,region,date);
    ''')

app = FastAPI(title='Обрій · локальна кліматична лабораторія', version='0.1.0')
app.include_router(create_router(connect, DATA))

class ImportConfig(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    source: str = Field(default='Власний CSV', max_length=500)
    spatial_kind: Literal['regional', 'point'] = 'regional'
    mapping: dict[str, str]
    units: dict[str, str] = {}
    date_format: Literal['iso', 'dmy'] = 'iso'
    skip_invalid: bool = False

def upload_path(token):
    try:
        token = str(uuid.UUID(token))
    except ValueError:
        raise HTTPException(404, 'Файл не знайдено')
    path = UPLOADS / (token + '.json')
    if not path.exists():
        raise HTTPException(404, 'Файл не знайдено')
    return path

def read_upload(token):
    return json.loads(upload_path(token).read_text(encoding='utf-8'))

@app.get('/api/health')
def health():
    return {'status': 'ok'}

@app.get('/api/metadata')
def metadata():
    return {'regions': REGIONS, 'variables': VARIABLES, 'max_upload_mb': 20}

@app.post('/api/uploads')
async def upload(file: UploadFile = File(...)):
    if not (file.filename or '').lower().endswith('.csv'):
        raise HTTPException(400, 'Перша версія підтримує CSV. Збережіть XLSX як CSV UTF-8.')
    raw = await file.read(20 * 1024 * 1024 + 1)
    await file.close()
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(413, 'Максимальний розмір CSV — 20 МБ.')
    try:
        content = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise HTTPException(400, 'Збережіть файл у кодуванні UTF-8.')
    try:
        dialect = csv.Sniffer().sniff(content[:8192], delimiters=',;\t')
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(content), dialect=dialect)
    headers = reader.fieldnames
    if not headers or len(headers) != len(set(headers)) or any(not h.strip() for h in headers):
        raise HTTPException(400, 'CSV має містити непорожні унікальні назви колонок.')
    rows = []
    try:
        for row in reader:
            if None in row or any(v is None for v in row.values()):
                raise HTTPException(400, f'Неправильна кількість колонок у записі {len(rows) + 2}.')
            if any(v.strip() for v in row.values()):
                rows.append(row)
            if len(rows) > 1000000:
                raise HTTPException(413, 'Підтримується до 1 000 000 рядків.')
    except csv.Error:
        raise HTTPException(400, 'Не вдалося прочитати CSV. Перевірте лапки та роздільники.')
    if not rows:
        raise HTTPException(400, 'У файлі немає записів.')
    token = str(uuid.uuid4())
    filename = Path(file.filename.replace('\\', '/')).name
    payload = {'headers': headers, 'rows': rows, 'filename': filename}
    (UPLOADS / f'{token}.json').write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    (UPLOADS / f'{token}.csv').write_bytes(raw)
    aliases = {'date': ['date','дата','time'], 'region': ['region','область','oblast','region_code'],
               'temperature': ['temperature','t_avg','temperature_2m_mean','температура'],
               'precipitation': ['precipitation','rainfall','precipitation_sum','опади'],
               'humidity': ['humidity','rh','relative_humidity_2m_mean','вологість'],
               'wind': ['wind','wind_speed_10m_mean','вітер']}
    mapping = {key: next((h for h in headers if h.strip().lower() in choices), '') for key, choices in aliases.items()}
    return {'token': token, 'headers': headers, 'preview': rows[:5], 'total': len(rows), 'filename': filename, 'mapping': mapping}

def validate(token, config):
    payload = read_upload(token)
    mapping = {k: v for k, v in config.mapping.items() if v}
    if not mapping.get('date') or not mapping.get('region'):
        raise HTTPException(400, 'Зіставте дату та область.')
    metrics = [v for v in VARIABLES if v in mapping]
    if not metrics:
        raise HTTPException(400, 'Виберіть хоча б один погодний показник.')
    if len(set(mapping.values())) != len(mapping):
        raise HTTPException(400, 'Одна колонка не може відповідати кільком полям.')
    if any(v not in payload['headers'] for v in mapping.values()):
        raise HTTPException(400, 'Зіставлена колонка відсутня у файлі.')
    accepted_units = {'temperature': ['C','K'], 'precipitation': ['mm','m'], 'humidity': ['percent','fraction'], 'wind': ['ms','kmh']}
    for key in metrics:
        if config.units.get(key, accepted_units[key][0]) not in accepted_units[key]:
            raise HTTPException(400, 'Невідомі одиниці вимірювання.')
    valid, errors, seen = [], [], set()
    missing = {v: 0 for v in metrics}
    for index, row in enumerate(payload['rows'], 2):
        reasons, item = [], {v: None for v in VARIABLES}
        try:
            raw_date = row[mapping['date']].strip()
            day = date.fromisoformat(raw_date) if config.date_format == 'iso' else datetime.strptime(raw_date, '%d.%m.%Y').date()
            if not 1900 <= day.year <= 2100:
                raise ValueError()
            item['date'] = day.isoformat()
        except ValueError:
            reasons.append('Некоректна дата або рік поза 1900–2100')
        item['region'] = region_code(row[mapping['region']])
        if not item['region']:
            reasons.append('Невідома область: використайте назву або код UA-XX')
        for key in metrics:
            raw = row[mapping[key]].strip()
            if raw.lower() in ['', 'na', 'nan', 'null', 'n/a', '-']:
                continue
            try:
                value = float(raw.replace(',', '.'))
                if not math.isfinite(value):
                    raise ValueError()
                unit = config.units.get(key, accepted_units[key][0])
                if unit == 'K': value -= 273.15
                if unit == 'm': value *= 1000
                if unit == 'fraction': value *= 100
                if unit == 'kmh': value /= 3.6
                if (key == 'humidity' and not 0 <= value <= 100) or (key in ['precipitation','wind'] and value < 0) or (key == 'temperature' and value < -273.15):
                    raise ValueError()
                item[key] = round(value, 6)
            except ValueError:
                reasons.append(f"{VARIABLES[key]['label']}: нечислове або фізично некоректне значення")
        if all(item[v] is None for v in metrics):
            reasons.append('Немає жодного числового показника')
        pair = (item.get('date'), item['region'])
        if not reasons and pair in seen:
            reasons.append('Повтор дати й області; перший коректний запис збережено')
        if reasons:
            errors.append({'row': index, 'reason': '; '.join(reasons), 'values': row})
        else:
            seen.add(pair)
            valid.append(item)
            for key in metrics:
                missing[key] += item[key] is None
    dates = sorted({v['date'] for v in valid})
    report = {'total': len(payload['rows']), 'valid': len(valid), 'invalid': len(errors),
              'missing': missing, 'regions': sorted({v['region'] for v in valid}),
              'start': dates[0] if dates else None, 'end': dates[-1] if dates else None,
              'variables': metrics, 'errors': errors[:30]}
    return valid, errors, report

@app.post('/api/uploads/{token}/validate')
def preview_validation(token: str, config: ImportConfig):
    return validate(token, config)[2]

def csv_response(rows, fields, filename):
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fields, extrasaction='ignore')
    writer.writeheader()
    for row in rows:
        safe = {k: ("'" + v if isinstance(v, str) and v.lstrip().startswith(('=', '+', '-', '@')) else v) for k, v in row.items()}
        writer.writerow(safe)
    return Response(buffer.getvalue().encode('utf-8-sig'), media_type='text/csv; charset=utf-8', headers={'Content-Disposition': f'attachment; filename="{filename}"'})

@app.post('/api/uploads/{token}/errors')
def error_export(token: str, config: ImportConfig):
    _, errors, _ = validate(token, config)
    return csv_response([{'row': e['row'], 'reason': e['reason'], 'original': json.dumps(e['values'], ensure_ascii=False)} for e in errors], ['row','reason','original'], 'import-errors.csv')

@app.post('/api/uploads/{token}/commit')
def commit(token: str, config: ImportConfig):
    valid, errors, report = validate(token, config)
    if not valid:
        raise HTTPException(400, 'Немає коректних записів для імпорту.')
    if errors and not config.skip_invalid:
        raise HTTPException(400, 'Підтвердьте імпорт без помилкових рядків або виправте файл.')
    payload = read_upload(token)
    ident = str(uuid.uuid4())
    with connect() as con:
        con.execute('INSERT INTO datasets VALUES(?,?,?,?,?,?,?)', (ident, config.name.strip(), config.source.strip(), config.spatial_kind, token, datetime.now().isoformat(), json.dumps(report, ensure_ascii=False)))
        con.executemany('INSERT INTO observations VALUES(?,?,?,?,?,?,?)', [(ident, r['date'], r['region'], r['temperature'], r['precipitation'], r['humidity'], r['wind']) for r in valid])
    return {'id': ident, 'report': report}

@app.get('/api/datasets')
def datasets():
    with connect() as con:
        rows = con.execute('SELECT * FROM datasets ORDER BY created DESC').fetchall()
    return [{**dict(row), 'report': json.loads(row['report'])} for row in rows]

def get_dataset(ident):
    with connect() as con:
        row = con.execute('SELECT * FROM datasets WHERE id=?', (ident,)).fetchone()
    if not row:
        raise HTTPException(404, 'Датасет не знайдено')
    return dict(row)

def filtered_rows(ident, region, start, end):
    get_dataset(ident)
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError:
        raise HTTPException(400, 'Невірна дата')
    if first > last:
        raise HTTPException(400, 'Початок має бути не пізніше кінця')
    if region and region not in REGIONS:
        raise HTTPException(400, 'Невідома область')
    with connect() as con:
        return [dict(r) for r in con.execute('SELECT * FROM observations WHERE dataset_id=? AND date BETWEEN ? AND ?' + (' AND region=?' if region else '') + ' ORDER BY date', [ident, start, end] + ([region] if region else []))]

@app.get('/api/datasets/{ident}/analysis')
def analysis(ident: str, variable: Literal['temperature','precipitation','humidity','wind'], region: str, start: str, end: str):
    rows = filtered_rows(ident, region, start, end)
    values = [r[variable] for r in rows if r[variable] is not None]
    expected = (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
    lookup = {r['date']: r[variable] for r in rows}
    first = date.fromisoformat(start)
    # Daily series includes missing days explicitly; long windows use monthly buckets.
    series = []
    if expected <= 1500:
        series = [{'date': (first + timedelta(days=i)).isoformat(), 'value': lookup.get((first + timedelta(days=i)).isoformat())} for i in range(expected)]
    else:
        groups = {}
        for i in range(expected):
            day = (first + timedelta(days=i)).isoformat()
            groups.setdefault(day[:7], []).append(lookup.get(day))
        for month, vals in groups.items():
            available = [v for v in vals if v is not None]
            series.append({'date': month + '-01', 'value': (sum(available) if variable == 'precipitation' else statistics.mean(available)) if available else None, 'coverage': round(len(available) / len(vals) * 100, 1)})
    return {'series': series, 'resolution': 'daily' if expected <= 1500 else 'monthly',
            'stats': {'mean': statistics.mean(values) if values else None, 'min': min(values) if values else None,
                      'max': max(values) if values else None, 'sum': sum(values) if values else None,
                      'count': len(values), 'expected': expected, 'coverage': round(len(values)/expected*100, 1)}}

@app.get('/api/datasets/{ident}/map')
def map_values(ident: str, variable: Literal['temperature','precipitation','humidity','wind'], start: str, end: str):
    get_dataset(ident)
    try:
        first,last=date.fromisoformat(start),date.fromisoformat(end)
        if first>last:raise ValueError()
    except ValueError:raise HTTPException(400,'Некоректний період')
    expected=(last-first).days+1
    aggregate='SUM' if variable=='precipitation' else 'AVG'
    # variable is constrained by the Literal above; aggregate is selected internally.
    with connect() as con:
        rows=con.execute(f'SELECT region,{aggregate}({variable}) AS value,COUNT({variable}) AS count FROM observations WHERE dataset_id=? AND date BETWEEN ? AND ? GROUP BY region HAVING COUNT({variable})>0',(ident,start,end)).fetchall()
    return {row['region']:{'value':row['value'],'coverage':round(row['count']/expected*100,1)} for row in rows}

@app.get('/api/datasets/{ident}/export')
def export(ident: str, start: str, end: str, region: str | None = None):
    rows = filtered_rows(ident, region, start, end)
    return csv_response(rows, ['date','region',*VARIABLES], 'weather-selection.csv')

@app.get('/api/datasets/{ident}/original')
def original(ident: str):
    dataset = get_dataset(ident)
    return FileResponse(UPLOADS / (dataset['filename'] + '.csv'), filename='original.csv', media_type='text/csv')

@app.get('/api/sample')
def sample():
    path = ROOT / 'samples' / ('era5_2000_2025_all_regions.csv' if (ROOT / 'samples' / 'era5_2000_2025_all_regions.csv').exists() else 'era5_2024.csv')
    if not path.exists():
        raise HTTPException(404, 'Приклад ще не завантажено.')
    return FileResponse(path, filename=path.name, media_type='text/csv')

@app.post('/api/sample/import')
async def sample_import():
    expanded=(ROOT / 'samples' / 'era5_2000_2025_all_regions.csv').exists()
    path = ROOT / 'samples' / ('era5_2000_2025_all_regions.csv' if expanded else 'era5_2024.csv')
    if not path.exists():
        raise HTTPException(404, 'Приклад ще не завантажено.')
    name='ERA5 · усі області · 2000–2025' if expanded else 'ERA5 · Україна · 2024'
    with connect() as con:
        existing=con.execute('SELECT id FROM datasets WHERE name=? AND spatial_kind=?',(name,'point')).fetchone()
    if existing:return {'id':existing['id']}
    with path.open('rb') as file:
        preview = await upload(UploadFile(file=file, filename=path.name))
    return commit(preview['token'], ImportConfig(name=name, source=f'Open-Meteo / ECMWF ERA5 · CC BY 4.0 · доба UTC · точки в {27 if expanded else 6} містах', spatial_kind='point', mapping=preview['mapping']))

@app.get('/api/sample/source')
def sample_source():
    path=ROOT / 'samples' / 'era5_2000_2025_all_regions.source.json'
    return FileResponse(path if path.exists() else ROOT / 'samples' / 'source.json', media_type='application/json')

DIST = ROOT / 'frontend' / 'dist'
if DIST.exists():
    app.mount('/', StaticFiles(directory=DIST, html=True), name='frontend')
