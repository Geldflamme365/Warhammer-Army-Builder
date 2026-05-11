export type CatalogueIndex = {
  source: {
    name: string;
    repo: string;
    commit: string;
    sourceTimestamp: string;
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
};

export type FactionData = {
  catalogue: {
    id: string;
    name: string;
    revision: string;
    sourceFile: string;
  };
  units: UnitRecord[];
};

export type RosterItem = {
  unitId: string;
  name: string;
  points: number;
  count: number;
  primaryCategory?: string | null;
  categories: string[];
  note: string;
};

export type StoredDraft = {
  updatedAt: string;
  items: RosterItem[];
};

export type StoredState = {
  selectedFactionSlug?: string;
  selectedUnitIdByFaction?: Record<string, string>;
  draftsByFaction?: Record<string, StoredDraft>;
};
