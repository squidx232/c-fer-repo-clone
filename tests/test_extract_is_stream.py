"""Synthetic format tests: never redistribute vendor application data."""
import contextlib
import importlib.util
import io
import struct
import tempfile
import unittest
import zlib
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "extractor", Path(__file__).resolve().parents[1] / "scripts/extract-is-stream.py")
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


def archive(name="test.bin", content=b"hello" * 1000, version=4, encoded=True):
    payload = zlib.compress(content)
    if encoded:
        seed = name.encode()
        key = bytes(v ^ (0x13, 0x35, 0x86, 0x07)[i % 4] for i, v in enumerate(seed))
        transformed = bytearray()
        for i, v in enumerate(payload):
            b = key[(i % 1024) % len(key)] ^ ((~v) & 255)
            transformed.append(((b << 4) | (b >> 4)) & 255)
        payload = bytes(transformed)
    filename = name.encode("utf-16le")
    attr = struct.pack("<II2sI8sH", len(filename), 6 if encoded else 0, b"\0" * 2,
                       len(payload), b"\0" * 8, 1)
    return (struct.pack("<14sHI26s", extractor.SIGNATURE, 1, version, b"\0" * 26)
            + attr + (b"\0" * 24 if version == 4 else b"") + filename + payload)


class ExtractTests(unittest.TestCase):
    def run_extract(self, blob, root, limit=100000):
        source = root / "input"
        source.write_bytes(blob)
        with contextlib.redirect_stdout(io.StringIO()):
            return extractor.extract(source, root / "output", limit)

    def test_versions_and_plain_streams(self):
        for version in (0, 4):
            for encoded in (True, False):
                with self.subTest(version=version, encoded=encoded), tempfile.TemporaryDirectory() as d:
                    root = Path(d)
                    self.run_extract(archive(version=version, encoded=encoded), root)
                    self.assertEqual((root / "output/test.bin").read_bytes(), b"hello" * 1000)

    def test_block_transform_reset(self):
        import random
        content = random.Random(123).randbytes(10000)
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            self.run_extract(archive(content=content), root)
            self.assertEqual((root / "output/test.bin").read_bytes(), content)

    def test_unsafe_paths(self):
        for name in ("../escape", "C:\\escape", "\\escape", "a\\..\\escape"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as d:
                with self.assertRaises(ValueError):
                    self.run_extract(archive(name=name), Path(d))

    def test_existing_file_preserved(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "output").mkdir()
            target = root / "output/test.bin"
            target.write_bytes(b"existing")
            with self.assertRaises(FileExistsError):
                self.run_extract(archive(), root)
            self.assertEqual(target.read_bytes(), b"existing")

    def test_limit_and_truncation(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            with self.assertRaises(ValueError):
                self.run_extract(archive(), root, 10)
            self.assertFalse((root / "output/test.bin").exists())
            with self.assertRaises(ValueError):
                self.run_extract(archive()[:-1], root)


if __name__ == "__main__":
    unittest.main()
