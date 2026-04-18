#!/usr/bin/env python3
"""Emit Hipparcos-backed sky: assets/hipparcos_celestial.svg.

Zoomed star field: Orion family (CMi CMa Ori Tau Gem Aur Lep Mon Col Cnc) plus Hydra, Leo,
Eridanus, Pyxis, Puppis, Sextans, Lynx, Leo Minor, Crater — western .fab abbreviations in NEIGHBOR_ABBREV.

Catalogue: ESA Hipparcos (1997), VizieR I/239/hip_main — J2000 (_RA.icrs, _DE.icrs), V, B−V, π, μ.
Stick figures: constellationship.fab (GPL-2.0+, Stellarium / derivatives).

Refresh VizieR dump (~15 MB):
  curl -sL 'https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=I/239/hip_main&-out.max=120000' \\
    -o assets/hipparcos_cache.tsv

Then:  python3 assets/build_hip_layer.py

Index constellation panels (CMa, Ori, Leo, CMi) should match this output: line endpoints and
star positions are copied from assets/hipparcos_celestial.svg map space (constellationship.fab).
Regenerate panel snippets with:  python3 assets/extract_const_panels.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FAB_PATH = HERE / "constellationship.fab"
CACHE_PATH = HERE / "hipparcos_cache.tsv"
CELESTIAL_SVG_PATH = HERE / "hipparcos_celestial.svg"
SKY_MANIFEST_PATH = HERE.parent / "sky-manifest.json"


def write_sky_manifest(
    vx: float, vy: float, vw: float, vh: float, pivot_cx: float, pivot_cy: float
) -> None:
    """Sync sky-manifest.json viewBox + mapScale (matches hipparcos-map-scale in emitted SVG)."""
    detail_focals: dict[str, object] = {}
    if SKY_MANIFEST_PATH.is_file():
        try:
            raw = json.loads(SKY_MANIFEST_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                df = raw.get("detailFocals")
                if isinstance(df, dict):
                    detail_focals = df
        except (json.JSONDecodeError, OSError):
            pass
    out = {
        "viewBox": {"x": vx, "y": vy, "w": vw, "h": vh},
        "mapScale": {"cx": pivot_cx, "cy": pivot_cy, "s": CONTENT_ZOOM},
        "detailFocals": detail_focals,
    }
    SKY_MANIFEST_PATH.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")

def svg_defs_with_sky(vx: float, vy: float, vw: float, vh: float) -> str:
    """Sky gradient + background rect use the same user-space box as the root viewBox."""
    y_top, y_bot = vy, vy + vh
    return f"""  <defs>
    <filter id="lotor-star-glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="1.65" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <linearGradient id="lotor-sky" gradientUnits="userSpaceOnUse"
        x1="{vx:.2f}" y1="{y_top:.2f}" x2="{vx:.2f}" y2="{y_bot:.2f}">
      <stop offset="0%" stop-color="#16101f" />
      <stop offset="40%" stop-color="#0e0c16" />
      <stop offset="100%" stop-color="#0a0812" />
    </linearGradient>
    <!-- Deck reference: 4-point star, vertical rays slightly longer than horizontal. -->
    <path
      id="lotor-star-4"
      d="M 0,-1.08 L 0.2,-0.2 L 1,0 L 0.2,0.2 L 0,1.08 L -0.2,0.2 L -1,0 L -0.2,-0.2 Z"
    />
    <style>
      @media (prefers-reduced-motion: no-preference) {{
        .lotor-tw-a {{ animation: lotorTw 6.5s ease-in-out infinite; }}
        .hip-star--pulse {{ animation: lotorTw 9s ease-in-out infinite 0.5s; }}
      }}
      @keyframes lotorTw {{
        0%, 100% {{ opacity: 0.55; }}
        50% {{ opacity: 1; }}
      }}
    </style>
  </defs>
  <rect x="{vx:.2f}" y="{vy:.2f}" width="{vw:.2f}" height="{vh:.2f}" fill="url(#lotor-sky)" />
