#!/usr/bin/env python3
"""Inventory decompiled methods without claiming semantic recovery or parity.

Output stays in .local-analysis; method text is not copied into the inventory.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLASS = re.compile(r'^public (?:(?:static|sealed|abstract) )*class ([^\s:{]+)')
METHOD = re.compile(r'^\t(?:public|private|internal|protected) .+\([^;]*\)\s*$')
WARNING = re.compile(r'//IL_[^\n]+(?:Unknown|Expected|Invalid)[^\n]*')


def inventory(source):
    text = source.read_text(encoding='utf-8')
    lines = text.splitlines()
    classes = []
    current = None
    for index, line in enumerate(lines):
        match = CLASS.match(line)
        if match:
            if current:
                current['end_line'] = index
            current = {'name': match.group(1), 'start_line': index + 1,
                       'end_line': len(lines), 'methods': []}
            classes.append(current)
        elif current and METHOD.match(line):
            current['methods'].append({'signature': line.strip(), 'line': index + 1})
    for cls in classes:
        for i, method in enumerate(cls['methods']):
            end = cls['methods'][i + 1]['line'] - 1 if i + 1 < len(cls['methods']) else cls['end_line']
            body = '\n'.join(lines[method['line'] - 1:end])
            method.update(end_line=end, decompiler_warning_count=len(WARNING.findall(body)),
                          switch_case_count=len(re.findall(r'\bcase\s+', body)),
                          math_calls=sorted(set(re.findall(r'Math\.([A-Za-z0-9_]+)', body))))
    return {'source_file': source.name, 'source_sha256': hashlib.sha256(text.encode()).hexdigest(),
            'scope': 'syntactic inventory only; obfuscated state machines are NOT resolved',
            'class_count': len(classes), 'method_count': sum(len(c['methods']) for c in classes),
            'decompiler_warning_count': len(WARNING.findall(text)), 'classes': classes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / '.local-analysis/managed-core/pcpump.engine.dll.cs')
    args = parser.parse_args()
    output = ROOT / '.local-analysis/engine-obfuscation-map.json'
    result = inventory(args.source)
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'classes'}, indent=2))


if __name__ == '__main__':
    main()
