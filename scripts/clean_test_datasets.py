"""Remove only the known browser smoke fixture, after backing up SQLite."""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1]
database = root / 'data' / 'climate.sqlite'
with sqlite3.connect(database) as connection:
    ids = [row[0] for row in connection.execute(
        "SELECT id FROM datasets WHERE name = ? AND source = ?",
        ('browser-smoke', 'E2E automated fixture'),
    )]
    if ids:
        backup_dir = database.parent / 'backups'
        backup_dir.mkdir(exist_ok=True)
        backup = backup_dir / f"before-ui-cleanup-{datetime.now(timezone.utc):%Y%m%dT%H%M%S%f}.sqlite"
        with sqlite3.connect(backup) as destination:
            connection.backup(destination)
        connection.executemany('DELETE FROM observations WHERE dataset_id = ?', [(id,) for id in ids])
        connection.executemany('DELETE FROM datasets WHERE id = ?', [(id,) for id in ids])
        print(f'Removed {len(ids)} test datasets. Backup: {backup}')
    else:
        print('No matching test datasets found.')
