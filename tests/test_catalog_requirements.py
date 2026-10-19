import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('requirements', ROOT / 'scripts/catalog-requirements.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SOURCE = '''public interface q8 : global::System.IDisposable
{
 List<PumpModel> a9(bool A_0 = true);
 DatabaseVersion a5();
}
[Table("pump")]
internal class Pump
{
 public double? Rating
 {
 get; set;
 }
}
'''


class CatalogRequirementsTests(unittest.TestCase):
    def test_interface_retains_types_defaults_and_no_argument_methods(self):
        methods = module.interface_methods(SOURCE)
        self.assertEqual(methods, [dict(returnType='List<PumpModel>', method='a9', parameters='bool A_0 = true'),
                                   dict(returnType='DatabaseVersion', method='a5', parameters='')])

    def test_missing_interface_is_not_empty_success(self):
        with self.assertRaises(ValueError):
            module.interface_methods('')

    def test_catalog_variants_hashes_and_missing_files(self):
        with tempfile.TemporaryDirectory(prefix='tmp_rovodev_', dir=ROOT) as tmp:
            application = Path(tmp)
            directory = application / 'Database'
            directory.mkdir()
            (directory / 'equipment.db').write_bytes(b'SQLite format 3\x00')
            result = module.inventory(application, SOURCE)
            self.assertEqual(len(result['schema']), 1)
            self.assertTrue(result['catalogs'][0]['plaintextSqliteHeader'])
            self.assertEqual(len(result['catalogs'][0]['sha256']), 64)
            self.assertFalse(result['catalogs'][1]['present'])
            self.assertFalse(result['loadingRequirements']['rawDatabaseDirectImportSupported'])
            self.assertTrue(result['loadingRequirements']['securityInitializationRequired'])
