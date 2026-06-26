# Prepared BSData Export

Generated with `python scripts/prepare_bsdata.py`. Stratagem and enhancement card
data are not present in the BSData 10th-edition catalogue, so they are merged in
from the Wahapedia 10e export. Fetch that first:

```bash
python scripts/fetch_wahapedia.py   # downloads into .cache/wahapedia/ (git-ignored)
python scripts/prepare_bsdata.py    # builds data/bsdata/ using both sources
```

If `.cache/wahapedia/` is absent the prep script still runs; stratagems and
enhancements are simply left empty.

Files:

- `data/bsdata/index.json`: faction manifest with file paths and unit / detachment
  / enhancement / stratagem counts, plus the BSData and Wahapedia source blocks.
- `data/bsdata/factions/*.json`: one cleaned export per faction catalogue.

Each faction file contains:

- `catalogue`: source file metadata.
- `units`: cleaned root datasheet entries for that faction. Characters carry
  `isCharacter` / `isEpicHero`, and Leaders carry a `leads` list of the Bodyguard
  units they can be attached to (parsed from the Leader ability text).
- `detachments`: each detachment record now also carries an `enhancements` list
  (name, points, rule text) merged from Wahapedia.
- `stratagems`: Wahapedia stratagem cards (Core + detachment), with parsed
  `when` / `target` / `effect` / `restrictions`, `cp`, `phase`, `turn` and `type`.

Each unit contains:

- `name` and `baseName`
- `summary`: quick fields for points, categories, stats, weapons, abilities, and rules
- `tree`: the fuller simplified BattleScribe selection tree with resolved profile and rule links
- `options`: a lighter nested option tree with costs, constraints, modifiers, categories, profiles, and child choices

Notes:

- The export keeps BSData logic as simplified JSON, but it does not fully evaluate every BattleScribe modifier or validation rule.
- Core and shared rules are kept as names in the quick summary to avoid repeating a lot of duplicated rule text there, but the richer `tree` keeps the linked detail.
- Raw BSData source files live in `.cache/bsdata-wh40k-10e` and are ignored by git.
- Raw Wahapedia CSV files live in `.cache/wahapedia` and are ignored by git.
- Stratagem and enhancement data are © Wahapedia (https://wahapedia.ru) and used
  under their non-commercial, attribution terms. Both data sources are 10th
  edition only.
