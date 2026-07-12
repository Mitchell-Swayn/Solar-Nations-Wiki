#!/usr/bin/env python3
"""Parse Solar Nations 2 legacy UE exports into tutorialMod-compatible JSON."""

from __future__ import annotations

import json
import os
import re
import struct
import subprocess
import sys
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LEGACY_ROOT = PROJECT_ROOT / "data/raw/legacy-all"
UNPACKED_ROOT = PROJECT_ROOT / "data/raw/unpacked"
OUTPUT_DEFINES = PROJECT_ROOT / "data/raw/Defines"
OUTPUT_LOC = PROJECT_ROOT / "data/raw/Localization"
RETOC = PROJECT_ROOT / "tools/retoc_cli-aarch64-apple-darwin/retoc"

DEFINE_PREFIX = "twilightModernity/Content/Blueprints/Struct/Defines"

VARIANT_KEYS = ("default", "genetics", "cyberneticsTech", "virtualReality", "futuristic")

JUNK_STRINGS = {
    "None",
    "True",
    "False",
    "default",
    "ffffff",
    "BAD",
    "noPolicy",
    *VARIANT_KEYS,
}

REFORM_CATEGORY_PREFIXES: list[tuple[str, str]] = [
    ("form_", "form"),
    ("economy_", "economySystem"),
    ("bureaucracy_", "bureaucracy"),
    ("civilLiberty_", "civilLiberties"),
    ("colonyPolicy_", "colonyPolicy"),
    ("educationSpending_", "educationSpending"),
    ("espionageFunding_", "espionageFunding"),
    ("espionagePolicy_", "espionagePolicy"),
    ("fiscalPolicy_", "fiscalPolicy"),
    ("governmentSpending_", "governmentSpending"),
    ("immigration_", "immigration"),
    ("militaryDoctrine_", "militaryDoctrine"),
    ("nanocompositeLaw_", "nanocompositeLaw"),
    ("nationalFocus_", "nationalFocus"),
    ("roboticsLaw_", "robotics"),
    ("serviceLaw_", "serviceLaw"),
    ("tradePolicy_", "tradePolicy"),
    ("welfareSpending_", "welfareSpending"),
    ("familyPolicy_", "familyPolicy"),
    ("incomeTax_", "incomeTax"),
    ("education_", "educationLaw"),
    ("diplomaticStance_", "adminStance"),
]

TECH_DENY = {
    "factory",
    "consumerGoodsFactory",
    "nanocomposites",
    "electronics",
    "development",
    "education",
    "industry",
    "culture",
    "morale",
    "logistics",
    "robots",
    "colony",
    "manpower",
    "liberal",
    "traditional",
    "communism",
    "unity",
    "health",
    "synthetic",
    "monument",
    "shipyard",
    "gravitons",
    "superconstruction",
    "cohesion",
    "galaxysmall",
    "tank",
    "landcruiser",
    "engine",
    "armor",
    "missile",
    "autocannon",
    "airplane",
    "enactDecision",
}


def read_bytes(path: Path) -> bytes:
    return path.read_bytes()


def extract_ascii_strings(data: bytes, min_len: int = 3) -> list[str]:
    strings: list[str] = []
    i = 0
    while i < len(data):
        if 32 <= data[i] <= 126:
            j = i
            while j < len(data) and 32 <= data[j] <= 126:
                j += 1
            if j - i >= min_len:
                strings.append(data[i:j].decode("ascii", "ignore"))
            i = j
        else:
            i += 1
    return strings


