import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('stage_msi', Path(__file__).resolve().parents[1] / 'scripts/stage-msi-application.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StagingTests(unittest.TestCase):
    def mapping(self, names=('a.dll', 'b.dll')):
        return module.build_mapping(
            [dict(File='file' + str(i), Component_='c' + str(i), FileName=name, FileSize='3') for i, name in enumerate(names)],
            [dict(Component='c0', Directory_='app'), dict(Component='c1', Directory_='native')],
            [dict(Directory='app', Directory_Parent='root', DefaultDir='SHORT|Application'),
             dict(Directory='native', Directory_Parent='app', DefaultDir='x64:source')], 'root')

    def test_long_names_and_native_paths(self):
        mapping = self.mapping(('SHORT|Actual.dll', 'SQLite.Interop.dll'))
        self.assertEqual(str(mapping[0][1]), 'Application/Actual.dll')
        self.assertEqual(str(mapping[1][1]), 'Application/x64/SQLite.Interop.dll')

    def test_reject_unsafe_names(self):
        for name in ('../bad', 'C:\\bad', 'a\\b', '..', '\\root'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                module.long_name(name)

    def test_reject_cycle(self):
        with self.assertRaises(ValueError):
            module.build_mapping([dict(File='a', Component_='c', FileName='a', FileSize='0')],
                [dict(Component='c', Directory_='a')],
                [dict(Directory='a', Directory_Parent='b', DefaultDir='a'),
                 dict(Directory='b', Directory_Parent='a', DefaultDir='b')], 'root')

    def test_reject_windows_case_collision(self):
        with self.assertRaises(ValueError):
            module.build_mapping([dict(File=str(i), Component_='c', FileName=n, FileSize='0')
                                  for i, n in enumerate(('A.dll', 'a.dll'))],
                                 [dict(Component='c', Directory_='root')], [], 'root')

    def test_validated_copy_and_stale_rejection(self):
        # Temporary directories remain within the provided workspace.
        with tempfile.TemporaryDirectory(prefix='tmp_rovodev_', dir=Path(__file__).resolve().parents[1]) as tmp:
            root = Path(tmp)
            source = root / 'source'
            source.mkdir()
            (source / 'file0').write_bytes(b'abc')
            (source / 'file1').write_bytes(b'def')
            output = root / 'output'
            records = module.stage(source, output, self.mapping())
            self.assertEqual(len(records), 2)
            self.assertEqual((output / 'Application/x64/b.dll').read_bytes(), b'def')
            with self.assertRaises(ValueError):
                module.stage(source, output, self.mapping())

    def test_preflight_prevents_partial_copy(self):
        with tempfile.TemporaryDirectory(prefix='tmp_rovodev_', dir=Path(__file__).resolve().parents[1]) as tmp:
            root = Path(tmp)
            source = root / 'source'
            source.mkdir()
            (source / 'file0').write_bytes(b'abc')
            output = root / 'output'
            with self.assertRaises(ValueError):
                module.stage(source, output, self.mapping())
            self.assertFalse(output.exists())
