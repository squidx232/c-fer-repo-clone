#!/usr/bin/env python3
"""Map original catalog schema and desktop screen names; no equipment rows/assets."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def schema(text):
    entities = []
    for match in re.finditer(r'\[Table\("([^"]+)"\)\]\s+(?:public|internal) class (\w+)', text):
        tail = text[match.end():]
        next_table = tail.find('[Table(')
        if next_table >= 0:
            tail = tail[:next_table]
        properties = re.findall(r'^\s+public (?:virtual )?([\w.?<>]+) (\w+)\s*\n\s*\{', tail, re.M)
        entities.append({'table': match[1], 'entity': match[2],
                         'properties': [{'type': t, 'name': n} for t, n in properties]})
    return entities


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-report', type=Path, default=ROOT / '.local-analysis/runtime-paths/runtime-paths.json')
    args = parser.parse_args()
    report = json.loads(args.runtime_report.read_text())
    data = (ROOT / '.local-analysis/managed-core/pcpump.data.dll.cs').read_text()
    resources = report.get('desktopResources', {}).get('result', {}).get('resources', [])
    screens = sorted(r['name'] for r in resources if r['name'].endswith('.baml'))
    result = {'scope': 'schema/screen inventory only, no equipment records or behavioral parity',
              'equipmentEntities': schema(data), 'desktopResources': screens,
              'runtimeStatus': {k: v.get('status') for k, v in report.items() if isinstance(v, dict)}}
    destination = ROOT / '.local-analysis/desktop-catalog-inventory.json'
    destination.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'entities': len(result['equipmentEntities']), 'bamlResources': len(screens),
                      'runtimeStatus': result['runtimeStatus']}, indent=2))


if __name__ == '__main__':
    main()
