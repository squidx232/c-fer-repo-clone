#!/usr/bin/env python3
"""Prepare an isolated local ASP.NET compatibility experiment, never vendor activation.

Requires a built CryptoCompat.dll, dotnet SDK and an authoritative MSI deployment.
Does not modify the input deployment or distribute transformed dependencies.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local-analysis'


def runtime_configuration(config):
    result = json.loads(json.dumps(config))
    options = result['runtimeOptions']
    frameworks = options['frameworks']
    if not any(f['name'] == 'Microsoft.AspNetCore.App' for f in frameworks):
        raise ValueError('Expected ASP.NET shared framework declaration')
    # Resolve the already-shipped app-local ASP.NET assemblies, rather than the
    # shared runtime overriding the isolated compatibility dependency.
    options['frameworks'] = [f for f in frameworks if f['name'] != 'Microsoft.AspNetCore.App']
    if not any(f['name'] == 'Microsoft.WindowsDesktop.App' for f in options['frameworks']):
        raise ValueError('Expected original WindowsDesktop framework')
    return result


def prepare(source, destination, patcher, dotnet):
    source, destination = source.resolve(), destination.resolve()
    if LOCAL.resolve() not in destination.parents:
        raise ValueError('Experimental deployment must stay in .local-analysis')
    if source == destination or source in destination.parents or destination in source.parents:
        raise ValueError('Source and destination must be separate non-nested directories')
    if destination.exists():
        raise ValueError('Use a new destination; refusing stale deployment')
    original = source / 'Microsoft.AspNetCore.DataProtection.dll'
    config = source / 'PcPump.runtimeconfig.json'
    updated = runtime_configuration(json.loads(config.read_text()))
    if not (source / 'Microsoft.AspNetCore.Cryptography.Internal.dll').is_file():
        raise ValueError('Missing application-local ASP.NET dependencies')
    shutil.copytree(source, destination)
    output = destination / original.name
    output.unlink()
    result = subprocess.run([str(dotnet.resolve()), str(patcher.resolve()), str(original), str(output)],
                            check=True, capture_output=True, text=True)
    (destination / config.name).write_text(json.dumps(updated, indent=2) + '\n')
    # Verify all other input files, including vendor assemblies/catalogs, unchanged.
    unchanged = 0
    for file in source.rglob('*'):
        if file.is_file() and file not in (original, config):
            copy = destination / file.relative_to(source)
            if hashlib.sha256(file.read_bytes()).digest() != hashlib.sha256(copy.read_bytes()).digest():
                raise ValueError(f'Unexpected changed file: {file.name}')
            unchanged += 1
    manifest = dict(scope='local ASP.NET compatibility experiment; no activation or catalog extraction',
                    transform=json.loads(result.stdout), unchangedFilesVerified=unchanged,
                    runtimeChange='resolve shipped application-local ASP.NET dependencies',
                    catalogAccessVerified=False)
    (destination / 'compatibility-experiment.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--patcher', type=Path, default=LOCAL / 'crypto-compat/CryptoCompat.dll')
    parser.add_argument('--dotnet', type=Path, default=LOCAL / 'dotnet/dotnet')
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.output, args.patcher, args.dotnet), indent=2))


if __name__ == '__main__':
    main()
