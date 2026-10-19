import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('samples', Path(__file__).resolve().parents[1] / 'scripts/summarize-sample-equipment.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SampleEquipmentTests(unittest.TestCase):
    def report(self, pump):
        return dict(sampleCount=1, equipmentCount=1, samples=[dict(file='sample.pcp', result=dict(
            status='success', result=dict(equipmentDefinitions=[dict(Description='Sample', Pump=pump)])))])

    def test_defaults_are_not_equipment_records(self):
        result = module.summarize(self.report(dict(Company='<None>', Displacement=0, PressureRating=0)))
        self.assertEqual(result['populatedPumpSnapshots'], 0)
        self.assertFalse(result['rows'][0]['importableManufacturerRecord'])

    def test_populated_snapshot_still_not_verified_catalog_record(self):
        result = module.summarize(self.report(dict(Company='Example', Displacement=1, PressureRating=2)))
        self.assertEqual(result['populatedPumpSnapshots'], 1)
        self.assertEqual(result['manufacturerRecordsImported'], 0)
        self.assertFalse(result['rows'][0]['importableManufacturerRecord'])

    def test_invalid_numeric_values_rejected(self):
        for value in (None, True, '2', -1, 0, float('nan'), float('inf')):
            with self.subTest(value=value):
                self.assertFalse(module.positive(value))
