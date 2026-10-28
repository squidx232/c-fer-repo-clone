import hashlib
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('extract_equipment', ROOT / 'scripts/extract-equipment-db.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ExtractEquipmentTests(unittest.TestCase):
    def test_shipped_database_is_reported_without_inventing_rows(self):
        path = ROOT / 'equipment.db'
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        report = module.extract(path)
        self.assertEqual(report['status'], 'blocked-non-sqlite')
        self.assertEqual(report['tables'], [])
        self.assertEqual(report['extractedRows'], 0)
        self.assertFalse(report['simulationReady'])
        self.assertEqual(report['sha256'], before)
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)

    def test_sqlite_preserves_columns_nulls_blobs_and_quoted_names(self):
        with tempfile.TemporaryDirectory(prefix='tmp_rovodev_', dir=ROOT) as tmp:
            path = Path(tmp) / 'equipment.db'
            with sqlite3.connect(path) as conn:
                conn.execute('CREATE TABLE "pump""spec" (id INTEGER, name TEXT, rating REAL, extra BLOB)')
                conn.execute('INSERT INTO "pump""spec" VALUES (?, ?, ?, ?)', (1, 'Pump A', None, b'\x00\xff'))
            before = path.read_bytes()
            report = module.extract(path)
            self.assertEqual(report['status'], 'extracted')
            self.assertEqual(report['extractedRows'], 1)
            self.assertEqual(report['tables'][0]['columns'], ['id', 'name', 'rating', 'extra'])
            self.assertEqual(report['tables'][0]['rows'], [[1, 'Pump A', None, {'encoding': 'base64', 'data': 'AP8='}]])
            self.assertFalse(report['simulationReady'])
            self.assertEqual(path.read_bytes(), before)

    def test_row_limit_rejects_partial_export_and_corrupt_sqlite(self):
        with tempfile.TemporaryDirectory(prefix='tmp_rovodev_', dir=ROOT) as tmp:
            path = Path(tmp) / 'equipment.db'
            with sqlite3.connect(path) as conn:
                conn.execute('CREATE TABLE pumps (id INTEGER)')
                conn.executemany('INSERT INTO pumps VALUES (?)', [(1,), (2,)])
            report = module.extract(path, max_rows=1)
            self.assertEqual(report['status'], 'blocked-read-error')
            self.assertEqual(report['tables'], [])
            self.assertEqual(report['extractedRows'], 0)
            path.write_bytes(module.SQLITE_HEADER + b'broken')
            self.assertEqual(module.extract(path)['status'], 'blocked-read-error')
