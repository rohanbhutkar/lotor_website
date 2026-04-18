#!/usr/bin/env python3
"""Build assets/qual_const_paths.json: FAB stick figures in qual-sheet SVG space + star leader lines.

  python3 assets/build_qual_const_layers.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FAB_PATH = HERE / "constellationship.fab"
TSV_PATH = HERE / "hipparcos_cache.tsv"
MANIFEST_PATH = ROOT / "sky-manifest.json"
OUT_PATH = HERE / "qual_const_paths.json"

VB_X0, VB_Y0 = -380.0, -240.0
VB_W, VB_H = 2680.0, 1680.0
MAX_DX = 420.0

# Familiar names for leader lines (HIP catalogue)
HIP_LABELS: dict[int, str] = {
    # Orion
    27989: "Betelgeuse",
    24436: "Rigel",
    25336: "Bellatrix",
    26727: "Alnitak",
    27913: "Alnilam",
    25930: "Mintaka",
    27366: "Saiph",
    # Taurus
    21421: "Aldebaran",
    25428: "Alcyone",
    # Gemini
    37826: "Pollux",
    36850: "Castor",
    # Leo
    54449: "Regulus",
    49669: "Denebola",
    54879: "Algieba",
    # CMa
    32349: "Sirius",
    33579: "Adhara",
    30324: "Mirzam",
    # Auriga
    24608: "Capella",
    28360: "Menkalinan",
    28380: "Hassaleh",
    # Lepus
    25985: "Arneb",
    28910: "Nihal",
    # Monoceros
    30867: "18 Mon",
    34769: "13 Mon",
    # Cancer
    42911: "Acubens",
    42806: "Asellus Borealis",
    44066: "Asellus Australis",
}

FAB_BY_SLUG: dict[str, str] = {
    "ori": "Ori",
    "tau": "Tau",
    "gem": "Gem",
    "leo": "Leo",
    "cma": "CMa",
    "aur": "Aur",
    "lep": "Lep",
    "mon": "Mon",
    "cnc": "Cnc",
}

QUAL_HTML: list[tuple[str, str, str]] = [
    ("trial-to-payer-value.html", "ori", "Orion"),
    ("rare-disease-pre-launch.html", "tau", "Taurus"),
    ("rare-disease-post-launch.html", "gem", "Gemini"),
    ("immunology-pricing-market-access.html", "leo", "Leo"),
    ("gene-therapy-pediatric-expansion.html", "cma", "Canis Major"),
    ("gene-therapy-first-in-human.html", "aur", "Auriga"),
    ("de-novo-first-in-class-pdt.html", "lep", "Lepus"),
    ("combination-therapy-evidence-lead.html", "mon", "Monoceros"),
    ("bd-diligence.html", "cnc", "Cancer"),
]


def project(ra_deg: float, dec_deg: float) -> tuple[float, float]:
    ra = ra_deg % 360.0
    x = VB_X0 + (ra / 360.0) * VB_W
    y = VB_Y0 + ((90.0 - dec_deg) / 180.0) * VB_H
    return x, y


def parse_tsv(path: Path) -> dict[int, tuple[float, float, float]]:
    out: dict[int, tuple[float, float, float]] = {}
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    header: list[str] | None = None
    for line in lines:
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        parts = line.split("\t")
        if header is None:
            header = [p.strip() for p in parts]
            continue
        row = {header[i]: (parts[i].strip() if i < len(parts) else "") for i in range(len(header))}
        hip_s = row.get("HIP", "")
        if not hip_s:
            continue
        try:
            hip = int(hip_s)
        except ValueError:
            continue
        ra = row.get("_RA.icrs", row.get("RAICRS", ""))
        de = row.get("_DE.icrs", row.get("DEICRS", ""))
        vm = row.get("Vmag", row.get("VMAG", ""))
        try:
            ra_f = float(ra)
            de_f = float(de)
        except (TypeError, ValueError):
            continue
        try:
            vm_f = float(vm)
        except (TypeError, ValueError):
            vm_f = 99.0
        out[hip] = (ra_f, de_f, vm_f)
    return out


def load_fab_segments(abbrev: str) -> list[tuple[int, int]]:
    segs: list[tuple[int, int]] = []
    for raw in FAB_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 3 or parts[0] != abbrev:
            continue
        n = int(parts[1])
        ids = [int(parts[i]) for i in range(2, 2 + 2 * n)]
        for i in range(0, len(ids) - 1, 2):
            segs.append((ids[i], ids[i + 1]))
    return segs


def map_scale_xy(x: float, y: float, cx: float, cy: float, s: float) -> tuple[float, float]:
    return cx + (x - cx) * s, cy + (y - cy) * s


def fmt_path_d(parts: list[tuple[str, float, float]]) -> str:
    return "".join(f"{cmd}{x:.2f},{y:.2f}" for cmd, x, y in parts)


def build_one(abbrev: str, hip_data: dict[int, tuple[float, float, float]], cx: float, cy: float, s: float) -> dict:
    segs = load_fab_segments(abbrev)
    if not segs:
        raise SystemExit(f"No FAB segments for {abbrev}")

    xy: dict[int, tuple[float, float]] = {}
    for a, b in segs:
        for hip in (a, b):
            if hip in xy or hip not in hip_data:
                continue
            ra, de, _ = hip_data[hip]
            px, py = project(ra, de)
            xy[hip] = map_scale_xy(px, py, cx, cy, s)

    path_parts: list[tuple[str, float, float]] = []
    for a, b in segs:
        if a not in xy or b not in xy:
            continue
        x1, y1 = xy[a]
        x2, y2 = xy[b]
        if abs(x2 - x1) > MAX_DX:
            continue
        path_parts.append(("M", x1, y1))
        path_parts.append(("L", x2, y2))

    if not path_parts:
        raise SystemExit(f"No drawable segments for {abbrev}")

    xs = [x for _, x, _ in path_parts]
    ys = [y for _, _, y in path_parts]
    pad = 32.0
    minx, maxx = min(xs) - pad, max(xs) + pad
    miny, maxy = min(ys) - pad, max(ys) + pad
    w, h = maxx - minx, maxy - miny

    def norm(x: float, y: float) -> tuple[float, float]:
        return x - minx, y - miny

    d_parts = [(cmd, *norm(x, y)) for cmd, x, y in path_parts]

    hip_set: set[int] = set()
    for a, b in segs:
        if a not in xy or b not in xy:
            continue
        x1, y1 = xy[a]
        x2, y2 = xy[b]
        if abs(x2 - x1) > MAX_DX:
            continue
        hip_set.add(a)
        hip_set.add(b)

    labeled = [hip for hip in hip_set if hip in HIP_LABELS and hip in hip_data]
    labeled.sort(key=lambda h: hip_data[h][2])

    leaders: list[dict[str, float | str]] = []
    placed: list[tuple[float, float]] = []
    for i, hip in enumerate(labeled[:8]):
        sx, sy = norm(*xy[hip])
        name = HIP_LABELS[hip]
        side = 1 if i % 2 == 0 else -1
        tx = sx + side * 52.0
        ty = sy - 6 + (i // 2) * 11
        for _ in range(5):
            hit = any(abs(tx - px) < 48 and abs(ty - py) < 12 for px, py in placed)
            if not hit:
                break
            ty += 14
        placed.append((tx, ty))
        x2, y2 = tx - side * 4, ty - 2
        leaders.append(
            {
                "x1": round(sx, 2),
                "y1": round(sy, 2),
                "x2": round(x2, 2),
                "y2": round(y2, 2),
                "tx": round(tx, 2),
                "ty": round(ty, 2),
                "text": name,
            }
        )

    return {
        "vb": f"0 0 {w:.2f} {h:.2f}",
        "d": fmt_path_d(d_parts),
        "leaders": leaders,
    }


def patch_qual_html(quals_dir: Path, data: dict[str, dict]) -> None:
    for fname, slug, display in QUAL_HTML:
        p = quals_dir / fname
        if not p.is_file():
            print(f"skip missing {p}", file=sys.stderr)
            continue
        layer = data[slug]
        vb = layer["vb"]
        d = layer["d"]
        leaders = layer.get("leaders") or []
        lines_svg = [
            '                        <path class="qual-sheet__const-line" fill="none" d="' + d + '" />',
        ]
        for L in leaders:
            lines_svg.append(
                f'                        <line class="qual-sheet__const-leader" x1="{L["x1"]}" y1="{L["y1"]}" x2="{L["x2"]}" y2="{L["y2"]}" />'
            )
        for L in leaders:
            lines_svg.append(
                f'                        <text class="qual-sheet__const-label" x="{L["tx"]}" y="{L["ty"]}">{L["text"]}</text>'
            )
        inner_svg = "\n".join(lines_svg)

        text = p.read_text(encoding="utf-8")
        text = re.sub(
            r'<html lang="en" class="page-qual" data-qual-const="[^"]*">',
            f'<html lang="en" class="page-qual" data-qual-const="{slug}">',
            text,
            count=1,
        )
        # foreignObject: name only, no tag
        text = re.sub(
            r'<p class="qual-sky-fo__name">[^<]*</p>',
            f'<p class="qual-sky-fo__name">{display}</p>',
            text,
            count=1,
        )
        text = re.sub(r'\s*<p class="qual-sky-fo__tag">[^<]*</p>\s*\n?', "\n", text, count=1)

        svg_block = re.search(
            r'(<svg\s+[^>]*class="qual-sheet__const-arc"[^>]*>\s*)([\s\S]*?)(\s*</svg>)',
            text,
        )
        if not svg_block:
            print(f"no svg in {p}", file=sys.stderr)
            continue
        new_open = re.sub(
            r'viewBox="[^"]*"',
            f'viewBox="{vb}"',
            svg_block.group(1),
            count=1,
        )
        text = text[: svg_block.start()] + new_open + "\n" + inner_svg + svg_block.group(3) + text[svg_block.end() :]

        # Remove section kicker, hello-actions, simplify hidden heading
        text = re.sub(
            r'\s*<p class="section-kicker section-kicker--muted">Qualification</p>\s*\n',
            "\n",
            text,
            count=1,
        )
        text = re.sub(
            r'\s*<p class="hello-actions qual-sheet__hello-actions">[\s\S]*?</p>\s*\n',
            "\n",
            text,
            count=1,
        )
        text = re.sub(
            r'<h2 class="visually-hidden" id="qual-sky-h">[^<]*</h2>',
            '<h2 class="visually-hidden" id="qual-sky-h">Capability map</h2>',
            text,
            count=1,
        )

        p.write_text(text, encoding="utf-8")
        print("patched", fname)


def main() -> int:
    if not FAB_PATH.is_file() or not TSV_PATH.is_file():
        print("Missing FAB or TSV", file=sys.stderr)
        return 1
    hip_data = parse_tsv(TSV_PATH)
    raw = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    ms = raw.get("mapScale") or {}
    cx = float(ms.get("cx", 353.28))
    cy = float(ms.get("cy", 553.33))
    sc = float(ms.get("s", 1.24))

    out: dict[str, object] = {}
    for slug, abbrev in FAB_BY_SLUG.items():
        out[slug] = build_one(abbrev, hip_data, cx, cy, sc)

    OUT_PATH.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH}")

    patch_qual_html(ROOT / "quals", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
