#!/usr/bin/env python3
"""Restore a cabinet payload using authoritative MSI tables, without executing it.

Requires msiinfo (msitools). Sources must be the unmodified, flat CAB payload.
Copies all files, preserving directory/filename case and RID-specific layouts.
Does not install registry entries, initialize licensing, or assert runtime parity.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path, PureWindowsPath
import shutil
import subprocess


def table(tool, msi, name):
    result = subprocess.run([str(tool), 'export', str(msi), name],
                            check=True, capture_output=True, text=True)
    rows = list(csv.reader(io.StringIO(result.stdout), delimiter='\t'))
    if len(rows) < 3:
        raise ValueError(f'Invalid MSI table: {name}')
    return [dict(zip(rows[0], row)) for row in rows[3:] if row]


def long_name(value):
    name = value.split('|')[-1]
    if name in ('', '.'):
        return ''
    path = PureWindowsPath(name)
    if path.is_absolute() or path.drive or len(path.parts) != 1 or name in ('..',):
        raise ValueError(f'Unsafe installer path: {value!r}')
    return name


def build_mapping(files, components, directories, root):
    dirs = {row['Directory']: row for row in directories}
    comps = {row['Component']: row['Directory_'] for row in components}
    cache = {root: Path()}

    def relative(key, visiting=None):
        if key in cache:
            return cache[key]
        visiting = set() if visiting is None else visiting
        if key in visiting or key not in dirs:
            raise ValueError(f'Invalid directory ancestry: {key}')
        visiting.add(key)
        row = dirs[key]
        parent = row['Directory_Parent']
        if not parent:
            raise ValueError(f'Directory {key} is not beneath application root {root}')
        # DefaultDir target:source; short|long syntax applies to each side.
        part = long_name(row['DefaultDir'].split(':')[0])
        cache[key] = relative(parent, visiting) / part
        visiting.remove(key)
        return cache[key]

    mapping = []
    seen = set()
    for row in files:
        source = long_name(row['File'])
        target = relative(comps[row['Component_']]) / long_name(row['FileName'])
        folded = str(target).casefold()
        if folded in seen:
            raise ValueError(f'Duplicate Windows destination: {target}')
        seen.add(folded)
        mapping.append((source, target, int(row['FileSize'])))
    return mapping


def stage(source, output, mapping):
    source, output = source.resolve(), output.resolve()
    if output == source or source in output.parents or output in source.parents:
        raise ValueError('Source and destination must be separate, non-nested directories')
    if output.exists() and any(output.iterdir()):
        raise ValueError('Destination must be empty; refusing stale or mixed deployment')
    # Validate every input before writing anything.
    for identifier, target, size in mapping:
        file = source / identifier
        if file.is_symlink() or not file.is_file() or file.stat().st_size != size:
            raise ValueError(f'Missing or size-mismatched CAB file: {identifier}')
        if target.is_absolute() or '..' in target.parts:
            raise ValueError(f'Unsafe destination: {target}')
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for identifier, target, size in mapping:
        file = source / identifier
        destination = output / target
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, destination)
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        if hashlib.sha256(destination.read_bytes()).hexdigest() != digest:
            raise OSError(f'Copy verification failed: {target}')
        records.append(dict(source=identifier, destination=target.as_posix(), bytes=size, sha256=digest))
    (output / 'msi-staging.json').write_text(json.dumps({
        'scope': 'MSI File/Component/Directory layout; not registry, activation or simulation',
        'files': records,
    }, indent=2) + '\n')
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--msiinfo', default='msiinfo')
    parser.add_argument('--msi', required=True, type=Path)
    parser.add_argument('--app-files', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--root', default='TARGETDIR', help='MSI Directory key to treat as staging root')
    args = parser.parse_args()
    mapping = build_mapping(*(table(args.msiinfo, args.msi, name)
                              for name in ('File', 'Component', 'Directory')), args.root)
    records = stage(args.app_files, args.output, mapping)
    print(f'Restored {len(records)} files from authoritative installer paths; bytes unchanged.')


if __name__ == '__main__':
    main()
