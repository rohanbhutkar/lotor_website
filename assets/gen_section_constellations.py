#!/usr/bin/env python3
"""Emit HTML fragments for section constellation panels (Hipparcos + FAB, same projection as build_hip_layer).

Run from repo root:  python3 assets/gen_section_constellations.py > assets/generated/section_constellations_fragment.html

Then paste or include into index.html (or wire a build step).
"""
from __future__ import annotations

import html
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / "hipparcos_cache.tsv"

VB_X0, VB_Y0 = -380.0, -240.0
VB_W, VB_H = 2680.0, 1680.0
CONTENT_ZOOM = 1.24
CX, CY = 353.28, 553.33  # from current hipparcos_celestial.svg hipparcos-map-scale
LINE_STROKE = "#805E27"
STAR_PATH = "M 0,-1.08 L 0.2,-0.2 L 1,0 L 0.2,0.2 L 0,1.08 L -0.2,0.2 L -1,0 L -0.2,-0.2 Z"
BASE_SCALE = 2.35  # boost for section panels vs main sky


def ffloat(s: str) -> float | None:
    s = (s or "").strip()
    if not s or s == "?":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_tsv(text: str) -> dict[int, dict[str, str]]:
    lines = text.splitlines()
    header: list[str] | None = None
    by_hip: dict[int, dict[str, str]] = {}
    for line in lines:
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        parts = line.split("\t")
        if header is None:
            header = [p.strip() for p in parts]
            continue
        row = {header[i]: (parts[i].strip() if i < len(parts) else "") for i in range(len(header))}
        try:
            hip = int(row["HIP"].strip())
        except (ValueError, KeyError):
            continue
        by_hip[hip] = row
    return by_hip


def project(ra_deg: float, dec_deg: float) -> tuple[float, float]:
    ra = ra_deg % 360.0
    x = VB_X0 + (ra / 360.0) * VB_W
    y = VB_Y0 + ((90.0 - dec_deg) / 180.0) * VB_H
    return x, y


def unwrap_ra(ra1: float, ra2: float) -> float:
    d = (ra2 - ra1 + 180.0) % 360.0 - 180.0
    return ra1 + d


def bake(x: float, y: float) -> tuple[float, float]:
    return (
        CX + (x - CX) * CONTENT_ZOOM,
        CY + (y - CY) * CONTENT_ZOOM,
    )


STAR_GOLD = "#d6b277"


def bv_to_star_fill(bv: float | None) -> str:
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
    if vmag <= 0.5:
        return 2.07
    vmax = 7.12
    if vmag >= vmax:
        return 0.57
    t = (vmax - vmag) / (vmax - 0.5)
    return 0.57 + t * t * 1.5


def hip_xy(by_hip: dict[int, dict[str, str]], hip: int) -> tuple[float, float] | None:
    row = by_hip.get(hip)
    if not row:
        return None
    ra = ffloat(row.get("_RA.icrs", "")) or ffloat(row.get("RAICRS", ""))
    dec = ffloat(row.get("_DE.icrs", "")) or ffloat(row.get("DEICRS", ""))
    if ra is None or dec is None:
        return None
    return project(ra, dec)


def hip_meta(by_hip: dict[int, dict[str, str]], hip: int) -> tuple[float, float | None, float | None]:
    row = by_hip.get(hip)
    if not row:
        return 99.0, None, None
    vmag = ffloat(row.get("Vmag", "")) or 99.0
    bv = ffloat(row.get("B-V", ""))
    return vmag, bv, None


def line_segment_baked(
    by_hip: dict[int, dict[str, str]], a: int, b: int
) -> tuple[tuple[float, float], tuple[float, float]] | None:
    ra = ffloat(by_hip[a].get("_RA.icrs", "")) or ffloat(by_hip[a].get("RAICRS", ""))
    deca = ffloat(by_hip[a].get("_DE.icrs", "")) or ffloat(by_hip[a].get("DEICRS", ""))
    rb = ffloat(by_hip[b].get("_RA.icrs", "")) or ffloat(by_hip[b].get("RAICRS", ""))
    decb = ffloat(by_hip[b].get("_DE.icrs", "")) or ffloat(by_hip[b].get("DEICRS", ""))
    if None in (ra, deca, rb, decb):
        return None
    rb = unwrap_ra(ra, rb)
    x1, y1 = project(ra, deca)
    x2, y2 = project(rb, decb)
    return bake(x1, y1), bake(x2, y2)