"""

VB_X0, VB_Y0 = -380.0, -240.0
VB_W, VB_H = 2680.0, 1680.0

# Western skyculture abbreviations (constellationship.fab tokens).
# Core Orion area + Mon/Cnc + Hydra/Leo/Eri + Pyx/Pup/Sex/Lyn/LMi/Crt.
NEIGHBOR_ABBREV: frozenset[str] = frozenset(
    {
        "CMi",
        "CMa",
        "Ori",
        "Tau",
        "Gem",
        "Aur",
        "Lep",
        "Mon",
        "Cnc",
        "Col",
        "Hya",
        "Leo",
        "Eri",
        "Pyx",
        "Pup",
        "Sex",
        "Lyn",
        "LMi",
        "Crt",
    }
)

# J2000 bounds (degrees) for framing + field stars; wide enough for Leo, Hydra head/body, Eridanus (north).
REGION_RA_LO, REGION_RA_HI = 22.0, 175.0
REGION_DEC_LO, REGION_DEC_HI = -40.0, 50.0
# Include stick-figure vertices that project slightly outside the RA/Dec hull (e.g. CMa tail).
VIEWBOX_PAD = 175.0
# Zoom projected map about viewBox center so the field reads larger in the browser viewport.
CONTENT_ZOOM = 1.24
# index.html home-map-leaders: final (x,y) = cx + (xi - cx) * CONTENT_ZOOM with cx,cy = hipparcos-map-scale pivot
# (see emitted <g class="hipparcos-map-scale" transform="translate(cx,cy) scale(...)">).

PROCYON_HIP = 37279
# Primary star body color (requested); strokes are darker bronzes of the same hue.
STAR_GOLD = "#d6b277"
# Field stars: faint cut (was 6.45); higher = more background stars like earlier full-sky density.
# Line vertices: allow very faint HIP endpoints so stick figures stay connected.
VMAG_FIELD = 7.08
VMAG_LINE_MAX = 7.65
TOOLTIP_VMAG_MAX = 4.2


def parse_tsv(text: str) -> list[dict[str, str]]:
    lines = text.splitlines()
    header: list[str] | None = None
    rows: list[dict[str, str]] = []
    for line in lines:
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        parts = line.split("\t")
        if header is None:
            header = [p.strip() for p in parts]
            continue
        if len(parts) < 2:
            continue
        row = {header[i]: (parts[i].strip() if i < len(parts) else "") for i in range(len(header))}
        if row.get("HIP"):
            rows.append(row)
    return rows


def ffloat(s: str) -> float | None:
    s = s.strip()
    if not s or s == "?":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def load_segments(allowed_abbrevs: frozenset[str]) -> tuple[set[int], list[tuple[int, int]]]:
    hips: set[int] = set()
    segs: list[tuple[int, int]] = []
    for raw in FAB_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 3:
            continue
        abbrev = parts[0]
        if abbrev not in allowed_abbrevs:
            continue
        n = int(parts[1])
        ids = [int(parts[i]) for i in range(2, 2 + 2 * n)]
        for i in range(0, len(ids) - 1, 2):
            a, b = ids[i], ids[i + 1]
            hips.add(a)
            hips.add(b)
            segs.append((a, b))
    return hips, segs


def in_region(ra_deg: float, dec_deg: float) -> bool:
    ra = ra_deg % 360.0
    return REGION_RA_LO <= ra <= REGION_RA_HI and REGION_DEC_LO <= dec_deg <= REGION_DEC_HI


def region_viewbox_projected() -> tuple[float, float, float, float]:
    corners = (
        (REGION_RA_LO, REGION_DEC_LO),
        (REGION_RA_HI, REGION_DEC_LO),
        (REGION_RA_HI, REGION_DEC_HI),
        (REGION_RA_LO, REGION_DEC_HI),
    )
    xs: list[float] = []
    ys: list[float] = []
    for ra, dec in corners:
        x, y = project(ra, dec)
        xs.append(x)
        ys.append(y)
    p = VIEWBOX_PAD
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    return (minx - p, miny - p, maxx - minx + 2 * p, maxy - miny + 2 * p)


def bv_to_star_fill(bv: float | None) -> str:
    """Tints of STAR_GOLD; cool stars slightly lighter, very red stars a touch deeper."""
    if bv is None:
        return STAR_GOLD
    if bv < -0.08:
        return "#e8d5a8"
    if bv < 0.15:
        return "#e2c995"
    if bv < 0.45:
        return STAR_GOLD
    if bv < 0.85:
        return "#c9a068"
    if bv < 1.2:
        return "#b8925a"
    return "#a67f4a"


def stroke_for_star(_bv: float | None) -> str:
    return "#6b4a28"


def fill_bright_star(vmag: float, bv: float | None) -> str:
    if vmag < -0.2:
        return "#ffffff"
    if vmag < 0.4:
        return "#faf4e8"
    if vmag < 0.9:
        return "#f0e0c0"
    if vmag < 1.35:
        return STAR_GOLD
    return bv_to_star_fill(bv)


def stroke_bright_star(vmag: float) -> str:
    if vmag < 0.4:
        return "#c9a24d"
    if vmag < 1.35:
        return "#8a6238"
    return "#6b4a28"


def vmag_to_star_scale(vmag: float) -> float:
    """Scale for #lotor-star-4 (unit ~1); ~1.5× previous sizes for visibility."""
    if vmag <= 0.5:
        return 2.07
    vmax = 7.12
    if vmag >= vmax:
        return 0.57
    t = (vmax - vmag) / (vmax - 0.5)
    return 0.57 + t * t * 1.5


