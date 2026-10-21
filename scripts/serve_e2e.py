"""Serve browser tests against a temporary copy of the local data."""
import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

import uvicorn

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
with tempfile.TemporaryDirectory(prefix='obrii-e2e-') as directory:
    target = Path(directory)
    source = root / 'data' / 'climate.sqlite'
    if source.exists():
        with sqlite3.connect(source) as original, sqlite3.connect(target / 'climate.sqlite') as copy:
            original.backup(copy)
    for name in ['uploads', 'disaster_uploads']:
        if (root / 'data' / name).exists():
            shutil.copytree(root / 'data' / name, target / name)
    os.environ['CLIMATE_DATA_DIR'] = directory
    uvicorn.run('backend.main:app', host='127.0.0.1', port=8002)