# --- Section configs: tree edges only (no crossing Hunter’s bow); labels map HIP -> HTML slug ---
# Work: Orion belt + shoulders + Rigel as a tree
WORK_TREE = [
    (24436, 25930),  # Rigel - Mintaka
    (25930, 26311),  # Mintaka - Alnilam
    (26311, 26727),  # Alnilam - Alnitak
    (26727, 27989),  # Alnitak - Betelgeuse
    (25930, 25336),  # Mintaka - Bellatrix
]
WORK_LABELS = {
    27989: ("foundation", "Architecting the foundation", "Core clinical and regulatory strategy—protocol optimization, endpoints, SoA."),
    25336: ("lifecycle", "Drive lifecycle value", "Ongoing evidence and stakeholder engagement through the lifecycle."),
    24436: ("access", "Translate for access", "RWE and value stories aligned with payer priorities."),
    25930: ("ai", "Enabling advanced AI / ML", "Enterprise agentic workflows for evidence—not demos."),
}

# Intro: Canis Major — Sirius hub (FAB: Sirius–Adhara–Wezen branch to Muliphein)
INTRO_TREE = [
    (32349, 33977),
    (33977, 34444),
    (32349, 33579),
    (32349, 33347),
]
INTRO_LABELS = {
    32349: ("hero", "Evidence without a borrowed map", "Regulatory, clinical, access, and RWE—aligned when precedent runs out."),
    34444: ("cta1", "", '<a class="btn btn-primary" href="#contact">Get in touch</a>'),
    33579: ("cta2", "", '<a class="btn btn-ghost" href="#work">See what we do</a>'),
}

# Context: Monoceros small tree
WHY_TREE = [
    (34769, 30419),
    (30419, 29151),
    (34769, 30867),
    (30867, 29651),
]
WHY_LABELS = {
    34769: ("w1", "Rules shift", "What cleared last cycle may not frame the next dialogue."),
    30419: ("w2", "Evidence is distributed", "Endpoints, RWE, and partners must read as one thread."),
    29151: ("w3", "Misalignment is costly", "Strategy and evidence need to match from day one."),
    29651: ("w0", "No template, no spare shots", "Design the story and studies—not someone else’s playbook."),
}

# Quals: Leo sickle subset (tree)
QUALS_TREE = [
    (57632, 54879),
    (54879, 54872),
    (54872, 50335),
    (50335, 48455),
]
QUALS_LABELS = {
    57632: ("q1", "De Novo · first-in-class PDT", "Pathway, evidence package, three-trial synthesis, investor-ready narrative."),
    54879: ("q2", "Trial → payer value", "Unified story; EQ-5D / QALY / ICER crosswalk for access."),
    54872: ("q3", "Rare disease · pre-launch", "Burden, RWE, KOL targeting, PIE-facing medical affairs."),
    50335: ("q4", "Rare disease · post-launch", "Specialty pharmacy, claims / ML, payer and MA evidence."),
    48455: ("q5", "BD diligence", "End-to-end asset view, models, executive go / no-go."),
}

# Team: Castor–Pollux via FAB hub (HIP 35550)
TEAM_TREE = [(32362, 35350), (35350, 35550), (35550, 37826)]
TEAM_LABELS = {
    32362: (
        "michelle",
        "Michelle Guo",
        "Co-founder &amp; CEO · Clinical R&amp;D portfolio leadership, Deloitte. UChicago, Yale.<br />"
        '<a href="mailto:michelle@lotorlab.com">michelle@lotorlab.com</a> · '
        '<a href="tel:+16103894218">+1 610-389-4218</a> · '
        '<a href="https://www.linkedin.com/in/michellelguo/" rel="noopener noreferrer">LinkedIn</a>',
    ),
    37826: (
        "rohan",
        "Rohan Bhutkar",
        "Co-founder &amp; CTO · Lead engineer Clinical R&amp;D, Deloitte. McGill, Imperial.<br />"
        '<a href="mailto:rohan@lotorlab.com">rohan@lotorlab.com</a> · '
        '<a href="tel:+19178901984">+1 917-890-1984</a> · '
        '<a href="https://www.linkedin.com/in/rohan-bhutkar/" rel="noopener noreferrer">LinkedIn</a>',
    ),
}

# Contact: Canis Minor
CONTACT_TREE = [(37279, 36188)]
CONTACT_LABELS = {
    37279: (
        "email1",
        "Michelle",
        '<a class="btn btn-primary btn-email" href="mailto:michelle@lotorlab.com">michelle@lotorlab.com</a><br />'
        "<span>Clinical strategy, access, and program leadership.</span>",
    ),
    36188: (
        "email2",
        "Rohan",
        '<a class="btn btn-primary btn-email" href="mailto:rohan@lotorlab.com">rohan@lotorlab.com</a><br />'
        "<span>Engineering, AI/ML evidence systems, and technical diligence.</span>",
    ),
}


