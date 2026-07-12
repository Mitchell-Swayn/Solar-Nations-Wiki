# Extracting Solar Nations 2 Game Data

Solar Nations 2 stores base-game definitions inside **UE5 IoStore** packs (`.pak`, `.ucas`, `.utoc`), not as loose JSON on disk. This guide explains how to export data for the wiki.

## Game install location

Default path (CrossOver Steam bottle):

```
~/Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/Solar Nations 2/Windows/twilightModernity/
```

Override with the `SN2_GAME_PATH` environment variable if your install differs.

## Automated extraction (recommended on macOS)

The wiki includes a Mac-native pipeline that does not require FModel:

```bash
npm run data
```

This runs:

1. **`retoc unpack`** — extracts raw `.uasset` files to `data/raw/unpacked/` (first run only, ~6 GB)
2. **`retoc to-legacy`** — converts define assets to legacy `.uexp` format in `data/raw/legacy-all/`
3. **`tools/parse_legacy.py`** — parses binary exports into `data/raw/Defines/*.json` and `data/raw/Localization/en.json`
4. **`scripts/normalize.ts`** — writes `data/curated/` and copies flags/icons

Current automated output: **2,590 define records**, including 41 deposits, and **4,000+ localization keys** (vs. 231 tutorialMod samples). Normalization adds tutorial modifier and mission-component definitions for **2,804 wiki entries** total.

### Limitations of automated extraction

- **Modifier keys** on reform options and some complex types use indexed keys (`modifier_0`, `modifier_1`) until a `.usmap` mappings file is available
- **Numeric fields** (tech cost, prerequisites, coordinates) are not fully decoded without UE property mappings
- **Deposits** currently include row names and icons, but their structured modifiers, colors, and special flags still require property mappings

For pixel-perfect parity with in-game JSON, use FModel + `.usmap` (see below).

## Full extraction with FModel (best quality)

### 1. Generate a `.usmap` mappings file

UE5.6+ games require mappings for unversioned properties. Options:

- **UE4SS** — install to `Binaries/Win64/`, launch game, Dumpers tab → Generate `.usmap`
- **UnrealMappingsDumper** — inject DLL on Windows
- **Community archives** — [Unreal-Mappings-Archive](https://github.com/TheNaeem/Unreal-Mappings-Archive)

On Mac/CrossOver, UE4SS signature scanning may fail; generating mappings on native Windows is most reliable.

### 2. Install FModel

Download from [https://fmodel.app/](https://fmodel.app/) (Windows; runs in CrossOver).

### 3. Configure FModel

- **Directory:** `.../twilightModernity/`
- **UE version:** 5.6 / 5.7
- **Mappings:** point to your `Mappings.usmap`

### 4. Export define data

Export these define types as JSON:

- `Factions`, `Technologies`, `Resources`, `Projects`, `Events`, `Eras`
- `CultureTraits`, `CharacterTraits`, `CharacterJobs`
- `GovernmentReforms`, `GovernmentReformOptions`
- `UnitComponents`, `Deposits`, `DepositResources`
- `Situations`, `StaticModifiers`, `FactionVariants`

Place exports in:

```
data/raw/Defines/
  Factions.json
  Technologies.json
  ...
```

Localization:

```
data/raw/Localization/en.json
```

File names must match the tutorialMod convention (see `Saved/Mods/tutorialMod/README.md`).

### 5. Regenerate wiki data

```bash
npm run normalize
npm run build
```

The normalize script prefers `data/raw/Defines/` over tutorialMod samples when present.

## What is available without any extraction

| Source | Location | Contents |
|--------|----------|----------|
| tutorialMod | `Saved/Mods/tutorialMod/` | JSON schema samples (1 entry per define type) |
| Modifiers | `tutorialMod/modifiers.json` | 174 modifier definitions |
| Mission components | `tutorialMod/missioncomponents.json` | 40 mission component definitions |
| Flags | `Saved/Flags/` | ~502 country flag PNGs |
| Icons | `Saved/Icons/` | Game icon PNGs |

## Verifying extraction

After `npm run normalize`, check entry counts per category. A full automated extract should show hundreds of technologies, culture traits, projects, etc. — not 1 sample each.

## In-game localization tip

Use the console command `toggleLocalization` in-game to show raw localization keys instead of translated text.

## Updating after a game patch

1. Delete `data/raw/legacy-all/` and re-run `npm run data`, or re-export from FModel
2. Run `npm run build:local`
3. Commit updated `data/curated/` for CI if desired
