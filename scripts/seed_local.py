"""Import downloaded datasets and the user's original EM-DAT without replacing user data."""
import asyncio
import csv
import io
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from fastapi import UploadFile
from backend.main import app, upload, commit, ImportConfig, connect
from fastapi.testclient import TestClient

async def weather(path,name):
    if not path.exists():raise FileNotFoundError(path)
    with connect() as con:
        existing=con.execute('SELECT id FROM datasets WHERE name=? AND spatial_kind=?',(name,'point')).fetchone()
    if existing:
        print(f'Already imported: {name}',flush=True);return existing['id']
    raw=path.read_bytes()
    preview=await upload(UploadFile(file=io.BytesIO(raw),filename=path.name))
    result=commit(preview['token'],ImportConfig(name=name,source='Open-Meteo / ECMWF ERA5 · CC BY 4.0 · доба UTC · точки в 27 містах',spatial_kind='point',mapping=preview['mapping']))
    print(f'Imported {name}: {result["report"]["valid"]} records / {len(result["report"]["regions"])} territories',flush=True)
    return result['id']

async def main():
    sample=ROOT/'samples/era5_2000_2025_all_regions.csv'
    for year in [2023,2024,2025]:
        target=ROOT/f'samples/era5_{year}_all_regions.csv'
        with sample.open(encoding='utf-8-sig',newline='') as src,target.open('w',encoding='utf-8-sig',newline='') as dst:
            reader=csv.DictReader(src);writer=csv.DictWriter(dst,reader.fieldnames);writer.writeheader()
            writer.writerows(row for row in reader if row['date'].startswith(str(year)))
        provenance=json.loads(sample.with_suffix('.source.json').read_text(encoding='utf-8'))
        with target.open(encoding='utf-8-sig') as check: rows=sum(1 for _ in csv.DictReader(check))
        provenance.update({'start':f'{year}-01-01','end':f'{year}-12-31','rows':rows,'note':'Filtered from the 2000–2025 snapshot; representative points, not area means'})
        target.with_suffix('.source.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2),encoding='utf-8')
    await weather(ROOT/'samples/era5_1950_all_regions.csv','ERA5 · усі області · 1950')
    for year in [2023,2024,2025]:
        await weather(ROOT/f'samples/era5_{year}_all_regions.csv',f'ERA5 · усі області · {year}')
    await weather(sample,'ERA5 · усі області · 2000–2025')
    original=next(ROOT.parent.glob('public_emdat_custom_request_*.xlsx'))
    client=TestClient(app)
    response=client.post('/api/disaster-uploads',files={'file':(original.name,original.read_bytes(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    response.raise_for_status();preview=response.json()
    committed=client.post(f'/api/disaster-uploads/{preview["token"]}/commit',json={'name':'Катастрофи України · EM-DAT · 2000–2025'})
    committed.raise_for_status()
    print(f'EM-DAT imported: {json.dumps(preview["report"],ensure_ascii=False)}',flush=True)

if __name__=='__main__':asyncio.run(main())
