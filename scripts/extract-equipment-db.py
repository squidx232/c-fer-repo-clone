#!/usr/bin/env python3
"""Read-only SQLite table extraction; never guesses encryption keys or units.

Non-SQLite input produces a diagnostic report and exit code 2, not equipment rows.
The raw export is an inspection artifact, NOT an SI simulation catalog.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import sqlite3

SQLITE_HEADER = b'SQLite format 3\x00'


def encode_value(value):
    if isinstance(value, bytes):
        return {'encoding': 'base64', 'data': base64.b64encode(value).decode('ascii')}
    return value


def extract(path, max_rows=100000):
    path = Path(path).resolve()
    if max_rows < 1:
        raise ValueError('max_rows must be positive')
    digest = hashlib.sha256()
    with path.open('rb') as source:
        header = source.read(16)
        digest.update(header)
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    report = dict(reportVersion=1, source=path.name, bytes=path.stat().st_size,
                  sha256=digest.hexdigest(), plaintextSqliteHeader=header == SQLITE_HEADER,
                  status='unreadable', extractedRows=0, tables=[],
                  simulationReady=False)
    if header != SQLITE_HEADER:
        report.update(status='blocked-non-sqlite', message=(
            'No plaintext SQLite header. This file cannot be decoded by the standard SQLite reader. '
            'The existing vendor investigation identifies an application-managed encrypted catalog; '
            'use an authorized application export or a readable database copy. No equipment records extracted.'))
        return report
    try:
        connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
        try:
            connection.execute('PRAGMA query_only = ON')
            connection.execute('BEGIN')
            tables = connection.execute(
                "SELECT name, sql FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
            for name, schema in tables:
                quoted = '"' + name.replace('"', '""') + '"'
                cursor = connection.execute('SELECT * FROM ' + quoted)
                rows = cursor.fetchmany(max_rows - report['extractedRows'] + 1)
                if len(rows) + report['extractedRows'] > max_rows:
                    raise ValueError('Extraction exceeds max_rows; increase --max-rows explicitly.')
                report['tables'].append(dict(
                    name=name, sql=schema, columns=[column[0] for column in cursor.description],
                    rows=[[encode_value(value) for value in row] for row in rows]))
                report['extractedRows'] += len(rows)
        finally:
            connection.close()
    except (sqlite3.DatabaseError, ValueError) as error:
        report.update(status='blocked-read-error', extractedRows=0, tables=[], message=str(error))
        return report
    report.update(status='extracted', message=(
        'Raw tables extracted without unit conversion. Verify field mappings and units, then prepare '
        'schemaVersion 1 / units SI catalog JSON before importing into the simulation.'))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--max-rows', type=int, default=100000)
    args = parser.parse_args()
    if args.database.resolve() == args.output.resolve():
        parser.error('Output must not overwrite the source database.')
    if args.output.exists():
        parser.error('Output already exists; choose a new output path.')
    try:
        report = extract(args.database, args.max_rows)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print(report['message'])
    return 0 if report['status'] == 'extracted' else 2


if __name__ == '__main__':
    raise SystemExit(main())
