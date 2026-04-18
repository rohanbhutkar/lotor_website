#!/usr/bin/env python3
"""Emit world-space geometry for index.html const panels from constellationship.fab + Hipparcos cache.

Coordinates match assets/hipparcos_celestial.svg (region viewBox + map-scale transform).
Run from repo root: python3 assets/extract_const_panels.py
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

spec = importlib.util.spec_from_file_location("bh", HERE / "build_hip_layer.py")
bh = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(bh)

FAB_PATH = HERE / "constellationship.fab"
CACHE_PATH = HERE / "hipparcos_cache.tsv"


def fab_segments(abbrev: str) -> list[tuple[int, int]]:
    for raw in FAB_PATH.read_text(encoding="utf-8").splitlines():
        parts = raw.split()
        if len(parts) < 3 or parts[0] != abbrev:
            continue
        n = int(parts[1])
        ids = [int(parts[i]) for i in range(2, 2 + 2 * n)]
        out: list[tuple[int, int]] = []
        for i in range(0, len(ids), 2):
            out.append((ids[i], ids[i + 1]))
        return out
    raise SystemExit(f"No fab entry for {abbrev}")


def load_cache() -> dict[int, dict[str, str]]:
    rows = bh.parse_tsv(CACHE_PATH.read_text(encoding="utf-8"))
    by_hip: dict[int, dict[str, str]] = {}
    for row in rows:
        try:
            by_hip[int(row["HIP"])] = row
        except (ValueError, KeyError):
            continue
    return by_hip


def world_xy(px: float, py: float) -> tuple[float, float]:
    vb = bh.region_viewbox_projected()
    vx, vy, vw, vh = vb
    cx, cy = vx + vw * 0.5, vy + vh * 0.5
    return cx + bh.CONTENT_ZOOM * (px - cx), cy + bh.CONTENT_ZOOM * (py - cy)


def hip_world(hip: int, by_hip: dict[int, dict[str, str]]) -> tuple[float, float] | None:
    row = by_hip.get(hip)
    if not row:
        return None
    ra = bh.ffloat(row.get("_RA.icrs", "")) or bh.ffloat(row.get("RAICRS", ""))
    dec = bh.ffloat(row.get("_DE.icrs", "")) or bh.ffloat(row.get("DEICRS", ""))
    if ra is None or dec is None:
        return None
    px, py = bh.project(ra, dec)
    return world_xy(px, py)


def segment_line_world(
    a: int, b: int, by_hip: dict[int, dict[str, str]], vb_w: float
) -> tuple[tuple[float, float], tuple[float, float]] | None:
    ra = bh.ffloat(by_hip[a].get("_RA.icrs", "")) or bh.ffloat(by_hip[a].get("RAICRS", ""))
    dec1 = bh.ffloat(by_hip[a].get("_DE.icrs", "")) or bh.ffloat(by_hip[a].get("DEICRS", ""))
    ra2 = bh.ffloat(by_hip[b].get("_RA.icrs", "")) or bh.ffloat(by_hip[b].get("RAICRS", ""))
    dec2 = bh.ffloat(by_hip[b].get("_DE.icrs", "")) or bh.ffloat(by_hip[b].get("DEICRS", ""))
    if None in (ra, dec1, ra2, dec2):
        return None
    ra2u = bh.unwrap_ra(ra, ra2)
    x1, y1 = bh.project(ra, dec1)
    x2, y2 = bh.project(ra2u, dec2)
    if abs(x1 - x2) > vb_w * 0.92:
        return None
    w1 = world_xy(x1, y1)
    w2 = world_xy(x2, y2)
    return w1, w2


def star_markup(hip: int, by_hip: dict[int, dict[str, str]], path_id: str) -> str:
    row = by_hip[hip]
    ra = bh.ffloat(row.get("_RA.icrs", "")) or bh.ffloat(row.get("RAICRS", ""))
    dec = bh.ffloat(row.get("_DE.icrs", "")) or bh.ffloat(row.get("DEICRS", ""))
    if ra is None or dec is None:
        return ""
    wx, wy = world_xy(*bh.project(ra, dec))
    vmag = bh.ffloat(row.get("Vmag", "")) or 6.5
    bv = bh.ffloat(row.get("B-V", ""))
    sc = bh.vmag_to_star_scale(vmag)
    if vmag <= 2.0:
        sc_m = sc * (1.18 + max(0.0, 1.4 - vmag) * 0.23)
        fill = bh.fill_bright_star(vmag, bv)
        stroke = bh.stroke_bright_star(vmag)
        sw = 0.28
    else:
        sc_m = sc * 1.15
        fill = bh.bv_to_star_fill(bv)
        stroke = fill
        sw = 0.28
    tip = f"HIP {hip} · V≈{vmag:.2f}" if vmag <= 6 else f"HIP {hip}"
    return (
        f'          <g transform="translate({wx:.2f},{wy:.2f}) scale({sc_m:.3f})">'
        f"<title>{tip}</title>"
        f'<use href="#{path_id}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" '
        f'stroke-linejoin="miter" vector-effect="non-scaling-stroke" /></g>\n'
    )


def panel_for(abbrev: str, path_id: str, pad: float = 95.0) -> None:
    by_hip = load_cache()
    segs = fab_segments(abbrev)
    vb = bh.region_viewbox_projected()
    vb_w = vb[2]

    xs: list[float] = []
    ys: list[float] = []
    lines_out: list[str] = []

    for a, b in segs:
        if a not in by_hip or b not in by_hip:
            continue
        sl = segment_line_world(a, b, by_hip, vb_w)
        if not sl:
            continue
        (x1, y1), (x2, y2) = sl
        xs.extend([x1, x2])
        ys.extend([y1, y2])
        lines_out.append(
            f'          <line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" />'
        )

    hips = set()
    for a, b in segs:
        hips.add(a)
        hips.add(b)

    for h in hips:
        p = hip_world(h, by_hip)
        if p:
            xs.append(p[0])
            ys.append(p[1])

    if not xs:
        print(f"<!-- {abbrev}: no geometry -->", file=sys.stderr)
        return

    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    minx -= pad
    miny -= pad
    maxx += pad
    maxy += pad
    vw, vh = maxx - minx, maxy - miny

    print(f"\n<!-- ========== {abbrev} ========== -->")
    print(f'viewBox="{minx:.2f} {miny:.2f} {vw:.2f} {vh:.2f}"')
    print("<g class=\"const-lines\" fill=\"none\">")
    for ln in lines_out:
        print(ln)
    print("</g>")
    print("<g class=\"const-stars\">")
    for h in sorted(hips):
        if h not in by_hip:
            continue
        print(star_markup(h, by_hip, path_id).rstrip())
    print("</g>")
    print("<!-- key world positions -->")
    for h in sorted(hips):
        p = hip_world(h, by_hip)
        if p:
            print(f"  HIP {h}: {p[0]:.2f}, {p[1]:.2f}")


def main() -> int:
    if not CACHE_PATH.is_file():
        print("Missing hipparcos_cache.tsv — run build_hip_layer download step.", file=sys.stderr)
        return 1
    for ab, pid in (
        ("CMa", "lotor-star-section-intro"),
        ("Ori", "lotor-star-section-work"),
        ("Leo", "lotor-star-section-quals"),
        ("CMi", "lotor-star-section-contact"),
    ):
        panel_for(ab, pid)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
