import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Crosshair,
  Database,
  Download,
  FolderPlus,
  LoaderCircle,
  Minus,
  Plus,
  Search,
  Shield,
  ScrollText,
  Sparkles,
  Swords,
  Link2,
  Unlink,
  Trash2,
  X,
} from "lucide-react";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { loadCatalogueIndex, loadFactionCatalogue } from "./data";
import type {
  CatalogueIndex,
  Constraint,
  DetachmentRecord,
  EnhancementRecord,
  FactionMeta,
  FactionData,
  Modifier,
  Profile,
  RosterItem,
  StoredArmy,
  StoredState,
  StratagemRecord,
  TreeNode,
  UnitRecord,
} from "./types";

const STORAGE_KEY = "warhammer-army-builder.prototype";
const ALLIANCE_ORDER = ["Xenos", "Imperium - Astartes", "Imperium - Other", "Chaos"] as const;
const CATEGORY_ORDER = [
  "Epic Hero",
  "Character",
  "Battleline",
  "Dedicated Transport",
  "Infantry",
  "Mounted",
  "Beast",
  "Swarm",
  "Monster",
  "Vehicle",
  "Fortification",
  "Allied Units",
  "Other",
] as const;
const EMPTY_DETACHMENTS: DetachmentRecord[] = [];
const EMPTY_STRATAGEMS: StratagemRecord[] = [];
const EMPTY_ENHANCEMENTS: EnhancementRecord[] = [];

type Alliance = (typeof ALLIANCE_ORDER)[number];
type AppView = "home" | "setup" | "builder";

