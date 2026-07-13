#!/usr/bin/env python3
"""Decode wiki-referenced icons that the game omits from Saved/Icons.

The unpacked UE assets contain either a top-level DXT payload in a sibling
``.ubulk`` file or inline BGRA pixels. ImageMagick performs the final pixel
conversion after this script supplies the small amount of container metadata
that Unreal stores separately.
"""

from __future__ import annotations

import json
import math
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path


PACKED_ICONS = (
    "Modifiers/accuracy",
    "Modifiers/moveSpeed",
    "Planets/Saturn",
    "Planets/StableOrbit",
    "Planets/Venus",
    "Planets/dwarfPlanet",
    "Planets/earth",
    "Planets/jupiter",
    "Planets/luna",
    "Planets/mars",
    "Planets/mercury",
    "Planets/neptune",
    "Planets/planetNine",
    "Planets/pluto",
    "Planets/sol",
    "Planets/uranus",
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
PLANET_PORTRAIT_SIZE = 256
PLANET_TEXTURE_WIDTH = 1024
PLANET_TEXTURE_HEIGHT = 512
PLANET_TEXTURE_SKIP = {"blank_black", "fakesurface"}


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


def texture_dimensions(asset: Path) -> tuple[int, int]:
    """Read inline dimensions or infer the stored 2:1 top mip."""
    data = asset.read_bytes()
    trailer_at = data.rfind(UE_PACKAGE_TRAILER)
    if trailer_at >= 24:
        width, height = struct.unpack_from("<II", data, trailer_at - 24)
        if width >= 4 and height >= 4:
            return width, height

    bulk_path = asset.with_suffix(".ubulk")
    if not bulk_path.exists():
        raise ValueError(f"Could not determine texture dimensions in {asset}")
    metadata = data
    bytes_per_pixel = 1.0 if b"PF_DXT5" in metadata else 0.5
    payload_size = bulk_path.stat().st_size
    width = 8
    # A complete mip chain is about 4/3 the size of its top mip. Pick the
    # largest 2:1 power-of-two image whose top mip fits that relationship.
    while (width * 2) * width * bytes_per_pixel <= payload_size * 0.80:
        width *= 2
    return width, width // 2


def texture_rgba(asset: Path) -> bytes:
    """Decode an equirectangular game texture to a consistent RGBA buffer."""
    metadata = asset.read_bytes()
    width, height = texture_dimensions(asset)
    bulk_path = asset.with_suffix(".ubulk")
    payload_end = metadata.rfind(UE_PACKAGE_TRAILER) - 24

    with tempfile.TemporaryDirectory() as temporary:
        temp_dir = Path(temporary)
        if b"PF_DXT5" in metadata or b"PF_DXT1" in metadata:
            block_bytes = 16 if b"PF_DXT5" in metadata else 8
            fourcc = b"DXT5" if b"PF_DXT5" in metadata else b"DXT1"
            top_mip_size = max(1, width // 4) * max(1, height // 4) * block_bytes
            if bulk_path.exists():
                payload = bulk_path.read_bytes()[:top_mip_size]
            else:
                payload = metadata[payload_end - top_mip_size : payload_end]
            source = temp_dir / "texture.dds"
            source.write_bytes(dds_header(width, height, fourcc, top_mip_size) + payload)
        elif b"PF_B8G8R8A8" in metadata:
            payload_size = width * height * 4
            if bulk_path.exists():
                payload = bulk_path.read_bytes()[:payload_size]
            else:
                payload = metadata[payload_end - payload_size : payload_end]
            source = temp_dir / "texture.bgra"
            source.write_bytes(payload)
            source = Path(f"BGRA:{source}")
        else:
            raise ValueError(f"Unsupported pixel format in {asset}")

        command = [
            "magick",
            "-size",
            f"{width}x{height}",
            "-depth",
            "8",
            str(source),
            "-resize",
            f"{PLANET_TEXTURE_WIDTH}x{PLANET_TEXTURE_HEIGHT}!",
            "-depth",
            "8",
            "RGBA:-",
        ]
        result = subprocess.run(command, check=True, stdout=subprocess.PIPE)
        expected = PLANET_TEXTURE_WIDTH * PLANET_TEXTURE_HEIGHT * 4
        if len(result.stdout) != expected:
            raise ValueError(f"Unexpected decoded size for {asset}: {len(result.stdout)}")
        return result.stdout


def sample_rgba(texture: bytes, u: float, v: float) -> tuple[int, int, int, int]:
    """Bilinearly sample a wrapped equirectangular RGBA texture."""
    x = (u % 1.0) * PLANET_TEXTURE_WIDTH
    y = max(0.0, min(1.0, v)) * (PLANET_TEXTURE_HEIGHT - 1)
    x0 = int(x) % PLANET_TEXTURE_WIDTH
    x1 = (x0 + 1) % PLANET_TEXTURE_WIDTH
    y0 = int(y)
    y1 = min(y0 + 1, PLANET_TEXTURE_HEIGHT - 1)
    tx, ty = x - int(x), y - y0
    result = []
    for channel in range(4):
        p00 = texture[(y0 * PLANET_TEXTURE_WIDTH + x0) * 4 + channel]
        p10 = texture[(y0 * PLANET_TEXTURE_WIDTH + x1) * 4 + channel]
        p01 = texture[(y1 * PLANET_TEXTURE_WIDTH + x0) * 4 + channel]
        p11 = texture[(y1 * PLANET_TEXTURE_WIDTH + x1) * 4 + channel]
        top = p00 * (1 - tx) + p10 * tx
        bottom = p01 * (1 - tx) + p11 * tx
        result.append(round(top * (1 - ty) + bottom * ty))
    return tuple(result)  # type: ignore[return-value]


def blend_pixel(canvas: bytearray, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    index = (y * PLANET_PORTRAIT_SIZE + x) * 4
    alpha = color[3] / 255
    inverse = 1 - alpha
    canvas[index] = round(color[0] * alpha + canvas[index] * inverse)
    canvas[index + 1] = round(color[1] * alpha + canvas[index + 1] * inverse)
    canvas[index + 2] = round(color[2] * alpha + canvas[index + 2] * inverse)
    canvas[index + 3] = round((alpha + canvas[index + 3] / 255 * inverse) * 255)


def draw_rings(canvas: bytearray, front: bool) -> None:
    center = PLANET_PORTRAIT_SIZE / 2
    angle = math.radians(-12)
    cosine, sine = math.cos(angle), math.sin(angle)
    for y in range(PLANET_PORTRAIT_SIZE):
        for x in range(PLANET_PORTRAIT_SIZE):
            dx, dy = x + 0.5 - center, y + 0.5 - center
            rx = dx * cosine - dy * sine
            ry = dx * sine + dy * cosine
            if (ry >= 0) != front:
                continue
            distance = math.sqrt((rx / 116) ** 2 + (ry / 25) ** 2)
            if 0.70 <= distance <= 1.0:
                edge = min((distance - 0.70) / 0.05, (1.0 - distance) / 0.05, 1.0)
                band = 0.65 + 0.25 * math.sin(distance * 90)
                alpha = round(150 * max(0.0, edge))
                shade = round(205 * band)
                blend_pixel(canvas, x, y, (shade, round(shade * 0.88), round(shade * 0.68), alpha))


def render_planet(texture: bytes, output: Path, atmosphere: dict, has_rings: bool) -> None:
    canvas = bytearray(PLANET_PORTRAIT_SIZE * PLANET_PORTRAIT_SIZE * 4)
    if has_rings:
        draw_rings(canvas, False)

    center = PLANET_PORTRAIT_SIZE / 2
    radius = 91 if has_rings else 106
    light = (-0.45, -0.55, 0.70)
    light_length = math.sqrt(sum(component * component for component in light))
    light = tuple(component / light_length for component in light)
    atm_rgb = tuple(round(float(atmosphere.get(key, 0)) * 255) for key in ("R", "G", "B"))

    for y in range(PLANET_PORTRAIT_SIZE):
        for x in range(PLANET_PORTRAIT_SIZE):
            nx = (x + 0.5 - center) / radius
            ny = (y + 0.5 - center) / radius
            distance_squared = nx * nx + ny * ny
            if distance_squared > 1.035:
                continue
            if distance_squared > 1.0:
                rim_alpha = round(100 * (1.035 - distance_squared) / 0.035)
                blend_pixel(canvas, x, y, (*atm_rgb, rim_alpha))
                continue
            nz = math.sqrt(max(0.0, 1.0 - distance_squared))
            longitude = math.atan2(nx, nz)
            latitude = math.asin(-ny)
            u = 0.5 + longitude / (2 * math.pi)
            v = 0.5 - latitude / math.pi
            red, green, blue, alpha = sample_rgba(texture, u, v)
            diffuse = max(0.0, nx * light[0] + ny * light[1] + nz * light[2])
            illumination = 0.30 + 0.85 * diffuse
            edge_alpha = min(1.0, (1.0 - math.sqrt(distance_squared)) * radius)
            color = (
                min(255, round(red * illumination)),
                min(255, round(green * illumination)),
                min(255, round(blue * illumination)),
                round(alpha * edge_alpha),
            )
            blend_pixel(canvas, x, y, color)

    if has_rings:
        draw_rings(canvas, True)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".rgba") as temporary:
        temporary.write(canvas)
        temporary.flush()
        command = [
            "magick", "-size", f"{PLANET_PORTRAIT_SIZE}x{PLANET_PORTRAIT_SIZE}",
            "-depth", "8", f"RGBA:{temporary.name}", str(output),
        ]
        subprocess.run(command, check=True)


def index_surface_assets(content_root: Path) -> dict[str, Path]:
    assets: dict[str, Path] = {}
    priorities = ("/GFX/SolarNations/", "/GFX/Textures/", "/Maps/")
    candidates = [path for path in content_root.rglob("*.uasset") if "/GFX/Icons/Planets/" not in str(path)]
    for priority in reversed(priorities):
        for asset in candidates:
            if priority in str(asset):
                assets[asset.stem.casefold()] = asset
    return assets


def render_planet_portraits(project_root: Path) -> None:
    definitions_path = project_root / "data/raw/Defines/Planets.json"
    content_root = project_root / "data/raw/unpacked/twilightModernity/Content"
    output_root = project_root / "data/icons-extra/PlanetPortraits"
    shutil.rmtree(output_root, ignore_errors=True)
    output_root.mkdir(parents=True, exist_ok=True)
    assets = index_surface_assets(content_root)
    texture_cache: dict[str, bytes] = {}
    rendered = 0
    skipped: list[str] = []
    print("Rendering planetary portraits from game surface maps...")
    for planet in json.loads(definitions_path.read_text()):
        identifier = str(planet.get("Name", ""))
        surface = str(planet.get("SurfaceTexture") or "")
        key = surface.casefold()
        asset = assets.get(key)
        if not identifier or key in PLANET_TEXTURE_SKIP or asset is None:
            skipped.append(f"{identifier} ({surface or 'no surface'})")
            continue
        try:
            if key not in texture_cache:
                texture_cache[key] = texture_rgba(asset)
            render_planet(
                texture_cache[key],
                output_root / f"planet-{identifier}.png",
                planet.get("AtmColor") or {},
                bool(planet.get("HasRings")),
            )
            rendered += 1
        except (OSError, ValueError, subprocess.CalledProcessError) as error:
            skipped.append(f"{identifier} ({surface}: {error})")
    print(f"  rendered {rendered} portraits; skipped {len(skipped)}")
    for item in skipped:
        print(f"  skipped: {item}")


def decode_dxt(asset: Path, output: Path, pixel_format: bytes) -> None:
    block_bytes = 16 if pixel_format == b"PF_DXT5" else 8
    bytes_per_pixel = 1.0 if pixel_format == b"PF_DXT5" else 0.5
    bulk_path = asset.with_suffix(".ubulk")
    if bulk_path.exists():
        payload = bulk_path.read_bytes()
        size = largest_square_mip(len(payload), bytes_per_pixel)
    else:
        data = asset.read_bytes()
        trailer_at = data.rfind(UE_PACKAGE_TRAILER)
        if trailer_at < 24:
            raise ValueError(f"Could not locate Unreal package trailer in {asset}")
        width, height = struct.unpack_from("<II", data, trailer_at - 24)
        if width != height or width < 4:
            raise ValueError(f"Unsupported inline texture dimensions {width}x{height} in {asset}")
        size = width
        payload_end = trailer_at - 24
        payload_size = max(1, size // 4) * max(1, size // 4) * block_bytes
        payload = data[payload_end - payload_size : payload_end]
    top_mip_size = max(1, size // 4) * max(1, size // 4) * block_bytes
    fourcc = b"DXT5" if pixel_format == b"PF_DXT5" else b"DXT1"
    with tempfile.NamedTemporaryFile(suffix=".dds") as temp:
        temp.write(dds_header(size, size, fourcc, top_mip_size))
        temp.write(payload[:top_mip_size])
        temp.flush()
        run_magick(Path(temp.name), output)


def decode_bgra(asset: Path, output: Path) -> None:
    data = asset.read_bytes()
    trailer_at = data.rfind(UE_PACKAGE_TRAILER)
    if trailer_at < 24:
        raise ValueError(f"Could not locate Unreal package trailer in {asset}")
    # IoStore's unpacked package ends with 24 bytes of mip metadata followed by
    # the four-byte package trailer. Width and height are the first two values
    # in that metadata block.
    payload_end = trailer_at - 24
    width, height = struct.unpack_from("<II", data, payload_end)
    if width != height or width < 1:
        raise ValueError(f"Unsupported inline texture dimensions {width}x{height} in {asset}")
    size = width
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
    render_planet_portraits(project_root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
