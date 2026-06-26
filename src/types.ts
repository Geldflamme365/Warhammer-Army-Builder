export type CatalogueIndex = {
  source: {
    name: string;
    repo: string;
    commit: string;
    sourceTimestamp: string;
    wahapedia?: {
      name?: string;
      url?: string;
      attribution?: string;
      retrievedAt?: string;
    };
  };
  generatedAt: string;
  factions: FactionMeta[];
};

export type FactionMeta = {
  id: string;
  name: string;
  revision: string;
  sourceFile: string;
  slug: string;
  unitCount: number;
  detachmentCount?: number;
  stratagemCount?: number;
  path: string;
};

export type Profile = {
  id?: string;
  name: string;
  typeName: string;
  characteristics: Record<string, string>;
  sourceDocument?: string;
  linkName?: string;
};

export type Rule = {
  id?: string;
  name: string;
  alias?: string;
  description?: string;
  sourceDocument?: string;
  linkName?: string;
};

export type Constraint = Record<string, unknown>;
export type Modifier = Record<string, unknown>;

export type Summary = {
  points: number | null;
  primaryCategory?: string | null;
  categories: string[];
  stats: Profile[];
  abilities: Profile[];
  weapons: Profile[];
  transport: Profile[];
  rules: string[];
  constraints: Constraint[];
  modifiers: Modifier[];
};

export type TreeNode = {
  kind: string;
  id: string;
  name: string;
  type?: string;
  hidden?: boolean | null;
  collective?: boolean;
  defaultAmount?: number | string;
  defaultSelectionEntryId?: string;
  sourceDocument?: string;
  costs?: Record<string, number | string | null>;
  constraints?: Constraint[];
  modifiers?: Modifier[];
  categories?: Array<{
    id?: string;
    name: string;
    primary?: boolean | null;
  }>;
  profiles?: Profile[];
  linkedProfiles?: Profile[];
  rules?: Rule[];
  linkedRules?: Rule[];
  children?: TreeNode[];
  target?: TreeNode;
  targetId?: string;
  linkConstraints?: Constraint[];
  linkModifiers?: Modifier[];
  baseName?: string;
  entryLinks?: TreeNode[];
  cycle?: boolean;
  truncated?: boolean;
};

export type UnitRecord = {
  id: string;
  name: string;
  baseName: string;
  sourceDocument?: string;
  selectionType: string;
  entryLink?: {
    id?: string;
    name: string;
    hidden?: boolean | null;
    modifiers?: Modifier[];
    constraints?: Constraint[];
  };
  summary: Summary;
  tree: TreeNode;
  options: TreeNode[];
  isCharacter?: boolean;
  isEpicHero?: boolean;
  /** Names of Bodyguard units this Leader can be attached to (10e Leader ability). */
  leads?: string[];
};

export type EnhancementRecord = {
  id: string;
  name: string;
  points: number | string | null;
  detachmentId?: string;
  detachmentName?: string | null;
  description?: string;
};

export type DetachmentRecord = {
  id: string;
  name: string;
  sourceDocument?: string;
  sortIndex?: number | string | null;
  rules: Rule[];
  profiles: Profile[];
  constraints: Constraint[];
  modifiers: Modifier[];
  enhancements?: EnhancementRecord[];
};

export type StratagemRecord = {
  id: string;
  name: string;
  detachmentId?: string;
  detachmentName?: string;
  /** True for universal Core stratagems available to every army. */
  core?: boolean;
  sourceDocument?: string;
  cp?: string;
  phase?: string;
  turn?: string;
  type?: string;
  when?: string;
  target?: string;
  effect?: string;
  restrictions?: string;
  legend?: string;
  description?: string;
};

export type FactionData = {
  catalogue: {
    id: string;
    name: string;
    revision: string;
    sourceFile: string;
  };
  units: UnitRecord[];
  detachments?: DetachmentRecord[];
  stratagems?: StratagemRecord[];
};

export type RosterItem = {
  unitId: string;
  name: string;
  points: number;
  count: number;
  primaryCategory?: string | null;
  categories: string[];
  note: string;
  /** Enhancement assigned to this (character) item, if any. */
  enhancementId?: string;
  enhancementName?: string;
  enhancementPoints?: number;
  /** unitId of the Bodyguard roster item this Leader is attached to. */
  attachedTo?: string;
};

export type StoredDraft = {
  updatedAt: string;
  items: RosterItem[];
};

export type StoredArmy = {
  id: string;
  name: string;
  factionSlug: string;
  detachmentId?: string;
  detachmentName?: string;
  createdAt: string;
  updatedAt: string;
  items: RosterItem[];
};

export type StoredState = {
  armies?: StoredArmy[];
  activeArmyId?: string | null;
  selectedUnitIdByArmy?: Record<string, string>;
  selectedFactionSlug?: string;
  selectedUnitIdByFaction?: Record<string, string>;
  draftsByFaction?: Record<string, StoredDraft>;
};
