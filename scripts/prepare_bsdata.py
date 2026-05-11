#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import re
import shutil
import subprocess
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple


ROOT_DIR = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT_DIR / ".cache" / "bsdata-wh40k-10e"
OUTPUT_DIR = ROOT_DIR / "data" / "bsdata"
FACTIONS_DIR = OUTPUT_DIR / "factions"
GAME_SYSTEM_FILE = "Warhammer 40,000.gst"

DATASET_NAME = "BSData Warhammer 40,000 10th Edition"
DATASET_REPO = "https://github.com/BSData/wh40k-10e"

META_NAMES = {
    "configuration",
    "crusade",
    "enhancements",
    "order of battle",
    "show/hide options",
    "show crucible characters",
    "detachment",
    "warlord",
}
PROFILE_TYPES_TO_KEEP = {"Unit", "Abilities", "Ranged Weapons", "Melee Weapons", "Transport"}
SUSPICIOUS_TEXT = ("Â", "â", "€™", "€", "œ", "ž", "™", "–")
POINTS_COST_NAME = "pts"


@dataclass
class DocumentInfo:
    document_id: str
    name: str
    revision: str
    path: Path
    root: ET.Element
    tag: str
    library: bool


@dataclass
class NodeInfo:
    document: DocumentInfo
    element: ET.Element


class Index:
    def __init__(self) -> None:
        self.documents: Dict[str, DocumentInfo] = {}
        self.catalogues: Dict[str, DocumentInfo] = {}
        self.selection_entries: Dict[str, NodeInfo] = {}
        self.selection_entry_groups: Dict[str, NodeInfo] = {}
        self.profiles: Dict[str, NodeInfo] = {}
        self.rules: Dict[str, NodeInfo] = {}
        self.categories: Dict[str, NodeInfo] = {}


def strip_namespaces(element: ET.Element) -> None:
    for node in element.iter():
        if "}" in node.tag:
            node.tag = node.tag.split("}", 1)[1]


def read_text(path: Path) -> ET.Element:
    tree = ET.parse(path)
    root = tree.getroot()
    strip_namespaces(root)
    return root


def get_direct_children(parent: ET.Element, container_name: str, child_name: str) -> List[ET.Element]:
    container = parent.find(container_name)
    if container is None:
        return []
    return list(container.findall(child_name))


def get_text(element: Optional[ET.Element], child_name: str) -> str:
    if element is None:
        return ""
    child = element.find(child_name)
    if child is None or child.text is None:
        return ""
    return clean_text(child.text)


def suspicious_score(text: str) -> int:
    return sum(text.count(token) for token in SUSPICIOUS_TEXT)


