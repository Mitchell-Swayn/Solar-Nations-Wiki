#!/usr/bin/env python3
"""Decode wiki-referenced icons that the game omits from Saved/Icons.

The unpacked UE assets contain either a top-level DXT payload in a sibling
``.ubulk`` file or inline BGRA pixels. ImageMagick performs the final pixel
conversion after this script supplies the small amount of container metadata
that Unreal stores separately.
"""

from __future__ import annotations

import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path


PACKED_ICONS = (
    "Modifiers/accuracy",
    "Modifiers/moveSpeed",
    "Resources/constructHex",
    "Resources/cultureHex",
    "diplomacy",
    "education",
    "influence",
    "opinion",
    "recon",
    "survey",
    "trade",
)

DDS_MAGIC = b"DDS "
DDS_HEADER_SIZE = 124
DDS_PIXEL_FORMAT_SIZE = 32
DDS_FOURCC = 0x4
DDS_CAPS = 0x1
DDS_HEIGHT = 0x2
DDS_WIDTH = 0x4
DDS_PIXELFORMAT = 0x1000
DDS_LINEARSIZE = 0x80000
DDS_TEXTURE = 0x1000
UE_PACKAGE_TRAILER = bytes.fromhex("c1832a9e")


def largest_square_mip(payload_size: int, bytes_per_pixel: float) -> int:
    """Infer the largest square mip whose byte count fits the bulk payload."""
    size = 4
    while int((size * 2) ** 2 * bytes_per_pixel) <= payload_size:
        size *= 2
    return size


def dds_header(width: int, height: int, fourcc: bytes, linear_size: int) -> bytes:
    values = [
        DDS_HEADER_SIZE,
        DDS_CAPS | DDS_HEIGHT | DDS_WIDTH | DDS_PIXELFORMAT | DDS_LINEARSIZE,
        height,
        width,
        linear_size,
        0,
        0,
        *([0] * 11),
        DDS_PIXEL_FORMAT_SIZE,
        DDS_FOURCC,
        struct.unpack("<I", fourcc)[0],
        0,
        0,
        0,
        0,
        0,
        DDS_TEXTURE,
        0,
        0,
        0,
        0,
    ]
    return DDS_MAGIC + struct.pack("<31I", *values)


def run_magick(source: Path, output: Path, size: int | None = None) -> None:
    command = ["magick"]
    if size is not None:
        command += ["-size", f"{size}x{size}", "-depth", "8"]
    command += [str(source), str(output)]
    subprocess.run(command, check=True)


def decode_dxt(asset: Path, output: Path, pixel_format: bytes) -> None:
    bulk = asset.with_suffix(".ubulk").read_bytes()
    block_bytes = 16 if pixel_format == b"PF_DXT5" else 8
    bytes_per_pixel = 1.0 if pixel_format == b"PF_DXT5" else 0.5
    size = largest_square_mip(len(bulk), bytes_per_pixel)
    top_mip_size = max(1, size // 4) * max(1, size // 4) * block_bytes
    fourcc = b"DXT5" if pixel_format == b"PF_DXT5" else b"DXT1"
    with tempfile.NamedTemporaryFile(suffix=".dds") as temp:
        temp.write(dds_header(size, size, fourcc, top_mip_size))
        temp.write(bulk[:top_mip_size])
        temp.flush()
        run_magick(Path(temp.name), output)


def decode_bgra(asset: Path, output: Path) -> None:
    data = asset.read_bytes()
    trailer_at = data.rfind(UE_PACKAGE_TRAILER)
    if trailer_at < 24:
        raise ValueError(f"Could not locate Unreal package trailer in {asset}")
    # IoStore's unpacked package ends with 24 bytes of mip metadata followed by
    # the four-byte package trailer. These uncompressed UI icons use one
    # 130px BGRA mip (the game's compressed icons are generally 128px).
    payload_end = trailer_at - 24
    size = 130
    payload_size = size * size * 4
    payload = data[payload_end - payload_size : payload_end]
    if len(payload) != payload_size:
        raise ValueError(f"Could not locate inline BGRA pixels in {asset}")
    with tempfile.NamedTemporaryFile(suffix=".bgra") as temp:
        temp.write(payload)
        temp.flush()
        run_magick(Path(f"BGRA:{temp.name}"), output, size)


def decode_icon(source_root: Path, output_root: Path, relative: str) -> None:
    asset = source_root / f"{relative}.uasset"
    if not asset.exists():
        raise FileNotFoundError(asset)
    metadata = asset.read_bytes()
    output = output_root / f"{relative}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    if b"PF_DXT5" in metadata:
        decode_dxt(asset, output, b"PF_DXT5")
    elif b"PF_DXT1" in metadata:
        decode_dxt(asset, output, b"PF_DXT1")
    elif b"PF_B8G8R8A8" in metadata:
        decode_bgra(asset, output)
    else:
        raise ValueError(f"Unsupported pixel format in {asset}")
    print(f"  {relative} -> {output}")


def main() -> int:
    if shutil.which("magick") is None:
        print("ImageMagick's 'magick' command is required", file=sys.stderr)
        return 1
    project_root = Path(__file__).resolve().parent.parent
    source_root = (
        project_root
        / "data/raw/unpacked/twilightModernity/Content/GFX/Icons"
    )
    output_root = project_root / "data/icons-extra"
    if not source_root.exists():
        print(f"Packed icons have not been unpacked: {source_root}", file=sys.stderr)
        return 1
    print("Decoding packed game icons...")
    for relative in PACKED_ICONS:
        decode_icon(source_root, output_root, relative)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