def vmag_to_opacity(vmag: float) -> float:
    if vmag <= 2.0:
        return 1.0
    faint_floor, faint_start = 0.78, 7.12
    if vmag >= faint_start:
        return faint_floor
    if vmag >= 6.2:
        hi = 0.92
        return faint_floor + (faint_start - vmag) / (faint_start - 6.2) * (hi - faint_floor)
    return min(1.0, 1.0 - (vmag - 2.0) * 0.038)


def fmt_title(
    hip: int,
    vmag: float | None,
    bv: float | None,
    plx: float | None,
    eplx: float | None,
    pmra: float | None,
    pmde: float | None,
) -> str:
    bits = [f"HIP {hip}"]
    if vmag is not None:
        bits.append(f"V={vmag:.2f}")
    if bv is not None:
        bits.append(f"B−V={bv:+.2f}")
    if plx is not None and plx > 0:
        if eplx is not None and eplx > 0:
            bits.append(f"π={plx:.1f}±{eplx:.1f} mas")
        else:
            bits.append(f"π={plx:.1f} mas")
    if pmra is not None and pmde is not None:
        bits.append(f"μ={pmra:.0f},{pmde:.0f} mas/yr")
    return " · ".join(bits)


def project(ra_deg: float, dec_deg: float) -> tuple[float, float]:
    ra = ra_deg % 360.0
    x = VB_X0 + (ra / 360.0) * VB_W
    y = VB_Y0 + ((90.0 - dec_deg) / 180.0) * VB_H
    return x, y


def unwrap_ra(ra1: float, ra2: float) -> float:
    d = (ra2 - ra1 + 180.0) % 360.0 - 180.0
    return ra1 + d


