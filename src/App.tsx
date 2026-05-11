import {
  Check,
  ChevronRight,
  Copy,
  Crosshair,
  Database,
  Download,
  LoaderCircle,
  Minus,
  Plus,
  Search,
  Shield,
  Swords,
  Trash2,
  X,
} from "lucide-react";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { loadCatalogueIndex, loadFactionCatalogue } from "./data";
import type {
  CatalogueIndex,
  Constraint,
  FactionMeta,
  FactionData,
  Modifier,
  Profile,
  RosterItem,
  StoredState,
  TreeNode,
  UnitRecord,
} from "./types";

const STORAGE_KEY = "warhammer-army-builder.prototype";
const ALLIANCE_ORDER = ["Xenos", "Imperium - Astartes", "Imperium - Other", "Chaos"] as const;

type Alliance = (typeof ALLIANCE_ORDER)[number];

function App() {
  const [indexData, setIndexData] = useState<CatalogueIndex | null>(null);
  const [indexError, setIndexError] = useState<string>("");
  const [indexLoading, setIndexLoading] = useState(true);

  const [loadedFactions, setLoadedFactions] = useState<Record<string, FactionData>>({});
  const [factionLoading, setFactionLoading] = useState(false);
  const [factionError, setFactionError] = useState<string>("");

  const [selectedAlliance, setSelectedAlliance] = useState<Alliance>("Xenos");
  const [selectedFactionSlug, setSelectedFactionSlug] = useState<string>("");
  const [datasheetUnitId, setDatasheetUnitId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearch = useDeferredValue(searchTerm);
  const [detailTab, setDetailTab] = useState<"overview" | "weapons" | "abilities" | "options" | "tree">(
    "overview",
  );
  const [copiedState, setCopiedState] = useState(false);
  const [expandedSectionsByFaction, setExpandedSectionsByFaction] = useState<Record<string, Record<string, boolean>>>({});

  const [draftsByFaction, setDraftsByFaction] = useState<Record<string, { updatedAt: string; items: RosterItem[] }>>(
    {},
  );
  const [selectedUnitIdByFaction, setSelectedUnitIdByFaction] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as StoredState;
      if (parsed.selectedFactionSlug) {
        setSelectedFactionSlug(parsed.selectedFactionSlug);
      }
      if (parsed.draftsByFaction) {
        setDraftsByFaction(parsed.draftsByFaction);
      }
      if (parsed.selectedUnitIdByFaction) {
        setSelectedUnitIdByFaction(parsed.selectedUnitIdByFaction);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setIndexLoading(true);
    loadCatalogueIndex(controller.signal)
      .then((data) => {
        setIndexData(data);
        setIndexError("");
        const preferredFaction =
          (selectedFactionSlug && data.factions.find((faction) => faction.slug === selectedFactionSlug)) ??
          data.factions[17] ??
          data.factions[0];

        if (preferredFaction) {
          const alliance = getFactionAlliance(preferredFaction.name);
          setSelectedFactionSlug(preferredFaction.slug);
          setSelectedAlliance(alliance);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        setIndexError(error instanceof Error ? error.message : "Could not load the faction index.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIndexLoading(false);
        }
      });
    return () => controller.abort();
  }, [selectedFactionSlug]);

  const selectedFactionMeta = indexData?.factions.find((faction) => faction.slug === selectedFactionSlug) ?? null;
  const factionsByAlliance = useMemo(() => {
    const grouped: Record<Alliance, FactionMeta[]> = {
      Xenos: [],
      "Imperium - Astartes": [],
      "Imperium - Other": [],
      Chaos: [],
    };

    for (const faction of indexData?.factions ?? []) {
      grouped[getFactionAlliance(faction.name)].push(faction);
    }

    for (const alliance of ALLIANCE_ORDER) {
      grouped[alliance].sort((left, right) => getFactionLabel(left).localeCompare(getFactionLabel(right)));
    }

    return grouped;
  }, [indexData]);
  const visibleFactions = factionsByAlliance[selectedAlliance];

  useEffect(() => {
    if (!selectedFactionMeta || loadedFactions[selectedFactionMeta.slug]) {
      return;
    }
    const controller = new AbortController();
    setFactionLoading(true);
    loadFactionCatalogue(selectedFactionMeta, controller.signal)
      .then((data) => {
        setLoadedFactions((current) => ({
          ...current,
          [selectedFactionMeta.slug]: data,
        }));
        setFactionError("");
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        setFactionError(error instanceof Error ? error.message : "Could not load faction data.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setFactionLoading(false);
        }
      });
    return () => controller.abort();
  }, [loadedFactions, selectedFactionMeta]);

  useEffect(() => {
    if (!selectedFactionMeta) {
      return;
    }
    const alliance = getFactionAlliance(selectedFactionMeta.name);
    if (selectedAlliance !== alliance) {
      setSelectedAlliance(alliance);
    }
  }, [selectedAlliance, selectedFactionMeta]);

  useEffect(() => {
    if (!visibleFactions.length) {
      return;
    }
    if (!visibleFactions.some((faction) => faction.slug === selectedFactionSlug)) {
      setSelectedFactionSlug(visibleFactions[0].slug);
    }
  }, [selectedFactionSlug, visibleFactions]);

  useEffect(() => {
    const payload: StoredState = {
      selectedFactionSlug,
      selectedUnitIdByFaction,
      draftsByFaction,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [draftsByFaction, selectedFactionSlug, selectedUnitIdByFaction]);

  const activeFaction = selectedFactionMeta ? loadedFactions[selectedFactionMeta.slug] : undefined;
  const units = activeFaction?.units ?? [];

  const filteredUnits = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return units.filter((unit) => {
      if (!query) {
        return true;
      }
      const haystack = [
        unit.name,
        unit.baseName,
        unit.summary.primaryCategory ?? "",
        unit.summary.categories.join(" "),
        unit.summary.weapons.map((weapon) => weapon.name).join(" "),
        unit.summary.abilities.map((ability) => ability.name).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [deferredSearch, units]);

  const unitSections = useMemo(() => {
    const grouped = filteredUnits.reduce<Record<string, UnitRecord[]>>((sections, unit) => {
      const key = unit.summary.primaryCategory ?? "Other";
      if (!sections[key]) {
        sections[key] = [];
      }
      sections[key].push(unit);
      return sections;
    }, {});

    return Object.entries(grouped)
      .map(([title, sectionUnits]) => ({
        title,
        units: sectionUnits.sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .sort((left, right) => left.title.localeCompare(right.title));
  }, [filteredUnits]);

  const selectedUnitId = selectedFactionSlug ? selectedUnitIdByFaction[selectedFactionSlug] : undefined;

  useEffect(() => {
    if (!selectedFactionSlug || filteredUnits.length === 0) {
      return;
    }
    const currentId = selectedUnitIdByFaction[selectedFactionSlug];
    const stillExists = filteredUnits.some((unit) => unit.id === currentId);
    if (!currentId || !stillExists) {
      setSelectedUnitIdByFaction((current) => ({
        ...current,
        [selectedFactionSlug]: filteredUnits[0].id,
      }));
    }
  }, [filteredUnits, selectedFactionSlug, selectedUnitIdByFaction]);

  useEffect(() => {
    if (!selectedFactionSlug || !unitSections.length) {
      return;
    }
    setExpandedSectionsByFaction((current) => {
      if (current[selectedFactionSlug]) {
        return current;
      }
      const initialSections = Object.fromEntries(
        unitSections.map((section, index) => [section.title, index === 0]),
      );
      return {
        ...current,
        [selectedFactionSlug]: initialSections,
      };
    });
  }, [selectedFactionSlug, unitSections]);

  const selectedUnit =
    filteredUnits.find((unit) => unit.id === selectedUnitId) ??
    units.find((unit) => unit.id === selectedUnitId) ??
    filteredUnits[0] ??
    units[0] ??
    null;
  const datasheetUnit = datasheetUnitId ? units.find((unit) => unit.id === datasheetUnitId) ?? null : null;

  const currentDraft = draftsByFaction[selectedFactionSlug]?.items ?? [];
  const totalPoints = currentDraft.reduce((sum, item) => sum + item.points * item.count, 0);
  const totalSelections = currentDraft.reduce((sum, item) => sum + item.count, 0);

  useEffect(() => {
    if (datasheetUnitId && !units.some((unit) => unit.id === datasheetUnitId)) {
      setDatasheetUnitId(null);
    }
  }, [datasheetUnitId, units]);

  useEffect(() => {
    if (!datasheetUnit) {
      document.body.style.overflow = "";
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDatasheetUnitId(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [datasheetUnit]);

  function updateDraft(updater: (items: RosterItem[]) => RosterItem[]) {
    if (!selectedFactionSlug) {
      return;
    }
    setDraftsByFaction((current) => {
      const items = current[selectedFactionSlug]?.items ?? [];
      return {
        ...current,
        [selectedFactionSlug]: {
          updatedAt: new Date().toISOString(),
          items: updater(items),
        },
      };
    });
  }

  function selectAlliance(alliance: Alliance) {
    startTransition(() => {
      setSelectedAlliance(alliance);

      const availableFactions = factionsByAlliance[alliance];
      const keepCurrentFaction = availableFactions.some((faction) => faction.slug === selectedFactionSlug);
      const nextFactionSlug = keepCurrentFaction ? selectedFactionSlug : availableFactions[0]?.slug ?? "";

      setSelectedFactionSlug(nextFactionSlug);
      setSearchTerm("");
      setDetailTab("overview");
    });
  }

  function selectFaction(slug: string) {
    const factionMeta = indexData?.factions.find((faction) => faction.slug === slug);
    startTransition(() => {
      setSelectedFactionSlug(slug);
      if (factionMeta) {
        setSelectedAlliance(getFactionAlliance(factionMeta.name));
      }
      setSearchTerm("");
      setDetailTab("overview");
    });
  }

  function toggleSection(sectionTitle: string) {
    if (!selectedFactionSlug) {
      return;
    }
    setExpandedSectionsByFaction((current) => {
      const factionSections = current[selectedFactionSlug] ?? {};
      return {
        ...current,
        [selectedFactionSlug]: {
          ...factionSections,
          [sectionTitle]: !factionSections[sectionTitle],
        },
      };
    });
  }

  function openDatasheet(unit: UnitRecord) {
    selectUnit(unit.id);
    setDatasheetUnitId(unit.id);
  }

  function closeDatasheet() {
    setDatasheetUnitId(null);
  }

  function selectUnit(unitId: string) {
    if (!selectedFactionSlug) {
      return;
    }
    setSelectedUnitIdByFaction((current) => ({
      ...current,
      [selectedFactionSlug]: unitId,
    }));
  }

  function addUnitToRoster(unit: UnitRecord) {
    const points = typeof unit.summary.points === "number" ? unit.summary.points : 0;
    updateDraft((items) => {
      const existing = items.find((item) => item.unitId === unit.id);
      if (existing) {
        return items.map((item) =>
          item.unitId === unit.id
            ? {
                ...item,
                count: item.count + 1,
              }
            : item,
        );
      }
      return [
        ...items,
        {
          unitId: unit.id,
          name: unit.name,
          points,
          count: 1,
          primaryCategory: unit.summary.primaryCategory,
          categories: unit.summary.categories,
          note: "",
        },
      ];
    });
  }

  function adjustItemCount(unitId: string, nextCount: number) {
    updateDraft((items) =>
      items
        .map((item) => (item.unitId === unitId ? { ...item, count: nextCount } : item))
        .filter((item) => item.count > 0),
    );
  }

  function updateItemNote(unitId: string, note: string) {
    updateDraft((items) => items.map((item) => (item.unitId === unitId ? { ...item, note } : item)));
  }

  function clearFactionRoster() {
    updateDraft(() => []);
  }

  async function copyRoster() {
    if (!selectedFactionMeta || currentDraft.length === 0) {
      return;
    }
    const lines = [
      selectedFactionMeta.name,
      `${totalPoints} pts | ${totalSelections} selections`,
      "",
      ...currentDraft.map((item) => {
        const note = item.note.trim() ? ` - ${item.note.trim()}` : "";
        return `${item.count}x ${item.name} (${item.points} pts each)${note}`;
      }),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopiedState(true);
    window.setTimeout(() => setCopiedState(false), 1800);
  }

  function exportRosterJson() {
    if (!selectedFactionMeta) {
      return;
    }
    const payload = {
      faction: {
        slug: selectedFactionMeta.slug,
        name: selectedFactionMeta.name,
      },
      points: totalPoints,
      selections: currentDraft,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedFactionMeta.slug}-roster.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const sourceStamp = indexData ? formatStamp(indexData.source.sourceTimestamp) : "";
  const generatedStamp = indexData ? formatStamp(indexData.generatedAt) : "";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Prototype Roster Forge</p>
          <h1>Warhammer Army Builder</h1>
          <p className="header-copy">
            A first-pass web app wired straight into the prepared BSData faction exports. Pick a faction,
            inspect units, and assemble a local roster.
          </p>
        </div>

        <div className="header-status">
          <StatusChip icon={<Database size={14} />} label={indexData?.source.name ?? "Loading data"} />
          {sourceStamp ? <StatusChip icon={<Check size={14} />} label={`Source snapshot ${sourceStamp}`} /> : null}
          {generatedStamp ? <StatusChip icon={<Shield size={14} />} label={`Export built ${generatedStamp}`} /> : null}
        </div>
      </header>

      <main className="workspace">
        <section className="workspace-pane navigator-pane">
          <div className="pane-head">
            <h2>Command</h2>
            <span>{indexData?.factions.length ?? 0} factions</span>
          </div>

          {indexLoading ? <Loader label="Loading catalogue index" /> : null}
          {indexError ? <MessageTone tone="error" message={indexError} /> : null}

          <label className="field">
            <span>Alliance</span>
            <select
              value={selectedAlliance}
              onChange={(event) => selectAlliance(event.target.value as Alliance)}
              disabled={!indexData}
            >
              {ALLIANCE_ORDER.map((alliance) => (
                <option key={alliance} value={alliance}>
                  {alliance}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Faction</span>
            <select
              value={selectedFactionSlug}
              onChange={(event) => selectFaction(event.target.value)}
              disabled={!visibleFactions.length}
            >
              {visibleFactions.map((faction) => (
                <option key={faction.slug} value={faction.slug}>
                  {getFactionLabel(faction)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Search</span>
            <div className="search-shell">
              <Search size={16} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Units, weapons, rules"
              />
            </div>
          </label>

          {selectedFactionMeta ? (
            <div className="meta-block">
              <div>
                <span>Catalogue</span>
                <strong>{selectedFactionMeta.sourceFile}</strong>
              </div>
              <div>
                <span>Revision</span>
                <strong>{selectedFactionMeta.revision}</strong>
              </div>
              <div>
                <span>Indexed units</span>
                <strong>{selectedFactionMeta.unitCount}</strong>
              </div>
            </div>
          ) : null}
        </section>

        <section className="workspace-pane library-pane">
          <div className="pane-head">
            <h2>Unit Library</h2>
            <span>{filteredUnits.length} units</span>
          </div>

          {factionLoading ? <Loader label="Loading faction dossier" /> : null}
          {factionError ? <MessageTone tone="error" message={factionError} /> : null}

          <div className="library-grid">
            <div className="unit-list">
              {unitSections.map((section) => {
                const isExpanded =
                  deferredSearch.trim().length > 0 ||
                  expandedSectionsByFaction[selectedFactionSlug]?.[section.title] === true ||
                  section.units.some((unit) => unit.id === selectedUnit?.id);

                return (
                  <section key={section.title} className="unit-section">
                    <button
                      className={isExpanded ? "unit-section-toggle expanded" : "unit-section-toggle"}
                      type="button"
                      onClick={() => toggleSection(section.title)}
                    >
                      <span className="unit-section-label">
                        <ChevronRight size={16} />
                        <strong>{section.title}</strong>
                      </span>
                      <span className="unit-section-count">{section.units.length}</span>
                    </button>

                    {isExpanded ? (
                      <div className="unit-section-items">
                        {section.units.map((unit) => {
                          const inRoster = currentDraft.find((item) => item.unitId === unit.id)?.count ?? 0;
                          return (
                            <article
                              key={unit.id}
                              className={selectedUnit?.id === unit.id ? "unit-card selected" : "unit-card"}
                              onClick={() => openDatasheet(unit)}
                            >
                              <div className="unit-card-main">
                                <div>
                                  <h3>{unit.name}</h3>
                                  <p>{unit.selectionType}</p>
                                </div>
                                <strong>{formatPoints(unit.summary.points)}</strong>
                              </div>

                              <div className="unit-card-foot">
                                <span>{unit.summary.weapons.length} weapons</span>
                                <span>{unit.summary.abilities.length} abilities</span>
                                <button
                                  className="icon-button accent"
                                  type="button"
                                  title={`Add ${unit.name}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    addUnitToRoster(unit);
                                  }}
                                >
                                  <Plus size={16} />
                                </button>
                              </div>

                              {inRoster > 0 ? <span className="roster-count">{inRoster} in roster</span> : null}
                            </article>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}

              {!factionLoading && unitSections.length === 0 ? (
                <MessageTone tone="neutral" message="No units match the current filter set." />
              ) : null}
            </div>

            <div className="detail-pane">
              {selectedUnit ? (
                <>
                  <div className="detail-hero">
                    <div>
                      <p className="eyebrow">{selectedUnit.summary.primaryCategory ?? selectedUnit.selectionType}</p>
                      <h2>{selectedUnit.name}</h2>
                      <div className="detail-tags">
                        {selectedUnit.summary.categories.map((category) => (
                          <span key={category}>{category}</span>
                        ))}
                      </div>
                    </div>

                    <div className="detail-actions">
                      <strong>{formatPoints(selectedUnit.summary.points)}</strong>
                      <div className="detail-action-row">
                        <button className="secondary-button" type="button" onClick={() => openDatasheet(selectedUnit)}>
                          <Database size={16} />
                          Datasheet
                        </button>
                        <button className="primary-button" type="button" onClick={() => addUnitToRoster(selectedUnit)}>
                          <Plus size={16} />
                          Add to roster
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="tab-row" role="tablist" aria-label="Unit detail sections">
                    {[
                      ["overview", "Overview"],
                      ["weapons", "Weapons"],
                      ["abilities", "Abilities"],
                      ["options", "Options"],
                      ["tree", "Tree"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={detailTab === value ? "tab-button active" : "tab-button"}
                        onClick={() =>
                          setDetailTab(value as "overview" | "weapons" | "abilities" | "options" | "tree")
                        }
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="detail-content">
                    {detailTab === "overview" ? (
                      <OverviewSection unit={selectedUnit} />
                    ) : null}
                    {detailTab === "weapons" ? <WeaponsSection unit={selectedUnit} /> : null}
                    {detailTab === "abilities" ? <AbilitiesSection unit={selectedUnit} /> : null}
                    {detailTab === "options" ? <OptionsSection options={selectedUnit.options} /> : null}
                    {detailTab === "tree" ? <TreeSection tree={selectedUnit.tree} /> : null}
                  </div>
                </>
              ) : (
                <MessageTone tone="neutral" message="Pick a faction and select a unit to inspect its data." />
              )}
            </div>
          </div>
        </section>

        <section className="workspace-pane roster-pane">
          <div className="pane-head">
            <h2>Roster</h2>
            <span>{totalPoints} pts</span>
          </div>

          <div className="roster-summary">
            <div>
              <span>Total points</span>
              <strong>{totalPoints}</strong>
            </div>
            <div>
              <span>Selections</span>
              <strong>{totalSelections}</strong>
            </div>
            <div>
              <span>Faction</span>
              <strong>{selectedFactionMeta?.name ?? "None"}</strong>
            </div>
          </div>

          <div className="toolbar-row">
            <button
              className={copiedState ? "tool-button active" : "tool-button"}
              type="button"
              onClick={() => void copyRoster()}
              disabled={currentDraft.length === 0}
            >
              {copiedState ? <Check size={16} /> : <Copy size={16} />}
              {copiedState ? "Copied" : "Copy list"}
            </button>
            <button className="tool-button" type="button" onClick={exportRosterJson} disabled={currentDraft.length === 0}>
              <Download size={16} />
              Export
            </button>
            <button className="tool-button danger" type="button" onClick={clearFactionRoster} disabled={currentDraft.length === 0}>
              <Trash2 size={16} />
              Clear
            </button>
          </div>

          <div className="roster-list">
            {currentDraft.map((item) => (
              <article key={item.unitId} className="roster-item">
                <div className="roster-item-top">
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.primaryCategory ?? "Selection"}</p>
                  </div>
                  <strong>{item.points * item.count} pts</strong>
                </div>

                <div className="count-row">
                  <button
                    className="icon-button"
                    type="button"
                    title={`Decrease ${item.name}`}
                    onClick={() => adjustItemCount(item.unitId, item.count - 1)}
                  >
                    <Minus size={16} />
                  </button>
                  <span>{item.count}</span>
                  <button
                    className="icon-button"
                    type="button"
                    title={`Increase ${item.name}`}
                    onClick={() => adjustItemCount(item.unitId, item.count + 1)}
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    type="button"
                    title={`Remove ${item.name}`}
                    onClick={() => adjustItemCount(item.unitId, 0)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <input
                  className="note-field"
                  value={item.note}
                  onChange={(event) => updateItemNote(item.unitId, event.target.value)}
                  placeholder="Optional note, wargear idea, role"
                />
              </article>
            ))}

            {currentDraft.length === 0 ? (
              <MessageTone tone="neutral" message="Your roster is empty. Add units from the library to start building." />
            ) : null}
          </div>
        </section>
      </main>

      {datasheetUnit ? (
        <DatasheetModal unit={datasheetUnit} onClose={closeDatasheet} onAddToRoster={() => addUnitToRoster(datasheetUnit)} />
      ) : null}
    </div>
  );
}

function DatasheetModal({
  unit,
  onClose,
  onAddToRoster,
}: {
  unit: UnitRecord;
  onClose: () => void;
  onAddToRoster: () => void;
}) {
  const groupedWeapons = groupBy(unit.summary.weapons, (profile) => profile.typeName);

  return (
    <div className="datasheet-backdrop" onClick={onClose}>
      <div
        className="datasheet-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${unit.name} datasheet`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="datasheet-header">
          <div>
            <p className="eyebrow datasheet-eyebrow">{unit.summary.primaryCategory ?? unit.selectionType}</p>
            <h2>{unit.name}</h2>
            <div className="detail-tags">
              {unit.summary.categories.map((category) => (
                <span key={category}>{category}</span>
              ))}
            </div>
          </div>

          <div className="datasheet-header-tools">
            <strong>{formatPoints(unit.summary.points)}</strong>
            <button className="primary-button" type="button" onClick={onAddToRoster}>
              <Plus size={16} />
              Add to roster
            </button>
            <button className="icon-button" type="button" title="Close datasheet" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="datasheet-layout">
          <div className="datasheet-main">
            <section className="datasheet-section">
              <div className="section-head">
                <Shield size={16} />
                <h3>Unit Profile</h3>
              </div>
              <div className="profile-grid">
                {unit.summary.stats.map((profile) => (
                  <ProfileCard key={`${profile.name}-${profile.typeName}`} profile={profile} />
                ))}
                {unit.summary.transport.map((profile) => (
                  <ProfileCard key={`${profile.name}-${profile.typeName}`} profile={profile} />
                ))}
              </div>
            </section>

            <section className="datasheet-section">
              <div className="section-head">
                <Swords size={16} />
                <h3>Weapons</h3>
              </div>
              <div className="weapon-table">
                {Object.entries(groupedWeapons).map(([groupName, profiles]) => (
                  <div key={groupName} className="datasheet-weapon-group">
                    <p className="datasheet-subhead">{groupName}</p>
                    {profiles.map((profile) => (
                      <article key={`${profile.name}-${groupName}`} className="weapon-row">
                        <h4>{profile.name}</h4>
                        <div className="stat-badges">
                          {Object.entries(profile.characteristics).map(([label, value]) => (
                            <span key={label}>
                              <strong>{label}</strong>
                              {value}
                            </span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ))}
                {unit.summary.weapons.length === 0 ? (
                  <MessageTone tone="neutral" message="No weapon profiles found." />
                ) : null}
              </div>
            </section>

            <section className="datasheet-section">
              <div className="section-head">
                <Crosshair size={16} />
                <h3>Abilities</h3>
              </div>
              <div className="ability-list">
                {unit.summary.abilities.map((profile) => (
                  <article key={`${profile.name}-${profile.typeName}`} className="ability-row">
                    <h4>{profile.name}</h4>
                    <p>{profile.characteristics.Description ?? "No description on record."}</p>
                  </article>
                ))}
                {unit.summary.abilities.length === 0 ? (
                  <MessageTone tone="neutral" message="No ability profiles found." />
                ) : null}
              </div>
            </section>
          </div>

          <aside className="datasheet-side">
            <section className="datasheet-section side-block">
              <div className="section-head">
                <ChevronRight size={16} />
                <h3>Core Rules</h3>
              </div>
              <div className="detail-tags">
                {unit.summary.rules.map((rule) => (
                  <span key={rule}>{rule}</span>
                ))}
                {unit.summary.rules.length === 0 ? <span>None listed</span> : null}
              </div>
            </section>

            <section className="datasheet-section side-block">
              <div className="section-head">
                <Database size={16} />
                <h3>Sheet Data</h3>
              </div>
              <div className="summary-grid datasheet-summary-grid">
                <InfoTile label="Selection type" value={unit.selectionType} />
                <InfoTile label="Weapons" value={String(unit.summary.weapons.length)} />
                <InfoTile label="Abilities" value={String(unit.summary.abilities.length)} />
                <InfoTile label="Options" value={String(unit.options.length)} />
              </div>
            </section>

            <section className="datasheet-section side-block">
              <div className="section-head">
                <Shield size={16} />
                <h3>Datasheet Tree</h3>
              </div>
              <p className="datasheet-note">
                The prototype still keeps the full BSData tree for this unit, including nested options and linked
                rules.
              </p>
              <details className="json-panel">
                <summary>Open raw tree JSON</summary>
                <pre>{JSON.stringify(unit.tree, null, 2)}</pre>
              </details>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function OverviewSection({ unit }: { unit: UnitRecord }) {
  return (
    <div className="detail-section">
      <section>
        <div className="section-head">
          <Shield size={16} />
          <h3>Profiles</h3>
        </div>
        <div className="profile-grid">
          {unit.summary.stats.map((profile) => (
            <ProfileCard key={`${profile.name}-${profile.typeName}`} profile={profile} />
          ))}
          {unit.summary.transport.map((profile) => (
            <ProfileCard key={`${profile.name}-${profile.typeName}`} profile={profile} />
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <Crosshair size={16} />
          <h3>Quick read</h3>
        </div>
        <div className="summary-grid">
          <InfoTile label="Selection type" value={unit.selectionType} />
          <InfoTile label="Weapons" value={String(unit.summary.weapons.length)} />
          <InfoTile label="Abilities" value={String(unit.summary.abilities.length)} />
          <InfoTile label="Rules" value={String(unit.summary.rules.length)} />
        </div>
      </section>

      <section>
        <div className="section-head">
          <ChevronRight size={16} />
          <h3>Universal rules</h3>
        </div>
        <div className="detail-tags">
          {unit.summary.rules.map((rule) => (
            <span key={rule}>{rule}</span>
          ))}
          {unit.summary.rules.length === 0 ? <span>None listed</span> : null}
        </div>
      </section>
    </div>
  );
}

function WeaponsSection({ unit }: { unit: UnitRecord }) {
  const grouped = groupBy(unit.summary.weapons, (profile) => profile.typeName);
  return (
    <div className="detail-section">
      {Object.entries(grouped).map(([groupName, profiles]) => (
        <section key={groupName}>
          <div className="section-head">
            <Swords size={16} />
            <h3>{groupName}</h3>
          </div>
          <div className="weapon-table">
            {profiles.map((profile) => (
              <article key={`${profile.name}-${groupName}`} className="weapon-row">
                <h4>{profile.name}</h4>
                <div className="stat-badges">
                  {Object.entries(profile.characteristics).map(([label, value]) => (
                    <span key={label}>
                      <strong>{label}</strong>
                      {value}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {unit.summary.weapons.length === 0 ? <MessageTone tone="neutral" message="No weapon profiles found." /> : null}
    </div>
  );
}

function AbilitiesSection({ unit }: { unit: UnitRecord }) {
  return (
    <div className="detail-section">
      <section>
        <div className="section-head">
          <Shield size={16} />
          <h3>Abilities</h3>
        </div>
        <div className="ability-list">
          {unit.summary.abilities.map((profile) => (
            <article key={`${profile.name}-${profile.typeName}`} className="ability-row">
              <h4>{profile.name}</h4>
              <p>{profile.characteristics.Description ?? "No description on record."}</p>
            </article>
          ))}
        </div>
      </section>
      {unit.summary.abilities.length === 0 ? <MessageTone tone="neutral" message="No ability profiles found." /> : null}
    </div>
  );
}

function OptionsSection({ options }: { options: TreeNode[] }) {
  return (
    <div className="detail-section">
      {options.length === 0 ? <MessageTone tone="neutral" message="No option tree was exported for this unit." /> : null}
      {options.map((option) => (
        <OptionTree key={option.id} node={option} depth={0} />
      ))}
    </div>
  );
}

function TreeSection({ tree }: { tree: TreeNode }) {
  return (
    <div className="detail-section">
      <section>
        <div className="section-head">
          <Database size={16} />
          <h3>Selection tree snapshot</h3>
        </div>
        <details className="json-panel">
          <summary>Open full tree JSON</summary>
          <pre>{JSON.stringify(tree, null, 2)}</pre>
        </details>
      </section>
    </div>
  );
}

function OptionTree({ node, depth }: { node: TreeNode; depth: number }) {
  const hasChildren = Boolean(node.children?.length);
  const costs = node.costs ? Object.entries(node.costs) : [];
  return (
    <details className="option-node" open={depth < 1}>
      <summary>
        <div className="option-head">
          <div>
            <strong>{node.name}</strong>
            {node.type ? <span>{node.type}</span> : null}
          </div>
          <div className="option-meta">
            {costs.map(([label, value]) => (
              <span key={label}>
                {value} {label}
              </span>
            ))}
            {!costs.length && node.defaultSelectionEntryId ? <span>default path set</span> : null}
            {hasChildren ? <span>{node.children?.length} children</span> : null}
          </div>
        </div>
      </summary>

      {node.constraints?.length ? (
        <div className="logic-row">
          {node.constraints.slice(0, 4).map((constraint, index) => (
            <span key={`${node.id}-constraint-${index}`}>{formatConstraint(constraint)}</span>
          ))}
        </div>
      ) : null}

      {node.modifiers?.length ? (
        <div className="logic-row">
          {node.modifiers.slice(0, 3).map((modifier, index) => (
            <span key={`${node.id}-modifier-${index}`}>{formatModifier(modifier)}</span>
          ))}
        </div>
      ) : null}

      {hasChildren ? (
        <div className="option-children">
          {node.children?.map((child) => (
            <OptionTree key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </details>
  );
}

function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <article className="profile-card">
      <h4>{profile.name}</h4>
      <div className="stat-badges">
        {Object.entries(profile.characteristics).map(([label, value]) => (
          <span key={label}>
            <strong>{label}</strong>
            {value}
          </span>
        ))}
      </div>
    </article>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="info-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Loader({ label }: { label: string }) {
  return (
    <div className="loader-row">
      <LoaderCircle className="spin" size={16} />
      <span>{label}</span>
    </div>
  );
}

function MessageTone({ tone, message }: { tone: "error" | "neutral"; message: string }) {
  return <div className={tone === "error" ? "message-tone error" : "message-tone"}>{message}</div>;
}

function StatusChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="status-chip">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function formatPoints(points: number | null): string {
  return typeof points === "number" ? `${points} pts` : "points n/a";
}

function formatStamp(raw: string): string {
  const date = new Date(raw);
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getFactionAlliance(name: string): Alliance {
  if (name.startsWith("Imperium - Adeptus Astartes - ")) {
    return "Imperium - Astartes";
  }
  if (name.startsWith("Imperium - ")) {
    return "Imperium - Other";
  }
  if (name.startsWith("Chaos - ")) {
    return "Chaos";
  }
  if (name.startsWith("Xenos - ")) {
    return "Xenos";
  }
  return "Xenos";
}

function getFactionLabel(faction: FactionMeta): string {
  if (faction.name.startsWith("Imperium - Adeptus Astartes - ")) {
    return faction.name.slice("Imperium - Adeptus Astartes - ".length);
  }
  if (faction.name.startsWith("Imperium - ")) {
    return faction.name.slice("Imperium - ".length);
  }
  if (faction.name.startsWith("Chaos - ")) {
    return faction.name.slice("Chaos - ".length);
  }
  if (faction.name.startsWith("Xenos - ")) {
    return faction.name.slice("Xenos - ".length);
  }
  return faction.name;
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = getKey(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
}

function formatConstraint(constraint: Constraint): string {
  const parts = [
    stringifyValue(constraint.type),
    stringifyValue(constraint.value),
    simplifyField(constraint.field),
    stringifyValue(constraint.childName) || stringifyValue(constraint.childId),
  ].filter(Boolean);
  return parts.join(" ");
}

function formatModifier(modifier: Modifier): string {
  const parts = [
    stringifyValue(modifier.type),
    stringifyValue(modifier.field),
    stringifyValue(modifier.value),
    stringifyValue(modifier.comment),
  ].filter(Boolean);
  return parts.join(" ");
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function simplifyField(value: unknown): string {
  const raw = stringifyValue(value);
  if (!raw) {
    return "";
  }
  if (raw === "selections") {
    return "selections";
  }
  if (raw === "forces") {
    return "forces";
  }
  if (raw === "51b2-306e-1021-d207") {
    return "points";
  }
  return raw;
}

export default App;
