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
    ("focus_", "nationalFocus"),
    ("spending_", "governmentSpending"),
    ("trade_", "tradePolicy"),
    ("unitTraining_", "unitTraining"),
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

FORBIDDEN_ROWS: dict[str, set[str]] = {
    "Resources.json": {
        "baseEconomicOutputMult", "developmentGrowthMult", "educationEfficiency",
        "factionLoyaltyAdd", "habitabilityAdd", "health", "popGrowthMult",
        "projectBuildCostMult", "projectEfficiency", "resourceCapacityMult",
        "stabilityGainAdd", "unitMoraleMult", "unitReinforceRateMult",
        "unitSpeedMult", "unitStatMult", "unityMult", "university",
    },
    "Events.json": {"true", "false", "option1", "option2", "option3"},
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


def validate_records(filename: str, records: list[dict]) -> None:
    names = [record.get("Name") for record in records]
    if any(not isinstance(name, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", name) for name in names):
        raise ValueError(f"{filename}: invalid row identifier")
    if len(names) != len(set(names)):
        raise ValueError(f"{filename}: duplicate row identifiers")
    leaked = set(names) & FORBIDDEN_ROWS.get(filename, set())
    leaked.update(name for name in names if filename == "Events.json" and name.endswith(("_title", "_desc")))
    if leaked:
        raise ValueError(f"{filename}: non-row identifiers leaked into output: {sorted(leaked)}")


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
    """Extract candidate row identifiers, preferring serialized table payloads.

    The uasset name table contains schema fields, modifier keys, and imports in
    addition to row names. Those strings must only be used as a last-resort
    fallback when retoc did not produce a uexp payload.
    """
    names: list[str] = []
    export_name = uexp_name or str(Path(uasset_name).with_suffix(".uexp"))
    export_path = uexp_path(export_name)
    asset_path = uasset_path(uasset_name)
    path = export_path if export_path.exists() else asset_path
    if path.exists():
        names.extend(unique_identifiers(extract_ascii_strings(read_bytes(path))))

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
    resource_ids = {record["Name"] for record in parse_resources()}
    resource_ids.update(record["Name"] for record in parse_simple("", "DepositResources.uasset"))
    return parse_name_list(
        "Projects.json",
        "Projects.uasset",
        filter_fn=lambda n: len(n) >= 4 and n not in resource_ids and n not in {"oxygen", "water"},
    )


def parse_culture_modifier_collection(data: bytes, cursor: int, count: int, name_map: list[str]) -> tuple[dict, int]:
    modifiers: dict[str, float] = {}
    parameter_lengths = {0x0E: 7, 0x0C: 15, 0x0A: 15, 0x08: 23}
    for _ in range(count):
        if data[cursor : cursor + 2] != b"\x80\x09":
            raise ValueError(f"Culture trait modifier marker missing at {cursor}")
        flag = data[cursor + 2]
        parameter_length = parameter_lengths.get(flag)
        if parameter_length is None:
            raise ValueError(f"Unknown culture trait modifier flag 0x{flag:02x} at {cursor}")

        key_index = data[cursor + 3] + 1  # Legacy name map omits implicit None from `strings` output.
        if key_index >= len(name_map):
            raise ValueError(f"Culture trait modifier name index {key_index} is out of range")
        cursor += 4

        parameter_data = data[cursor : cursor + parameter_length]
        targets = [name_map[value + 1] for value in parameter_data if value and value + 1 < len(name_map)]
        cursor += parameter_length
        value = struct.unpack_from("<d", data, cursor)[0]
        cursor += 8

        padded_targets = (targets + ["", "", ""])[:3]
        modifiers[modifier_key(name_map[key_index], *padded_targets)] = round(value, 10)
    return modifiers, cursor


def parse_culture_traits() -> list[dict]:
    export_path = uexp_path("CultureTraits.uexp")
    asset_path = uexp_path("CultureTraits.uasset")
    if not export_path.exists() or not asset_path.exists():
        return []

    data = read_bytes(export_path)
    name_map = strings_from_file(asset_path)
    names = unique_identifiers(extract_ascii_strings(data))
    names = [
        name for name in names
        if len(name) >= 6 and ("Trait" in name or "species" in name or "christian" in name or "american" in name or "british" in name or "trait" in name or name[0].islower())
    ]

    records: list[dict] = []
    for name in names:
        position = data.find(name.encode() + b"\x00")
        cursor = position + len(name) + 1 + 4
        primary_count = struct.unpack_from("<I", data, cursor)[0]
        primary, cursor = parse_culture_modifier_collection(data, cursor + 4, primary_count, name_map)
        cursor += 4
        region_count = struct.unpack_from("<I", data, cursor)[0]
        region, _ = parse_culture_modifier_collection(data, cursor + 4, region_count, name_map)
        records.append({"Name": name, "Icon": name, "PrimaryModifier": primary, "RegionModifier": region})
    return records


def parse_character_jobs() -> list[dict]:
    jobs = parse_name_list(
        "CharacterJobs.json",
        "CharacterJobs.uasset",
        filter_fn=lambda n: len(n) >= 4 and not n.endswith("Tech"),
    )
    for record in jobs:
        record.update({"EffortCost": 1, "ExperienceGain": 1, "Term": 999999, "ElectionType": 0, "MajorJob": False})
    return jobs


def parse_simple(name: str, uasset_name: str, uexp_name: str | None = None) -> list[dict]:
    return parse_name_list(name, uasset_name, uexp_name)


def parse_unit_components() -> list[dict]:
    reference_ids = {
        "ammunition", "antimatter", "biohazard", "communism", "computers",
        "conservative", "electronics", "experience", "fascism", "geneticMaterial",
        "health", "leader", "liberal", "logistics", "neuralNetworks", "nuclearFuels",
        "progressive", "threeStar", "traditional", "water",
    }
    return parse_name_list(
        "UnitComponents.json",
        "UnitDesigner/UnitComponents.uasset",
        "UnitDesigner/UnitComponents.uexp",
        filter_fn=lambda name: name not in reference_ids,
    )


def parse_faction_variants() -> list[dict]:
    path = uexp_path("FactionVariants.uasset")
    if not path.exists():
        return []
    names = unique_identifiers(extract_ascii_strings(read_bytes(path)))
    variants = [
        name for name in names
        if re.match(r"^(clergy|laborer|military)_[A-Za-z0-9_]+$", name)
        or name.endswith("_hivemind")
        or name == "militaryIndustrialComplex"
    ]
    records = []
    faction_ids = {"military", "bureaucracy", "clergy", "corporate", "upperClass", "laborer", "middleClass"}
    for name in sorted(set(variants)):
        base_faction = "military" if name == "militaryIndustrialComplex" else next(
            (faction for faction in faction_ids if name == f"{faction}_hivemind" or name.startswith(f"{faction}_")), None
        )
        records.append({"Name": name, "Icon": name, "BaseFaction": base_faction})
    return records


def parse_events() -> list[dict]:
    path = uexp_path("Situation/Events.uexp")
    if not path.exists():
        return []
    strings = unique_identifiers(extract_ascii_strings(read_bytes(path)))
    event_ids = sorted({name.removesuffix("_title") for name in strings if name.endswith("_title")})
    return [{"Name": name} for name in event_ids]


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
        ("FactionVariants.json", parse_faction_variants),
        ("DepositResources.json", lambda: parse_simple("DepositResources.json", "DepositResources.uasset")),
        ("StaticModifiers.json", lambda: parse_simple("StaticModifiers.json", "StaticModifiers.uasset")),
        ("UnitComponents.json", parse_unit_components),
        ("Situations.json", parse_situations),
        ("Events.json", parse_events),
        ("Deposits.json", parse_deposits),
    ]

    summary: dict[str, int] = {}

    for filename, parser in parsers:
        records = parser()
        validate_records(filename, records)
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
        "note": "Row IDs come from serialized uexp payloads. Full property names and structured fields still require .usmap; reform option modifiers use indexed keys where needed.",
    }
    write_json(PROJECT_ROOT / "data/raw/extraction-manifest.json", manifest)

    total = sum(summary.values())
    print(f"\nExtracted {total} define records across {len(summary)} files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