def maybe_fix_mojibake(text: str) -> str:
    if suspicious_score(text) == 0:
        return text
    try:
        candidate = text.encode("latin1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text
    return candidate if suspicious_score(candidate) < suspicious_score(text) else text


def ascii_normalize(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    return normalized.encode("ascii", "ignore").decode("ascii")


def clean_text(value: Optional[str]) -> str:
    if not value:
        return ""
    text = value.replace("\r", "")
    text = maybe_fix_mojibake(text)
    replacements = {
        "\u00a0": " ",
        "“": '"',
        "”": '"',
        "‘": "'",
        "’": "'",
        "•": "-",
        "●": "-",
        "■": "-",
        "►": "->",
        "➤": "->",
        "–": "-",
        "—": "-",
        "\t": " ",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = ascii_normalize(text)
    text = text.replace("**", "")
    text = text.replace("^^", "")
    text = re.sub(r"[ ]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


def slugify(value: str) -> str:
    text = clean_text(value).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text or "unknown"


def parse_bool(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return None
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False
    return None


def coerce_scalar(value: Optional[str]) -> Any:
    if value is None:
        return None
    cleaned = clean_text(value)
    if cleaned == "":
        return ""
    if re.fullmatch(r"-?\d+", cleaned):
        return int(cleaned)
    if re.fullmatch(r"-?\d+\.\d+", cleaned):
        return float(cleaned)
    return cleaned


def extract_costs(element: ET.Element) -> Dict[str, Any]:
    result: Dict[str, Any] = {}
    for cost in get_direct_children(element, "costs", "cost"):
        name = clean_text(cost.attrib.get("name") or cost.attrib.get("typeId") or "")
        if not name:
            continue
        result[name] = coerce_scalar(cost.attrib.get("value"))
    return result


def extract_categories(element: ET.Element) -> List[Dict[str, Any]]:
    categories: List[Dict[str, Any]] = []
    for category in get_direct_children(element, "categoryLinks", "categoryLink"):
        categories.append(
            {
                "id": category.attrib.get("targetId") or category.attrib.get("id"),
                "name": clean_text(category.attrib.get("name")),
                "primary": parse_bool(category.attrib.get("primary")),
            }
        )
    return [category for category in categories if category["name"]]


def extract_characteristics(profile: ET.Element) -> Dict[str, str]:
    result: Dict[str, str] = {}
    characteristics = profile.find("characteristics")
    if characteristics is None:
        return result
    for characteristic in characteristics.findall("characteristic"):
        name = clean_text(characteristic.attrib.get("name"))
        if not name:
            continue
        result[name] = clean_text(characteristic.text or "")
    return result


def profile_to_json(node: NodeInfo) -> Dict[str, Any]:
    element = node.element
    return {
        "id": element.attrib.get("id"),
        "name": clean_text(element.attrib.get("name")),
        "typeName": clean_text(element.attrib.get("typeName")),
        "characteristics": extract_characteristics(element),
        "sourceDocument": node.document.name,
    }


def rule_to_json(node: NodeInfo, include_description: bool) -> Dict[str, Any]:
    element = node.element
    data: Dict[str, Any] = {
        "id": element.attrib.get("id"),
        "name": clean_text(element.attrib.get("name")),
        "sourceDocument": node.document.name,
    }
    alias = get_text(element, "alias")
    if alias:
        data["alias"] = alias
    if include_description:
        description = get_text(element, "description")
        if description:
            data["description"] = description
    return data


def extract_profiles(element: ET.Element) -> List[Dict[str, Any]]:
    profiles: List[Dict[str, Any]] = []
    for profile in get_direct_children(element, "profiles", "profile"):
        profile_type = clean_text(profile.attrib.get("typeName"))
        if profile_type and profile_type not in PROFILE_TYPES_TO_KEEP:
            continue
        profiles.append(
            {
                "id": profile.attrib.get("id"),
                "name": clean_text(profile.attrib.get("name")),
                "typeName": profile_type,
                "characteristics": extract_characteristics(profile),
            }
        )
    return profiles


def extract_direct_rules(element: ET.Element) -> List[Dict[str, Any]]:
    rules: List[Dict[str, Any]] = []
    for rule in get_direct_children(element, "rules", "rule"):
        data = {
            "id": rule.attrib.get("id"),
            "name": clean_text(rule.attrib.get("name")),
        }
        description = get_text(rule, "description")
        if description:
            data["description"] = description
        alias = get_text(rule, "alias")
        if alias:
            data["alias"] = alias
        rules.append(data)
    return rules


def extract_constraints(element: ET.Element) -> List[Dict[str, Any]]:
    constraints: List[Dict[str, Any]] = []
    for constraint in get_direct_children(element, "constraints", "constraint"):
        data: Dict[str, Any] = {}
        for key in (
            "id",
            "type",
            "field",
            "scope",
            "value",
            "childId",
            "childName",
            "includeChildSelections",
            "includeChildForces",
            "shared",
            "percentValue",
        ):
            value = constraint.attrib.get(key)
            if value is None:
                continue
            bool_value = parse_bool(value)
            data[key] = bool_value if bool_value is not None else coerce_scalar(value)
        constraints.append(data)
    return constraints


def extract_repeats(element: ET.Element) -> List[Dict[str, Any]]:
    repeats: List[Dict[str, Any]] = []
    container = element.find("repeats")
    if container is None:
        return repeats
    for repeat in container.findall("repeat"):
        data: Dict[str, Any] = {}
        for key, value in repeat.attrib.items():
            bool_value = parse_bool(value)
            data[key] = bool_value if bool_value is not None else coerce_scalar(value)
        repeats.append(data)
    return repeats


def extract_conditions_from(element: Optional[ET.Element]) -> List[Dict[str, Any]]:
    if element is None:
        return []
    conditions: List[Dict[str, Any]] = []
    for condition in element.findall("condition"):
        data: Dict[str, Any] = {}
        for key, value in condition.attrib.items():
            bool_value = parse_bool(value)
            data[key] = bool_value if bool_value is not None else coerce_scalar(value)
        conditions.append(data)
    return conditions


def extract_condition_groups(element: ET.Element) -> List[Dict[str, Any]]:
    container = element.find("conditionGroups")
    if container is None:
        return []
    groups: List[Dict[str, Any]] = []
    for group in container.findall("conditionGroup"):
        data: Dict[str, Any] = {"type": clean_text(group.attrib.get("type"))}
        nested_conditions = extract_conditions_from(group.find("conditions"))
        if nested_conditions:
            data["conditions"] = nested_conditions
        nested_groups = extract_condition_groups(group)
        if nested_groups:
            data["conditionGroups"] = nested_groups
        groups.append(data)
    return groups


def extract_modifiers(element: ET.Element) -> List[Dict[str, Any]]:
    modifiers: List[Dict[str, Any]] = []

    def add_modifier_nodes(parent: Optional[ET.Element]) -> None:
        if parent is None:
            return
        for modifier in parent.findall("modifier"):
            data: Dict[str, Any] = {}
            for key, value in modifier.attrib.items():
                bool_value = parse_bool(value)
                data[key] = bool_value if bool_value is not None else coerce_scalar(value)
            direct_conditions = extract_conditions_from(modifier.find("conditions"))
            if direct_conditions:
                data["conditions"] = direct_conditions
            condition_groups = extract_condition_groups(modifier)
            if condition_groups:
                data["conditionGroups"] = condition_groups
            repeats = extract_repeats(modifier)
            if repeats:
                data["repeats"] = repeats
            modifiers.append(data)

    add_modifier_nodes(element.find("modifiers"))
    modifier_groups = element.find("modifierGroups")
    if modifier_groups is not None:
        for group in modifier_groups.findall("modifierGroup"):
            group_data: Dict[str, Any] = {"type": clean_text(group.attrib.get("type"))}
            comment = get_text(group, "comment")
            if comment:
                group_data["comment"] = comment
            group_modifiers: List[Dict[str, Any]] = []
            container = group.find("modifiers")
            if container is not None:
                for modifier in container.findall("modifier"):
                    data: Dict[str, Any] = {}
                    for key, value in modifier.attrib.items():
                        bool_value = parse_bool(value)
                        data[key] = bool_value if bool_value is not None else coerce_scalar(value)
                    direct_conditions = extract_conditions_from(modifier.find("conditions"))
                    if direct_conditions:
                        data["conditions"] = direct_conditions
                    condition_groups = extract_condition_groups(modifier)
                    if condition_groups:
                        data["conditionGroups"] = condition_groups
                    repeats = extract_repeats(modifier)
                    if repeats:
                        data["repeats"] = repeats
                    group_modifiers.append(data)
            if group_modifiers:
                group_data["modifiers"] = group_modifiers
            modifiers.append(group_data)
    return modifiers


def is_meta_name(name: str) -> bool:
    lowered = clean_text(name).lower()
    if not lowered:
        return False
    return lowered in META_NAMES or lowered.startswith("show ")


def should_follow_entry_link(link: ET.Element) -> bool:
    if parse_bool(link.attrib.get("hidden")):
        return False
    name = clean_text(link.attrib.get("name"))
    if is_meta_name(name):
        return False
    return link.attrib.get("type") in {"selectionEntry", "selectionEntryGroup"}


def build_index(source_dir: Path) -> Index:
    index = Index()
    files = sorted(source_dir.glob("*.cat")) + sorted(source_dir.glob("*.gst"))
    for path in files:
        root = read_text(path)
        document = DocumentInfo(
            document_id=root.attrib.get("id", path.stem),
            name=clean_text(root.attrib.get("name", path.stem)),
            revision=root.attrib.get("revision", ""),
            path=path,
            root=root,
            tag=root.tag,
            library=parse_bool(root.attrib.get("library")) or False,
        )
        index.documents[document.document_id] = document
        if root.tag == "catalogue":
            index.catalogues[document.document_id] = document
        for node in root.iter("selectionEntry"):
            node_id = node.attrib.get("id")
            if node_id and node_id not in index.selection_entries:
                index.selection_entries[node_id] = NodeInfo(document, node)
        for node in root.iter("selectionEntryGroup"):
            node_id = node.attrib.get("id")
            if node_id and node_id not in index.selection_entry_groups:
                index.selection_entry_groups[node_id] = NodeInfo(document, node)
        for node in root.iter("profile"):
            node_id = node.attrib.get("id")
            if node_id and node_id not in index.profiles:
                index.profiles[node_id] = NodeInfo(document, node)
        for node in root.iter("rule"):
            node_id = node.attrib.get("id")
            if node_id and node_id not in index.rules:
                index.rules[node_id] = NodeInfo(document, node)
        for node in root.iter("categoryEntry"):
            node_id = node.attrib.get("id")
            if node_id and node_id not in index.categories:
                index.categories[node_id] = NodeInfo(document, node)
    return index


def resolve_link_target(link: ET.Element, index: Index) -> Optional[NodeInfo]:
    target_id = link.attrib.get("targetId")
    link_type = link.attrib.get("type")
    if not target_id:
        return None
    if link_type == "selectionEntry":
        return index.selection_entries.get(target_id)
    if link_type == "selectionEntryGroup":
        return index.selection_entry_groups.get(target_id)
    return None


def include_rule_description(rule: NodeInfo) -> bool:
    return rule.document.path.name != GAME_SYSTEM_FILE


def build_linked_profiles(element: ET.Element, index: Index) -> List[Dict[str, Any]]:
    linked_profiles: List[Dict[str, Any]] = []
    for link in get_direct_children(element, "infoLinks", "infoLink"):
        if link.attrib.get("type") != "profile":
            continue
        target_id = link.attrib.get("targetId")
        if not target_id:
            continue
        profile = index.profiles.get(target_id)
        if profile is None:
            continue
        profile_data = profile_to_json(profile)
        link_name = clean_text(link.attrib.get("name"))
        if link_name and link_name != profile_data["name"]:
            profile_data["linkName"] = link_name
        linked_profiles.append(profile_data)
    return linked_profiles


def build_linked_rules(element: ET.Element, index: Index) -> List[Dict[str, Any]]:
    linked_rules: List[Dict[str, Any]] = []
    for link in get_direct_children(element, "infoLinks", "infoLink"):
        if link.attrib.get("type") != "rule":
            continue
        target_id = link.attrib.get("targetId")
        if not target_id:
            continue
        rule = index.rules.get(target_id)
        if rule is None:
            continue
        rule_data = rule_to_json(rule, include_rule_description(rule))
        link_name = clean_text(link.attrib.get("name"))
        if link_name and link_name != rule_data["name"]:
            rule_data["linkName"] = link_name
        linked_rules.append(rule_data)
    return linked_rules


def build_option_node(
    node_info: NodeInfo,
    index: Index,
    visited: Optional[Set[Tuple[str, str]]] = None,
    depth: int = 0,
    max_depth: int = 5,
) -> Dict[str, Any]:
    if visited is None:
        visited = set()

    kind = node_info.element.tag
    node_id = node_info.element.attrib.get("id", f"{kind}-{depth}")
    visit_key = (kind, node_id)
    if visit_key in visited:
        return {"kind": kind, "id": node_id, "name": clean_text(node_info.element.attrib.get("name")), "cycle": True}
    if depth > max_depth:
        return {"kind": kind, "id": node_id, "name": clean_text(node_info.element.attrib.get("name")), "truncated": True}

    visited.add(visit_key)
    element = node_info.element
    data: Dict[str, Any] = {
        "kind": kind,
        "id": node_id,
        "name": clean_text(element.attrib.get("name")),
    }
    if kind == "selectionEntry":
        node_type = clean_text(element.attrib.get("type"))
        if node_type:
            data["type"] = node_type
    if kind == "selectionEntryGroup":
        default_selection = element.attrib.get("defaultSelectionEntryId")
        if default_selection:
            data["defaultSelectionEntryId"] = default_selection

    costs = extract_costs(element)
    if costs:
        data["costs"] = costs
    constraints = extract_constraints(element)
    if constraints:
        data["constraints"] = constraints
    modifiers = extract_modifiers(element)
    if modifiers:
        data["modifiers"] = modifiers

    children: List[Dict[str, Any]] = []
    for group in get_direct_children(element, "selectionEntryGroups", "selectionEntryGroup"):
        if is_meta_name(clean_text(group.attrib.get("name"))):
            continue
        children.append(
            build_option_node(
                NodeInfo(node_info.document, group),
                index,
                visited=visited,
                depth=depth + 1,
                max_depth=max_depth,
            )
        )
    for child in get_direct_children(element, "selectionEntries", "selectionEntry"):
        if is_meta_name(clean_text(child.attrib.get("name"))):
            continue
        children.append(
            build_option_node(
                NodeInfo(node_info.document, child),
                index,
                visited=visited,
                depth=depth + 1,
                max_depth=max_depth,
            )
        )
    for link in get_direct_children(element, "entryLinks", "entryLink"):
        if not should_follow_entry_link(link):
            continue
        target = resolve_link_target(link, index)
        if target is None:
            continue
        child_data = build_option_node(
            target,
            index,
            visited=visited,
            depth=depth + 1,
            max_depth=max_depth,
        )
        child_data = copy.deepcopy(child_data)
        link_name = clean_text(link.attrib.get("name"))
        if link_name and link_name != child_data.get("name"):
            child_data["baseName"] = child_data.get("name")
            child_data["name"] = link_name
        link_constraints = extract_constraints(link)
        if link_constraints:
            child_data["linkConstraints"] = link_constraints
        link_modifiers = extract_modifiers(link)
        if link_modifiers:
            child_data["linkModifiers"] = link_modifiers
        children.append(child_data)

    if children:
        data["children"] = children

    visited.remove(visit_key)
    return data


def build_options(entry: NodeInfo, index: Index) -> List[Dict[str, Any]]:
    element = entry.element
    options: List[Dict[str, Any]] = []
    for group in get_direct_children(element, "selectionEntryGroups", "selectionEntryGroup"):
        if is_meta_name(clean_text(group.attrib.get("name"))):
            continue
        options.append(build_option_node(NodeInfo(entry.document, group), index))
    for child in get_direct_children(element, "selectionEntries", "selectionEntry"):
        if is_meta_name(clean_text(child.attrib.get("name"))):
            continue
        options.append(build_option_node(NodeInfo(entry.document, child), index))
    for link in get_direct_children(element, "entryLinks", "entryLink"):
        if not should_follow_entry_link(link):
            continue
        target = resolve_link_target(link, index)
        if target is None:
            continue
        option = build_option_node(target, index)
        option = copy.deepcopy(option)
        link_name = clean_text(link.attrib.get("name"))
        if link_name and link_name != option.get("name"):
            option["baseName"] = option.get("name")
            option["name"] = link_name
        link_constraints = extract_constraints(link)
        if link_constraints:
            option["linkConstraints"] = link_constraints
        link_modifiers = extract_modifiers(link)
        if link_modifiers:
            option["linkModifiers"] = link_modifiers
        options.append(option)
    return options


def build_selection_node(
    node_info: NodeInfo,
    index: Index,
    visited: Optional[Set[Tuple[str, str]]] = None,
    depth: int = 0,
    max_depth: int = 6,
) -> Dict[str, Any]:
    if visited is None:
        visited = set()
    kind = node_info.element.tag
    node_id = node_info.element.attrib.get("id", f"{kind}-{depth}")
    visit_key = (kind, node_id)
    if visit_key in visited:
        return {"kind": kind, "id": node_id, "name": clean_text(node_info.element.attrib.get("name")), "cycle": True}
    if depth > max_depth:
        return {"kind": kind, "id": node_id, "name": clean_text(node_info.element.attrib.get("name")), "truncated": True}

    visited.add(visit_key)
    element = node_info.element

    data: Dict[str, Any] = {
        "kind": kind,
        "id": node_id,
        "name": clean_text(element.attrib.get("name")),
        "hidden": parse_bool(element.attrib.get("hidden")),
        "sourceDocument": node_info.document.name,
    }
    if kind == "selectionEntry":
        data["type"] = clean_text(element.attrib.get("type"))
        collective = parse_bool(element.attrib.get("collective"))
        if collective is not None:
            data["collective"] = collective
        default_amount = coerce_scalar(element.attrib.get("defaultAmount"))
        if default_amount not in (None, ""):
            data["defaultAmount"] = default_amount
    if kind == "selectionEntryGroup":
        default_selection = element.attrib.get("defaultSelectionEntryId")
        if default_selection:
            data["defaultSelectionEntryId"] = default_selection

    costs = extract_costs(element)
    if costs:
        data["costs"] = costs
    constraints = extract_constraints(element)
    if constraints:
        data["constraints"] = constraints
    modifiers = extract_modifiers(element)
    if modifiers:
        data["modifiers"] = modifiers
    categories = extract_categories(element)
    if categories:
        data["categories"] = categories
    profiles = extract_profiles(element)
    if profiles:
        data["profiles"] = profiles
    linked_profiles = build_linked_profiles(element, index)
    if linked_profiles:
        data["linkedProfiles"] = linked_profiles
    rules = extract_direct_rules(element)
    if rules:
        data["rules"] = rules
    linked_rules = build_linked_rules(element, index)
    if linked_rules:
        data["linkedRules"] = linked_rules

    children: List[Dict[str, Any]] = []
    for group in get_direct_children(element, "selectionEntryGroups", "selectionEntryGroup"):
        group_name = clean_text(group.attrib.get("name"))
        if is_meta_name(group_name):
            continue
        children.append(
            build_selection_node(
                NodeInfo(node_info.document, group),
                index,
                visited=visited,
                depth=depth + 1,
                max_depth=max_depth,
            )
        )
    for child in get_direct_children(element, "selectionEntries", "selectionEntry"):
        child_name = clean_text(child.attrib.get("name"))
        if is_meta_name(child_name):
            continue
        children.append(
            build_selection_node(
                NodeInfo(node_info.document, child),
                index,
                visited=visited,
                depth=depth + 1,
                max_depth=max_depth,
            )
        )
    for link in get_direct_children(element, "entryLinks", "entryLink"):
        if not should_follow_entry_link(link):
            continue
        target = resolve_link_target(link, index)
        if target is None:
            continue
        link_data: Dict[str, Any] = {
            "kind": "entryLink",
            "id": link.attrib.get("id"),
            "name": clean_text(link.attrib.get("name")),
            "type": clean_text(link.attrib.get("type")),
            "targetId": link.attrib.get("targetId"),
            "hidden": parse_bool(link.attrib.get("hidden")),
        }
        link_constraints = extract_constraints(link)
        if link_constraints:
            link_data["constraints"] = link_constraints
        link_modifiers = extract_modifiers(link)
        if link_modifiers:
            link_data["modifiers"] = link_modifiers
        link_data["target"] = build_selection_node(
            target,
            index,
            visited=visited,
            depth=depth + 1,
            max_depth=max_depth,
        )
        children.append(link_data)

    if children:
        data["children"] = children

    visited.remove(visit_key)
    return data


def iter_tree_nodes(node: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    yield node
    target = node.get("target")
    if isinstance(target, dict):
        yield from iter_tree_nodes(target)
    for child in node.get("children", []):
        yield from iter_tree_nodes(child)


def dedupe_dicts(items: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: Set[str] = set()
    unique: List[Dict[str, Any]] = []
    for item in items:
        key = json.dumps(item, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def summarize_tree(tree: Dict[str, Any]) -> Dict[str, Any]:
    profiles: List[Dict[str, Any]] = []
    rule_names: Set[str] = set()
    for node in iter_tree_nodes(tree):
        for profile in node.get("profiles", []):
            profiles.append(profile)
        for profile in node.get("linkedProfiles", []):
            profiles.append(profile)
        for rule in node.get("rules", []):
            rule_name = clean_text(rule.get("name"))
            if rule_name:
                rule_names.add(rule_name)
        for rule in node.get("linkedRules", []):
            rule_name = clean_text(rule.get("name"))
            if rule_name:
                rule_names.add(rule_name)

    profiles = dedupe_dicts(profiles)

    stats = [profile for profile in profiles if profile.get("typeName") == "Unit"]
    abilities = [profile for profile in profiles if profile.get("typeName") == "Abilities"]
    weapons = [
        profile
        for profile in profiles
        if profile.get("typeName") in {"Ranged Weapons", "Melee Weapons"}
    ]
    transports = [profile for profile in profiles if profile.get("typeName") == "Transport"]

    root_categories = tree.get("categories", [])
    category_names = [category["name"] for category in root_categories if category.get("name")]
    primary_category = next((category["name"] for category in root_categories if category.get("primary")), None)

    return {
        "points": tree.get("costs", {}).get(POINTS_COST_NAME),
        "primaryCategory": primary_category,
        "categories": category_names,
        "stats": stats,
        "abilities": abilities,
        "weapons": weapons,
        "transport": transports,
        "rules": sorted(rule_names),
        "constraints": tree.get("constraints", []),
        "modifiers": tree.get("modifiers", []),
    }


def is_datasheet_export(unit: Dict[str, Any]) -> bool:
    summary = unit["summary"]
    name = clean_text(unit["name"])
    if is_meta_name(name):
        return False
    node_type = clean_text(unit.get("selectionType"))
    has_stats = len(summary["stats"]) > 0
    has_points = summary["points"] is not None
    if node_type not in {"unit", "model"} and not has_stats:
        return False
    if not has_stats and not has_points:
        return False
    return True


def collect_root_entries(
    document: DocumentInfo,
    index: Index,
    visited_documents: Optional[Set[str]] = None,
) -> List[Tuple[Optional[ET.Element], NodeInfo]]:
    if visited_documents is None:
        visited_documents = set()
    if document.document_id in visited_documents:
        return []
    visited_documents.add(document.document_id)

    root_entries: List[Tuple[Optional[ET.Element], NodeInfo]] = []
    for entry in get_direct_children(document.root, "selectionEntries", "selectionEntry"):
        entry_id = entry.attrib.get("id")
        if not entry_id:
            continue
        node = index.selection_entries.get(entry_id)
        if node is not None:
            root_entries.append((None, node))
    for entry_link in get_direct_children(document.root, "entryLinks", "entryLink"):
        if entry_link.attrib.get("type") != "selectionEntry":
            continue
        target = resolve_link_target(entry_link, index)
        if target is not None:
            root_entries.append((entry_link, target))
    for catalogue_link in get_direct_children(document.root, "catalogueLinks", "catalogueLink"):
        if parse_bool(catalogue_link.attrib.get("importRootEntries")) is not True:
            continue
        linked_document = index.catalogues.get(catalogue_link.attrib.get("targetId", ""))
        if linked_document is None:
            continue
        root_entries.extend(collect_root_entries(linked_document, index, visited_documents))
    return root_entries


def get_repo_commit(source_dir: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(source_dir), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return ""
    return result.stdout.strip()


def get_repo_timestamp(source_dir: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(source_dir), "log", "-1", "--format=%cI"],
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return ""
    return result.stdout.strip()


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")


def export_catalogue(document: DocumentInfo, index: Index) -> Dict[str, Any]:
    units: List[Dict[str, Any]] = []
    seen_keys: Set[Tuple[str, str]] = set()

    for root_link, entry in collect_root_entries(document, index):
        display_name = clean_text(root_link.attrib.get("name")) if root_link is not None else clean_text(entry.element.attrib.get("name"))
        tree = build_selection_node(entry, index)
        unit = {
            "id": entry.element.attrib.get("id"),
            "name": display_name or clean_text(entry.element.attrib.get("name")),
            "baseName": clean_text(entry.element.attrib.get("name")),
            "sourceDocument": entry.document.name,
            "selectionType": clean_text(entry.element.attrib.get("type")),
            "tree": tree,
        }
        if root_link is not None:
            unit["entryLink"] = {
                "id": root_link.attrib.get("id"),
                "name": clean_text(root_link.attrib.get("name")),
                "hidden": parse_bool(root_link.attrib.get("hidden")),
                "modifiers": extract_modifiers(root_link),
                "constraints": extract_constraints(root_link),
            }
        unit["summary"] = summarize_tree(tree)
        unit["options"] = build_options(entry, index)
        if not is_datasheet_export(unit):
            continue
        unit_key = (unit["name"], unit["id"])
        if unit_key in seen_keys:
            continue
        seen_keys.add(unit_key)
        units.append(unit)

    units.sort(key=lambda item: item["name"])
    return {
        "catalogue": {
            "id": document.document_id,
            "name": document.name,
            "revision": document.revision,
            "sourceFile": document.path.name,
        },
        "units": units,
    }


def build_index_file(faction_exports: List[Dict[str, Any]], source_commit: str, source_timestamp: str) -> Dict[str, Any]:
    factions = []
    for export in faction_exports:
        catalogue = export["catalogue"]
        slug = slugify(catalogue["name"])
        factions.append(
            {
                "id": catalogue["id"],
                "name": catalogue["name"],
                "revision": catalogue["revision"],
                "sourceFile": catalogue["sourceFile"],
                "slug": slug,
                "unitCount": len(export["units"]),
                "path": f"factions/{slug}.json",
            }
        )
    factions.sort(key=lambda item: item["name"])
    return {
        "source": {
            "name": DATASET_NAME,
            "repo": DATASET_REPO,
            "commit": source_commit,
            "sourceTimestamp": source_timestamp,
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "factions": factions,
    }


def ensure_output_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if FACTIONS_DIR.exists():
        shutil.rmtree(FACTIONS_DIR)
    FACTIONS_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    if not SOURCE_DIR.exists():
        raise SystemExit(f"Missing BSData source directory: {SOURCE_DIR}")

    ensure_output_dirs()
    index = build_index(SOURCE_DIR)
    source_commit = get_repo_commit(SOURCE_DIR)
    source_timestamp = get_repo_timestamp(SOURCE_DIR)

    faction_exports: List[Dict[str, Any]] = []
    for document in sorted(index.catalogues.values(), key=lambda item: item.name):
        if document.library:
            continue
        export = export_catalogue(document, index)
        faction_exports.append(export)
        file_name = slugify(document.name) + ".json"
        write_json(FACTIONS_DIR / file_name, export)
        print(f"exported {document.name}: {len(export['units'])} units")

    write_json(OUTPUT_DIR / "index.json", build_index_file(faction_exports, source_commit, source_timestamp))
    print(f"wrote {len(faction_exports)} faction files to {FACTIONS_DIR}")


if __name__ == "__main__":
    main()
