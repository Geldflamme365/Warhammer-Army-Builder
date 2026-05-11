# Prepared BSData Export

Generated with `python scripts/prepare_bsdata.py`.

Files:

- `data/bsdata/index.json`: faction manifest with file paths and unit counts.
- `data/bsdata/factions/*.json`: one cleaned export per faction catalogue.

Each faction file contains:

- `catalogue`: source file metadata.
- `units`: cleaned root datasheet entries for that faction.

Each unit contains:

- `name` and `baseName`
- `summary`: quick fields for points, categories, stats, weapons, abilities, and rules
- `tree`: the fuller simplified BattleScribe selection tree with resolved profile and rule links
- `options`: a lighter nested option tree with costs, constraints, modifiers, categories, profiles, and child choices

Notes:

- The export keeps BSData logic as simplified JSON, but it does not fully evaluate every BattleScribe modifier or validation rule.
- Core and shared rules are kept as names in the quick summary to avoid repeating a lot of duplicated rule text there, but the richer `tree` keeps the linked detail.
- Raw BSData source files live in `.cache/bsdata-wh40k-10e` and are ignored by git.