def extract_reform_doubles(data: bytes, start: int, limit: int = 220) -> list[float]:
    """Pull gameplay modifier doubles after a reform variant name."""
    end = min(start + limit, len(data) - 8)
    values: list[float] = []
    seen: set[float] = set()
    for off in range(start, end):
        val = struct.unpack("<d", data[off : off + 8])[0]
        if val != val or abs(val) > 50:
            continue
        rounded = round(val, 6)
        if rounded in seen:
            continue
        if abs(rounded) < 1e-4:
            continue
        if not (
            0.05 <= abs(rounded) <= 10
            or rounded in (-0.1, -0.15, -0.05)
            or (rounded == int(rounded) and 1 <= abs(rounded) <= 20)
        ):
            continue
        seen.add(rounded)
        values.append(rounded)
        if len(values) >= 6:
            break
    return values


def extract_doubles(data: bytes, start: int, end: int) -> list[float]:
    values: list[float] = []
    seen: set[float] = set()
    for off in range(start, min(end, len(data) - 8)):
        val = struct.unpack("<d", data[off : off + 8])[0]
        if val != val or abs(val) > 1e6:
            continue
        rounded = round(val, 6)
        if rounded in seen or abs(rounded) < 1e-9:
            continue
        seen.add(rounded)
        values.append(rounded)
    return values


def modifier_key(key: str, value1: str = "", value2: str = "", value3: str = "") -> str:
    return f'(Key="{key}",Value1="{value1}",Value2="{value2}",Value3="{value3}")'


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def uasset_path(name: str) -> Path:
    return UNPACKED_ROOT / DEFINE_PREFIX / name


def uexp_path(name: str) -> Path:
    return LEGACY_ROOT / DEFINE_PREFIX / name


def strings_from_file(path: Path) -> list[str]:
    if not path.exists():
        return []
    try:
        out = subprocess.check_output(["strings", str(path)], text=True)
    except subprocess.CalledProcessError:
        return []
    return [line.strip() for line in out.splitlines() if line.strip()]


def unique_identifiers(strings: list[str], pattern: str = r"^[a-z][a-zA-Z0-9_]*$") -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for s in strings:
        if s in JUNK_STRINGS or s in seen:
            continue
        if not re.match(pattern, s):
            continue
        if len(s) < 3:
            continue
        seen.add(s)
        result.append(s)
    return result


def is_probable_tech(name: str) -> bool:
    if name in TECH_DENY or name in JUNK_STRINGS:
        return False
    if re.search(r"\d$", name):
        return True
    if "_" in name:
        return True
    if "Tech" in name or "tech" in name:
        return True
    if len(name) >= 9:
        return True
    return False


def parse_factions() -> list[dict]:
    path = uexp_path("Factions.uexp")
    if not path.exists():
        return []

    data = read_bytes(path)
    strings = extract_ascii_strings(data)
    faction_ids = [
        "military",
        "bureaucracy",
        "clergy",
        "corporate",
        "upperClass",
        "laborer",
        "middleClass",
        "separatist",
        "espionageFaction",
    ]

    positive_keys = [
        ("adminEfficiencyAdd", "", "", ""),
        ("sliderMaxAdd", "incomeTax", "", ""),
    ]
    negative_keys = [
        ("adminEfficiencyAdd", "", "", ""),
        ("unrestChangeAdd", "", "", ""),
        ("crisisSpawnChanceAdd", "bureaucracyCrisis", "", ""),
        ("situationVariableAdd", "bureaucracyCrisis_intensity", "", ""),
    ]
    region_keys = [("adminEfficiencyAdd", "", "", "")]

    records: list[dict] = []
    for faction_id in faction_ids:
        idx = data.find(faction_id.encode() + b"\x00")
        if idx < 0:
            continue
        doubles = extract_doubles(data, idx, idx + 450)
        if len(doubles) < 4:
            records.append({"Name": faction_id, "Icon": faction_id})
            continue

        pos = {}
        for i, key in enumerate(positive_keys):
            if i < len(doubles):
                pos[modifier_key(*key)] = doubles[i]

        neg = {}
        neg_start = len(positive_keys)
        for i, key in enumerate(negative_keys):
            if neg_start + i < len(doubles):
                neg[modifier_key(*key)] = doubles[neg_start + i]

        region = {}
        region_start = neg_start + len(negative_keys)
        for i, key in enumerate(region_keys):
            if region_start + i < len(doubles):
                region[modifier_key(*key)] = doubles[region_start + i]

        alignment_r = doubles[region_start + len(region_keys)] if region_start + len(region_keys) < len(doubles) else 1.0
        alignment_theta = doubles[region_start + len(region_keys) + 1] if region_start + len(region_keys) + 1 < len(doubles) else 180.0

        records.append(
            {
                "Name": faction_id,
                "Icon": faction_id,
                "PositiveModifier": pos,
                "NegativeModifier": neg,
                "Alignment": {"R": alignment_r, "Theta": alignment_theta},
                "RegionModifier": region,
                "Color": {"R": 1, "G": 0, "B": 0, "A": 1},
            }
        )

    return records