def collect_hips(tree: list[tuple[int, int]]) -> set[int]:
    s: set[int] = set()
    for a, b in tree:
        s.add(a)
        s.add(b)
    return s


def bbox_baked(
    by_hip: dict[int, dict[str, str]], hips: set[int], pad: float = 52.0
) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    for hip in hips:
        xy = hip_xy(by_hip, hip)
        if not xy:
            continue
        bx, by = bake(*xy)
        xs.append(bx)
        ys.append(by)
    if not xs:
        return 0, 0, 400, 400
    return min(xs) - pad, min(ys) - pad, max(xs) - min(xs) + 2 * pad, max(ys) - min(ys) + 2 * pad


def body_markup(body: str) -> str:
    if "<" in body:
        return f'<div class="const-label__body const-label__body--rich">{body}</div>'
    return f'<p class="const-label__body">{html.escape(body)}</p>'


def emit_section(
    sid: str,
    tree: list[tuple[int, int]],
    labels: dict[int, tuple[str, str, str]],
    by_hip: dict[int, dict[str, str]],
    title_kicker: str,
    heading: str,
    heading_id: str,
) -> str:
    star_path_id = f"lotor-star-section-{sid}"
    hips = collect_hips(tree)
    vb = bbox_baked(by_hip, hips, 58.0)
    minx, miny, vw, vh = vb

    lines_html: list[str] = []
    for a, b in tree:
        seg = line_segment_baked(by_hip, a, b)
        if not seg:
            continue
        (x1, y1), (x2, y2) = seg
        lines_html.append(
            f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" />'
        )

    stars_html: list[str] = []
    for hip in sorted(hips):
        xy = hip_xy(by_hip, hip)
        if not xy:
            continue
        bx, by = bake(*xy)
        vmag, bv, _ = hip_meta(by_hip, hip)
        sc = vmag_to_star_scale(vmag) * BASE_SCALE
        if vmag <= 2.0:
            sc *= 1.12 + max(0.0, 1.4 - vmag) * 0.12
        fill = fill_bright_star(vmag, bv)
        stroke = stroke_bright_star(vmag)
        tip = f"HIP {hip} · V≈{vmag:.2f}"
        stars_html.append(
            f'<g transform="translate({bx:.2f},{by:.2f}) scale({sc:.3f})">'
            f"<title>{html.escape(tip)}</title>"
            f'<use href="#{star_path_id}" fill="{fill}" stroke="{stroke}" '
            f'stroke-width="0.28" stroke-linejoin="miter" vector-effect="non-scaling-stroke" />'
            f"</g>"
        )

    # Leader polylines: orthogonal from label anchor toward star (in baked space)
    leaders: list[str] = []
    label_slots: list[tuple[str, str, str, str, str]] = []  # id, title, body, lx, ly class

    for hip, (slug, title, body) in labels.items():
        xy = hip_xy(by_hip, hip)
        if not xy:
            continue
        bx, by = bake(*xy)
        rel_cx = (bx - minx) / vw
        rel_cy = (by - miny) / vh
        # label position outside cluster
        if rel_cx < 0.42:
            lx, ly = minx + vw * 0.02, by
            x2, y2 = minx + vw * 0.14, by
            d = f"M {lx:.1f},{ly:.1f} L {x2:.1f},{y2:.1f} L {bx:.1f},{by:.1f}"
        elif rel_cx > 0.58:
            lx, ly = minx + vw * 0.98, by
            x2, y2 = minx + vw * 0.86, by
            d = f"M {lx:.1f},{ly:.1f} L {x2:.1f},{y2:.1f} L {bx:.1f},{by:.1f}"
        else:
            lx, ly = bx, miny + vh * 0.06
            x2, y2 = bx, miny + vh * 0.18
            d = f"M {lx:.1f},{ly:.1f} L {x2:.1f},{y2:.1f} L {bx:.1f},{by:.1f}"
        leaders.append(
            f'<path d="{d}" fill="none" stroke="{LINE_STROKE}" stroke-width="1.25" '
            f'vector-effect="non-scaling-stroke" stroke-linejoin="miter" stroke-linecap="square" />'
        )
        pos_class = "const-label--left" if rel_cx < 0.5 else "const-label--right"
        if 0.42 <= rel_cx <= 0.58 and rel_cy > 0.5:
            pos_class = "const-label--top"
        label_slots.append((slug, title, body, f"{100 * (lx - minx) / vw:.2f}%", f"{100 * (ly - miny) / vh:.2f}%", pos_class))

    hero_cls = " panel--hero" if sid == "intro" else ""
    out = [f'<!-- SECTION {sid} auto-generated -->']
    out.append(
        f'<section id="{sid}" class="panel const-section{hero_cls}" data-scroll-section="{sid}" '
        f'aria-labelledby="{heading_id}">'
    )
    inner = "panel__inner panel__inner--hero panel__inner--deck" if sid == "intro" else "panel__inner panel__inner--deck"
    if sid == "contact":
        inner += " panel__inner--narrow"
    out.append(f'  <div class="{inner}">')
    if sid == "intro":
        out.append('    <p class="section-kicker">lotor lab</p>')
        out.append(
            '    <h1 id="intro-heading">Evidence for therapies that <span class="hero-em">don&rsquo;t ship with a map.</span></h1>'
        )
    else:
        out.append(f'    <p class="section-kicker section-kicker--muted">{html.escape(title_kicker)}</p>')
        out.append(f'    <h2 id="{heading_id}" class="visually-hidden">{html.escape(heading)}</h2>')
    if sid == "quals":
        out.append(
            '    <p class="lede lede--narrow const-section__lede">Five representative proofs on the chart; we can walk through the full set.</p>'
        )
    if sid == "contact":
        out.append(
            '    <p class="lede const-section__lede">Tell us what you&rsquo;re building. We read everything.</p>'
        )
    out.append(f'    <div class="const-panel" data-constellation="{sid}">')
    out.append(
        f'      <svg class="const-panel__svg" viewBox="{minx:.2f} {miny:.2f} {vw:.2f} {vh:.2f}" '
        f'preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">'
    )
    out.append("        <defs>")
    out.append(f'          <path id="{star_path_id}" d="{STAR_PATH}" />')
    out.append("        </defs>")
    out.append(
        f'        <g class="const-lines" fill="none" stroke="{LINE_STROKE}" stroke-width="1.4" '
        f'stroke-linecap="round" vector-effect="non-scaling-stroke">'
    )
    out.extend("          " + L for L in lines_html)
    out.append("        </g>")
    out.append('        <g class="const-leaders" fill="none">')
    out.extend("          " + L for L in leaders)
    out.append("        </g>")
    out.append('        <g class="const-stars">')
    out.extend("          " + L for L in stars_html)
    out.append("        </g>")
    out.append("      </svg>")
    out.append('      <div class="const-labels">')
    for slug, title, body, lxp, lyp, pclass in label_slots:
        title_html = (
            f'          <h3 class="const-label__title">{html.escape(title)}</h3>\n' if title else ""
        )
        out.append(
            f'        <div class="const-label {pclass}" style="left:{lxp};top:{lyp}" '
            f'id="const-{sid}-{slug}">\n'
            f"{title_html}"
            f"          {body_markup(body)}\n"
            f"        </div>"
        )
    out.append("      </div>")
    out.append("    </div>")
    out.append("  </div>")
    out.append("</section>")
    return "\n".join(out)


