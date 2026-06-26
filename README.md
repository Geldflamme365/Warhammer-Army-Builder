# Warhammer Army Builder

A prototype web app for building Warhammer armies from prepared BSData exports.

This project is focused on a practical army-building workflow:

- create and save multiple armies
- choose a faction when creating a new army
- browse units by category
- inspect datasheets and linked BSData details
- add units to a roster and track points
- reopen saved armies from a homescreen

The app is currently frontend-only and stores saved armies locally in the browser.

## Project Status

This is an early prototype, not a finished competitive list-building tool.

What works now:

- homescreen with saved armies
- new army flow with alliance and faction selection
- army builder with searchable unit library
- one-open-at-a-time category accordion for unit browsing
- datasheet modal for unit inspection
- grouped army view with points totals
- detachment rules, enhancements, and stratagems panel
- stratagem browser: Core vs detachment, grouped by phase, CP badges, search
- enhancements assignable to characters in the roster (10e limits: max 3 per army,
  one per character, no Epic Heroes), counted toward points
- leaders attachable to a valid Bodyguard unit in the roster, shown nested with
  combined points
- local save state in `localStorage`
- copy/export of the current army (including enhancements and leader attachments)
- delete saved armies

What is still incomplete:

- options are mostly read-only display right now
- points are based on exported summary values, not a full live rules engine
- validation is not complete BattleScribe/New Recruit style validation
- wargear logic and full force-org rules are not fully implemented

## Stack

- `React`
- `TypeScript`
- `Vite`
- `lucide-react` for icons

## Data Source

The app uses prepared JSON exports generated from two community-maintained 10th
edition sources:

- **BSData** (`wh40k-10e`) — units, datasheets, detachments, options.
- **Wahapedia** (`wh40k10ed`) — stratagems and enhancements, which are not present
  in the BSData catalogue.

Files and scripts:

- prepared faction index: [data/bsdata/index.json](data/bsdata/index.json)
- prepared faction files: `data/bsdata/factions/*.json`
- export notes: [data/bsdata/README.md](data/bsdata/README.md)
- Wahapedia fetch script: [scripts/fetch_wahapedia.py](scripts/fetch_wahapedia.py)
- generator script: [scripts/prepare_bsdata.py](scripts/prepare_bsdata.py)

Regenerate the data with:

```bash
npm run fetch:wahapedia
npm run prepare:bsdata
```

Important:

- this is not an official Games Workshop API
- everything here is 10th edition only
- the data is based on BSData and Wahapedia and inherits their strengths and limitations
- stratagem and enhancement data are © Wahapedia (https://wahapedia.ru), used under
  their non-commercial, attribution terms ("powered by Wahapedia")
- the export keeps rich unit trees, profiles, rules, and option structures, but the app does not fully evaluate all of that logic yet

## App Flow

The current user flow is:

1. `Home`
   - view saved armies
   - open an existing army
   - create a new army
2. `New Army`
   - choose alliance
   - choose faction
   - optionally name the army
3. `Builder`
   - browse units
   - inspect datasheets
   - add units to the army
   - manage counts, notes, export, copy, or delete

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Refreshing the BSData Export

To regenerate the prepared JSON from the cached BSData source:

```bash
npm run prepare:bsdata
```

This rebuilds the prepared export used by the app. The generated data is served from the `data/bsdata` folder.

## Project Structure

```text
src/
  App.tsx            Main application flow and UI
  data.ts            JSON loading helpers
  main.tsx           React entry point
  styles.css         Application styling
  types.ts           Shared TypeScript types

data/bsdata/
  index.json         Faction manifest
  factions/          Prepared faction JSON files
  README.md          Export format notes

scripts/
  prepare_bsdata.py  BSData to JSON export script
```

## Storage

Saved armies are stored in browser `localStorage`.

That means:

- armies persist between reloads on the same browser
- there is no backend database yet
- clearing browser storage will remove saved armies

## Notes for Future Work

The next big steps are probably:

- editable wargear and options
- proper points recalculation from choices
- detachment support
- army validation rules
- import/export formats beyond the current JSON/text export
- better army naming, duplication, and editing tools

## License / Usage Note

The code in this repository is one thing; Warhammer rules text and game data are another.

If this project is shared publicly, it is worth being careful about:

- republishing copyrighted rules text
- treating community data as if it were official
- distributing a tool that looks more complete than its current rules support actually is
