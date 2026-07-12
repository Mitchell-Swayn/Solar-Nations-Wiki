# Solar Nations Wiki — Agent Handoff

Handoff document for another agent to continue from the current state.

---

## Goal

Build an **auto-generated data encyclopedia** for Solar Nations 2 (Astro static site → GitHub Pages). The wiki should be fed from **full base-game Defines**, not just the tutorialMod samples.

| Resource | URL / path |
|----------|------------|
| Live site | https://mitchell-swayn.github.io/Solar-Nations-Wiki/ |
| GitHub repo | https://github.com/Mitchell-Swayn/Solar-Nations-Wiki.git |
| Workspace | `/Users/mitchellswayn/Projects/Solar Nations Wiki` |

---

## What's Done

### 1. Astro wiki (v0 → v1)

- Static site with category pages, detail pages, search, icons/flags
- GitHub Actions deploy to Pages
- `withBase()` fix for subpath 404s (committed as `311664f`)
- **1,310 curated entries** generated from validated `.uexp` row identifiers

### 2. Data pipeline

| Step | Script / tool | Output |
|------|----------------|--------|
| Unpack paks | `retoc unpack` via `scripts/extract.ts` | `data/raw/unpacked/` (~5.9 GB, gitignored) |
| Zen → legacy | `retoc to-legacy --version UE5_6` | `data/raw/legacy-all/` (~11 MB, gitignored) |
| Binary → JSON | `tools/parse_legacy.py` | `data/raw/Defines/*.json`, `data/raw/Localization/en.json` |
| Wiki normalize | `scripts/normalize.ts` | `data/curated/` (committed for CI) |

**Run everything:**

```bash
npm run data        # extract + normalize
npm run build:local # data + astro build
```

### 3. Entry counts (current local `data/curated/`)

| Category | Count |
|----------|------:|
| static-modifiers | 12 |
| culture-traits | 421 |
| technologies | 99 |
| projects | 87 |
| unit-components | 173 |
| modifiers | 175 |
| character-traits | 68 |
| faction-variants | 18 |
| government-reform-options | 56 |
| deposit-resources | 17 |
| deposits | 41 |
| events | 3 |
| mission-components | 40 |
| situations | 32 |
| resources | 16 |
| character-jobs | 23 |
| factions | 9 |
| eras | 8 |
| government-reforms | 12 |
| **Total** | **1,310** |

Counts are lower than earlier automated output because schema fields and cross-table values are no longer misclassified as rows.

### 4. Documentation

- `docs/extraction.md` — macOS automated path + FModel/usmap path
- `README.md` — updated for new pipeline (modified, not pushed)

---

## Game Install Paths

**Default game root** (`scripts/paths.ts`):

```
~/Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/Solar Nations 2/Windows/twilightModernity/
```

**Key on-disk sources:**

- `Content/Paks/` — UE5 IoStore (packed defines)
- `Saved/Mods/tutorialMod/` — JSON schema samples + 174 modifiers + 40 mission components
- `Saved/Flags/`, `Saved/Icons/` — ~502 flags, ~71 icon roots

**Launch arg** (per game README): `-NotInstalled` for scenarios/saves.

Override install path:

```bash
export SN2_GAME_PATH="/path/to/twilightModernity"
```

---

## Extraction Approaches Tried

### A. `retoc` + `parse_legacy.py` — **working (primary path on Mac)**

- Unpacks and converts define assets without `.usmap`
- Produces tutorialMod-shaped JSON with **names, icons, partial modifiers**
- **Limitations:**
  - Modifier keys are placeholders (`modifier_0`, `modifier_1`) — real keys like `popGrowthMult` need property name resolution from `.usmap`
  - Tech fields (`Cost`, `Prerequisites`, `Location`, etc.) mostly default/empty
  - Deposits currently contain names/icons only; structured modifiers, colors, and special flags still need property mappings
  - Some variants missing (e.g. `economy_agrarian` only has `default`, `genetics`, `futuristic` — not all 5 variants)

**Example — `economy_agrarian` in `data/raw/Defines/GovernmentReformOptions.json`:**

```json
{
  "Name": "economy_agrarian",
  "Modifier": {
    "default": { "Modifiers": { "modifier_0": 0.35 } },
    "genetics": { "Modifiers": { "modifier_0": 0.1 } }
  }
}
```

**Known raw values from binary probing** (not yet mapped to keys): default variant ≈ `0.35, 0.1, 0.1`; flavor text in localization: *"The Industrial Revolution and its consequences have been a disaster for humanity..."*

### B. CUE4Parse extractor — **blocked**

- Location: `tools/extractor/Sn2Extractor/` (.NET 10 + CUE4Parse NuGet)
- Mounts 5,200+ files from paks
- **Fails:** `Package has unversioned properties but mapping file is missing, can't serialize`
- Needs `.usmap` to export full JSON

### C. UE4SS mappings dump — **failed on CrossOver/Mac**

- Installed to game `Binaries/Win64/` (`UE4SS.dll`, `dwmapi.dll`, `UsmapAutoDump` mod)
- Launched `twilightModernity-Win64-Shipping.exe` via CrossOver wine
- **Failed:** pattern scan timeout — `GUObjectArray`, `FName::FName`, `FText::FText` not found
- Log: `.../Binaries/Win64/UE4SS.log` — ends with `Fatal Error: PS scan timed out`
- **No `Mappings.usmap` produced**
- UE4SS files still present in game folder — consider removing before normal play

### D. `jmap_dumper` — **not run**

- Downloaded: `tools/jmap_dumper/jmap_dumper.exe` (Windows x64 only)
- Needs running game process or Windows minidump
- No Mac ARM build

