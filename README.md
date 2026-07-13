# Solar Nations 2 Wiki

An unofficial, auto-generated data encyclopedia for [Solar Nations 2](https://store.steampowered.com/app/2275440/Solar_Nations_2/). The project extracts definitions from the game, converts them into a stable wiki-oriented data model, and uses [Astro](https://astro.build/) to generate a static site for GitHub Pages.

## How it works

The repository has two connected but intentionally separate workflows:

```text
Solar Nations 2 install
  |  UE5 IoStore packs, localization, flags, and icons
  v
npm run extract
  |  data/raw/Defines/*.json + data/raw/Localization/en.json
  v
npm run normalize
  |  data/curated/*.json + public/wiki-icons/ + public/assets/
  v
npm run build
  |  Astro reads only curated data and pre-renders every route
  v
dist/ -> GitHub Pages
```

The extraction and normalization pipeline runs on a developer machine that has the game installed. The static site build does not need the game: it consumes the committed files in `data/curated/` and `public/`. This allows GitHub Actions to deploy the wiki on Linux without access to the game files or extraction tools.

### 1. Extract game data

`npm run extract` runs `scripts/extract.ts`, which locates the game through `SN2_GAME_PATH` or the default CrossOver installation path. It then:

1. Uses `retoc` to unpack the UE5 IoStore containers into `data/raw/unpacked/` if they have not already been unpacked.
2. Converts selected define assets to legacy `.uexp` files in `data/raw/legacy-all/`.
3. Decodes packed icons that are absent from the game's loose icon directory.
4. Runs `tools/parse_legacy.py` to produce JSON tables in `data/raw/Defines/` and English localization in `data/raw/Localization/en.json`.
5. If `tools/jmap_dumper/mappings.usmap` and the .NET SDK are available, runs the CUE4Parse exporter and replaces the legacy parser's partial records with full-fidelity records.

The large intermediate directories under `data/raw/` are gitignored. Existing unpacked and legacy assets are reused, which makes later runs faster.

Without a current `.usmap`, the legacy parser still recovers verified row identities and many useful fields, but some numeric values and complex properties may be incomplete. See [docs/extraction.md](docs/extraction.md) for setup details, limitations, and the FModel alternative.

### 2. Normalize into the wiki model

`npm run normalize` runs `scripts/normalize.ts`. This is the boundary between game-specific exports and the web application. It:

- maps each supported define filename to a category declared in `src/lib/categories.ts`;
- localizes names and descriptions;
- promotes nested culture ideas into individually addressable wiki entries;
- extracts modifiers, prerequisites, references, icons, and remaining properties into the shared `WikiEntry` shape from `src/lib/types.ts`;
- removes references to unavailable icons and applies known icon aliases and fallbacks;
- writes a combined lookup index plus one JSON file per category to `data/curated/`;
- copies flags and icons into `public/assets/` and creates the deployable `public/wiki-icons/` bundle and icon manifest.

`data/curated/index.json` is the main application data contract. It contains entries keyed as `<category>:<id>` and ordered lists of those keys grouped by category. The per-category JSON files are useful generated artifacts, while the application primarily loads the combined index.

### 3. Generate the application

Astro imports the curated index at build time through `src/lib/data.ts`. Its dynamic route templates use `getStaticPaths()` to turn that data into static HTML:

- `/` is the category overview;
- `/[type]/` is a category directory;
- `/[type]/[id]/` is an entry detail page;
- `/culture-traits/[family]/` groups culture traits into family pages.

Category metadata controls labels, navigation groups, source define files, and categories that are visually merged into a parent directory, such as reform options under government reforms. The base layout also embeds a compact search index in each build, so global search and directory filtering run entirely in the browser with no server or database.

### 4. Deploy

On a push to `main`, `.github/workflows/deploy.yml` installs Node dependencies, runs `npm run build` against the committed curated data, uploads `dist/`, and deploys it to GitHub Pages. `astro.config.mjs` supplies the Pages base path when `GITHUB_PAGES=true`, so generated links work under `/Solar-Nations-Wiki/`.

## Local development

Requirements:

- Node.js 22.12 or newer
- npm
- A local Solar Nations 2 install only if refreshing data
- Python 3 and the repository's `retoc` binary for extraction
- Optional: the .NET SDK and a current `.usmap` for full-fidelity extraction

Install dependencies and build from the already committed curated data:

```bash
npm install
npm run build
npm run preview
```

For day-to-day UI work, start Astro in background mode:

```bash
npm exec astro -- dev --background
npm exec astro -- dev status
npm exec astro -- dev logs
npm exec astro -- dev stop
```

The development server is available at `http://localhost:4321` by default.

## Refreshing game data

The default game root is:

```text
~/Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/Solar Nations 2/Windows/twilightModernity/
```

For another installation, point `SN2_GAME_PATH` at the `twilightModernity` directory:

```bash
export SN2_GAME_PATH="/path/to/twilightModernity"
npm run data
```

`npm run data` is equivalent to running extraction and normalization in sequence. To refresh the data and immediately verify the production build:

```bash
npm run build:local
```

Review changes to `data/curated/`, `public/wiki-icons/`, and other generated public assets before committing them. Do not commit `data/raw/`; those files are local extraction intermediates and can be several gigabytes.

## Commands

| Command | Purpose |
|---|---|
| `npm run build` | Build the static site from committed curated data |
| `npm run preview` | Serve the production build locally |
| `npm run extract` | Extract raw definitions, localization, and packed icons from the game |
| `npm run normalize` | Convert raw exports into curated wiki data and public assets |
| `npm run data` | Run `extract` followed by `normalize` |
| `npm run build:local` | Refresh game data and then build the site |

## Project structure

```text
.github/workflows/deploy.yml  GitHub Pages build and deployment
data/curated/                committed, wiki-ready JSON used by Astro and CI
data/icons-extra/            tracked icons decoded from packed game textures
data/raw/                    local extraction intermediates (gitignored)
docs/extraction.md           detailed extraction and mappings guide
public/assets/               copied loose game flags and icons
public/wiki-icons/           deployable icon bundle generated by normalization
scripts/extract.ts           extraction orchestrator
scripts/normalize.ts         raw-to-curated transformation
scripts/paths.ts             game and project path resolution
src/components/              reusable wiki presentation components
src/layouts/                 shared page shell, navigation, and client search
src/lib/                     categories, types, data access, and URL helpers
src/pages/                   Astro static route templates
tools/                       binary parsers, icon tools, and full export utilities
```

## Adding a new data category

1. Ensure extraction produces the table as `data/raw/Defines/<TableName>.json`.
2. Add category metadata with the matching `defineFile` to `src/lib/categories.ts`.
3. Run `npm run normalize`; the filename-to-category map is derived from that metadata.
4. Check the generated category JSON, directory page, representative detail pages, icons, and links.
5. Run `npm run build` before committing the curated data and public assets.

Most categories work through the generic route templates. Add category-specific presentation only when its records need grouping or relationships beyond the shared entry model.

## License

Game data and artwork belong to Flomgus Games. This repository is an unofficial fan wiki tool.
