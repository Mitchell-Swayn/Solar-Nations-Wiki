#!/usr/bin/env python3
"""Convert CUE4Parse DefinesFull exports into tutorialMod-convention JSON.

Reads data/raw/DefinesFull/**/*.json (produced by tools/cue4-export) and
writes data/raw/Defines/<Table>.json row arrays that scripts/normalize.ts
consumes. Transformations:

- Blueprint GUID suffixes are stripped from property names
  (SizeofEarth_20_94D8... -> SizeofEarth).
- TMap entries with the modifier key struct (Key/Value1..3) are folded into
  the tutorialMod '(Key="..",Value1="..",Value2="..",Value3="..")' form.
- Blueprint enum values (Enum::NewEnumeratorN) are resolved through the
  exported UserDefinedEnum DisplayNameMap.
- FText objects collapse to their localized/source string.
- Object references collapse to the bare asset name.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data/raw/DefinesFull"
DEST = ROOT / "data/raw/Defines"

GUID_SUFFIX = re.compile(r"_\d+_[0-9A-F]{32}$")
ENUM_VALUE = re.compile(r"^([A-Za-z0-9_]+)::(NewEnumerator\d+)$")
OBJECT_NAME = re.compile(r"^[A-Za-z0-9_]+'(.+)'$")

# Source table -> output file consumed by normalize.ts / categories.ts
RENAMES = {
    "resources.json": "Resources.json",
    "Deposit.json": "Deposits.json",
    "UnitDesigner/UnitComponents.json": "UnitComponents.json",
    "UnitDesigner/UnitStats.json": "UnitStats.json",
    "UnitDesigner/DamageTypes.json": "DamageTypes.json",
    "UnitDesigner/UnitQualities.json": "UnitQualities.json",
    "Situation/Events.json": "Events.json",
    "Situation/GlobalFlags.json": "GlobalFlags.json",
    "Edicts/Edicts.json": "Edicts.json",
    "PolicyOptions2.json": "PolicyOptions.json",
    "Policy.json": "Policies.json",
    "Ideology/ReformVariantTech.json": "ReformVariantTech.json",
    "Deposit/DepositCosmetics.json": "DepositCosmetics.json",
}

SKIP = {
    "BAD.json",
    "DELETE.json",
    "InstancedStructLogicTest.json",
    "LogicParameters.json",
}

# ModifierProperties + ModifierProperties1 merge into one catalogue.
MERGE_INTO = {"ModifierProperties1.json": "ModifierProperties.json"}


def strip_key(key: str) -> str:
    return GUID_SUFFIX.sub("", key)


def is_ftext(value: dict) -> bool:
    return set(value) == {"Namespace", "Key", "SourceString", "LocalizedString"}


def load_enum_display_names() -> dict[str, dict[str, str]]:
    enums: dict[str, dict[str, str]] = {}
    for path in SRC.rglob("*.json"):
        try:
            exports = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        for export in exports:
            if export.get("Type") != "UserDefinedEnum":
                continue
            mapping = {}
            for pair in export.get("Properties", {}).get("DisplayNameMap", []):
                text = pair.get("Value", {})
                name = text.get("LocalizedString") or text.get("SourceString")
                if name:
                    mapping[pair["Key"]] = name
            enums[export["Name"]] = mapping
    return enums


ENUMS = load_enum_display_names()


def modifier_map_key(key: dict) -> str | None:
    """Fold a modifier key struct into the tutorialMod string form."""
    stripped = {strip_key(k): v for k, v in key.items()}
    if set(stripped) != {"Key", "Value1", "Value2", "Value3"}:
        return None
    vals = [stripped[k] for k in ("Key", "Value1", "Value2", "Value3")]
    vals = ["" if v in (None, "None") else str(v) for v in vals]
    return (
        f'(Key="{vals[0]}",Value1="{vals[1]}",Value2="{vals[2]}",Value3="{vals[3]}")'
    )


def convert(value):
    if isinstance(value, dict):
        if is_ftext(value):
            return value.get("LocalizedString") or value.get("SourceString") or ""
        if set(value) == {"ObjectName", "ObjectPath"}:
            match = OBJECT_NAME.match(value["ObjectName"])
            return match.group(1) if match else value["ObjectName"]
        return {strip_key(k): convert(v) for k, v in value.items()}
    if isinstance(value, list):
        # TMap exported as [{Key, Value}] pairs.
        if value and all(
            isinstance(item, dict) and set(item) == {"Key", "Value"} for item in value
        ):
            out = {}
            for item in value:
                key = item["Key"]
                if isinstance(key, dict):
                    folded = modifier_map_key(key)
                    key = folded if folded else json.dumps(convert(key), sort_keys=True)
                else:
                    key = str(convert(key))
                out[key] = convert(item["Value"])
            return out
        return [convert(item) for item in value]
    if isinstance(value, str):
        match = ENUM_VALUE.match(value)
        if match:
            enum_name, entry = match.groups()
            resolved = ENUMS.get(enum_name, {}).get(entry)
            if resolved:
                return resolved
        return value
    return value


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    outputs: dict[str, list] = {}
    for path in sorted(SRC.rglob("*.json")):
        rel = path.relative_to(SRC).as_posix()
        if rel in SKIP:
            continue
        exports = json.loads(path.read_text())
        for export in exports:
            if export.get("Type") != "DataTable" or not export.get("Rows"):
                continue
            rows = []
            for row_id, row in export["Rows"].items():
                record = {"Name": row_id}
                converted = convert(row)
                if isinstance(converted, dict):
                    record.update(converted)
                rows.append(record)
            out_name = RENAMES.get(rel, Path(rel).name)
            out_name = MERGE_INTO.get(out_name, out_name)
            existing = outputs.setdefault(out_name, [])
            seen = {r["Name"] for r in existing}
            existing.extend(r for r in rows if r["Name"] not in seen)

    for out_name, rows in sorted(outputs.items()):
        (DEST / out_name).write_text(json.dumps(rows, indent=1))
        print(f"{len(rows):5} {out_name}")
    print(f"Wrote {len(outputs)} tables to {DEST}")


if __name__ == "__main__":
    main()