def parse_reform_options() -> list[dict]:
    path = uexp_path("GovernmentReformOptions.uexp")
    if not path.exists():
        return []

    data = read_bytes(path)
    strings = extract_ascii_strings(data)

    row_names: list[str] = []
    for s in strings:
        if s in JUNK_STRINGS:
            continue
        if re.match(r"^[a-z][a-zA-Z0-9_]+$", s) and s not in row_names:
            if any(s.endswith(v) for v in ("_genetics", "_cybernetics", "_virtualReality", "_futuristic")):
                continue
            if s.endswith("Tech") and s not in ("cyberneticsTech",):
                continue
            if s in VARIANT_KEYS:
                continue
            row_names.append(s)

    # Keep top-level reform option ids (appear as repeated row keys)
    counts = Counter(strings)
    options = [s for s in row_names if counts[s] >= 2 and "_" in s or s.startswith("form_") or s.startswith("economy_") or s.startswith("bureaucracy_")]
    options = sorted(set(options))

    records: list[dict] = []
    for option_id in options:
        idx = data.find(option_id.encode() + b"\x00")
        if idx < 0:
            records.append({"Name": option_id, "Icon": option_id, "Modifier": {}})
            continue

        modifier: dict[str, dict] = {}
        cursor = idx
        for variant in VARIANT_KEYS:
            variant_name = option_id if variant == "default" else f"{option_id}_{variant}"
            vidx = data.find(variant_name.encode() + b"\x00", cursor)
            if vidx < 0:
                continue
            values = extract_reform_doubles(data, vidx)[:6]
            if not values:
                continue
            modifiers = {f"modifier_{i}": val for i, val in enumerate(values)}
            modifier[variant] = {
                "Icon": option_id,
                "Name": variant_name,
                "Modifiers": modifiers,
            }
            cursor = vidx + 1

        records.append({"Name": option_id, "Icon": option_id, "Modifier": modifier or {"default": {"Icon": option_id, "Name": option_id, "Modifiers": {}}}})

    return records


def parse_government_reforms(option_ids: list[str]) -> list[dict]:
    categories: dict[str, list[str]] = {}
    for option_id in option_ids:
        category = None
        for prefix, cat in REFORM_CATEGORY_PREFIXES:
            if option_id.startswith(prefix):
                category = cat
                break
        if not category:
            continue
        categories.setdefault(category, []).append(option_id)

    records = []
    for name, options in sorted(categories.items()):
        records.append(
            {
                "Name": name,
                "Options": sorted(options),
                "Variants": list(VARIANT_KEYS),
                "Cost": 20,
                "Cooldown": 3600,
                "DefaultIndex": 1,
                "Sequential": False,
                "IsPolitical": 0,
                "Prerequisite": {"A": "None", "B": "None"},
            }
        )
    return records


