#!/usr/bin/env python3
"""Inventory catalog files, model schema and loader API without decrypting data.

All derived output remains local. Schema is not equipment data or decoded rows.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('catalog_schema', ROOT / 'scripts/inventory-desktop-catalog.py')
schema_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(schema_module)


def interface_methods(text):
    match = re.search(r'public interface q8\s*:[^{]+\{(.*?)\n\}', text, re.S)
    if not match:
        raise ValueError('Original q8 catalog interface not found')
    return [dict(returnType=m[1].strip(), method=m[2], parameters=m[3].strip())
            for m in re.finditer(r'^\s*([^\n;]+?)\s+(\w+)\(([^\n]*)\);', match[1], re.M)]


def inventory(application, source):
    files = []
    for variant in ('Database', 'Database_Educational'):
        path = application / variant / 'equipment.db'
        item = dict(variant=variant, relativePath=f'{variant}/equipment.db', present=path.is_file())
        if path.is_file():
            data = path.read_bytes()
            item.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                        plaintextSqliteHeader=data.startswith(b'SQLite format 3\x00'))
        files.append(item)
    return dict(scope='catalog deployment/schema/API inventory; no decoded equipment records',
                catalogs=files, schema=schema_module.schema(source),
                catalogInterface=interface_methods(source),
                loadingRequirements=dict(
                    manufacturerLoader='q6(string path, string optionalArgument = null)',
                    customDatabaseLoader='q5(string path, bool readOnly = false)',
                    connectionPath=['q6 constructor', 'q3.a', 'q1.a(bool)', 'ace.b() security context'],
                    securityInitializationRequired=True,
                    rawDatabaseDirectImportSupported=False,
                    unitNormalizationVerified=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--application', type=Path, required=True)
    parser.add_argument('--source', type=Path, default=ROOT / '.local-analysis/managed-core/pcpump.data.dll.cs')
    parser.add_argument('--output', type=Path, default=ROOT / '.local-analysis/catalog-requirements.json')
    args = parser.parse_args()
    output = args.output.resolve()
    if (ROOT / '.local-analysis').resolve() not in output.parents:
        raise ValueError('Derived catalog inventory must stay in workspace .local-analysis')
    result = inventory(args.application, args.source.read_text())
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(catalogs=result['catalogs'], tables=len(result['schema']),
                         apiMethods=len(result['catalogInterface']), output=str(output)), indent=2))


if __name__ == '__main__':
    main()
