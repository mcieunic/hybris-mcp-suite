#!/usr/bin/env python3
"""
Hybris knowledge indexer.

Scans a Hybris repo and emits JSON indexes:
  - extensions.json       (per extensioninfo.xml: name, path, requires, type)
  - items.json            (item types from *-items.xml)
  - beans.json            (DTOs from *-beans.xml)
  - spring-beans.json     (bean id+class from *-spring*.xml)
  - services-facades.json (Service/Facade interfaces in src/)

Usage:
  scan.py --hybris-bin /path/to/hybris/bin --out /path/to/index
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

try:
    from lxml import etree
except ImportError:
    sys.stderr.write("lxml not installed. Run: pip3 install lxml\n")
    sys.exit(1)


SECTIONS = ("platform/ext", "custom", "modules")


def _walk_follow(root: Path):
    """os.walk that follows symlinks and de-dupes by realpath."""
    seen = set()
    for dirpath, dirnames, filenames in os.walk(root, followlinks=True):
        rp = os.path.realpath(dirpath)
        if rp in seen:
            dirnames[:] = []
            continue
        seen.add(rp)
        # prune common noise
        dirnames[:] = [d for d in dirnames if d not in ("temp", "_archive", "node_modules", ".git", "build", "classes")]
        for f in filenames:
            yield Path(dirpath) / f


def find_extensions(hybris_bin: Path) -> list[dict]:
    """Return one record per extensioninfo.xml found, with section + path."""
    out = []
    for section in SECTIONS:
        root = hybris_bin / section
        if not root.is_dir():
            continue
        for info in _walk_follow(root):
            if info.name != "extensioninfo.xml":
                continue
            if "/temp/" in str(info) or "/_archive/" in str(info):
                continue
            ext_dir = info.parent
            try:
                tree = etree.parse(str(info))
            except etree.XMLSyntaxError as e:
                out.append({"path": str(ext_dir), "error": f"xml: {e}"})
                continue
            r = tree.getroot()
            ext_el = r.find("extension")
            if ext_el is None:
                continue
            name = ext_el.get("name")
            if not name:
                continue
            requires = [
                e.get("name") for e in ext_el.findall("requires-extension") if e.get("name")
            ]
            meta = {m.get("key"): m.get("value") for m in ext_el.findall("meta")}
            corejars = [c.get("jarfile") for c in ext_el.findall("coremodule")]
            webjars = [w.get("jarfile") for w in ext_el.findall("webmodule")]
            backoffice_module = ext_el.find("backoffice-module") is not None
            hmcjars = [h.get("jarfile") for h in ext_el.findall("hmcmodule")]
            kinds = []
            if corejars:
                kinds.append("core")
            if webjars:
                kinds.append("web")
            if backoffice_module:
                kinds.append("backoffice")
            if hmcjars:
                kinds.append("hmc")
            out.append(
                {
                    "name": name,
                    "section": section,
                    "path": str(ext_dir.relative_to(hybris_bin)),
                    "abs_path": str(ext_dir),
                    "requires": requires,
                    "kinds": kinds,
                    "meta": meta,
                }
            )
    out.sort(key=lambda x: (x.get("section", ""), x.get("name", "")))
    return out


def find_items(extensions: list[dict]) -> list[dict]:
    out = []
    for ext in extensions:
        if "abs_path" not in ext:
            continue
        ext_path = Path(ext["abs_path"])
        for items_xml in _walk_follow(ext_path):
            if not items_xml.name.endswith("-items.xml"):
                continue
            if "/temp/" in str(items_xml) or "/gensrc/" in str(items_xml):
                continue
            try:
                tree = etree.parse(str(items_xml))
            except etree.XMLSyntaxError:
                continue
            r = tree.getroot()
            # Strip namespace if any
            ns = re.sub(r"^\{[^}]+\}", "", r.tag)
            for itemtype in r.iter("{*}itemtype") if "}" in r.tag else r.iter("itemtype"):
                code = itemtype.get("code")
                if not code:
                    continue
                extends = itemtype.get("extends")
                deployment = itemtype.find("deployment")
                deployment_table = deployment.get("table") if deployment is not None else None
                attrs = []
                attributes = itemtype.find("attributes")
                if attributes is not None:
                    for a in attributes.findall("attribute"):
                        a_qual = a.get("qualifier")
                        a_type = a.get("type")
                        if a_qual:
                            attrs.append({"qualifier": a_qual, "type": a_type})
                out.append(
                    {
                        "code": code,
                        "extends": extends,
                        "deployment_table": deployment_table,
                        "attributes_count": len(attrs),
                        "attributes": attrs[:30],
                        "extension": ext["name"],
                        "file": str(items_xml.relative_to(ext_path)),
                    }
                )
    out.sort(key=lambda x: (x["extension"], x["code"]))
    return out


def find_beans(extensions: list[dict]) -> list[dict]:
    out = []
    for ext in extensions:
        if "abs_path" not in ext:
            continue
        ext_path = Path(ext["abs_path"])
        for beans_xml in _walk_follow(ext_path):
            if not beans_xml.name.endswith("-beans.xml"):
                continue
            if "/temp/" in str(beans_xml) or "/gensrc/" in str(beans_xml):
                continue
            try:
                tree = etree.parse(str(beans_xml))
            except etree.XMLSyntaxError:
                continue
            r = tree.getroot()
            for b in r.iter("{*}bean") if "}" in r.tag else r.iter("bean"):
                clazz = b.get("class")
                if not clazz:
                    continue
                out.append(
                    {
                        "class": clazz,
                        "extends": b.get("extends"),
                        "type": b.get("type", "bean"),
                        "extension": ext["name"],
                        "file": str(beans_xml.relative_to(ext_path)),
                    }
                )
            for e in r.iter("{*}enum") if "}" in r.tag else r.iter("enum"):
                clazz = e.get("class")
                if clazz:
                    out.append(
                        {
                            "class": clazz,
                            "type": "enum",
                            "extension": ext["name"],
                            "file": str(beans_xml.relative_to(ext_path)),
                        }
                    )
    out.sort(key=lambda x: (x["extension"], x["class"]))
    return out


SPRING_GLOB = ("*-spring.xml", "*-spring-*.xml")


def find_spring_beans(extensions: list[dict]) -> list[dict]:
    out = []
    for ext in extensions:
        if "abs_path" not in ext:
            continue
        ext_path = Path(ext["abs_path"])
        candidates = set()
        for f in _walk_follow(ext_path):
            n = f.name
            if n.endswith("-spring.xml") or (n.startswith(("spring-", )) and n.endswith(".xml")) or "-spring-" in n and n.endswith(".xml"):
                candidates.add(f)
        for spring_xml in candidates:
            if "/temp/" in str(spring_xml) or "/gensrc/" in str(spring_xml):
                continue
            try:
                tree = etree.parse(str(spring_xml))
            except etree.XMLSyntaxError:
                continue
            r = tree.getroot()
            for b in r.iter("{*}bean") if "}" in r.tag else r.iter("bean"):
                bid = b.get("id")
                clazz = b.get("class")
                if not (bid or clazz):
                    continue
                out.append(
                    {
                        "id": bid,
                        "class": clazz,
                        "parent": b.get("parent"),
                        "scope": b.get("scope"),
                        "abstract": b.get("abstract") == "true",
                        "extension": ext["name"],
                        "file": str(spring_xml.relative_to(ext_path)),
                    }
                )
    out.sort(key=lambda x: (x["extension"], x.get("id") or x.get("class") or ""))
    return out


SERVICE_FACADE_RE = re.compile(
    r"^\s*public\s+interface\s+(\w+(?:Service|Facade|Strategy|Dao|DAO|Resolver|Provider|Handler|Manager|Validator|Builder|Calculator|Converter|Populator|Notifier))\b"
)
PACKAGE_RE = re.compile(r"^\s*package\s+([\w.]+);")


def find_services_facades(extensions: list[dict]) -> list[dict]:
    out = []
    for ext in extensions:
        if "abs_path" not in ext:
            continue
        ext_path = Path(ext["abs_path"])
        src_dirs = [ext_path / "src", ext_path / "web" / "src", ext_path / "testsrc"]
        for src_dir in src_dirs:
            if not src_dir.is_dir():
                continue
            javas = [p for p in _walk_follow(src_dir) if p.suffix == ".java"]
            for java in javas:
                try:
                    head = java.read_text(encoding="utf-8", errors="replace").splitlines()[:80]
                except OSError:
                    continue
                pkg = ""
                for line in head:
                    m = PACKAGE_RE.match(line)
                    if m:
                        pkg = m.group(1)
                        break
                for line in head:
                    m = SERVICE_FACADE_RE.match(line)
                    if m:
                        iface = m.group(1)
                        kind = next(
                            (
                                k
                                for k in (
                                    "Service",
                                    "Facade",
                                    "Strategy",
                                    "DAO",
                                    "Dao",
                                    "Resolver",
                                    "Provider",
                                    "Handler",
                                    "Manager",
                                    "Validator",
                                    "Builder",
                                    "Calculator",
                                    "Converter",
                                    "Populator",
                                    "Notifier",
                                )
                                if iface.endswith(k)
                            ),
                            "?",
                        )
                        out.append(
                            {
                                "interface": iface,
                                "kind": kind,
                                "package": pkg,
                                "extension": ext["name"],
                                "file": str(java.relative_to(ext_path)),
                            }
                        )
                        break
    out.sort(key=lambda x: (x["extension"], x["interface"]))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hybris-bin", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    print("Scanning extensions...", flush=True)
    exts = find_extensions(args.hybris_bin)
    (args.out / "extensions.json").write_text(json.dumps(exts, indent=2, ensure_ascii=False))
    print(f"  {len(exts)} extensions")

    print("Scanning items...", flush=True)
    items = find_items(exts)
    (args.out / "items.json").write_text(json.dumps(items, indent=2, ensure_ascii=False))
    print(f"  {len(items)} item types")

    print("Scanning beans...", flush=True)
    beans = find_beans(exts)
    (args.out / "beans.json").write_text(json.dumps(beans, indent=2, ensure_ascii=False))
    print(f"  {len(beans)} bean DTOs")

    print("Scanning spring beans...", flush=True)
    spring = find_spring_beans(exts)
    (args.out / "spring-beans.json").write_text(json.dumps(spring, indent=2, ensure_ascii=False))
    print(f"  {len(spring)} spring beans")

    print("Scanning services/facades...", flush=True)
    sf = find_services_facades(exts)
    (args.out / "services-facades.json").write_text(json.dumps(sf, indent=2, ensure_ascii=False))
    print(f"  {len(sf)} service/facade interfaces")

    summary = {
        "extensions": len(exts),
        "items": len(items),
        "beans": len(beans),
        "spring_beans": len(spring),
        "services_facades": len(sf),
    }
    (args.out / "summary.json").write_text(json.dumps(summary, indent=2))
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
