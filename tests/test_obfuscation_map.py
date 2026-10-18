import importlib.util
import os
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'mapper', Path(__file__).resolve().parents[1] / 'scripts/map-engine-obfuscation.py')
mapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mapper)


class MapTests(unittest.TestCase):
    def test_signatures_warnings_and_math_are_inventory_not_semantics(self):
        code = '''public static class first
{
\tpublic static double a(double x)
\t{
\t\t//IL_0010: Unknown result type
\t\tswitch (x) { case 0: return Math.Pow(x, 2); }
\t}
\tprivate static double b(double x)
\t{
\t\treturn Math.Log(x);
\t}
}
public sealed class second
{
\tpublic void c()
\t{
\t}
}
'''
        # Respect workspace-scoped TMPDIR when run with the other analysis tests.
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as directory:
            p = Path(directory) / 'synthetic.cs'
            p.write_text(code)
            result = mapper.inventory(p)
        self.assertEqual(result['class_count'], 2)
        self.assertEqual(result['method_count'], 3)
        self.assertEqual(result['decompiler_warning_count'], 1)
        first = result['classes'][0]['methods'][0]
        self.assertEqual(first['math_calls'], ['Pow'])
        self.assertEqual(first['switch_case_count'], 1)
        self.assertEqual(first['decompiler_warning_count'], 1)
        self.assertEqual(result['classes'][0]['methods'][1]['decompiler_warning_count'], 0)
        self.assertIn('NOT resolved', result['scope'])


if __name__ == '__main__':
    unittest.main()
