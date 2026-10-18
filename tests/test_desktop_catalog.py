import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', Path(__file__).resolve().parents[1] / 'scripts/inventory-desktop-catalog.py')
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


class SchemaTests(unittest.TestCase):
    def test_public_and_internal_tables_and_property_types(self):
        text = '''[Table("pump")]
internal class Pump
{
 public double? Rating
 {
 get; set;
 }
 public string Model
 {
 get; set;
 }
}
[Table("rod")]
public class Rod
{
 public int Id
 {
 get; set;
 }
}
'''
        tables = inventory.schema(text)
        self.assertEqual(len(tables), 2)
        self.assertEqual(tables[0]['table'], 'pump')
        self.assertEqual(tables[0]['properties'], [{'type': 'double?', 'name': 'Rating'}, {'type': 'string', 'name': 'Model'}])
        self.assertEqual(tables[1]['properties'], [{'type': 'int', 'name': 'Id'}])


if __name__ == '__main__':
    unittest.main()
