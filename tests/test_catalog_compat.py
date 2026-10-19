import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('compat', ROOT / 'scripts/prepare-catalog-compat.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CompatibilityConfigurationTests(unittest.TestCase):
    def test_preserves_original_and_desktop_runtime(self):
        config = dict(runtimeOptions=dict(tfm='net8.0', frameworks=[
            dict(name='Microsoft.NETCore.App', version='8.0.10'),
            dict(name='Microsoft.WindowsDesktop.App', version='8.0.10'),
            dict(name='Microsoft.AspNetCore.App', version='8.0.10')], configProperties={'unchanged': True}))
        updated = module.runtime_configuration(config)
        self.assertEqual(len(config['runtimeOptions']['frameworks']), 3)
        self.assertEqual([f['name'] for f in updated['runtimeOptions']['frameworks']],
                         ['Microsoft.NETCore.App', 'Microsoft.WindowsDesktop.App'])
        self.assertTrue(updated['runtimeOptions']['configProperties']['unchanged'])

    def test_rejects_unexpected_runtime(self):
        for frameworks in ([], [dict(name='Microsoft.AspNetCore.App')]):
            with self.subTest(frameworks=frameworks), self.assertRaises(ValueError):
                module.runtime_configuration(dict(runtimeOptions=dict(frameworks=frameworks)))