### E. Community `.usmap` — **not found**

- Searched [Unreal-Mappings-Archive](https://github.com/TheNaeem/Unreal-Mappings-Archive) — no Solar Nations / twilightModernity entry

---

## Key Files for Next Agent

### Pipeline

| File | Role |
|------|------|
| `scripts/extract.ts` | Orchestrates retoc unpack/legacy + calls parser |
| `tools/parse_legacy.py` | **Main parser** — extend here for better field decoding |
| `scripts/normalize.ts` | Raw/tutorialMod → `data/curated/`; prefers `data/raw/Defines/` when present |
| `scripts/paths.ts` | Game path resolution (`SN2_GAME_PATH`) |
| `src/lib/categories.ts` | Define file → wiki slug mapping (`DEFINE_FILE_TO_SLUG`) |

### Data (gitignored unless noted)

| Path | Notes |
|------|-------|
| `data/raw/unpacked/` | ~5.9 GB raw `.uasset` |
| `data/raw/legacy-all/` | ~137 `.uexp` legacy exports |
| `data/raw/Defines/` | 17 JSON files from parser |
| `data/raw/Localization/en.json` | ~4,365 keys |
| `data/curated/` | **Committed for CI** — locally updated, **not pushed** |

### Tools (mostly untracked `?? tools/`)

| Path | Notes |
|------|-------|
| `tools/retoc_cli-aarch64-apple-darwin/retoc` | Mac ARM retoc binary |
| `tools/parse_legacy.py` | Custom binary parser |
| `tools/extractor/Sn2Extractor/` | CUE4Parse .NET tool (blocked on usmap) |
| `tools/ue4ss/extracted/` | UE4SS v3.0.1 download |
| `tools/jmap_dumper/` | Windows jmap dumper |
| `tools/pakstore.json` | Pak index (3028 entries) |

### Reference schema (tutorialMod)

```
{game}/Saved/Mods/tutorialMod/
  Defines/*.json      # 17 types, 1 sample each — canonical JSON shape
  modifiers.json      # 174 entries
  missioncomponents.json
  Localization/en.json
  README.md           # Schema docs, prerequisite types, election enums
```

### Related docs

- `docs/extraction.md` — full extraction guide
- Prior chat transcript: `062dee63-d4b2-4e5c-b25c-76ecc2c6dc90`

---

## Git State (as of handoff)

```
Branch: main (tracking origin/main)
Last pushed commit before this parser correction: 4f9cd1c

Uncommitted:
  - Modified: README.md, docs/extraction.md, scripts/extract.ts
  - Modified: parser, documentation, curated JSON, and generated wiki icon bundle
  - Untracked: tools/ (retoc, parse_legacy.py, extractor, ue4ss, jmap, etc.)
```

**Do not commit** `data/raw/` (gitignored). **Consider committing** `data/curated/` + `tools/parse_legacy.py` + retoc path docs after review.

---

## Recommended Next Steps (priority order)

### 1. Get `.usmap` (unblocks CUE4Parse + FModel quality)

- **Best:** Native Windows — UE4SS → Dumpers → Generate `.usmap`, or inject UnrealMappingsDumper
- Place at `tools/mappings/twilightModernity.usmap` or game `Binaries/Win64/Mappings.usmap`
- Wire into `Sn2Extractor` via CUE4Parse `MappingsContainer`
- Re-export all `Defines/*.json` with real modifier keys and numeric fields

### 2. Improve `parse_legacy.py` (no usmap needed)

- Map `modifier_N` → real keys using name table from `.uasset` + index order in `.uexp`
- Decode tech `Cost`, `Prerequisites`, `Location` from `Technologies.uexp`
- Decode deposit modifiers, colors, and special flags from the singular `Deposit` table
- Recover all 5 reform variants per option

### 3. Localization

- Parser pulls keys from unpacked `resource_english.uasset` via `strings`
- Could improve with proper UE string table parsing for `SourceString` pairs

### 4. Cleanup

- Remove UE4SS from game `Binaries/Win64/` if user doesn't need it (`UE4SS.dll`, `dwmapi.dll`, `Mods/UsmapAutoDump/`)
- Add `tools/` to git (exclude large binaries: `retoc.tar.xz`, `jmap.zip`, `ue4ss` zip, `data/raw/unpacked`)

### 5. Ship

```bash
npm run build:local
git add data/curated/ tools/parse_legacy.py scripts/extract.ts docs/extraction.md README.md
git commit -m "Add full-game extraction pipeline and regenerate curated data"
git push
```

---

## Environment Notes

- **OS:** macOS (darwin), CrossOver for Steam/Windows game
- **CrossOver wine:** `/Applications/Games/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine`
- **Node:** >=22.12; `npm run build` = astro only (CI uses committed `data/curated/`)
- **`public/assets/`** gitignored (~62 MB); regenerated by `normalize.ts`
- **Engine:** UE 5.6 (`EGame.GAME_UE5_6` in CUE4Parse; `retoc --version UE5_6`)

---

## Success Criteria

| Milestone | Status |
|-----------|--------|
| Wiki builds and deploys | Done |
| Category/detail pages work on GitHub Pages | Done |
| Validated row identifiers in wiki | Done locally (1,310) |
| Real modifier keys on reforms | **Not done** — needs usmap or better parser |
| Tech costs/prerequisites accurate | **Not done** |
| Deposits category populated | Done (41 names/icons; structured fields remain) |
| Curated data pushed to GitHub | **Not done** |
| FModel-quality full export | **Blocked on `.usmap`** |