def parse_name_list(output_name: str, uasset_name: str, uexp_name: str | None = None, filter_fn=None) -> list[dict]:
    names: list[str] = []
    for path in [uasset_path(uasset_name), uexp_path(uexp_name or uasset_name)]:
        if path.exists():
            names.extend(unique_identifiers(strings_from_file(path) + extract_ascii_strings(read_bytes(path))))

    if filter_fn:
        names = [n for n in names if filter_fn(n)]

    deduped = sorted(set(names))
    return [{"Name": n, "Icon": n} for n in deduped]


def parse_eras() -> list[dict]:
    return parse_name_list("Eras.json", "Eras.uasset", filter_fn=lambda n: n.startswith("era"))


def parse_technologies() -> list[dict]:
    records = parse_name_list("Technologies.json", "Technologies.uasset", filter_fn=is_probable_tech)
    for record in records:
        record.update(
            {
                "Type": 1,
                "Year": 0,
                "Cost": 0,
                "Modifier": {},
                "Prerequisites": [],
                "Exclusives": [],
                "Tier": 1,
                "Location": {"X": 0, "Y": 0},
                "Domain": [],
                "Categories": [],
                "Dangerous": False,
            }
        )
    return records


def parse_resources() -> list[dict]:
    return parse_name_list("Resources.json", "resources.uasset")


def parse_deposits() -> list[dict]:
    """Read deposit row names from the singular Deposit data table export."""
    path = uexp_path("Deposit.uexp")
    if not path.exists():
        return []

    names = unique_identifiers(extract_ascii_strings(read_bytes(path)))
    return [{"Name": name, "Icon": name} for name in names]


def parse_projects() -> list[dict]:
    return parse_name_list(
        "Projects.json",
        "Projects.uasset",
        filter_fn=lambda n: len(n) >= 4 and n not in TECH_DENY and not n.endswith("School"),
    )


def parse_culture_traits() -> list[dict]:
    return parse_name_list(
        "CultureTraits.json",
        "CultureTraits.uasset",
        filter_fn=lambda n: len(n) >= 6 and ("Trait" in n or "species" in n or "christian" in n or "american" in n or "british" in n or "trait" in n or n[0].islower()),
    )


def parse_character_jobs() -> list[dict]:
    jobs = parse_name_list(
        "CharacterJobs.json",
        "CharacterJobs.uasset",
        filter_fn=lambda n: n.islower() and len(n) >= 4 and not n.endswith("Tech"),
    )
    for record in jobs:
        record.update({"EffortCost": 1, "ExperienceGain": 1, "Term": 999999, "ElectionType": 0, "MajorJob": False})
    return jobs


def parse_simple(name: str, uasset_name: str, uexp_name: str | None = None) -> list[dict]:
    return parse_name_list(name, uasset_name, uexp_name)


def extract_localization() -> dict[str, str]:
    loc_dir = UNPACKED_ROOT / "twilightModernity/Content/Localisation/English"
    loc: dict[str, str] = {}

    if not loc_dir.exists():
        return loc

    for path in sorted(loc_dir.glob("*.uasset")):
        strings = strings_from_file(path)
        for i, s in enumerate(strings):
            if not re.match(r"^[a-z][a-z0-9_]*$", s) or len(s) < 3:
                continue
            if i + 1 >= len(strings):
                continue
            nxt = strings[i + 1]
            if not nxt or nxt in JUNK_STRINGS:
                continue
            if re.match(r"^[a-z][a-z0-9_]*$", nxt) and not (" " in nxt):
                continue
            if nxt.startswith("(") or len(nxt) > 300:
                continue
            if s not in loc or len(nxt) > len(loc[s]):
                loc[s] = nxt

    return loc


