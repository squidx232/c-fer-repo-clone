#!/usr/bin/env python3
"""Statically unpack an ISSetupStream overlay (versions 0..4).

Format and byte-transform adapted from lifenjoiner/ISx (MIT):
https://github.com/lifenjoiner/ISx/blob/master/ISx.c
Copyright (c) 2017 lifenjoiner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""
import argparse
import json
import struct
import zlib
from pathlib import Path, PureWindowsPath

SIGNATURE = b"ISSetupStream\0"
CHUNK = 16384


def exact(stream, length):
    data = stream.read(length)
    if len(data) != length:
        raise ValueError("truncated stream")
    return data


def entries(source):
    """Require an extracted overlay, not an arbitrary executable signature scan."""
    total = source.stat().st_size
    with source.open("rb") as stream:
        header = exact(stream, 46)
        signature, count, version = struct.unpack_from("<14sHI", header)
        if signature != SIGNATURE or version > 4 or not count:
            raise ValueError("unsupported ISSetupStream header")
        for _ in range(count):
            attr = exact(stream, 24)
            name_len, flags = struct.unpack_from("<II", attr)
            size = struct.unpack_from("<I", attr, 10)[0]
            compressed = struct.unpack_from("<H", attr, 22)[0]
            if not 0 < name_len < 520 or name_len % 2:
                raise ValueError("invalid filename length")
            if version == 4:
                exact(stream, 24)
            name = exact(stream, name_len).decode("utf-16le").rstrip("\0")
            offset = stream.tell()
            if offset + size > total:
                raise ValueError("file extends beyond archive")
            yield dict(name=name, size=size, flags=flags, compressed=bool(compressed), offset=offset)
            stream.seek(offset + size)


def extract(source, destination, max_bytes):
    if max_bytes <= 0:
        raise ValueError("output limit must be positive")
    records = list(entries(source))
    destination = destination.resolve()
    used = 0
    for record in records:
        name = PureWindowsPath(record["name"])
        if name.drive or name.root or ".." in name.parts or not name.parts:
            raise ValueError("unsafe archive path")
        output = destination.joinpath(*name.parts)
        if not output.resolve().is_relative_to(destination):
            raise ValueError("archive path escapes destination")
        output.parent.mkdir(parents=True, exist_ok=True)
        # Each file is transformed in independent 1024-byte blocks.
        seed = record["name"].encode("utf-8")
        magic = bytes((0x13, 0x35, 0x86, 0x07))
        key = bytes(v ^ magic[i % 4] for i, v in enumerate(seed))
        tables = [bytes((~(k ^ (((v << 4) | (v >> 4)) & 255))) & 255 for v in range(256)) for k in key]
        decoder = zlib.decompressobj() if record["compressed"] else None
        remaining = record["size"]
        created = False
        try:
            with source.open("rb") as stream, output.open("xb") as target:
                created = True
                stream.seek(record["offset"])
                while remaining:
                    block = exact(stream, min(1024, remaining))
                    remaining -= len(block)
                    if record["flags"] & 4:
                        block = bytes(tables[i % len(key)][v] for i, v in enumerate(block))
                    elif record["flags"] & 2:
                        raise ValueError("unsupported full-file transform")
                    if decoder:
                        block = decoder.decompress(block, max_bytes - used + 1)
                        if decoder.unconsumed_tail:
                            raise ValueError("decompression output limit exceeded")
                    used += len(block)
                    if used > max_bytes:
                        raise ValueError("total output limit exceeded")
                    target.write(block)
                if decoder and (not decoder.eof or decoder.unused_data):
                    raise ValueError("incomplete or trailing compressed data")
        except Exception:
            # Never remove a pre-existing file if exclusive creation failed.
            if created:
                output.unlink(missing_ok=True)
            raise
        print(json.dumps(record))
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source", type=Path, help="overlay exposed by 7-Zip as [0]")
    parser.add_argument("destination", type=Path, nargs="?")
    parser.add_argument("--max-bytes", type=int, default=2 * 1024**3)
    args = parser.parse_args()
    if args.destination:
        extract(args.source, args.destination, args.max_bytes)
    else:
        print(json.dumps(list(entries(args.source)), indent=2))


if __name__ == "__main__":
    main()
