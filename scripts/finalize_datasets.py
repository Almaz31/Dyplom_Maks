"""Synchronize derived-file metadata and remove only automated weather fixtures."""
import csv
import json
import sqlite3
from pathlib import Path

root=Path(__file__).resolve().parents[1]
for year in [2023,2024,2025]:
    path=root/f'samples/era5_{year}_all_regions.csv'
    with path.open(encoding='utf-8-sig') as file:count=sum(1 for _ in csv.DictReader(file))
    metadata=path.with_suffix('.source.json')
    data=json.loads(metadata.read_text(encoding='utf-8'));data['rows']=count
    metadata.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')

readme=root/'README.md'
text=readme.read_text(encoding='utf-8').replace(chr(8)+'ackend/disasters.py','`backend/disasters.py`')
readme.write_text(text,encoding='utf-8')

with sqlite3.connect(root/'data/climate.sqlite') as con:
    con.execute('DELETE FROM observations WHERE dataset_id IN (SELECT id FROM datasets WHERE source=?)',('E2E automated fixture',))
    con.execute('DELETE FROM datasets WHERE source=?',('E2E automated fixture',))
print('Dataset metadata synchronized; automated fixtures removed')
