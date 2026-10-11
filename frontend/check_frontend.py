"""
check_frontend.py - will the frontend BUILD with the Live Sensors + Learning & Accuracy files? (run BEFORE git push)

  python check_frontend.py            # run from your project root (the folder that contains frontend/)
  python check_frontend.py path/to/frontend

A frontend build that fails keeps the OLD site online, which looks exactly like "I deployed it and nothing changed".
This catches the usual causes without needing npm: missing files, imports that point at a file that does not exist,
names imported from api/client.js that it does not export, and missing routes / sidebar links.
Exit code 0 = OK, 1 = problems (listed).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REQUIRED = [
    "App.jsx", "api/client.js", "hooks/useSafePolling.js", "hooks/usePolling.js",
    "utils/sensorData.js", "utils/dashboardLoader.js", "utils/learningConfig.js",
    "components/Sidebar.jsx", "components/LiveSensorCard.jsx", "components/SelfHealingStatus.jsx", "components/PipelineFlow.jsx",
    "components/Topbar.jsx", "components/TrustBar.jsx", "components/StatusBadge.jsx",
    "pages/LiveSensors.jsx", "pages/Learning.jsx", "pages/Overview.jsx", "pages/SelfHealing.jsx",
]
# files written by the update - their imports are verified
CHECK_IMPORTS = [
    "App.jsx", "hooks/useSafePolling.js", "utils/sensorData.js", "utils/dashboardLoader.js", "utils/learningConfig.js",
    "components/Sidebar.jsx", "components/LiveSensorCard.jsx", "components/SelfHealingStatus.jsx", "components/PipelineFlow.jsx",
    "pages/LiveSensors.jsx", "pages/Learning.jsx", "pages/Overview.jsx", "pages/SelfHealing.jsx",
]
IMPORT_RE = re.compile(r'import\s+(?:(?P<what>[^;]*?)\s+from\s+)?["\'](?P<src>[^"\']+)["\']', re.S)
EXPORT_RE = re.compile(r"export\s+(?:async\s+)?(?:const|function|class|let|var)\s+([A-Za-z0-9_$]+)")
EXPORT_LIST_RE = re.compile(r"export\s*\{([^}]*)\}")


def resolve(base: Path, spec: str) -> Path | None:
    p = (base.parent / spec).resolve()
    for cand in [p] + [p.with_suffix(s) for s in (".js", ".jsx", ".mjs")] + [p / "index.js", p / "index.jsx"]:
        if cand.is_file():
            return cand
    return None


def exports_of(path: Path) -> set[str]:
    txt = path.read_text(encoding="utf-8")
    names = set(EXPORT_RE.findall(txt))
    for grp in EXPORT_LIST_RE.findall(txt):
        names |= {x.split(" as ")[-1].strip() for x in grp.split(",") if x.strip()}
    return names


def check(src: Path) -> list[str]:
    problems: list[str] = []
    for rel in REQUIRED:
        if not (src / rel).is_file():
            problems.append(f"MISSING FILE: src/{rel}")
    if problems:
        return problems   # nothing else is meaningful until the files exist
    client_exports = exports_of(src / "api/client.js")
    for rel in CHECK_IMPORTS:
        f = src / rel
        txt = f.read_text(encoding="utf-8")
        for m in IMPORT_RE.finditer(txt):
            spec, what = m.group("src"), (m.group("what") or "")
            if not spec.startswith("."):
                continue
            target = resolve(f, spec)
            if target is None:
                problems.append(f"src/{rel}: imports \"{spec}\" but that file does not exist")
                continue
            if target == (src / "api/client.js").resolve():
                named = re.search(r"\{([^}]*)\}", what)
                if named:
                    for name in [x.split(" as ")[0].strip() for x in named.group(1).split(",") if x.strip()]:
                        if name not in client_exports:
                            problems.append(f"src/{rel}: imports {name} from api/client.js, which does not export it (replace api/client.js with the new one)")
    app = (src / "App.jsx").read_text(encoding="utf-8")
    side = (src / "components/Sidebar.jsx").read_text(encoding="utf-8")
    for route in ("/live-sensors", "/learning"):
        if f'path="{route}"' not in app:
            problems.append(f'src/App.jsx has no route path="{route}" (replace App.jsx with the new one)')
        if f'"{route}"' not in side:
            problems.append(f"src/components/Sidebar.jsx has no link to {route} (replace Sidebar.jsx with the new one)")
    return problems


def find_src(arg: str | None) -> Path | None:
    cands = [Path(arg)] if arg else [Path("frontend"), Path(".")]
    for c in cands:
        for s in (c / "src", c):
            if (s / "App.jsx").is_file():
                return s.resolve()
    return None


if __name__ == "__main__":
    src = find_src(sys.argv[1] if len(sys.argv) > 1 else None)
    if src is None:
        print("Cannot find frontend/src/App.jsx - run this from your project root, or pass the frontend folder.")
        sys.exit(1)
    issues = check(src)
    if issues:
        print(f"{len(issues)} problem(s) that would break the frontend build or hide the new pages:\n")
        for i in issues:
            print("   -", i)
        print("\nFix them, then run  npm run build  in the frontend folder to be sure, before git push.")
        sys.exit(1)
    print("OK: all files are present, every import resolves, api/client.js exports what the pages use, and the routes + sidebar links exist.")
    print("Next: run  npm run build  in the frontend folder (it must finish without errors), then git push.")