def main() -> int:
    if not FAB_PATH.is_file():
        print(f"Missing {FAB_PATH}", file=sys.stderr)
        return 1
    if not CACHE_PATH.is_file():
        print(f"Missing {CACHE_PATH}", file=sys.stderr)
        print(
            "Download Hipparcos (~15 MB) into that path, then re-run:\n"
            "  curl -fSL 'https://vizier.cds.unistra.fr/viz-bin/asu-tsv?"
            "-source=I/239/hip_main&-out.max=120000' "
            f"-o {CACHE_PATH}",
            file=sys.stderr,
        )
        return 1

    line_hips, segments = load_segments(NEIGHBOR_ABBREV)
    rows = parse_tsv(CACHE_PATH.read_text(encoding="utf-8"))
    by_hip: dict[int, dict[str, str]] = {}
    for row in rows:
        try:
            hip = int(row["HIP"].strip())
        except (ValueError, KeyError):
            continue
        by_hip[hip] = row

    viewbox = region_viewbox_projected()
    vx, vy, vw, vh = viewbox
    vb_w = vw
    cx = vx + vw * 0.5
    cy = vy + vh * 0.5

    selected: set[int] = set()
    for hip in line_hips:
        row = by_hip.get(hip)
        if not row:
            continue
        vmag = ffloat(row.get("Vmag", "")) or 99.0
        if vmag <= VMAG_LINE_MAX:
            selected.add(hip)
    for hip, row in by_hip.items():
        ra = ffloat(row.get("_RA.icrs", "")) or ffloat(row.get("RAICRS", ""))
        dec = ffloat(row.get("_DE.icrs", "")) or ffloat(row.get("DEICRS", ""))
        if ra is None or dec is None:
            continue
        if not in_region(ra, dec):
            continue
        vmag = ffloat(row.get("Vmag", ""))
        if vmag is not None and vmag <= VMAG_FIELD:
            selected.add(hip)

    p: list[str] = []
    p.append(
        f"  <!-- Hipparcos J2000; CMi CMa Ori Tau Gem + Aur Lep Mon Cnc Col. "
        f"Field V≤{VMAG_FIELD} in RA[{REGION_RA_LO},{REGION_RA_HI}]° Dec[{REGION_DEC_LO},{REGION_DEC_HI}]°. -->\n"
        f'  <g class="hipparcos-root" aria-hidden="true">\n'
        f'    <g class="hipparcos-map-scale" transform="translate({cx:.2f},{cy:.2f}) '
        f"scale({CONTENT_ZOOM}) translate({-cx:.2f},{-cy:.2f})\">\n"
    )
    # Stick figures: single style (mid between former default and CMa highlight).
    p.append(
        '    <g class="hipparcos-lines" fill="none" stroke="#b19971" '
        'stroke-width="1.32" stroke-dasharray="1.75 8.75" stroke-linecap="round" '
        'stroke-linejoin="round" opacity="0.6" vector-effect="non-scaling-stroke">\n'
    )
    for a, b in segments:
        if a not in by_hip or b not in by_hip:
            continue
        ra1 = ffloat(by_hip[a].get("_RA.icrs", "")) or ffloat(by_hip[a].get("RAICRS", ""))
        dec1 = ffloat(by_hip[a].get("_DE.icrs", "")) or ffloat(by_hip[a].get("DEICRS", ""))
        ra2 = ffloat(by_hip[b].get("_RA.icrs", "")) or ffloat(by_hip[b].get("RAICRS", ""))
        dec2 = ffloat(by_hip[b].get("_DE.icrs", "")) or ffloat(by_hip[b].get("DEICRS", ""))
        if None in (ra1, dec1, ra2, dec2):
            continue
        ra2u = unwrap_ra(ra1, ra2)
        x1, y1 = project(ra1, dec1)
        x2, y2 = project(ra2u, dec2)
        if abs(x1 - x2) > vb_w * 0.92:
            continue
        p.append(f'      <line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" />\n')
    p.append("    </g>\n")

    dim: list[tuple[float, str]] = []
    bright: list[str] = []

    for hip in sorted(selected):
        if hip == PROCYON_HIP:
            continue
        row = by_hip.get(hip)
        if not row:
            continue
        ra = ffloat(row.get("_RA.icrs", "")) or ffloat(row.get("RAICRS", ""))
        dec = ffloat(row.get("_DE.icrs", "")) or ffloat(row.get("DEICRS", ""))
        if ra is None or dec is None:
            continue
        vmag = ffloat(row.get("Vmag", "")) or 6.5
        bv = ffloat(row.get("B-V", ""))
        plx = ffloat(row.get("Plx", ""))
        eplx = ffloat(row.get("e_Plx", ""))
        pmra = ffloat(row.get("pmRA", ""))
        pmde = ffloat(row.get("pmDE", ""))
        x, y = project(ra, dec)
        sc = vmag_to_star_scale(vmag)
        op = vmag_to_opacity(vmag)
        title = fmt_title(hip, vmag, bv, plx, eplx, pmra, pmde) if vmag <= TOOLTIP_VMAG_MAX else ""
        t_el = f"<title>{title}</title>" if title else ""

        if vmag <= 2.0:
            sc_m = sc * (1.18 + max(0.0, 1.4 - vmag) * 0.23)
            bf = fill_bright_star(vmag, bv)
            stk_m = stroke_bright_star(vmag)
            sw = 0.36 if vmag < 0.5 else 0.27
            glow = "" if vmag > 1.65 else ' filter="url(#lotor-star-glow)"'
            bright.append(
                f'        <g class="hip-star hip-star--major hip-star--pulse" '
                f'transform="translate({x:.2f},{y:.2f}) scale({sc_m:.3f})">{t_el}'
                f'<use href="#lotor-star-4" fill="{bf}" stroke="{stk_m}" stroke-width="{sw:.2f}" '
                f'stroke-linejoin="miter" vector-effect="non-scaling-stroke" data-hip="{hip}"'
                f'{glow} /></g>\n'
            )
        else:
            fill = bv_to_star_fill(bv)
            stk = stroke_for_star(bv)
            dim.append(
                (
                    vmag,
                    f'        <g class="hip-star hip-star--dim" transform="translate({x:.2f},{y:.2f}) scale({sc:.3f})" '
                    f'opacity="{op:.3f}">{t_el}'
                    f'<use href="#lotor-star-4" fill="{fill}" stroke="{stk}" stroke-width="0.26" '
                    f'stroke-linejoin="miter" vector-effect="non-scaling-stroke" data-hip="{hip}" /></g>\n',
                )
            )

    dim.sort(key=lambda t: t[0], reverse=True)
    p.append(
        '    <g class="hipparcos-stars" fill="none" stroke="none" vector-effect="non-scaling-stroke">\n'
    )
    for _, s in dim:
        p.append(s)
    for s in bright:
        p.append(s)
    p.append("    </g>\n")

    if PROCYON_HIP in by_hip:
        r = by_hip[PROCYON_HIP]
        ra = ffloat(r.get("_RA.icrs", "")) or ffloat(r.get("RAICRS", ""))
        dec = ffloat(r.get("_DE.icrs", "")) or ffloat(r.get("DEICRS", ""))
        if ra is not None and dec is not None:
            x, y = project(ra, dec)
            tip = fmt_title(
                PROCYON_HIP,
                ffloat(r.get("Vmag", "")),
                ffloat(r.get("B-V", "")),
                ffloat(r.get("Plx", "")),
                ffloat(r.get("e_Plx", "")),
                ffloat(r.get("pmRA", "")),
                ffloat(r.get("pmDE", "")),
            )
            p.append(
                f'    <g class="hipparcos-procyon" transform="translate({x:.2f},{y:.2f})">\n'
                f"      <title>{tip}</title>\n"
                '      <rect x="-10" y="-10" width="20" height="20" fill="none" '
                'stroke="#5b5b8c" stroke-width="1" opacity="0.95" vector-effect="non-scaling-stroke" />\n'
                '      <g class="lotor-tw-a" transform="scale(1.48)">\n'
                f'        <use href="#lotor-star-4" fill="#ffffff" stroke="{STAR_GOLD}" stroke-width="0.26" '
                'stroke-linejoin="miter" vector-effect="non-scaling-stroke" filter="url(#lotor-star-glow)" />\n'
                "      </g>\n"
                '      <text class="hipparcos-procyon-label" x="14" y="0" dominant-baseline="middle" '
                'text-anchor="start" font-style="italic" font-weight="400" font-size="12" '
                f'fill="{STAR_GOLD}" font-family="Times New Roman, Times, Georgia, serif" '
                'paint-order="stroke fill" stroke="#0a0812" stroke-width="0.35" '
                'vector-effect="non-scaling-stroke" opacity="0.96">Procyon</text>\n'
                "    </g>\n"
            )

    p.append("    </g>\n  </g>\n")
    fragment = "".join(p)
    doc = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" class="celestial-svg" '
        f'viewBox="{vx:.2f} {vy:.2f} {vw:.2f} {vh:.2f}" preserveAspectRatio="xMidYMid slice" '
        'aria-hidden="true" focusable="false">\n'
        + svg_defs_with_sky(vx, vy, vw, vh)
        + fragment
        + "\n</svg>\n"
    )
    CELESTIAL_SVG_PATH.write_text(doc, encoding="utf-8")
    write_sky_manifest(vx, vy, vw, vh, cx, cy)
    print(
        f"Wrote {CELESTIAL_SVG_PATH} ({len(selected)} stars, {len(segments)} line segments)",
        file=sys.stderr,
    )
    print(f"Wrote {SKY_MANIFEST_PATH} (viewBox + detailFocals)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
