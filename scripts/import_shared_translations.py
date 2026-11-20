"""Import literal translation maps from a Cursor localization checkout."""
import argparse
import ast
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("cursor", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
locale_path = root / "locales" / "tr.json"
locale = json.loads(locale_path.read_text(encoding="utf-8-sig"))
placeholder = re.compile(r"\$\{[^{}]+\}|\{\d+\}")

def placeholders(text):
    return sorted(placeholder.findall(text))

def python_maps(path):
    tree = ast.parse(path.read_text(encoding="utf-8-sig"))
    for statement in tree.body:
        if isinstance(statement, ast.Assign) and any(
            isinstance(target, ast.Name)
            and target.id in {"STATE_ACTION_MAP", "COMPUTED_PROP_MAP"}
            for target in statement.targets
        ):
            yield ast.literal_eval(statement.value)

maps = [
    json.loads((args.cursor / name).read_text(encoding="utf-8-sig"))
    for name in ("cursor-ui-tm.json", "nls-tm.json")
]
maps.extend(python_maps(args.cursor / "patch_tool_labels.py"))
desktop = json.loads((root / "scripts" / "desktop_full_dictionary.json").read_text(encoding="utf-8-sig"))
merged = {}
rejected = 0
for source_map in [*maps, desktop, locale.get("translations", {})]:
    for source, target in source_map.items():
        if not isinstance(target, str) or placeholders(source) != placeholders(target):
            rejected += 1
            continue
        if source != target:
            merged[source] = target
locale["translations"] = dict(sorted(merged.items()))
with locale_path.open("w", encoding="utf-8", newline="\n") as output:
    json.dump(locale, output, ensure_ascii=False, indent=2)
    output.write("\n")
print(f"Source entries: {[len(mapping) for mapping in maps]}")
print(f"Merged translations: {len(merged)}; rejected entries: {rejected}")