def ensure_legacy_assets() -> None:
    if not RETOC.exists():
        return

    default_game_root = Path.home() / (
        "Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/"
        "Steam/steamapps/common/Solar Nations 2/Windows/twilightModernity"
    )
    game_root = Path(os.environ.get("SN2_GAME_PATH", default_game_root)).expanduser()
    game_paks = game_root / "Content/Paks"
    if not game_paks.exists():
        return

    targets = [
        "Factions",
        "Technologies",
        "resources",
        "Projects",
        "Events",
        "Eras",
        "CultureTraits",
        "CharacterTraits",
        "CharacterJobs",
        "GovernmentReforms",
        "GovernmentReformOptions",
        "UnitComponents",
        "Deposit",
        "DepositResources",
        "Situations",
        "StaticModifiers",
        "FactionVariants",
    ]

    for target in targets:
        uexp = uexp_path(f"{target}.uexp" if target != "resources" else "resources.uexp")
        if uexp.exists():
            continue
        subprocess.run(
            [str(RETOC), "to-legacy", "--version", "UE5_6", "-f", target, str(game_paks), str(LEGACY_ROOT)],
            check=False,
            capture_output=True,
            text=True,
        )


def parse_situations() -> list[dict]:
    return parse_name_list(
        "Situations.json",
        "Situations.uasset",
        filter_fn=lambda n: (
            (n.endswith("Crisis") or n.endswith("Situation") or n.startswith("situation"))
            and len(n) >= 8
            and re.match(r"^[a-z][a-zA-Z0-9_]+$", n) is not None
        ),
    )


def main() -> int:
    ensure_legacy_assets()

    parsers: list[tuple[str, callable]] = [
        ("Factions.json", parse_factions),
        ("GovernmentReformOptions.json", parse_reform_options),
        ("Technologies.json", parse_technologies),
        ("Resources.json", parse_resources),
        ("Projects.json", parse_projects),
        ("CultureTraits.json", parse_culture_traits),
        ("CharacterJobs.json", parse_character_jobs),
        ("Eras.json", parse_eras),
        ("CharacterTraits.json", lambda: parse_simple("CharacterTraits.json", "CharacterTraits.uasset")),
        ("FactionVariants.json", lambda: parse_simple("FactionVariants.json", "FactionVariants.uasset")),
        ("DepositResources.json", lambda: parse_simple("DepositResources.json", "DepositResources.uasset")),
        ("StaticModifiers.json", lambda: parse_simple("StaticModifiers.json", "StaticModifiers.uasset")),
        ("UnitComponents.json", lambda: parse_simple("UnitComponents.json", "UnitDesigner/UnitComponents.uasset", "UnitDesigner/UnitComponents.uexp")),
        ("Situations.json", parse_situations),
        ("Events.json", lambda: parse_simple("Events.json", "Situation/Events.uasset", "Situation/Events.uexp")),
        ("Deposits.json", parse_deposits),
    ]

    summary: dict[str, int] = {}

    for filename, parser in parsers:
        records = parser()
        write_json(OUTPUT_DEFINES / filename, records)
        summary[filename] = len(records)
        print(f"  {filename}: {len(records)} records")

    reform_options = json.loads((OUTPUT_DEFINES / "GovernmentReformOptions.json").read_text())
    reforms = parse_government_reforms([r["Name"] for r in reform_options])
    write_json(OUTPUT_DEFINES / "GovernmentReforms.json", reforms)
    summary["GovernmentReforms.json"] = len(reforms)
    print(f"  GovernmentReforms.json: {len(reforms)} records")

    loc = extract_localization()
    write_json(OUTPUT_LOC / "en.json", loc)
    print(f"  Localization/en.json: {len(loc)} keys")

    manifest = {
        "extractedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "tool": "parse_legacy.py (retoc to-legacy + binary parser)",
        "legacyRoot": str(LEGACY_ROOT),
        "unpackedRoot": str(UNPACKED_ROOT),
        "defineCounts": summary,
        "note": "Full modifier keys require .usmap; reform option modifiers use indexed keys where needed.",
    }
    write_json(PROJECT_ROOT / "data/raw/extraction-manifest.json", manifest)

    total = sum(summary.values())
    print(f"\nExtracted {total} define records across {len(summary)} files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
