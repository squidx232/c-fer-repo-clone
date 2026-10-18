#!/usr/bin/env python3
"""Decompile recovered first-party assemblies locally; never execute vendor code."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / '.local-analysis/app-files')
    parser.add_argument('--timeout', type=int, default=240, help='seconds per assembly')
    args = parser.parse_args()
    output = ROOT / '.local-analysis/managed-core'
    output.mkdir(parents=True, exist_ok=True)
    results = []
    for dll in sorted(args.source.glob('pcpump*.dll')):
        target = output / (dll.name + '.cs')
        digest = hashlib.sha256(dll.read_bytes()).hexdigest()
        record = {'assembly_file': dll.name, 'sha256': digest}
        try:
            with target.open('w') as code, (output / (dll.name + '.log')).open('w') as log:
                process = subprocess.run(
                    ['bash', str(ROOT / 'scripts/analysis-tools.sh'), 'ilspy', str(dll.resolve())],
                    stdout=code, stderr=log, timeout=args.timeout, cwd=ROOT)
            record['status'] = 'decompiled' if process.returncode == 0 and target.stat().st_size else 'failed'
            record['exit_code'] = process.returncode
            record['output_bytes'] = target.stat().st_size
        except subprocess.TimeoutExpired:
            record['status'] = 'timeout'
        results.append(record)
        (output / 'inventory.json').write_text(json.dumps(results, indent=2) + '\n')
        print(json.dumps(record), flush=True)
    if not results or any(r['status'] != 'decompiled' for r in results):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