function App() {
  const [indexData, setIndexData] = useState<CatalogueIndex | null>(null);
  const [indexError, setIndexError] = useState<string>("");
  const [indexLoading, setIndexLoading] = useState(true);

  const [loadedFactions, setLoadedFactions] = useState<Record<string, FactionData>>({});
  const [factionLoading, setFactionLoading] = useState(false);
  const [factionError, setFactionError] = useState<string>("");

  const [view, setView] = useState<AppView>("home");
  const [setupAlliance, setSetupAlliance] = useState<Alliance>("Xenos");
  const [setupFactionSlug, setSetupFactionSlug] = useState<string>("");
  const [setupDetachmentId, setSetupDetachmentId] = useState<string>("");
  const [setupArmyName, setSetupArmyName] = useState("");
  const [armies, setArmies] = useState<StoredArmy[]>([]);
  const [activeArmyId, setActiveArmyId] = useState<string | null>(null);
  const [datasheetUnitId, setDatasheetUnitId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearch = useDeferredValue(searchTerm);
  const [detailTab, setDetailTab] = useState<"overview" | "weapons" | "abilities" | "options" | "tree">(
    "overview",
  );
  const [copiedState, setCopiedState] = useState(false);
  const [openSectionByArmy, setOpenSectionByArmy] = useState<Record<string, string | null>>({});
  const [selectedUnitIdByArmy, setSelectedUnitIdByArmy] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as StoredState;
      const migrated = migrateStoredState(parsed);
      setArmies(migrated.armies);
      setActiveArmyId(migrated.activeArmyId);
      setSelectedUnitIdByArmy(migrated.selectedUnitIdByArmy);
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
  }, []);

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
  const visibleFactions = factionsByAlliance[setupAlliance];
  const armiesByUpdatedAt = useMemo(
    () => armies.slice().sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [armies],
  );
  const activeArmy = activeArmyId ? armies.find((army) => army.id === activeArmyId) ?? null : null;
  const selectedFactionMeta = activeArmy
    ? indexData?.factions.find((faction) => faction.slug === activeArmy.factionSlug) ?? null
    : null;
  const setupFactionMeta = setupFactionSlug
    ? indexData?.factions.find((faction) => faction.slug === setupFactionSlug) ?? null
    : null;
  const screen = view === "builder" && !activeArmy ? "home" : view;
  const catalogueTargetMeta = screen === "setup" ? setupFactionMeta : selectedFactionMeta;

  useEffect(() => {
    if (!indexData || !visibleFactions.length) {
      return;
    }
    if (!visibleFactions.some((faction) => faction.slug === setupFactionSlug)) {
      setSetupFactionSlug(visibleFactions[0].slug);
    }
  }, [indexData, setupFactionSlug, visibleFactions]);

  useEffect(() => {
    if (!catalogueTargetMeta || loadedFactions[catalogueTargetMeta.slug]) {
      return;
    }
    const controller = new AbortController();
    setFactionLoading(true);
    loadFactionCatalogue(catalogueTargetMeta, controller.signal)
      .then((data) => {
        setLoadedFactions((current) => ({
          ...current,
          [catalogueTargetMeta.slug]: data,
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
  }, [catalogueTargetMeta, loadedFactions]);

  useEffect(() => {
    if (screen !== "builder" || activeArmy) {
      return;
    }
    setView("home");
  }, [activeArmy, screen]);

  useEffect(() => {
    const payload: StoredState = {
      armies,
      activeArmyId,
      selectedUnitIdByArmy,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [activeArmyId, armies, selectedUnitIdByArmy]);

  const setupFaction = setupFactionMeta ? loadedFactions[setupFactionMeta.slug] : undefined;
  const setupDetachments = setupFaction?.detachments ?? EMPTY_DETACHMENTS;
  const activeFaction = selectedFactionMeta ? loadedFactions[selectedFactionMeta.slug] : undefined;
  const units = activeFaction?.units ?? [];
  const activeDetachments = activeFaction?.detachments ?? EMPTY_DETACHMENTS;
  const activeStratagems = activeFaction?.stratagems ?? EMPTY_STRATAGEMS;
  const activeDetachment = activeArmy ? resolveArmyDetachment(activeArmy, activeDetachments) : null;
  const activeDetachmentStratagems = getDetachmentStratagems(activeStratagems, activeDetachment);

  useEffect(() => {
    if (screen !== "setup") {
      return;
    }
    if (setupDetachments.length === 0) {
      if (setupDetachmentId) {
        setSetupDetachmentId("");
      }
      return;
    }
    if (!setupDetachments.some((detachment) => detachment.id === setupDetachmentId)) {
      setSetupDetachmentId(setupDetachments[0].id);
    }
  }, [screen, setupDetachmentId, setupDetachments]);

  useEffect(() => {
    if (screen !== "builder" || !activeArmy || activeDetachments.length === 0 || !activeDetachment) {
      return;
    }
    if (activeArmy.detachmentId === activeDetachment.id && activeArmy.detachmentName === activeDetachment.name) {
      return;
    }
    setArmies((current) =>
      current.map((army) =>
        army.id === activeArmy.id
          ? {
              ...army,
              detachmentId: activeDetachment.id,
              detachmentName: activeDetachment.name,
            }
          : army,
      ),
    );
  }, [activeArmy, activeDetachment, activeDetachments.length, screen]);

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
      .sort((left, right) => compareCategoryTitle(left.title, right.title));
  }, [filteredUnits]);

  const selectedUnitId = activeArmyId ? selectedUnitIdByArmy[activeArmyId] : undefined;

  useEffect(() => {
    if (screen !== "builder" || !activeArmyId || filteredUnits.length === 0) {
      return;
    }
    const currentId = selectedUnitIdByArmy[activeArmyId];
    const stillExists = filteredUnits.some((unit) => unit.id === currentId);
    if (!currentId || !stillExists) {
      setSelectedUnitIdByArmy((current) => ({
        ...current,
        [activeArmyId]: filteredUnits[0].id,
      }));
    }
  }, [activeArmyId, filteredUnits, screen, selectedUnitIdByArmy]);

  const selectedUnit =
    screen === "builder"
      ? filteredUnits.find((unit) => unit.id === selectedUnitId) ??
        units.find((unit) => unit.id === selectedUnitId) ??
        filteredUnits[0] ??
        units[0] ??
        null
      : null;
  const datasheetUnit =
    screen === "builder" && datasheetUnitId ? units.find((unit) => unit.id === datasheetUnitId) ?? null : null;

  useEffect(() => {
    if (screen !== "builder" || !activeArmyId || !unitSections.length) {
      return;
    }
    const selectedSectionTitle =
      selectedUnit?.summary.primaryCategory &&
      unitSections.some((section) => section.title === selectedUnit.summary.primaryCategory)
        ? selectedUnit.summary.primaryCategory
        : null;
    const defaultSection = selectedSectionTitle ?? unitSections[0]?.title ?? null;

    setOpenSectionByArmy((current) => {
      const currentOpenSection = current[activeArmyId];
      const openSectionStillExists =
        currentOpenSection !== undefined && unitSections.some((section) => section.title === currentOpenSection);
      const shouldFollowSelection = deferredSearch.trim().length > 0;
      const nextOpenSection =
        shouldFollowSelection || !openSectionStillExists ? defaultSection : currentOpenSection;

      if (currentOpenSection === nextOpenSection) {
        return current;
      }

      return {
        ...current,
        [activeArmyId]: nextOpenSection,
      };
    });
  }, [activeArmyId, deferredSearch, screen, selectedUnit, unitSections]);

  const currentDraft = activeArmy?.items ?? [];
  const unitsById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const totalPoints = currentDraft.reduce((sum, item) => sum + rosterItemPoints(item), 0);
  const totalSelections = currentDraft.reduce((sum, item) => sum + item.count, 0);

  // Leaders attached to a Bodyguard unit that is also in the roster are nested
  // under that host rather than listed on their own.
  const attachedByHost = useMemo(() => {
    const map: Record<string, RosterItem[]> = {};
    for (const item of currentDraft) {
      if (item.attachedTo && currentDraft.some((host) => host.unitId === item.attachedTo)) {
        (map[item.attachedTo] ??= []).push(item);
      }
    }
    return map;
  }, [currentDraft]);
  const attachedIds = useMemo(
    () => new Set(Object.values(attachedByHost).flat().map((item) => item.unitId)),
    [attachedByHost],
  );

  const armySections = useMemo(() => {
    const visible = currentDraft.filter((item) => !attachedIds.has(item.unitId));
    const grouped = groupBy(visible, (item) => item.primaryCategory ?? "Other");
    return Object.entries(grouped)
      .map(([title, items]) => {
        const sortedItems = items.slice().sort((left, right) => left.name.localeCompare(right.name));
        const nestedLeaders = sortedItems.flatMap((item) => attachedByHost[item.unitId] ?? []);
        const allItems = [...sortedItems, ...nestedLeaders];
        return {
          title,
          items: sortedItems,
          totalCount: allItems.reduce((sum, item) => sum + item.count, 0),
          totalPoints: allItems.reduce((sum, item) => sum + rosterItemPoints(item), 0),
        };
      })
      .sort((left, right) => compareCategoryTitle(left.title, right.title));
  }, [currentDraft, attachedByHost, attachedIds]);

  const detachmentEnhancements = activeDetachment?.enhancements ?? EMPTY_ENHANCEMENTS;
  const usedEnhancementIds = useMemo(
    () => new Set(currentDraft.map((item) => item.enhancementId).filter(Boolean) as string[]),
    [currentDraft],
  );
  // 10e: an army may include at most three Enhancements.
  const enhancementsRemaining = Math.max(0, 3 - usedEnhancementIds.size);

  useEffect(() => {
    if (screen !== "builder" || (datasheetUnitId && !units.some((unit) => unit.id === datasheetUnitId))) {
      setDatasheetUnitId(null);
    }
  }, [datasheetUnitId, screen, units]);

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

  function updateArmyItems(updater: (items: RosterItem[]) => RosterItem[]) {
    if (!activeArmyId) {
      return;
    }
    setArmies((current) =>
      current.map((army) =>
        army.id === activeArmyId
          ? {
              ...army,
              updatedAt: new Date().toISOString(),
              items: updater(army.items),
            }
          : army,
      ),
    );
  }

  function beginNewArmy() {
    setView("setup");
    setSetupArmyName("");
    setSetupDetachmentId("");
    setDatasheetUnitId(null);
    setSearchTerm("");
    setDetailTab("overview");
  }

  function openArmy(armyId: string) {
    setActiveArmyId(armyId);
    setView("builder");
    setCopiedState(false);
    setDatasheetUnitId(null);
    setSearchTerm("");
    setDetailTab("overview");
  }

  function returnHome() {
    setView("home");
    setCopiedState(false);
    setDatasheetUnitId(null);
    setSearchTerm("");
    setDetailTab("overview");
  }

  function deleteArmy(armyId: string) {
    const targetArmy = armies.find((army) => army.id === armyId);
    if (!targetArmy) {
      return;
    }

    const confirmed = window.confirm(`Delete "${targetArmy.name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setArmies((current) => current.filter((army) => army.id !== armyId));
    setSelectedUnitIdByArmy((current) => {
      const next = { ...current };
      delete next[armyId];
      return next;
    });
    setOpenSectionByArmy((current) => {
      const next = { ...current };
      delete next[armyId];
      return next;
    });

    if (activeArmyId === armyId) {
      setActiveArmyId(null);
      setView("home");
      setCopiedState(false);
      setDatasheetUnitId(null);
      setSearchTerm("");
      setDetailTab("overview");
    }
  }

  function selectAlliance(alliance: Alliance) {
    startTransition(() => {
      setSetupAlliance(alliance);

      const availableFactions = factionsByAlliance[alliance];
      const keepCurrentFaction = availableFactions.some((faction) => faction.slug === setupFactionSlug);
      const nextFactionSlug = keepCurrentFaction ? setupFactionSlug : availableFactions[0]?.slug ?? "";

      setSetupFactionSlug(nextFactionSlug);
      if (!keepCurrentFaction) {
        setSetupDetachmentId("");
      }
    });
  }

  function selectFaction(slug: string) {
    const factionMeta = indexData?.factions.find((faction) => faction.slug === slug);
    startTransition(() => {
      setSetupFactionSlug(slug);
      setSetupDetachmentId("");
      if (factionMeta) {
        setSetupAlliance(getFactionAlliance(factionMeta.name));
      }
    });
  }

  function toggleSection(sectionTitle: string) {
    if (!activeArmyId) {
      return;
    }
    setOpenSectionByArmy((current) => {
      const currentOpenSection = current[activeArmyId] ?? null;
      return {
        ...current,
        [activeArmyId]: currentOpenSection === sectionTitle ? null : sectionTitle,
      };
    });
  }

  function createArmy() {
    if (!setupFactionMeta) {
      return;
    }
    const now = new Date().toISOString();
    const armyId = createArmyId();
    const name = setupArmyName.trim() || buildArmyName(setupFactionMeta, armies);
    const detachment =
      setupDetachments.find((candidate) => candidate.id === setupDetachmentId) ?? setupDetachments[0] ?? null;
    const army: StoredArmy = {
      id: armyId,
      name,
      factionSlug: setupFactionMeta.slug,
      detachmentId: detachment?.id,
      detachmentName: detachment?.name,
      createdAt: now,
      updatedAt: now,
      items: [],
    };

    setArmies((current) => [army, ...current]);
    setActiveArmyId(armyId);
    setView("builder");
    setCopiedState(false);
    setDatasheetUnitId(null);
    setSearchTerm("");
    setDetailTab("overview");
    setSetupArmyName("");
    setSetupDetachmentId("");
  }

  function openDatasheet(unit: UnitRecord) {
    selectUnit(unit.id);
    setDatasheetUnitId(unit.id);
  }

  function closeDatasheet() {
    setDatasheetUnitId(null);
  }

  function selectUnit(unitId: string) {
    if (!activeArmyId) {
      return;
    }
    setSelectedUnitIdByArmy((current) => ({
      ...current,
      [activeArmyId]: unitId,
    }));
  }

  function selectDetachment(detachmentId: string) {
    if (!activeArmyId) {
      return;
    }
    const detachment = activeDetachments.find((candidate) => candidate.id === detachmentId);
    setArmies((current) =>
      current.map((army) =>
        army.id === activeArmyId
          ? {
              ...army,
              detachmentId: detachment?.id,
              detachmentName: detachment?.name,
              updatedAt: new Date().toISOString(),
            }
          : army,
      ),
    );
  }

  function focusArmyUnit(unitId: string) {
    const targetUnit = units.find((unit) => unit.id === unitId);
    if (!activeArmyId || !targetUnit) {
      return;
    }

    setSearchTerm("");
    selectUnit(unitId);
    setDetailTab("overview");
    setDatasheetUnitId(unitId);
    setOpenSectionByArmy((current) => ({
      ...current,
      [activeArmyId]: targetUnit.summary.primaryCategory ?? "Other",
    }));
  }

  function addUnitToRoster(unit: UnitRecord) {
    const points = typeof unit.summary.points === "number" ? unit.summary.points : 0;
    updateArmyItems((items) => {
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
    updateArmyItems((items) =>
      items
        .map((item) => (item.unitId === unitId ? { ...item, count: nextCount } : item))
        // Removing a unit also detaches any leader joined to it and clears
        // its own attachment so no dangling links remain.
        .filter((item) => item.count > 0)
        .map((item) =>
          nextCount <= 0 && item.attachedTo === unitId ? { ...item, attachedTo: undefined } : item,
        ),
    );
  }

  function updateItemNote(unitId: string, note: string) {
    updateArmyItems((items) => items.map((item) => (item.unitId === unitId ? { ...item, note } : item)));
  }

  function assignEnhancement(unitId: string, enhancement: EnhancementRecord) {
    const points = typeof enhancement.points === "number" ? enhancement.points : Number(enhancement.points) || 0;
    updateArmyItems((items) =>
      items.map((item) =>
        item.unitId === unitId
          ? {
              ...item,
              enhancementId: enhancement.id,
              enhancementName: enhancement.name,
              enhancementPoints: points,
            }
          : item,
      ),
    );
  }

  function clearEnhancement(unitId: string) {
    updateArmyItems((items) =>
      items.map((item) =>
        item.unitId === unitId
          ? { ...item, enhancementId: undefined, enhancementName: undefined, enhancementPoints: undefined }
          : item,
      ),
    );
  }

  function attachLeader(leaderUnitId: string, hostUnitId: string) {
    updateArmyItems((items) =>
      items.map((item) =>
        item.unitId === leaderUnitId ? { ...item, attachedTo: hostUnitId || undefined } : item,
      ),
    );
  }

  function clearArmyRoster() {
    updateArmyItems(() => []);
  }

  async function copyRoster() {
    if (!activeArmy || currentDraft.length === 0) {
      return;
    }
    const headerLines = [
      activeArmy.name,
      selectedFactionMeta?.name ?? formatSlugLabel(activeArmy.factionSlug),
      activeDetachment ? `Detachment: ${activeDetachment.name}` : "",
      `${totalPoints} pts | ${totalSelections} selections`,
    ].filter((line) => line !== "");
    const nameById = new Map(currentDraft.map((item) => [item.unitId, item.name]));
    const lines = [
      ...headerLines,
      "",
      ...currentDraft.map((item) => {
        const note = item.note.trim() ? ` - ${item.note.trim()}` : "";
        const enhancement = item.enhancementName
          ? ` [Enhancement: ${item.enhancementName} +${item.enhancementPoints ?? 0} pts]`
          : "";
        const attached =
          item.attachedTo && nameById.has(item.attachedTo)
            ? ` [Leading: ${nameById.get(item.attachedTo)}]`
            : "";
        return `${item.count}x ${item.name} (${rosterItemPoints(item)} pts)${enhancement}${attached}${note}`;
      }),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopiedState(true);
    window.setTimeout(() => setCopiedState(false), 1800);
  }

  function exportRosterJson() {
    if (!activeArmy) {
      return;
    }
    const payload = {
      army: {
        id: activeArmy.id,
        name: activeArmy.name,
        factionSlug: activeArmy.factionSlug,
        factionName: selectedFactionMeta?.name ?? formatSlugLabel(activeArmy.factionSlug),
        detachment: activeDetachment
          ? {
              id: activeDetachment.id,
              name: activeDetachment.name,
            }
          : null,
        createdAt: activeArmy.createdAt,
        updatedAt: activeArmy.updatedAt,
      },
      points: totalPoints,
      selections: currentDraft,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(activeArmy.name) || activeArmy.factionSlug}-roster.json`;
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
          {indexData?.source.wahapedia ? (
            <p className="app-credit">
              Stratagem & enhancement data powered by{" "}
              <a href={indexData.source.wahapedia.url} target="_blank" rel="noreferrer noopener">
                Wahapedia
              </a>
              . Warhammer 40,000 10th Edition.
            </p>
          ) : null}
        </div>

        <div className="header-status">
          <StatusChip icon={<Database size={14} />} label={indexData?.source.name ?? "Loading data"} />
          {sourceStamp ? <StatusChip icon={<Check size={14} />} label={`Source snapshot ${sourceStamp}`} /> : null}
          {generatedStamp ? <StatusChip icon={<Shield size={14} />} label={`Export built ${generatedStamp}`} /> : null}
        </div>
      </header>

      {screen === "home" ? (
        <main className="screen-grid">
          <section className="workspace-pane home-pane">
            <div className="pane-head">
              <h2>Your Armies</h2>
              <button className="primary-button" type="button" onClick={beginNewArmy} disabled={indexLoading || !!indexError}>
                <FolderPlus size={16} />
                New Army
              </button>
            </div>

            {indexLoading ? <Loader label="Loading faction index" /> : null}
            {indexError ? <MessageTone tone="error" message={indexError} /> : null}

            {armiesByUpdatedAt.length > 0 ? (
              <div className="army-home-grid">
                {armiesByUpdatedAt.map((army) => {
                  const factionMeta = indexData?.factions.find((faction) => faction.slug === army.factionSlug) ?? null;
                  const armyPoints = army.items.reduce((sum, item) => sum + item.points * item.count, 0);
                  const armySelections = army.items.reduce((sum, item) => sum + item.count, 0);
                  const sectionCount = new Set(army.items.map((item) => item.primaryCategory ?? "Other")).size;

                  return (
                    <article key={army.id} className="army-home-card">
                      <div className="army-card-top">
                        <div>
                          <p className="eyebrow">Saved Army</p>
                          <h3>{army.name}</h3>
                          <p className="army-card-subtitle">
                            {factionMeta?.name ?? formatSlugLabel(army.factionSlug)}
                          </p>
                        </div>

                        <button
                          className="icon-button danger"
                          type="button"
                          title={`Delete ${army.name}`}
                          onClick={() => deleteArmy(army.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="army-card-stats">
                        <div className="army-card-stat">
                          <span>Points</span>
                          <strong>{armyPoints}</strong>
                        </div>
                        <div className="army-card-stat">
                          <span>Selections</span>
                          <strong>{armySelections}</strong>
                        </div>
                        <div className="army-card-stat">
                          <span>Sections</span>
                          <strong>{sectionCount}</strong>
                        </div>
                      </div>

                      <div className="army-card-foot">
                        <p className="army-card-updated">Updated {formatStamp(army.updatedAt)}</p>
                        <button className="secondary-button compact-button" type="button" onClick={() => openArmy(army.id)}>
                          Open Army
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="home-empty">
                <p className="eyebrow">No Armies Yet</p>
                <h2>Create your first list</h2>
                <p>
                  Start a new army, choose its faction, and then jump straight into the builder. Saved armies will
                  show up here so you can reopen them any time.
                </p>
                <button className="primary-button" type="button" onClick={beginNewArmy} disabled={indexLoading || !!indexError}>
                  <FolderPlus size={16} />
                  New Army
                </button>
              </div>
            )}
          </section>
        </main>
      ) : null}

      {screen === "setup" ? (
        <main className="screen-grid">
          <section className="workspace-pane setup-pane">
            <div className="pane-head">
              <h2>New Army</h2>
              <button className="secondary-button" type="button" onClick={returnHome}>
                <ArrowLeft size={16} />
                Armies
              </button>
            </div>

            {indexLoading ? <Loader label="Loading faction index" /> : null}
            {indexError ? <MessageTone tone="error" message={indexError} /> : null}

            <div className="setup-layout">
              <div>
                <label className="field">
                  <span>Army name</span>
                  <input
                    className="text-field"
                    value={setupArmyName}
                    onChange={(event) => setSetupArmyName(event.target.value)}
                    placeholder="Optional, e.g. Canoptek Court 2000"
                  />
                </label>

                <label className="field">
                  <span>Alliance</span>
                  <select
                    value={setupAlliance}
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
                    value={setupFactionSlug}
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
                  <span>Detachment</span>
                  <select
                    value={setupDetachmentId}
                    onChange={(event) => setSetupDetachmentId(event.target.value)}
                    disabled={!setupDetachments.length}
                  >
                    {setupDetachments.length ? (
                      setupDetachments.map((detachment) => (
                        <option key={detachment.id} value={detachment.id}>
                          {detachment.name}
                        </option>
                      ))
                    ) : (
                      <option value="">No detachment data found</option>
                    )}
                  </select>
                </label>

                <div className="setup-actions">
                  <button className="secondary-button" type="button" onClick={returnHome}>
                    <ArrowLeft size={16} />
                    Cancel
                  </button>
                  <button className="primary-button" type="button" onClick={createArmy} disabled={!setupFactionMeta}>
                    <FolderPlus size={16} />
                    Create Army
                  </button>
                </div>
              </div>

              {setupFactionMeta ? (
                <div className="meta-block">
                  <div>
                    <span>Faction</span>
                    <strong>{setupFactionMeta.name}</strong>
                  </div>
                  <div>
                    <span>Catalogue</span>
                    <strong>{setupFactionMeta.sourceFile}</strong>
                  </div>
                  <div>
                    <span>Revision</span>
                    <strong>{setupFactionMeta.revision}</strong>
                  </div>
                  <div>
                    <span>Indexed units</span>
                    <strong>{setupFactionMeta.unitCount}</strong>
                  </div>
                  <div>
                    <span>Detachments</span>
                    <strong>{setupFactionMeta.detachmentCount ?? setupDetachments.length}</strong>
                  </div>
                  <div>
                    <span>Stratagem records</span>
                    <strong>{setupFactionMeta.stratagemCount ?? setupFaction?.stratagems?.length ?? 0}</strong>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </main>
      ) : null}

      {screen === "builder" && activeArmy ? (
        <main className="builder-workspace">
          <section className="workspace-pane library-pane">
            <div className="builder-overview">
              <div>
                <p className="eyebrow">Army Builder</p>
                <h2>{activeArmy.name}</h2>
                <p className="builder-subtitle">
                  {selectedFactionMeta?.name ?? formatSlugLabel(activeArmy.factionSlug)}
                </p>
              </div>

              <div className="builder-head-actions">
                <button className="secondary-button" type="button" onClick={returnHome}>
                  <ArrowLeft size={16} />
                  Armies
                </button>
                <button className="tool-button danger" type="button" onClick={() => deleteArmy(activeArmy.id)}>
                  <Trash2 size={16} />
                  Delete Army
                </button>
              </div>
            </div>

            <div className="builder-controls">
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
                <div className="detail-tags">
                  <span>{getFactionLabel(selectedFactionMeta)}</span>
                  <span>{selectedFactionMeta.unitCount} indexed units</span>
                  <span>{selectedFactionMeta.detachmentCount ?? activeDetachments.length} detachments</span>
                  <span>Rev. {selectedFactionMeta.revision}</span>
                </div>
              ) : null}
            </div>

            <div className="pane-head">
              <h2>Unit Library</h2>
              <span>{filteredUnits.length} units</span>
            </div>

            {factionLoading ? <Loader label="Loading faction dossier" /> : null}
            {factionError ? <MessageTone tone="error" message={factionError} /> : null}

            <div className="library-grid">
              <div className="unit-list">
                {unitSections.map((section) => {
                  const isExpanded = openSectionByArmy[activeArmy.id] === section.title;

                  return (
                    <section key={section.title} className="unit-section">
                      <button
                        className={isExpanded ? "unit-section-toggle expanded" : "unit-section-toggle"}
                        type="button"
                        onClick={() => toggleSection(section.title)}
                        aria-expanded={isExpanded}
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
                      {detailTab === "overview" ? <OverviewSection unit={selectedUnit} /> : null}
                      {detailTab === "weapons" ? <WeaponsSection unit={selectedUnit} /> : null}
                      {detailTab === "abilities" ? <AbilitiesSection unit={selectedUnit} /> : null}
                      {detailTab === "options" ? <OptionsSection options={selectedUnit.options} /> : null}
                      {detailTab === "tree" ? <TreeSection tree={selectedUnit.tree} /> : null}
                    </div>
                  </>
                ) : (
                  <MessageTone tone="neutral" message="Select a unit to inspect its data." />
                )}
              </div>
            </div>
          </section>

          <section className="workspace-pane roster-pane">
            <div className="pane-head">
              <h2>Army</h2>
              <span>{totalPoints} pts</span>
            </div>

            <div className="army-sheet">
              <div className="army-sheet-header">
                <div className="army-sheet-title">
                  <p className="eyebrow">Current Army</p>
                  <h3>{activeArmy.name}</h3>
                  <p className="army-sheet-subtitle">
                    {selectedFactionMeta?.name ?? formatSlugLabel(activeArmy.factionSlug)}
                  </p>
                </div>

                {activeDetachments.length > 0 ? (
                  <label className="field army-detachment-field">
                    <span>Detachment</span>
                    <select
                      value={activeDetachment?.id ?? ""}
                      onChange={(event) => selectDetachment(event.target.value)}
                    >
                      {activeDetachments.map((detachment) => (
                        <option key={detachment.id} value={detachment.id}>
                          {detachment.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

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
                    <span>Sections</span>
                    <strong>{armySections.length}</strong>
                  </div>
                </div>
              </div>

              {armySections.length > 0 ? (
                <div className="army-section-strip">
                  {armySections.map((section) => (
                    <div key={section.title} className="army-section-chip">
                      <strong>{section.title}</strong>
                      <span>
                        {section.totalCount} | {section.totalPoints} pts
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <RulesPanel
              detachment={activeDetachment}
              stratagems={activeDetachmentStratagems}
              totalStratagemCount={activeStratagems.length}
            />

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
              <button className="tool-button danger" type="button" onClick={clearArmyRoster} disabled={currentDraft.length === 0}>
                <Trash2 size={16} />
                Clear
              </button>
            </div>

            <div className="roster-list">
              {armySections.map((section) => (
                <section key={section.title} className="army-group">
                  <div className="army-group-head">
                    <div>
                      <h3>{section.title}</h3>
                      <p>{section.totalCount} selections</p>
                    </div>
                    <strong>{section.totalPoints} pts</strong>
                  </div>

                  <div className="army-group-items">
                    {section.items.map((item) => (
                      <RosterItemCard
                        key={item.unitId}
                        item={item}
                        unit={unitsById.get(item.unitId)}
                        enhancements={detachmentEnhancements}
                        usedEnhancementIds={usedEnhancementIds}
                        enhancementsRemaining={enhancementsRemaining}
                        leaderHosts={findLeaderHosts(item, currentDraft, unitsById)}
                        attachedLeaders={(attachedByHost[item.unitId] ?? []).map((leader) => ({
                          leader,
                          unit: unitsById.get(leader.unitId),
                        }))}
                        onInspect={focusArmyUnit}
                        onAdjust={adjustItemCount}
                        onNote={updateItemNote}
                        onAssignEnhancement={assignEnhancement}
                        onClearEnhancement={clearEnhancement}
                        onAttach={attachLeader}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {currentDraft.length === 0 ? (
                <MessageTone tone="neutral" message="Your roster is empty. Add units from the library to start building." />
              ) : null}
            </div>
          </section>
        </main>
      ) : null}

      {screen === "builder" && datasheetUnit ? (
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

type RosterItemCardProps = {
  item: RosterItem;
  unit?: UnitRecord;
  enhancements: EnhancementRecord[];
  usedEnhancementIds: Set<string>;
  enhancementsRemaining: number;
  leaderHosts: RosterItem[];
  attachedLeaders: { leader: RosterItem; unit?: UnitRecord }[];
  nested?: boolean;
  hostName?: string;
  onInspect: (unitId: string) => void;
  onAdjust: (unitId: string, nextCount: number) => void;
  onNote: (unitId: string, note: string) => void;
  onAssignEnhancement: (unitId: string, enhancement: EnhancementRecord) => void;
  onClearEnhancement: (unitId: string) => void;
  onAttach: (leaderUnitId: string, hostUnitId: string) => void;
};

function RosterItemCard({
  item,
  unit,
  enhancements,
  usedEnhancementIds,
  enhancementsRemaining,
  leaderHosts,
  attachedLeaders,
  nested = false,
  hostName,
  onInspect,
  onAdjust,
  onNote,
  onAssignEnhancement,
  onClearEnhancement,
  onAttach,
}: RosterItemCardProps) {
  const isCharacter = unit?.isCharacter ?? false;
  const isEpicHero = unit?.isEpicHero ?? false;
  const isLeader = (unit?.leads?.length ?? 0) > 0;
  const canHaveEnhancement = isCharacter && !isEpicHero && enhancements.length > 0;
  const combinedPoints = rosterItemPoints(item);

  return (
    <article className={nested ? "roster-item roster-item-nested" : "roster-item"}>
      <div className="roster-item-top">
        <div>
          <h3>{item.name}</h3>
          <div className="roster-item-meta">
            <span>{item.count}x in list</span>
            <span>
              {item.points} pts{item.enhancementPoints ? ` + ${item.enhancementPoints}` : ""} each
            </span>
            {nested && hostName ? (
              <span className="roster-attached-tag">
                <Link2 size={12} /> Leading {hostName}
              </span>
            ) : null}
          </div>
        </div>
        <strong>{combinedPoints} pts</strong>
      </div>

      <div className="count-row">
        <button className="secondary-button compact-button" type="button" onClick={() => onInspect(item.unitId)}>
          <Crosshair size={14} />
          Inspect
        </button>
        <button
          className="icon-button"
          type="button"
          title={`Decrease ${item.name}`}
          onClick={() => onAdjust(item.unitId, item.count - 1)}
        >
          <Minus size={16} />
        </button>
        <span>{item.count}</span>
        <button
          className="icon-button"
          type="button"
          title={`Increase ${item.name}`}
          onClick={() => onAdjust(item.unitId, item.count + 1)}
        >
          <Plus size={16} />
        </button>
        <button
          className="icon-button danger"
          type="button"
          title={`Remove ${item.name}`}
          onClick={() => onAdjust(item.unitId, 0)}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {canHaveEnhancement ? (
        <label className="roster-control">
          <Sparkles size={14} />
          <select
            value={item.enhancementId ?? ""}
            onChange={(event) => {
              const id = event.target.value;
              if (!id) {
                onClearEnhancement(item.unitId);
                return;
              }
              const enhancement = enhancements.find((entry) => entry.id === id);
              if (enhancement) {
                onAssignEnhancement(item.unitId, enhancement);
              }
            }}
          >
            <option value="">No enhancement</option>
            {enhancements.map((enhancement) => {
              const takenElsewhere =
                usedEnhancementIds.has(enhancement.id) && item.enhancementId !== enhancement.id;
              const blockedByCap = enhancementsRemaining <= 0 && item.enhancementId !== enhancement.id;
              return (
                <option key={enhancement.id} value={enhancement.id} disabled={takenElsewhere || blockedByCap}>
                  {enhancement.name} (+{formatEnhancementPoints(enhancement.points)})
                  {takenElsewhere ? " - taken" : ""}
                </option>
              );
            })}
          </select>
        </label>
      ) : null}

      {isLeader && !nested ? (
        <label className="roster-control">
          <Link2 size={14} />
          <select
            value={item.attachedTo ?? ""}
            onChange={(event) => onAttach(item.unitId, event.target.value)}
            disabled={leaderHosts.length === 0}
          >
            <option value="">{leaderHosts.length === 0 ? "No Bodyguard in roster" : "Not attached"}</option>
            {leaderHosts.map((host) => (
              <option key={host.unitId} value={host.unitId}>
                Attach to {host.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {nested ? (
        <button
          className="secondary-button compact-button detach-button"
          type="button"
          onClick={() => onAttach(item.unitId, "")}
        >
          <Unlink size={14} />
          Detach
        </button>
      ) : null}

      <input
        className="note-field"
        value={item.note}
        onChange={(event) => onNote(item.unitId, event.target.value)}
        placeholder="Optional note, wargear idea, role"
      />

      {attachedLeaders.length > 0 ? (
        <div className="roster-attachments">
          {attachedLeaders.map(({ leader, unit: leaderUnit }) => (
            <RosterItemCard
              key={leader.unitId}
              item={leader}
              unit={leaderUnit}
              enhancements={enhancements}
              usedEnhancementIds={usedEnhancementIds}
              enhancementsRemaining={enhancementsRemaining}
              leaderHosts={[]}
              attachedLeaders={[]}
              nested
              hostName={item.name}
              onInspect={onInspect}
              onAdjust={onAdjust}
              onNote={onNote}
              onAssignEnhancement={onAssignEnhancement}
              onClearEnhancement={onClearEnhancement}
              onAttach={onAttach}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

const STRATAGEM_PHASE_ORDER = [
  "Any phase",
  "Command phase",
  "Movement phase",
  "Shooting phase",
  "Charge phase",
  "Fight phase",
];

function stratagemPhaseRank(phase?: string): number {
  if (!phase) {
    return STRATAGEM_PHASE_ORDER.length + 1;
  }
  const index = STRATAGEM_PHASE_ORDER.findIndex((entry) => entry.toLowerCase() === phase.toLowerCase());
  return index === -1 ? STRATAGEM_PHASE_ORDER.length : index;
}

function groupStratagemsByPhase(stratagems: StratagemRecord[]): { phase: string; items: StratagemRecord[] }[] {
  const grouped = groupBy(stratagems, (stratagem) => stratagem.phase || "Other");
  return Object.entries(grouped)
    .map(([phase, items]) => ({
      phase,
      items: items.slice().sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => {
      const rank = stratagemPhaseRank(left.phase) - stratagemPhaseRank(right.phase);
      return rank !== 0 ? rank : left.phase.localeCompare(right.phase);
    });
}

function RulesPanel({
  detachment,
  stratagems,
  totalStratagemCount,
}: {
  detachment: DetachmentRecord | null;
  stratagems: StratagemRecord[];
  totalStratagemCount: number;
}) {
  const [stratagemQuery, setStratagemQuery] = useState("");
  const enhancements = detachment?.enhancements ?? [];

  const filteredStratagems = useMemo(() => {
    const query = stratagemQuery.trim().toLowerCase();
    if (!query) {
      return stratagems;
    }
    return stratagems.filter((stratagem) =>
      [stratagem.name, stratagem.type, stratagem.phase, stratagem.detachmentName, stratagem.effect, stratagem.when]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [stratagemQuery, stratagems]);

  const coreStratagems = filteredStratagems.filter((stratagem) => stratagem.core);
  const detachmentStratagems = filteredStratagems.filter((stratagem) => !stratagem.core);
  const coreGroups = groupStratagemsByPhase(coreStratagems);
  const detachmentGroups = groupStratagemsByPhase(detachmentStratagems);

  return (
    <section className="rules-panel">
      <div className="section-head">
        <BookOpen size={16} />
        <h3>Detachment Rules</h3>
      </div>

      {detachment ? (
        <div className="rules-stack">
          <div>
            <p className="eyebrow">Selected Detachment</p>
            <h4>{detachment.name}</h4>
          </div>

          {detachment.rules.length > 0 ? (
            <div className="ability-list">
              {detachment.rules.map((rule) => (
                <article key={rule.id ?? rule.name} className="ability-row">
                  <h4>{rule.name}</h4>
                  <p>{rule.description ?? rule.alias ?? "No description on record."}</p>
                </article>
              ))}
            </div>
          ) : (
            <MessageTone tone="neutral" message="No detachment rule text was found for this detachment." />
          )}

          {detachment.profiles.length > 0 ? (
            <div className="profile-grid">
              {detachment.profiles.map((profile) => (
                <ProfileCard key={`${profile.id ?? profile.name}-${profile.typeName}`} profile={profile} />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <MessageTone tone="neutral" message="No detachment data was found for this faction." />
      )}

      <div className="section-head enhancement-section-head">
        <Sparkles size={16} />
        <h3>Enhancements</h3>
        <span>{enhancements.length}</span>
      </div>
      {enhancements.length > 0 ? (
        <div className="enhancement-list">
          {enhancements.map((enhancement) => (
            <article key={enhancement.id} className="enhancement-card">
              <div className="enhancement-card-head">
                <h4>{enhancement.name}</h4>
                <span className="points-badge">{formatEnhancementPoints(enhancement.points)}</span>
              </div>
              {enhancement.description ? <p>{enhancement.description}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <MessageTone tone="neutral" message="No enhancements were found for this detachment." />
      )}

      <div className="section-head stratagem-section-head">
        <ScrollText size={16} />
        <h3>Stratagems</h3>
        <span>{filteredStratagems.length}</span>
      </div>

      {totalStratagemCount > 0 ? (
        <label className="field stratagem-search">
          <Search size={14} />
          <input
            value={stratagemQuery}
            onChange={(event) => setStratagemQuery(event.target.value)}
            placeholder="Filter stratagems by name, phase, type"
          />
        </label>
      ) : null}

      <div className="stratagem-list">
        {detachmentGroups.length > 0 ? (
          <div className="stratagem-pool">
            <p className="stratagem-pool-label">Detachment</p>
            {detachmentGroups.map((group) => (
              <StratagemPhaseGroup key={`det-${group.phase}`} phase={group.phase} items={group.items} />
            ))}
          </div>
        ) : null}

        {coreGroups.length > 0 ? (
          <div className="stratagem-pool">
            <p className="stratagem-pool-label">Core</p>
            {coreGroups.map((group) => (
              <StratagemPhaseGroup key={`core-${group.phase}`} phase={group.phase} items={group.items} />
            ))}
          </div>
        ) : null}

        {totalStratagemCount === 0 ? (
          <MessageTone tone="neutral" message="No stratagem card data is present in the current export." />
        ) : null}
        {totalStratagemCount > 0 && filteredStratagems.length === 0 ? (
          <MessageTone tone="neutral" message="No stratagems match the current filter or detachment." />
        ) : null}
      </div>
    </section>
  );
}

function StratagemPhaseGroup({ phase, items }: { phase: string; items: StratagemRecord[] }) {
  return (
    <div className="stratagem-phase-group">
      <p className="stratagem-phase-label">{phase}</p>
      {items.map((stratagem) => (
        <StratagemCard key={stratagem.id} stratagem={stratagem} />
      ))}
    </div>
  );
}

function StratagemCard({ stratagem }: { stratagem: StratagemRecord }) {
  const sections = [
    ["When", stratagem.when],
    ["Target", stratagem.target],
    ["Effect", stratagem.effect],
    ["Restrictions", stratagem.restrictions],
  ].filter(([, value]) => value) as [string, string][];
  const tags = [stratagem.type, stratagem.turn].filter(Boolean) as string[];

  return (
    <article className="stratagem-card">
      <div className="stratagem-card-head">
        <span className="cp-badge" title="Command points">
          {stratagem.cp ? `${stratagem.cp} CP` : "CP"}
        </span>
        <h4>{stratagem.name}</h4>
        {stratagem.detachmentName ? <span className="stratagem-source">{stratagem.detachmentName}</span> : null}
      </div>

      {tags.length > 0 ? (
        <div className="detail-tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}

      {sections.length > 0 ? (
        <dl className="stratagem-sections">
          {sections.map(([label, value]) => (
            <div key={label} className="stratagem-section">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>{stratagem.description ?? stratagem.legend ?? "No description on record."}</p>
      )}
    </article>
  );
}

function formatEnhancementPoints(points: number | string | null | undefined): string {
  if (points === null || points === undefined || points === "") {
    return "pts n/a";
  }
  return `${points} pts`;
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

function resolveArmyDetachment(army: StoredArmy, detachments: DetachmentRecord[]): DetachmentRecord | null {
  if (detachments.length === 0) {
    return null;
  }
  return (
    detachments.find((detachment) => detachment.id === army.detachmentId) ??
    detachments.find((detachment) => detachment.name === army.detachmentName) ??
    detachments[0]
  );
}

function rosterItemPoints(item: RosterItem): number {
  return (item.points + (item.enhancementPoints ?? 0)) * item.count;
}

function normalizeUnitName(value: string): string {
  return value.toLowerCase().replace(/\[[^\]]*\]/g, "").replace(/[^a-z0-9]/g, "");
}

/** Roster items a Leader item may be attached to, per its `leads` list. */
function findLeaderHosts(
  leaderItem: RosterItem,
  draft: RosterItem[],
  unitsById: Map<string, UnitRecord>,
): RosterItem[] {
  const leads = unitsById.get(leaderItem.unitId)?.leads ?? [];
  if (leads.length === 0) {
    return [];
  }
  const leadSet = new Set(leads.map(normalizeUnitName));
  return draft.filter((candidate) => {
    if (candidate.unitId === leaderItem.unitId || candidate.attachedTo) {
      return false;
    }
    const unit = unitsById.get(candidate.unitId);
    const names = [candidate.name, unit?.baseName].filter(Boolean) as string[];
    return names.some((name) => leadSet.has(normalizeUnitName(name)));
  });
}

function getDetachmentStratagems(
  stratagems: StratagemRecord[],
  detachment: DetachmentRecord | null,
): StratagemRecord[] {
  const detachmentName = detachment?.name.toLowerCase();
  return stratagems.filter((stratagem) => {
    // Universal Core stratagems and army-wide cards are always available.
    if (stratagem.core) {
      return true;
    }
    if (!stratagem.detachmentId && !stratagem.detachmentName) {
      return true;
    }
    if (!detachment) {
      return false;
    }
    return (
      stratagem.detachmentId === detachment.id ||
      stratagem.detachmentName?.toLowerCase() === detachmentName
    );
  });
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

function migrateStoredState(stored: StoredState): {
  armies: StoredArmy[];
  activeArmyId: string | null;
  selectedUnitIdByArmy: Record<string, string>;
} {
  if (stored.armies?.length) {
    const armies = stored.armies.map((army) => ({
      ...army,
      createdAt: army.createdAt ?? army.updatedAt,
      updatedAt: army.updatedAt ?? army.createdAt,
      items: Array.isArray(army.items) ? army.items : [],
    }));

    return {
      armies,
      activeArmyId: stored.activeArmyId ?? armies[0]?.id ?? null,
      selectedUnitIdByArmy: stored.selectedUnitIdByArmy ?? {},
    };
  }

  const selectedUnitIdByArmy: Record<string, string> = {};
  const armies = Object.entries(stored.draftsByFaction ?? {})
    .filter(([, draft]) => Array.isArray(draft.items))
    .map(([factionSlug, draft], index) => {
      const id = `legacy-${factionSlug}-${index}`;
      const legacySelectedUnit = stored.selectedUnitIdByFaction?.[factionSlug];
      if (legacySelectedUnit) {
        selectedUnitIdByArmy[id] = legacySelectedUnit;
      }

      return {
        id,
        name: `${formatSlugLabel(factionSlug)} Army`,
        factionSlug,
        createdAt: draft.updatedAt,
        updatedAt: draft.updatedAt,
        items: draft.items,
      };
    });

  const activeArmyId = stored.selectedFactionSlug
    ? armies.find((army) => army.factionSlug === stored.selectedFactionSlug)?.id ?? armies[0]?.id ?? null
    : armies[0]?.id ?? null;

  return {
    armies,
    activeArmyId,
    selectedUnitIdByArmy,
  };
}

function createArmyId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `army-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildArmyName(faction: FactionMeta, armies: StoredArmy[]): string {
  const base = `${getFactionLabel(faction)} Army`;
  const existingCount = armies.filter((army) => army.factionSlug === faction.slug).length;
  return existingCount === 0 ? base : `${base} ${existingCount + 1}`;
}

function formatSlugLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function compareCategoryTitle(left: string, right: string): number {
  const leftIndex = CATEGORY_ORDER.indexOf(left as (typeof CATEGORY_ORDER)[number]);
  const rightIndex = CATEGORY_ORDER.indexOf(right as (typeof CATEGORY_ORDER)[number]);

  if (leftIndex === -1 && rightIndex === -1) {
    return left.localeCompare(right);
  }
  if (leftIndex === -1) {
    return 1;
  }
  if (rightIndex === -1) {
    return -1;
  }
  return leftIndex - rightIndex;
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
