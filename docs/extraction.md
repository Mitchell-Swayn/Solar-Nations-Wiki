# Extracting Solar Nations 2 Game Data

Solar Nations 2 stores base-game definitions inside **UE5 IoStore** packs (`.pak`, `.ucas`, `.utoc`), not as loose JSON on disk. This guide explains how to export the full dataset for the wiki.

## Game install location

Default path (CrossOver Steam bottle):

```
~/Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/Solar Nations 2/Windows/twilightModernity/
```

Override with the `SN2_GAME_PATH` environment variable if your install differs.

## What is already available without extraction

| Source | Location | Contents |
|--------|----------|----------|
| tutorialMod | `Saved/Mods/tutorialMod/` | JSON schema samples (1 entry per define type) |
| Modifiers | `tutorialMod/modifiers.json` | 174 modifier definitions |
| Mission components | `tutorialMod/missioncomponents.json` | 40 mission component definitions |
| Flags | `Saved/Flags/` | ~502 country flag PNGs |
| Icons | `Saved/Icons/` | ~71 icon PNGs and subfolders |

The wiki pipeline uses these as a v0 dataset until full extraction is complete.

## Automated extraction (limited)

```bash
npm run extract
```

This script scans the UE5 `.utoc` asset index and writes a manifest to `data/raw/extraction-manifest.json`. It cannot dump full Defines JSON from IoStore packs — that requires FModel.

## Full extraction with FModel

### 1. Install FModel

Download from [https://fmodel.app/](https://fmodel.app/) (Windows app; runs in CrossOver if needed).

### 2. Point FModel at the game

- **Directory:** `.../twilightModernity/`
- **UE version:** 5.7 (confirmed from save file header: `UE5+Release-5.7`)
- **AES key:** Not required unless the developer encrypts paks (check FModel logs)

### 3. Export define data

In FModel, search for assets matching these define types (found in the utoc index):

- `Factions`
- `Technologies`
- `Resources`
- `Projects`
- `Events`
- `Eras`
- `CultureTraits`
- `CharacterTraits`
- `CharacterJobs`
- `GovernmentReforms`
- `GovernmentReformOptions`
- `UnitComponents`
- `Deposits`
- `DepositResources`
- `Situations`
- `StaticModifiers`
- `FactionVariants`

Export each as **JSON** (or the closest structured format FModel offers).

### 4. Place exports in the wiki project

Copy exported files into:

```
data/raw/Defines/
  Factions.json
  Technologies.json
  Resources.json
  ... (matching tutorialMod/Defines/ filenames exactly)
```

If you export localization separately:

```
data/raw/Localization/
  en.json
```

File names must match the tutorialMod convention exactly (see `Saved/Mods/tutorialMod/README.md`).

### 5. Regenerate wiki data

```bash
npm run normalize
npm run build
```

The normalize script prefers `data/raw/Defines/` over tutorialMod samples when present.

## Verifying extraction

After normalize, check the console output for entry counts per category. A full extract should have hundreds of entries per major type (technologies, factions, projects), not just 1 sample each.

## In-game localization tip

The tutorialMod README notes you can use the console command `toggleLocalization` in-game to show raw localization keys instead of translated text. This helps map keys to objects when building localization files.

## Updating after a game patch

1. Re-export from FModel after the game updates
2. Replace files in `data/raw/Defines/`
3. Run `npm run data && npm run build`
4. Commit updated `data/curated/` if you version curated data (optional — it is regenerated on each build)