def main() -> int:
    if not CACHE.is_file():
        print("Missing hipparcos_cache.tsv", file=sys.stderr)
        return 1
    by_hip = parse_tsv(CACHE.read_text(encoding="utf-8"))

    sections: list[tuple] = [
        (
            "intro",
            INTRO_TREE,
            INTRO_LABELS,
            "Start",
            "Evidence for therapies that don’t ship with a map — lotor lab",
            "intro-heading",
        ),
        (
            "why",
            WHY_TREE,
            WHY_LABELS,
            "01 · Context",
            "No template, no spare shots",
            "why-heading",
        ),
        (
            "work",
            WORK_TREE,
            WORK_LABELS,
            "02 · Work",
            "Our constellation of capabilities",
            "work-heading",
        ),
        (
            "quals",
            QUALS_TREE,
            QUALS_LABELS,
            "03 · Proof",
            "Key qualifications",
            "quals-heading",
        ),
        (
            "team",
            TEAM_TREE,
            TEAM_LABELS,
            "04 · Team",
            "Principals",
            "team-heading",
        ),
        (
            "contact",
            CONTACT_TREE,
            CONTACT_LABELS,
            "05 · Contact",
            "Say hello",
            "contact-heading",
        ),
    ]

    print("<!-- fragment: python3 assets/gen_section_constellations.py -->")
    print("<!-- After work section: insert capabilities pq-grid before closing panel__inner (see index.html). -->")
    for sid, tree, labels, kicker, htext, hid in sections:
        print(emit_section(sid, tree, labels, by_hip, kicker, htext, hid))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
