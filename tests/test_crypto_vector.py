"""Independently validate the public synthetic SP800-108 diagnostic vector."""
import hashlib
import hmac
from pathlib import Path
import unittest


class CryptoVectorTests(unittest.TestCase):
    def test_counter_kdf_hmac_sha512_vector(self):
        # NIST SP800-108 counter mode: [i]32 || label || 00 || context || [L]32.
        payload = (1).to_bytes(4, 'big') + b'public-label\0public-context' + (256).to_bytes(4, 'big')
        actual = hmac.new(b'catalog-runtime-compatibility-test', payload, hashlib.sha512).digest()[:32].hex()
        expected = 'b52e0704f1a56d3e221a6bdc9b440eabaffa41e8f5b5a3df307504f8ff5fe82a'
        self.assertEqual(actual, expected)
        code = (Path(__file__).resolve().parents[1] / 'scripts/engine-probe/CryptoReadiness.cs').read_text()
        self.assertIn(expected, code)
