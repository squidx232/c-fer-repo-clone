#!/usr/bin/env python3
"""Summarize raw sample snapshots without promoting them to manufacturer records."""
import argparse
import json
import math
from pathlib import Path


def positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def summarize(report):
    rows = []
    for sample in report['samples']:
        attempt = sample['result']
        if attempt['status'] != 'success':
            rows.append(dict(file=sample['file'], status='parse-failed'))
            continue
        for definition in attempt['result']['equipmentDefinitions']:
            pump = definition.get('Pump') or {}
            company = pump.get('Company')
            populated = isinstance(company, str) and company.strip() not in ('', '<None>') and all(
                positive(pump.get(field)) for field in ('Displacement', 'PressureRating'))
            rows.append(dict(file=sample['file'], description=definition.get('Description'),
                             pumpCompany=company, pumpIndex=definition.get('PumpIndex'),
                             pumpFieldsPopulated=populated,
                             status='raw-unvalidated' if populated else 'pump-unpopulated',
                             importableManufacturerRecord=False))
    return dict(scope='sample evidence only; no manufacturer database extraction',
                unitNormalizationVerified=False, manufacturerRecordsImported=0,
                sampleCount=report['sampleCount'], equipmentDefinitionCount=report['equipmentCount'],
                populatedPumpSnapshots=sum(bool(r.get('pumpFieldsPopulated')) for r in rows),
                rows=rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    local = Path(__file__).resolve().parents[1] / '.local-analysis'
    if local.resolve() not in args.output.resolve().parents:
        raise ValueError('Derived output must remain in workspace .local-analysis')
    result = summarize(json.loads(args.input.read_text()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'rows'}, indent=2))


if __name__ == '__main__':
    main()
