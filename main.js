(function () {
  /* Defaults match sky-manifest.json after build_hip_layer.py; manifest fetch may override. */
  var SKY_W = 1489;
  var SKY_H = 1190;
  var VB_X0 = -391.22;
  var VB_Y0 = -41.67;
  var detailFocals = Object.create(null);

  /**
   * Home map + sky: edit this object only (capabilities / quals callouts, leader lines, pan/zoom).
   * sceneFrame cx/cy are overwritten from leader-line means on init unless lines are missing.
   * Horizontal pan: larger sceneFrame.*.cx or focalNudgeMap.*.cx → higher map x → nx up → sky translate −nx
   * (contact block moves left on screen). Negative cx nudges move it right.
   * On contact, scroll parallax adds to nx; if nx hits clampSkyNormals maxX, cx tweaks do nothing — use
   * scrollParallaxScene.contact.xMul < 1 (or 0) so focal cx / nudge cx matters again.
   */
  var LOTOR_HOME_MAP_TUNING = {
    zoomMax: 2.35,
    zoomMin: 0.96,
    introProcyon: { x: 474.81, y: 551.23 },
    sceneFrame: {
      capabilities: { cx: 209.53, cy: 596.0, w: 520, h: 580 },
      quals: { cx: 385.06, cy: 866.26, w: 430, h: 310 },
      /* Contact foreignObject center ~774; +cy offsets scroll parallax (applySky subtracts ny at high scrollTop). */
      contact: { cx: 734.5, cy: 848, w: 498, h: 658 },
    },
    /** Larger → zoom out (fit a bigger map patch). Per scene; `default` if id missing. */
    sceneZoomPad: { capabilities: 0.8, quals: 1.4, contact: 1.32, default: 1.2 },
    /** Map-space offset added to focal after leader centroid (cx,cy in same units as viewBox). */
    focalNudgeMap: {
      capabilities: { cx: 0, cy: 20 },
      quals: { cx: -50, cy: 120 },
      contact: { cx: -50, cy: 140 },
    },
    /**
     * Scroll parallax in applySky: nx += scrollTop * 0.034 * xMul / W, ny += scrollTop * -0.092 * yMul / H.
     * Contact is near max scroll; xMul 1 often pins nx to maxX so horizontal focal edits have no effect.
     */
    scrollParallaxScene: {
      default: { xMul: 1, yMul: 1 },
      contact: { xMul: 0.28, yMul: 1 },
    },
    leaders: {
      strokeWidth: 1.2,
      stroke: "rgba(198, 210, 235, 0.52)",
      targetLenPxMin: 72,
      targetLenPxMax: 260,
      targetLenFallbackPx: 120,
      boxEdgeYPadPx: 8,
    },
    labels: {
      maxWidthPxBase: 120,
      maxWidthPxSpread: 76,
      maxWidthPxCap: 208,
      minWidthPx: 108,
      minWidthVwCap: 28,
      padding: "0.55rem 0.72rem",
    },
    layerPadding: {
      compactRefShort: 580,
      portraitBreakPx: 40,
      tallDivisor: 1.2,
      topBase: 7,
      topCompactScale: 8,
      topTallScale: 3.2,
      wideDesktopTopAdd: 1.35,
      xBase: 7.5,
      xCompactScale: 10,
      xTallScale: 2.8,
      wideDesktopXAdd: 1.65,
      bottomBase: 12,
      bottomCompactScale: 9,
      bottomTallScale: 2.8,
      wideDesktopBottomAdd: 2,
      railPadPct: 2.75,
      wideDesktopShortMin: 700,
      wideDesktopLongMin: 880,
      headerPadPctCap: 14,
      headerPadPctMul: 0.95,
    },
    invZoomFloor: {
      min: 0.5,
      max: 0.68,
      base: 0.57,
      compactScale: 0.1,
      tallScale: 0.04,
    },
    placement: {
      horizGain: 88,
      dupSpreadCap: 5,
      dupSpreadQuals: 4.25,
      flankEpsXMapUnits: 2.5,
      capLeftBase: 21,
      capLeftClampLo: 12,
      capLeftClampHi: 36,
      capRightBase: 65,
      capRightClampLo: 54,
      capRightClampHi: 84,
      /** Mirrored about 50%: right clamps = 100 − leftHi .. 100 − leftLo (right labels anchor on right edge). */
      qualsLeftBase: 30,
      qualsLeftClampLo: 22,
      qualsLeftClampHi: 42,
      qualsRightBase: 70,
      qualsRightClampLo: 58,
      qualsRightClampHi: 78,
      /** Same horizontal spread both flanks (was 0.72 on east only). */
      qualsHorizGainScale: 1,
      qualsNLeft: 4,
      /** Leader ids forced onto the west rail; the east-most previous left star moves east to keep 4+5 split. */
      qualsForceLeftAnchorIds: ["const-quals-q7"],
      qualsEastTopNudge: 0,
      topClampLo: 8,
      topClampHi: 90,
      qualsMinVertGap: 6,
      qualsVertLo: 8,
      qualsVertHi: 90,
      constellationAvoidance: {
        capabilities: {
          padXMin: 28,
          padXMax: 62,
          padXFrac: 0.058,
          padYMin: 24,
          padYMax: 56,
          padYFrac: 0.052,
          gapXMin: 18,
          gapXMax: 46,
          gapXFrac: 0.042,
        },
        quals: {
          padXMin: 32,
          padXMax: 72,
          padXFrac: 0.068,
          padYMin: 28,
          padYMax: 62,
          padYFrac: 0.06,
          gapXMin: 20,
          gapXMax: 52,
          gapXFrac: 0.046,
        },
      },
      /**
       * 2 callouts left / 2 right by star x-sort.
       * Same absolute nudge toward 50%: left rail +inset, right rail −inset (right labels use right-edge `left`).
       * Bases/clamps below include ~⅓ closure vs 17/73 · 8–30 / 56–91 (~⅔ of prior edge-to-centre distance).
       */
      capabilities2x2: {
        nPerFlank: 2,
        leftBase: 27,
        leftClampLo: 18,
        leftClampHi: 40,
        rightBase: 73,
        rightClampLo: 48,
        rightClampHi: 82,
        /** Extra pull-in for right-anchored cards (subtract from `left` % before clamp). */
        rightFlankInsetPct: 17,
        /**
         * relaxHomeMapCallouts overlap pushes often move right-anchored boxes +left% (outward).
         * Hard-cap right edge % after relax so the east column stays tucked toward Orion.
         */
        postRelaxMaxRightEdgePct: 64,
        minVertGap: 10,
        vertLo: 11,
        vertHi: 89,
      },
    },
    relax: {
      maxDevPctCap: 20,
      maxDevPctQuals: 26,
      iterCap: 6,
      iterQuals: 8,
      hardMaxPct: 88,
      hardPasses: 22,
      sepPasses: 28,
      gapMin: 6,
      gapMax: 14,
      gapFrac: 0.014,
      pushEarlyScale: 0.55,
      pushSepScale: 0.58,
      finalGapMin: 6,
      finalGapMax: 16,
      finalGapFrac: 0.014,
    },
    safeRect: {
      marginMin: 8,
      marginMax: 32,
      marginFrac: 0.022,
      headerExtraBelow: 6,
      headerFallbackExtra: 10,
      railViewportMin: 900,
      railReserveMax: 124,
      railReserveFrac: 0.14,
      minInner: 72,
      collapseMargin: 6,
      collapseTopMax: 48,
    },
    skyClamp: {
      margin: 0.02,
      innerMin: 0.02,
      guardMax: 48,
      zCoverSlack: 1.02,
      zoomBump: 1.06,
    },
  };

  var HOME_SCENE_FRAMES = LOTOR_HOME_MAP_TUNING.sceneFrame;
  var ZOOM_MAX = LOTOR_HOME_MAP_TUNING.zoomMax;
  var HOME_MOBILE_CARD_FALLBACKS = {
    capabilities: [
      {
        href: "capabilities/payer-hta-strategy.html",
        title: "Translate for access",
        body: "RWE and value stories aligned with payer priorities.",
        more: "Open capability page",
      },
      {
        href: "capabilities/post-launch-execution.html",
        title: "Drive lifecycle value",
        body: "Ongoing evidence and stakeholder engagement through the lifecycle.",
        more: "Open capability page",
      },
      {
        href: "capabilities/clinical-program-design.html",
        title: "Architecting the foundation",
        body: "Core clinical and regulatory strategy-protocol optimization, endpoints, SoA.",
        more: "Open capability page",
      },
      {
        href: "capabilities/ai-ml-for-evidence.html",
        title: "Enabling advanced AI / ML",
        body: "Enterprise agentic workflows for evidence-not demos.",
        more: "Open capability page",
      },
    ],
    quals: [
      {
        href: "quals/de-novo-first-in-class-pdt.html",
        title: "De Novo · first-in-class PDT",
        body: "Pathway, evidence package, and investor-ready narrative.",
        more: "Open story",
      },
      {
        href: "quals/trial-to-payer-value.html",
        title: "Trial → payer value",
        body: "Unified value story and payer-facing synthesis.",
        more: "Open story",
      },
      {
        href: "quals/rare-disease-pre-launch.html",
        title: "Rare disease · pre-launch MA / RWE",
        body: "Burden, KOLs, and pre-launch medical affairs.",
        more: "Open story",
      },
      {
        href: "quals/rare-disease-post-launch.html",
        title: "Rare disease · post-launch RWE",
        body: "Specialty channels, claims, and MA evidence.",
        more: "Open story",
      },
      {
        href: "quals/bd-diligence.html",
        title: "BD · asset & clinical diligence",
        body: "End-to-end asset view and executive go / no-go.",
        more: "Open story",
      },
      {
        href: "quals/combination-therapy-evidence-lead.html",
        title: "Combination therapy · evidence lead",
        body: "Evidence strategy across combination development.",
        more: "Open story",
      },
      {
        href: "quals/immunology-pricing-market-access.html",
        title: "Immunology · pricing & access",
        body: "Pricing, access, and immunology market evidence.",
        more: "Open story",
      },
      {
        href: "quals/gene-therapy-first-in-human.html",
        title: "Gene therapy · first-in-human program",
        body: "FIH design, endpoints, and regulatory path.",
        more: "Open story",
      },
      {
        href: "quals/gene-therapy-pediatric-expansion.html",
        title: "Gene therapy · pediatric expansion",
        body: "Pediatric evidence and expansion strategy.",
        more: "Open story",
      },
    ],
  };

  function mapToNormalized(mx, my) {
    return {
      nx: (mx - VB_X0) / SKY_W,
      ny: (my - VB_Y0) / SKY_H,
    };
  }

  function sceneFocalMapXY(id) {
    var fr = HOME_SCENE_FRAMES[id];
    if (!fr) return null;
    var n = LOTOR_HOME_MAP_TUNING.focalNudgeMap[id] || { cx: 0, cy: 0 };
    var dx = Number.isFinite(n.cx) ? n.cx : 0;
    var dy = Number.isFinite(n.cy) ? n.cy : 0;
    return { cx: fr.cx + dx, cy: fr.cy + dy };
  }

  function focalNormals(id) {
    if (id === "intro") {
      var ip = LOTOR_HOME_MAP_TUNING.introProcyon;
      return mapToNormalized(ip.x, ip.y);
    }
    var p = sceneFocalMapXY(id);
    if (!p) return { nx: 0.5, ny: 0.5 };
    return mapToNormalized(p.cx, p.cy);
  }

  /**
   * Layout viewport box (w × h) for sky cover, pan clamp, safe rects, label relax, and --sky-layout-*.
   * Must stay in the same client coordinate system as `getScreenCTM()` / element `getBoundingClientRect()`.
   *
   * Order: measured fixed sky host → measured <html> → max(client, inner). We intentionally do **not**
   * use `visualViewport` size here: it is often smaller than the layout viewport that `position: fixed`
   * and the SVG use, which shrinks safe rects and mis-clamps callouts vs where nodes actually paint.
   * Rounded integers match `syncSkyLayoutViewportCssVars` and reduce subpixel drift vs CSS transforms.
   */
  function layoutViewportDimensions() {
    function fromElementRect(el) {
      if (!el || typeof el.getBoundingClientRect !== "function") return null;
      var r = el.getBoundingClientRect();
      /* >1px: real laid-out box; 80×80 was too strict and skipped narrow phones / devtools strips → bad fallbacks. */
      if (!(r.width > 1) || !(r.height > 1)) return null;
      return { w: Math.round(r.width), h: Math.round(r.height) };
    }
    var fc = document.getElementById("fixed-celestial") || document.querySelector(".fixed-celestial");
    var out = fromElementRect(fc);
    if (out) return out;
    out = fromElementRect(document.documentElement);
    if (out) return out;
    var de = document.documentElement;
    var cw = de.clientWidth || 0;
    var ch = de.clientHeight || 0;
    var iw = window.innerWidth || 0;
    var ih = window.innerHeight || 0;
    var w = Math.max(cw, iw);
    var h = Math.max(ch, ih);
    if (!(w > 0)) w = iw || cw || 320;
    if (!(h > 0)) h = ih || ch || 560;
    return { w: Math.round(w), h: Math.round(h) };
  }

  /** Pixel size JS uses for clampSkyNormals, coverScale, mapCalloutSafeRect — must match .celestial-mover pivot in CSS (not raw vw/vh). */
  function syncSkyLayoutViewportCssVars(lay) {
    lay = lay || layoutViewportDimensions();
    var root = document.documentElement;
    root.style.setProperty("--sky-layout-w", Math.max(0, Math.round(lay.w || 0)) + "px");
    root.style.setProperty("--sky-layout-h", Math.max(0, Math.round(lay.h || 0)) + "px");
  }

  /**
   * Shared viewport-driven layout tokens for home shells, panels, and overlay stacks.
   * Keeping these in one place makes the foreignObject UI respond to real viewport changes
   * instead of a mix of fixed widths and duplicated CSS clamps.
   */
  function syncViewportComponentCssVars(lay) {
    lay = lay || layoutViewportDimensions();
    var root = document.documentElement;
    var prevMapMode = root.getAttribute("data-home-map-mode") || "anchored";
    var w = Math.max(320, lay.w || 0);
    var h = Math.max(320, lay.h || 0);
    var shortSide = Math.min(w, h);
    var longSide = Math.max(w, h);
    var portrait = h > w;
    var shellInset = Math.max(16, Math.min(52, shortSide * 0.045));
    var overlayInset = Math.max(12, Math.min(30, shortSide * 0.03));
    var railReserve = w > 900 ? Math.max(56, Math.min(112, Math.round(w * 0.11))) : 0;
    var shellInlineMax = Math.min(Math.max(w - shellInset * 2 - railReserve, 272), portrait ? 860 : 980);
    var overlayInlineMax = Math.min(Math.max(w - overlayInset * 2 - railReserve, 248), portrait ? 720 : 760);
    var panelInlineMax = Math.min(Math.max(w - shellInset * 2.4 - railReserve, 280), portrait ? 820 : 980);
    var stageBlock = Math.max(240, h - headerHeightForSky());
    var panelBlockMax = Math.max(220, stageBlock - Math.max(18, shortSide * 0.04));
    var scenePadX = Math.max(16, Math.min(42, shortSide * 0.04));
    var scenePadBottom = Math.max(14, Math.min(28, shortSide * 0.032));
    var shortMapViewport = h <= 820;
    root.style.setProperty("--viewport-w", Math.round(w) + "px");
    root.style.setProperty("--viewport-h", Math.round(h) + "px");
    root.style.setProperty("--viewport-short", Math.round(shortSide) + "px");
    root.style.setProperty("--viewport-long", Math.round(longSide) + "px");
    root.style.setProperty("--home-stage-h", Math.round(stageBlock) + "px");
    root.style.setProperty("--home-scene-pad-x", Math.round(scenePadX) + "px");
    root.style.setProperty("--home-scene-pad-bottom", Math.round(scenePadBottom) + "px");

    var cardGap = Math.max(12, Math.min(22, shortSide * 0.022));
    var introShift = portrait ? 0 : Math.max(0, Math.min(18, (Math.min(longSide, 1600) - 900) / 40));
    var introShiftPx = Math.round(shellInlineMax * (introShift / 100));
    var introVista = portrait
      ? Math.max(96, Math.min(168, w * 0.12))
      : Math.max(152, Math.min(240, w * 0.14));
    var introGap = portrait ? Math.max(16, Math.min(32, shortSide * 0.045)) : Math.max(20, Math.min(52, shortSide * 0.055));
    var narrowAnchored = w <= 980 || shortSide <= 700;
    var boxMode = w <= 760 ? "stacked" : "anchored";
    var boxDensity = w <= 700 ? "compact" : "regular";
    var mapMode = w <= 700 || shortSide <= 560 ? "stacked" : "anchored";
    var mapDensity = w <= 1024 || shortMapViewport ? "compact" : "regular";
    var introLayout = w <= 980 ? "single" : "split";
    var introDensity = w <= 760 ? "compact" : "regular";
    var introMode = "overlay";
    var contactMode = "overlay";
    if (introMode !== "embedded") introShiftPx = 0;
    var capLabelMax = Math.max(168, Math.min(240, Math.round(shortSide * 0.34)));
    var capLabelMin = Math.max(122, Math.min(164, Math.round(shortSide * 0.2)));
    var narrowCapLabelMaxBlock = Math.max(172, Math.min(320, Math.round(Math.min(stageBlock * 0.42, shortSide * 0.34))));
    var qualLabelW = Math.max(156, Math.min(222, Math.round(shortSide * 0.315)));
    var qualLabelMin = Math.max(120, Math.min(156, Math.round(shortSide * 0.19)));
    var narrowQualLabelMaxBlock = Math.max(148, Math.min(252, Math.round(Math.min(stageBlock * 0.3, shortSide * 0.27))));
    root.style.setProperty("--home-shell-inline-max", Math.round(shellInlineMax) + "px");
    root.style.setProperty("--home-overlay-shell-max", Math.round(overlayInlineMax) + "px");
    root.style.setProperty("--home-panel-inline-max", Math.round(panelInlineMax) + "px");
    root.style.setProperty("--home-panel-max-block", Math.round(panelBlockMax) + "px");
    root.style.setProperty("--home-card-gap", Math.round(cardGap) + "px");
    root.style.setProperty("--home-overlay-shell-pad", Math.round(Math.max(10, overlayInset)) + "px");
    root.style.setProperty("--home-rail-reserve", railReserve + "px");
    root.style.setProperty("--home-cap-label-max-px", capLabelMax + "px");
    root.style.setProperty("--home-cap-label-min-px", capLabelMin + "px");
    root.style.setProperty("--home-cap-label-max-block", narrowCapLabelMaxBlock + "px");
    root.style.setProperty("--home-qual-label-w-px", qualLabelW + "px");
    root.style.setProperty("--home-qual-label-min-px", qualLabelMin + "px");
    root.style.setProperty("--home-qual-label-max-block", narrowQualLabelMaxBlock + "px");
    root.style.setProperty("--intro-procyon-shift", round4(introShiftPx) + "px");
    root.style.setProperty("--intro-vista-w", Math.round(introVista) + "px");
    root.style.setProperty("--intro-col-gap", Math.round(introGap) + "px");
    root.setAttribute("data-home-box-mode", boxMode);
    root.setAttribute("data-home-box-density", boxDensity);
    root.setAttribute("data-home-map-mode", mapMode);
    root.setAttribute("data-home-map-density", mapDensity);
    root.setAttribute("data-home-box-band", narrowAnchored ? "narrow" : "regular");
    root.setAttribute("data-home-intro-layout", introLayout);
    root.setAttribute("data-home-intro-density", introDensity);
    root.setAttribute("data-home-intro-mode", introMode);
    root.setAttribute("data-home-contact-mode", contactMode);
    if (prevMapMode !== mapMode) {
      markHomeMapCalloutDirty("capabilities");
      markHomeMapCalloutDirty("quals");
    }
  }

  function round4(x) {
    return Math.round(x * 10000) / 10000;
  }

  var ACCESS_CODE = "yungbae";
  var ACCESS_SESSION_KEY = "lotor-access-granted-session";

  function readSessionAccessGranted() {
    try {
      return !!(window.sessionStorage && window.sessionStorage.getItem(ACCESS_SESSION_KEY) === "true");
    } catch (e) {
      return false;
    }
  }

  function persistSessionAccessGranted() {
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(ACCESS_SESSION_KEY, "true");
    } catch (e) {}
  }

  function initAccessGate() {
    var root = document.documentElement;
    if (!root || !document.body) return;
    if (readSessionAccessGranted()) {
      root.setAttribute("data-access-state", "granted");
      return;
    }
    root.setAttribute("data-access-state", "locked");

    if (document.querySelector(".access-gate")) return;

    var navBrand = document.querySelector(".nav-brand");
    var mark = document.querySelector(".nav-brand__mark");
    var homeHref = (navBrand && navBrand.getAttribute("href")) || "#";
    var markSrc = (mark && mark.getAttribute("src")) || "assets/inspiration/logo-raccoon.png";

    var gate = document.createElement("section");
    gate.className = "access-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "access-gate-title");
    gate.innerHTML =
      '<div class="access-gate__panel">' +
      '<a class="access-gate__brand" href="' +
      homeHref +
      '" aria-label="lotor lab home">' +
      '<img class="access-gate__mark" src="' +
      markSrc +
      '" alt="" width="56" height="56" decoding="async" />' +
      '<span><span class="access-gate__eyebrow">Private Access</span><span class="access-gate__brand-name brand-mark">lotor lab</span></span>' +
      "</a>" +
      '<form class="access-gate__form" novalidate>' +
      '<input id="access-gate-input" class="access-gate__field" name="code" type="password" autocomplete="current-password" spellcheck="false" placeholder="Enter code" />' +
      '<div class="access-gate__actions">' +
      '<button class="btn btn-ghost access-gate__submit" type="submit">Enter site</button>' +
      '<p class="access-gate__error" aria-live="polite"></p>' +
      "</div>" +
      "</form>" +
      "</div>";

    document.body.appendChild(gate);

    var form = gate.querySelector("form");
    var input = gate.querySelector(".access-gate__field");
    var error = gate.querySelector(".access-gate__error");

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if ((input.value || "") === ACCESS_CODE) {
        persistSessionAccessGranted();
        root.setAttribute("data-access-state", "granted");
        gate.remove();
        var main = document.getElementById("main");
        if (main && typeof main.focus === "function") main.focus();
        return;
      }
      error.textContent = "That code didn't match. Please try again.";
      input.select();
    });

    window.setTimeout(function () {
      if (input && typeof input.focus === "function") input.focus();
    }, 40);
  }

  var y = document.getElementById("y");
  if (y) y.textContent = new Date().getFullYear();

  var lotorHome = document.documentElement.classList.contains("lotor-home");
  var pageQual = document.documentElement.classList.contains("page-qual");
  initAccessGate();

  function homeScrollRoot() {
    return lotorHome ? document.getElementById("home-scrollport") : null;
  }

  /** ScrollTop that matches a section snapped to the top of #home-scrollport — used so parallax matches real viewing. */
  function parallaxScrollTopForHomeScene(sceneId) {
    var root = homeScrollRoot();
    if (!root || !sceneId) return 0;
    var el = document.getElementById(sceneId);
    if (!el) return 0;
    return Math.max(0, el.offsetTop);
  }

  function coverScaleFromLayout(lay) {
    lay = lay || layoutViewportDimensions();
    return Math.max((lay.w || 0) / SKY_W, (lay.h || 0) / SKY_H);
  }

  function coverScale() {
    return coverScaleFromLayout();
  }

  function roundToDevicePixel(x) {
    var n = Number.isFinite(x) ? x : 0;
    var dpr = window.devicePixelRatio || 1;
    if (!(dpr > 0)) dpr = 1;
    return Math.round(n * dpr) / dpr;
  }

  var fixedCelestial = document.getElementById("fixed-celestial");
  var mover = document.querySelector(".celestial-mover");
  var reduceMotionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduceMotion = reduceMotionMq.matches;

  var ZOOM_MAX = 2.35;

  function applySkyMapSize() {
    if (!fixedCelestial) return;
    fixedCelestial.style.setProperty("--sky-map-w", SKY_W + "px");
    fixedCelestial.style.setProperty("--sky-map-h", SKY_H + "px");
    fixedCelestial.setAttribute("data-sky-map-w", String(SKY_W));
    fixedCelestial.setAttribute("data-sky-map-h", String(SKY_H));
  }

  /** Mean (x1,y1) per leader line — matches Orion (4 lines) and CMa (9 lines, stars may repeat). */
  function applyLeaderLineSceneFocals() {
    if (!fixedCelestial) return;
    function avgLines(groupSel) {
      var g = fixedCelestial.querySelector(groupSel);
      if (!g) return null;
      var lines = g.querySelectorAll("line");
      var sx = 0;
      var sy = 0;
      var n = 0;
      for (var i = 0; i < lines.length; i++) {
        var x1 = parseFloat(lines[i].getAttribute("x1"));
        var y1 = parseFloat(lines[i].getAttribute("y1"));
        if (Number.isFinite(x1) && Number.isFinite(y1)) {
          sx += x1;
          sy += y1;
          n++;
        }
      }
      return n ? { cx: sx / n, cy: sy / n } : null;
    }
    var cap = avgLines(".home-cap-leaders");
    if (cap) {
      HOME_SCENE_FRAMES.capabilities.cx = cap.cx;
      HOME_SCENE_FRAMES.capabilities.cy = cap.cy;
    }
    var qu = avgLines(".home-quals-leaders");
    if (qu) {
      HOME_SCENE_FRAMES.quals.cx = qu.cx;
      HOME_SCENE_FRAMES.quals.cy = qu.cy;
    }
  }

  function measureZoomForSection(id) {
    if (id === "intro") return 1;
    var fr = HOME_SCENE_FRAMES[id];
    if (!fr) return 1.18;
    var lay = layoutViewportDimensions();
    var C = coverScaleFromLayout(lay);
    var vw = Math.max(200, lay.w || 0);
    var vh = Math.max(200, lay.h || 0);
    var zp = LOTOR_HOME_MAP_TUNING.sceneZoomPad;
    var pad = zp[id] != null ? zp[id] : zp.default;
    /* Fit fr.w × fr.h (map units) in the layout viewport; visible span ≈ viewport / (C·z). */
    var zW = vw / (C * fr.w * pad);
    var zH = vh / (C * fr.h * pad);
    var zFit = Math.min(zW, zH);
    var zMin = LOTOR_HOME_MAP_TUNING.zoomMin;
    return round4(Math.max(zMin, Math.min(ZOOM_MAX, zFit)));
  }

  function applyHomeMapLabelCssVars() {
    var lb = LOTOR_HOME_MAP_TUNING.labels;
    var root = document.documentElement;
    root.style.setProperty("--sky-map-label-min-px", lb.minWidthPx + "px");
    root.style.setProperty("--sky-map-label-min-vw-cap", lb.minWidthVwCap + "vw");
    root.style.setProperty("--sky-map-label-padding", lb.padding);
  }

  function applyHomeMapLeaderStrokeFromTuning() {
    if (!lotorHome || !fixedCelestial) return;
    var L = LOTOR_HOME_MAP_TUNING.leaders;
    var sel = ".home-cap-leaders line[data-leader-anchor], .home-quals-leaders line[data-leader-anchor]";
    var lines = fixedCelestial.querySelectorAll(sel);
    var i;
    for (i = 0; i < lines.length; i++) {
      lines[i].setAttribute("stroke-width", String(L.strokeWidth));
      lines[i].setAttribute("stroke", L.stroke);
    }
  }

  /** Padding + label caps from viewport shape (synced on resize / sky apply) */
  function syncHomeMapViewportCss() {
    if (!lotorHome || detailOpen) return;
    var lay = layoutViewportDimensions();
    syncViewportComponentCssVars(lay);
    var vw = Math.max(200, lay.w || 0);
    var vh = Math.max(200, lay.h || 0);
    var short = Math.min(vw, vh);
    var longSide = Math.max(vw, vh);
    var lp = LOTOR_HOME_MAP_TUNING.layerPadding;
    var iv = LOTOR_HOME_MAP_TUNING.invZoomFloor;
    var lb = LOTOR_HOME_MAP_TUNING.labels;
    var compact = Math.min(1, short / lp.compactRefShort);
    var portrait = vh > vw + lp.portraitBreakPx;
    var tall = portrait ? Math.min(1, (vh / Math.max(vw, 1) - 1) / lp.tallDivisor) : 0;
    tall = Math.max(0, tall);

    var wideDesktop = short > lp.wideDesktopShortMin && longSide > lp.wideDesktopLongMin;
    var railPad = wideDesktop ? lp.railPadPct : 0;
    var capTop =
      lp.topBase +
      (1 - compact) * lp.topCompactScale +
      tall * lp.topTallScale +
      (wideDesktop ? lp.wideDesktopTopAdd : 0);
    var capX =
      lp.xBase +
      (1 - compact) * lp.xCompactScale +
      tall * lp.xTallScale +
      (wideDesktop ? lp.wideDesktopXAdd : 0) +
      railPad;
    var capBot =
      lp.bottomBase + (1 - compact) * lp.bottomCompactScale + tall * lp.bottomTallScale + (wideDesktop ? lp.wideDesktopBottomAdd : 0);

    var root = document.documentElement;
    root.style.setProperty("--sky-pad-cap-top", capTop.toFixed(2) + "%");
    root.style.setProperty("--sky-pad-cap-x", capX.toFixed(2) + "%");
    root.style.setProperty("--sky-pad-cap-bottom", capBot.toFixed(2) + "%");

    var invFloor = Math.max(
      iv.min,
      Math.min(iv.max, iv.base + (1 - compact) * iv.compactScale + tall * iv.tallScale)
    );
    root.style.setProperty("--sky-map-inv-zoom-floor", String(round4(invFloor)));

    var maxPx = Math.round(Math.min(lb.maxWidthPxCap, lb.maxWidthPxBase + compact * lb.maxWidthPxSpread));
    root.style.setProperty("--sky-map-label-max-px", maxPx + "px");
    applyHomeMapLabelCssVars();
  }

  /** True after the initial hidden layout pass for capabilities & quals. */
  var homeMapCalloutsPrecomputed = false;
  var homeMapCalloutPrecomputePending = false;
  /** If fonts.ready or rAF stalls, `data-home-sky-precompute` must not leave the sky at opacity:0 forever. */
  var homePrecomputeSafetyTimer = null;
  var homeCalloutPrecomputeKickTimer = null;
  var homeMapCalloutDirty = {
    capabilities: true,
    quals: true,
  };
  var homeMapCalloutDirtyVersion = {
    capabilities: 1,
    quals: 1,
  };
  var homeMapCalloutRelayoutTimer = null;
  var homeActiveSceneLayoutTimers = [];
  var homeFixedStackLayer = null;

  function isHomeMapCalloutScene(sceneId) {
    return sceneId === "capabilities" || sceneId === "quals";
  }

  function homeMapCalloutLayoutMode() {
    return document.documentElement.getAttribute("data-home-map-mode") || "anchored";
  }

  function canLayoutHomeMapCalloutScene(sceneId) {
    return isHomeMapCalloutScene(sceneId) && homeMapCalloutLayoutMode() !== "stacked";
  }

  function markHomeMapCalloutDirty(sceneId) {
    if (isHomeMapCalloutScene(sceneId)) {
      homeMapCalloutDirty[sceneId] = true;
      homeMapCalloutDirtyVersion[sceneId] += 1;
      return;
    }
    homeMapCalloutDirty.capabilities = true;
    homeMapCalloutDirty.quals = true;
    homeMapCalloutDirtyVersion.capabilities += 1;
    homeMapCalloutDirtyVersion.quals += 1;
  }

  function markHomeMapCalloutClean(sceneId) {
    if (!isHomeMapCalloutScene(sceneId)) return;
    homeMapCalloutDirty[sceneId] = false;
  }

  function isHomeMapCalloutDirty(sceneId) {
    return !!(isHomeMapCalloutScene(sceneId) && homeMapCalloutDirty[sceneId]);
  }

  function cancelHomeMapCalloutRelayout() {
    if (!homeMapCalloutRelayoutTimer) return;
    clearTimeout(homeMapCalloutRelayoutTimer);
    homeMapCalloutRelayoutTimer = null;
  }

  function cancelHomeActiveSceneLayoutSyncs() {
    while (homeActiveSceneLayoutTimers.length) {
      clearTimeout(homeActiveSceneLayoutTimers.pop());
    }
  }

  function readMapLabelBase(el) {
    var unitAttr = el.getAttribute("data-base-unit");
    var bl = el.getAttribute("data-base-left");
    var bt = el.getAttribute("data-base-top");
    if (bl != null && bt != null) {
      return {
        left: parseFloat(bl),
        top: parseFloat(bt),
        unit: unitAttr === "px" ? "px" : "%",
      };
    }
    var st = el.getAttribute("style") || "";
    var lm = st.match(/left:\s*(-?[\d.]+)\s*(px|%)/);
    var tm = st.match(/top:\s*(-?[\d.]+)\s*(px|%)/);
    var unit = unitAttr === "px" || (lm && lm[2] === "px") || (tm && tm[2] === "px") ? "px" : "%";
    return {
      left: lm ? parseFloat(lm[1]) : unit === "px" ? 0 : 50,
      top: tm ? parseFloat(tm[1]) : unit === "px" ? 0 : 50,
      unit: unit,
    };
  }

  function setMapLabelPos(el, left, top, unit) {
    if (unit === "px") {
      el.style.left = round4(left) + "px";
      el.style.top = round4(top) + "px";
      return;
    }
    el.style.left = left.toFixed(2) + "%";
    el.style.top = top.toFixed(2) + "%";
  }

  function setMapLabelPct(el, left, top) {
    setMapLabelPos(el, left, top, "%");
  }

  function setMapLabelPx(el, left, top) {
    setMapLabelPos(el, left, top, "px");
  }

  function buildHomeMobileCard(labelEl) {
    if (!labelEl) return null;
    var href = typeof labelEl.getAttribute === "function" ? labelEl.getAttribute("href") : labelEl.href || null;
    var card = document.createElement(href ? "a" : "div");
    card.className = "home-mobile-card";
    if (href) {
      card.setAttribute("href", href);
    }
    var titleText = "";
    var bodyText = "";
    var moreText = "";
    var richBody = false;
    if (typeof labelEl.querySelector === "function") {
      var titleEl = labelEl.querySelector(".const-label__title");
      var bodyEl = labelEl.querySelector(".const-label__body, .const-label__body--rich");
      var moreEl = labelEl.querySelector(".const-label__more");
      titleText = titleEl ? (titleEl.textContent || "").trim() : "";
      bodyText = bodyEl ? (bodyEl.textContent || "").trim() : "";
      moreText = moreEl ? (moreEl.textContent || "").trim() : "";
      richBody = !!(bodyEl && bodyEl.classList.contains("const-label__body--rich"));
    } else {
      titleText = (labelEl.title || "").trim();
      bodyText = (labelEl.body || "").trim();
      moreText = (labelEl.more || "").trim();
      richBody = !!labelEl.richBody;
    }
    if (titleText) {
      var title = document.createElement("h3");
      title.className = "const-label__title";
      title.textContent = titleText;
      card.appendChild(title);
    }
    if (bodyText) {
      var body = document.createElement("p");
      body.className = richBody
        ? "const-label__body const-label__body--rich"
        : "const-label__body";
      body.textContent = bodyText;
      card.appendChild(body);
    }
    if (moreText) {
      var more = document.createElement("span");
      more.className = "const-label__more";
      more.textContent = moreText;
      card.appendChild(more);
    }
    return card;
  }

  var HOME_MOBILE_SCENE_META = {
    capabilities: {
      title: "Capabilities",
      lede: "Core evidence strategy, access planning, and AI-enabled execution in one responsive deck.",
    },
    quals: {
      title: "Qualifications",
      lede: "Representative programs and evidence stories organized into a layout that stays readable across viewports.",
    },
  };

  function buildHomeMobileStackHead(sceneId) {
    var meta = HOME_MOBILE_SCENE_META[sceneId];
    if (!meta) return null;
    var head = document.createElement("header");
    head.className = "home-mobile-stack__head";
    var title = document.createElement("h2");
    title.className = "home-mobile-stack__title";
    title.textContent = meta.title;
    head.appendChild(title);
    if (meta.lede) {
      var lede = document.createElement("p");
      lede.className = "home-mobile-stack__lede";
      lede.textContent = meta.lede;
      head.appendChild(lede);
    }
    return head;
  }

  function populateHomeMobileStackCards(cards, sceneId) {
    if (!cards) return 0;
    var source = document.querySelector('.home-map-const-labels[data-fo-labels="' + sceneId + '"]');
    var kids = source ? source.querySelectorAll(".home-map-const-label") : [];
    var i;
    cards.innerHTML = "";
    var head = buildHomeMobileStackHead(sceneId);
    if (head) cards.appendChild(head);
    for (i = 0; i < kids.length; i++) {
      var card = buildHomeMobileCard(kids[i]);
      if (card) cards.appendChild(card);
    }
    if (!cards.children.length) {
      var fallback = HOME_MOBILE_CARD_FALLBACKS[sceneId] || [];
      for (i = 0; i < fallback.length; i++) {
        var fallbackCard = buildHomeMobileCard(fallback[i]);
        if (fallbackCard) cards.appendChild(fallbackCard);
      }
      return fallback.length;
    }
    return kids.length;
  }

  function ensureHomeMobileStackDeck(sceneId) {
    if (!lotorHome) return null;
    if (sceneId !== "capabilities" && sceneId !== "quals") return null;
    var layer = ensureHomeFixedStackLayer();
    if (!layer) return null;
    var existing = layer.querySelector('.home-mobile-stack[data-mobile-scene="' + sceneId + '"]');
    if (existing) {
      var existingCards = existing.querySelector(".home-mobile-stack__cards");
      if (existingCards) {
        populateHomeMobileStackCards(existingCards, sceneId);
      }
      return existing;
    }
    var deck = document.createElement("div");
    deck.className = "home-mobile-stack";
    deck.setAttribute("data-mobile-scene", sceneId);
    deck.setAttribute("role", "region");
    deck.setAttribute("aria-label", sceneId === "capabilities" ? "Capabilities" : "Qualifications");
    deck.hidden = true;
    deck.setAttribute("aria-hidden", "true");
    var cards = document.createElement("div");
    cards.className = "home-mobile-stack__cards";
    populateHomeMobileStackCards(cards, sceneId);
    deck.appendChild(cards);
    layer.appendChild(deck);
    return deck;
  }

  function populateHomeContactStackCards(cards) {
    if (!cards) return 0;
    cards.innerHTML = "";

    function retargetCloneIds(root, suffix) {
      if (!root || !suffix) return;
      if (root.id) root.id += suffix;
      var idNodes = root.querySelectorAll ? root.querySelectorAll("[id]") : [];
      var i;
      for (i = 0; i < idNodes.length; i++) {
        idNodes[i].id += suffix;
      }
    }

    var head = document.querySelector('.home-fo[data-fo-scene="contact"] .contact-fo__head');
    if (head) {
      var headClone = head.cloneNode(true);
      headClone.classList.add("home-contact-stack__head");
      retargetCloneIds(headClone, "-overlay");
      cards.appendChild(headClone);
    }
    var sourceGrid = document.querySelector('.home-fo[data-fo-scene="contact"] .const-deck__grid--contact.contact-team');
    var cardCount = 0;
    if (sourceGrid) {
      var gridClone = sourceGrid.cloneNode(true);
      gridClone.classList.add("home-contact-stack__grid");
      retargetCloneIds(gridClone, "-overlay");
      cards.appendChild(gridClone);
      cardCount = gridClone.querySelectorAll(".contact-card").length;
    }
    var footer = document.querySelector('.home-fo[data-fo-scene="contact"] .home-fo__footer');
    if (footer) {
      var footerClone = footer.cloneNode(true);
      footerClone.classList.add("home-contact-stack__footer");
      retargetCloneIds(footerClone, "-overlay");
      cards.appendChild(footerClone);
    }
    return cardCount;
  }

  function ensureHomeContactStackDeck() {
    if (!lotorHome) return null;
    var layer = ensureHomeFixedStackLayer();
    if (!layer) return null;
    var existing = layer.querySelector('.home-contact-stack[data-mobile-scene="contact"]');
    if (existing) {
      var existingCards = existing.querySelector(".home-contact-stack__cards");
      if (existingCards) {
        populateHomeContactStackCards(existingCards);
      }
      return existing;
    }
    var deck = document.createElement("div");
    deck.className = "home-mobile-stack home-contact-stack";
    deck.setAttribute("data-mobile-scene", "contact");
    deck.setAttribute("role", "region");
    deck.setAttribute("aria-label", "Contact");
    deck.hidden = true;
    deck.setAttribute("aria-hidden", "true");
    var cards = document.createElement("div");
    cards.className = "home-mobile-stack__cards home-contact-stack__cards";
    populateHomeContactStackCards(cards);
    deck.appendChild(cards);
    layer.appendChild(deck);
    return deck;
  }

  function populateHomeIntroStack(cards) {
    if (!cards) return 0;
    cards.innerHTML = "";
    var source = document.querySelector(".home-fo--intro");
    if (!source) return 0;
    var clone = source.cloneNode(true);
    clone.classList.add("home-intro-stack__content");
    clone.removeAttribute("data-fo-scene");
    var heading = clone.querySelector("#intro-heading");
    if (heading) heading.id = "intro-heading-mobile";
    cards.appendChild(clone);
    return 1;
  }

  function ensureHomeIntroStackDeck() {
    if (!lotorHome) return null;
    var layer = ensureHomeFixedStackLayer();
    if (!layer) return null;
    var existing = layer.querySelector('.home-intro-stack[data-mobile-scene="intro"]');
    if (existing) {
      var existingCards = existing.querySelector(".home-intro-stack__cards");
      if (existingCards) populateHomeIntroStack(existingCards);
      return existing;
    }
    var deck = document.createElement("div");
    deck.className = "home-mobile-stack home-intro-stack";
    deck.setAttribute("data-mobile-scene", "intro");
    deck.setAttribute("role", "region");
    deck.setAttribute("aria-label", "Intro");
    deck.hidden = true;
    deck.setAttribute("aria-hidden", "true");
    var cards = document.createElement("div");
    cards.className = "home-intro-stack__cards";
    populateHomeIntroStack(cards);
    deck.appendChild(cards);
    layer.appendChild(deck);
    return deck;
  }

  function ensureHomeFixedStackLayer() {
    if (!lotorHome || !document.body) return null;
    if (homeFixedStackLayer && homeFixedStackLayer.isConnected) return homeFixedStackLayer;
    var existing = document.querySelector(".home-fixed-stack-layer");
    if (existing) {
      homeFixedStackLayer = existing;
      return existing;
    }
    var layer = document.createElement("div");
    layer.className = "home-fixed-stack-layer";
    layer.hidden = true;
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
    homeFixedStackLayer = layer;
    return layer;
  }

  function syncHomeFixedStackLayer() {
    if (!lotorHome) return;
    var layer = ensureHomeFixedStackLayer();
    if (!layer) return;
    var root = document.documentElement;
    var mapMode = root.getAttribute("data-home-map-mode") || "anchored";
    var boxMode = root.getAttribute("data-home-box-mode") || "anchored";
    var introMode = root.getAttribute("data-home-intro-mode") || "embedded";
    var contactMode = root.getAttribute("data-home-contact-mode") || "embedded";
    var showScene = "";
    if (!detailOpen) {
      if (activeSceneId === "intro" && introMode !== "embedded") {
        showScene = "intro";
      } else if ((activeSceneId === "capabilities" || activeSceneId === "quals") && mapMode === "stacked") {
        showScene = activeSceneId;
      } else if (activeSceneId === "contact" && (contactMode !== "embedded" || boxMode === "stacked")) {
        showScene = "contact";
      }
    }
    var decks = layer.querySelectorAll(".home-mobile-stack[data-mobile-scene]");
    var i;
    for (i = 0; i < decks.length; i++) {
      var deck = decks[i];
      var on = !!showScene && deck.getAttribute("data-mobile-scene") === showScene;
      deck.hidden = !on;
      deck.setAttribute("aria-hidden", on ? "false" : "true");
    }
    layer.hidden = !showScene;
    layer.setAttribute("aria-hidden", showScene ? "false" : "true");
  }

  function ensureHomeMobileStackDecks() {
    ensureHomeIntroStackDeck();
    ensureHomeMobileStackDeck("capabilities");
    ensureHomeMobileStackDeck("quals");
    ensureHomeContactStackDeck();
    syncHomeFixedStackLayer();
  }

  function skySvgScreenMatrices() {
    var svg = document.querySelector(".home-map-overlay.sky-unified");
    if (!svg || typeof svg.getScreenCTM !== "function" || typeof svg.createSVGPoint !== "function") return null;
    var ctm = svg.getScreenCTM();
    if (!ctm) return null;
    return { svg: svg, ctm: ctm };
  }

  function skyMapPointToClient(mx, my, mats) {
    mats = mats || skySvgScreenMatrices();
    if (!mats) return null;
    var pt = mats.svg.createSVGPoint();
    pt.x = mx;
    pt.y = my;
    var out = pt.matrixTransform(mats.ctm);
    return { x: out.x, y: out.y };
  }

  function elementLocalMetrics(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return null;
    var rect = el.getBoundingClientRect();
    /*
     * For foreignObject HTML, clientWidth/clientHeight reflect the local layout space while rect.width/height
     * reflect the zoomed client-space footprint. We need the former to translate client coordinates back into
     * the element's local positioning system.
     */
    var w = el.clientWidth || el.offsetWidth || rect.width || 0;
    var h = el.clientHeight || el.offsetHeight || rect.height || 0;
    if (!(rect.width > 1) || !(rect.height > 1) || !(w > 1) || !(h > 1)) return null;
    return { rect: rect, w: w, h: h };
  }

  function clientPointToElementLocal(el, cx, cy, metrics) {
    metrics = metrics || elementLocalMetrics(el);
    if (!metrics) return null;
    return {
      x: ((cx - metrics.rect.left) / metrics.rect.width) * metrics.w,
      y: ((cy - metrics.rect.top) / metrics.rect.height) * metrics.h,
    };
  }

  function clampRectShiftToSafeRect(rect, shiftX, shiftY, safe) {
    var outX = Number.isFinite(shiftX) ? shiftX : 0;
    var outY = Number.isFinite(shiftY) ? shiftY : 0;
    if (!rect || !safe) return { x: outX, y: outY };

    var minX = safe.left - rect.left;
    var maxX = safe.right - rect.right;
    if (minX <= maxX) outX = Math.max(minX, Math.min(maxX, outX));
    else outX = (safe.left + safe.right) * 0.5 - (rect.left + rect.right) * 0.5;

    var minY = safe.top - rect.top;
    var maxY = safe.bottom - rect.bottom;
    if (minY <= maxY) outY = Math.max(minY, Math.min(maxY, outY));
    else outY = (safe.top + safe.bottom) * 0.5 - (rect.top + rect.bottom) * 0.5;

    return { x: outX, y: outY };
  }

  function unionClientRects(nodes) {
    if (!nodes || !nodes.length) return null;
    var bounds = null;
    var i;
    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node || typeof node.getBoundingClientRect !== "function") continue;
      var rect = node.getBoundingClientRect();
      if (!(rect.width > 1) || !(rect.height > 1)) continue;
      if (!bounds) {
        bounds = {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      } else {
        bounds.left = Math.min(bounds.left, rect.left);
        bounds.right = Math.max(bounds.right, rect.right);
        bounds.top = Math.min(bounds.top, rect.top);
        bounds.bottom = Math.max(bounds.bottom, rect.bottom);
      }
    }
    if (!bounds) return null;
    bounds.width = bounds.right - bounds.left;
    bounds.height = bounds.bottom - bounds.top;
    return bounds;
  }

  function clampNumber(value, min, max) {
    var out = Number.isFinite(value) ? value : min;
    if (Number.isFinite(min) && out < min) out = min;
    if (Number.isFinite(max) && out > max) out = max;
    return out;
  }

  function distributeViewportLaneCenters(rows, laneTop, laneBottom, gapPx) {
    if (!rows || !rows.length) return;
    rows.sort(function (a, b) {
      if (a.idealCy !== b.idealCy) return a.idealCy - b.idealCy;
      return a.starClient.y - b.starClient.y;
    });

    var totalHeight = 0;
    var i;
    for (i = 0; i < rows.length; i++) {
      totalHeight += rows[i].rect.height;
      rows[i].halfH = rows[i].rect.height * 0.5;
      rows[i].minCy = laneTop + rows[i].halfH;
      rows[i].maxCy = laneBottom - rows[i].halfH;
    }

    var laneHeight = Math.max(0, laneBottom - laneTop);
    var gap =
      rows.length > 1
        ? Math.max(0, Math.min(gapPx, (laneHeight - totalHeight) / (rows.length - 1)))
        : 0;

    function forwardPack() {
      var prev = null;
      var j;
      for (j = 0; j < rows.length; j++) {
        var row = rows[j];
        var nextCy = clampNumber(row.idealCy, row.minCy, row.maxCy);
        if (prev) {
          var minFromPrev = prev.cy + prev.halfH + gap + row.halfH;
          if (nextCy < minFromPrev) nextCy = minFromPrev;
        }
        row.cy = clampNumber(nextCy, row.minCy, row.maxCy);
        prev = row;
      }
    }

    function backwardPack() {
      var next = null;
      var j;
      for (j = rows.length - 1; j >= 0; j--) {
        var row = rows[j];
        var nextCy = clampNumber(row.cy, row.minCy, row.maxCy);
        if (next) {
          var maxFromNext = next.cy - next.halfH - gap - row.halfH;
          if (nextCy > maxFromNext) nextCy = maxFromNext;
        }
        row.cy = clampNumber(nextCy, row.minCy, row.maxCy);
        next = row;
      }
    }

    forwardPack();
    backwardPack();
    forwardPack();
  }

  function sceneLeaderStarClients(sceneId, mats) {
    if (sceneId !== "capabilities" && sceneId !== "quals") return [];
    mats = mats || skySvgScreenMatrices();
    if (!mats) return [];
    var root = fixedCelestial || document;
    var gSel = sceneId === "quals" ? ".home-quals-leaders" : ".home-cap-leaders";
    var g = root.querySelector(gSel);
    if (!g) return [];
    var lines = g.querySelectorAll("line[data-leader-anchor]");
    var stars = [];
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      var sx = parseFloat(line.getAttribute("x1"));
      var sy = parseFloat(line.getAttribute("y1"));
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      var starClient = skyMapPointToClient(sx, sy, mats);
      if (!starClient) continue;
      stars.push(starClient);
    }
    return stars;
  }

  function mapCalloutConstellationExclusionRectClient(sceneId, layoutSnapshot, mats, starClients) {
    if (sceneId !== "capabilities" && sceneId !== "quals") return null;
    var placement = LOTOR_HOME_MAP_TUNING.placement;
    var spec =
      placement &&
      placement.constellationAvoidance &&
      placement.constellationAvoidance[sceneId];
    if (!spec) return null;
    mats = mats || skySvgScreenMatrices();
    if (!mats) return null;
    var stars = starClients && starClients.length ? starClients : sceneLeaderStarClients(sceneId, mats);
    if (!stars.length) return null;
    var lay = (layoutSnapshot && layoutSnapshot.lay) || layoutViewportDimensions();
    var shortSide = Math.max(320, Math.min(lay.w || 0, lay.h || 0));
    var padX = Math.max(spec.padXMin, Math.min(spec.padXMax, shortSide * spec.padXFrac));
    var padY = Math.max(spec.padYMin, Math.min(spec.padYMax, shortSide * spec.padYFrac));
    var gapX = Math.max(spec.gapXMin, Math.min(spec.gapXMax, shortSide * spec.gapXFrac));
    var left = Infinity;
    var right = -Infinity;
    var top = Infinity;
    var bottom = -Infinity;
    var i;
    for (i = 0; i < stars.length; i++) {
      left = Math.min(left, stars[i].x);
      right = Math.max(right, stars[i].x);
      top = Math.min(top, stars[i].y);
      bottom = Math.max(bottom, stars[i].y);
    }
    if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
      return null;
    }
    var safe = mapCalloutSafeRectClient(sceneId, layoutSnapshot);
    left = Math.max(safe.left, left - padX);
    right = Math.min(safe.right, right + padX);
    top = Math.max(safe.top, top - padY);
    bottom = Math.min(safe.bottom, bottom + padY);
    if (!(right > left) || !(bottom > top)) return null;
    return { left: left, right: right, top: top, bottom: bottom, gapX: gapX };
  }

  function viewportAnchoredLabelBases(sceneId, placed, focusCxMap, focusCyMap, layoutSnapshot) {
    if (!placed || !placed.length) return false;
    var mats = skySvgScreenMatrices();
    if (!mats) return false;
    var container = document.querySelector('.home-map-const-labels[data-fo-labels="' + sceneId + '"]');
    var layer = container && container.closest(".home-map-label-layer");
    if (!container || !layer) return false;
    var containerMetrics = elementLocalMetrics(container);
    if (!containerMetrics) return false;
    var safe = mapCalloutSafeRectClient(sceneId, layoutSnapshot);
    var focusClient = skyMapPointToClient(focusCxMap, focusCyMap, mats);
    if (!focusClient) return false;
    var lay = (layoutSnapshot && layoutSnapshot.lay) || layoutViewportDimensions();
    var shortSide = Math.max(320, Math.min(lay.w || 0, lay.h || 0));
    var narrowBand = (lay.w || 0) <= 980 || shortSide <= 700;
    var edgeInset = Math.max(12, Math.min(28, shortSide * 0.026));
    var focusGap = narrowBand ? Math.max(14, Math.min(34, shortSide * 0.036)) : Math.max(18, Math.min(52, shortSide * 0.055));
    var topInset = Math.max(8, Math.min(20, shortSide * 0.017));
    var rows = [];
    var i;
    for (i = 0; i < placed.length; i++) {
      var row = placed[i];
      var starClient = skyMapPointToClient(row.sx, row.sy, mats);
      var rect = row.el.getBoundingClientRect();
      if (!starClient || rect.width < 2 || rect.height < 2) continue;
      rows.push({
        el: row.el,
        isLeft: row.isLeft,
        sx: row.sx,
        sy: row.sy,
        starClient: starClient,
        rect: rect,
      });
    }
    if (!rows.length) return false;
    var constellation = mapCalloutConstellationExclusionRectClient(
      sceneId,
      layoutSnapshot,
      mats,
      rows.map(function (row) {
        return row.starClient;
      })
    );

    var leftRows = rows.filter(function (row) {
      return row.isLeft;
    });
    var rightRows = rows.filter(function (row) {
      return !row.isLeft;
    });

    function maxWidth(sideRows) {
      var max = 0;
      var j;
      for (j = 0; j < sideRows.length; j++) {
        if (sideRows[j].rect.width > max) max = sideRows[j].rect.width;
      }
      return max;
    }

    function minWidth(sideRows) {
      var min = Infinity;
      var j;
      for (j = 0; j < sideRows.length; j++) {
        if (sideRows[j].rect.width < min) min = sideRows[j].rect.width;
      }
      return Number.isFinite(min) ? min : 0;
    }

    var leftMaxW = maxWidth(leftRows);
    var rightMaxW = maxWidth(rightRows);
    var safeW = Math.max(120, safe.right - safe.left);
    var safeMid = (safe.left + safe.right) * 0.5;
    var bandFrac = narrowBand ? (sceneId === "capabilities" ? 0.12 : 0.11) : sceneId === "capabilities" ? 0.18 : 0.16;
    var laneGap = narrowBand ? Math.max(10, Math.min(20, shortSide * 0.018)) : Math.max(12, Math.min(26, shortSide * 0.022));
    var leftBandLo = safe.left + edgeInset;
    var leftBandHi = safeMid - focusGap - leftMaxW;
    var rightBandLo = safeMid + focusGap + rightMaxW;
    var rightBandHi = safe.right - edgeInset;
    if (constellation) {
      leftBandHi = Math.min(leftBandHi, constellation.left - constellation.gapX - leftMaxW);
      rightBandLo = Math.max(rightBandLo, constellation.right + constellation.gapX + rightMaxW);
    }
    var leftColLeft = safe.left + safeW * bandFrac;
    var rightColEdge = safe.right - safeW * bandFrac;
    if (leftBandHi > leftBandLo) {
      leftColLeft = Math.max(leftBandLo, Math.min(leftBandHi, leftColLeft));
    } else {
      leftColLeft = leftBandLo;
    }
    if (rightBandHi > rightBandLo) {
      rightColEdge = Math.max(rightBandLo, Math.min(rightBandHi, rightColEdge));
    } else {
      rightColEdge = rightBandHi;
    }
    if (focusClient.x < safeMid - safeW * 0.08) {
      rightColEdge = Math.max(rightBandLo, Math.min(rightBandHi, rightColEdge - safeW * 0.04));
    } else if (focusClient.x > safeMid + safeW * 0.08) {
      leftColLeft = Math.max(leftBandLo, Math.min(leftBandHi, leftColLeft + safeW * 0.04));
    }

    function placeSide(sideRows, isLeft, columnBase, minAnchor, maxAnchor) {
      if (!sideRows.length) return;
      var safeMidY = (safe.top + safe.bottom) * 0.5;
      var blend = narrowBand ? 0.24 : 0.11;
      var starMinX = Infinity;
      var starMaxX = -Infinity;
      var minLaneWidth = minWidth(sideRows);
      sideRows.forEach(function (row) {
        starMinX = Math.min(starMinX, row.starClient.x);
        starMaxX = Math.max(starMaxX, row.starClient.x);
        row.idealCy = row.starClient.y * (1 - blend) + safeMidY * blend;
      });
      distributeViewportLaneCenters(sideRows, safe.top + topInset, safe.bottom - topInset, laneGap);
      var starSpan = Math.max(1, starMaxX - starMinX);
      var focusSpan = Math.max(8, safeW * (narrowBand ? 0.035 : 0.05));
      sideRows.forEach(function (row, index) {
        var starNorm = clampNumber((row.starClient.x - starMinX) / starSpan, 0, 1);
        var rankNorm = sideRows.length <= 1 ? 0.5 : index / (sideRows.length - 1);
        var signedStar = isLeft ? starNorm - 0.5 : 0.5 - starNorm;
        var signedRank = rankNorm - 0.5;
        var inwardDrift = signedStar * focusSpan * 0.55 + signedRank * focusSpan * 0.25;
        var anchorX = columnBase + inwardDrift;
        if (isLeft) {
          var rowMaxAnchor = safeMid - focusGap - row.rect.width;
          if (constellation) {
            rowMaxAnchor = Math.min(rowMaxAnchor, constellation.left - constellation.gapX - row.rect.width);
          }
          if (minLaneWidth > 0 && row.rect.width < leftMaxW) {
            rowMaxAnchor = Math.min(rowMaxAnchor, maxAnchor + (leftMaxW - row.rect.width) * 0.45);
          }
          anchorX = clampNumber(anchorX, minAnchor, rowMaxAnchor);
        } else {
          var rowMinAnchor = safeMid + focusGap + row.rect.width;
          if (constellation) {
            rowMinAnchor = Math.max(rowMinAnchor, constellation.right + constellation.gapX + row.rect.width);
          }
          if (minLaneWidth > 0 && row.rect.width < rightMaxW) {
            rowMinAnchor = Math.max(rowMinAnchor, minAnchor - (rightMaxW - row.rect.width) * 0.45);
          }
          anchorX = clampNumber(anchorX, rowMinAnchor, maxAnchor);
        }
        var localPoint = clientPointToElementLocal(container, anchorX, row.cy, containerMetrics);
        if (!localPoint) return;
        row.leftPx = localPoint.x;
        row.topPx = localPoint.y;
      });
    }

    placeSide(leftRows, true, leftColLeft, leftBandLo, leftBandHi);
    placeSide(rightRows, false, rightColEdge, rightBandLo, rightBandHi);

    rows.forEach(function (row) {
      var localPoint = Number.isFinite(row.leftPx) && Number.isFinite(row.topPx) ? { x: row.leftPx, y: row.topPx } : null;
      if (!localPoint) return;
      row.leftPx = localPoint.x;
      row.topPx = localPoint.y;
    });

    var placedById = Object.create(null);
    rows.forEach(function (row) {
      placedById[row.el.id] = row;
    });
    placed.forEach(function (row) {
      var match = placedById[row.el.id];
      if (!match) return;
      row.leftPx = match.leftPx;
      row.topPx = match.topPx;
    });
    return true;
  }

  function syncViewportFocusedHomePanels(layoutSnapshot) {
    if (!lotorHome || detailOpen) return;
    var root = document.documentElement;
    var lay = (layoutSnapshot && layoutSnapshot.lay) || layoutViewportDimensions();
    var snap = layoutSnapshot || null;
    var safe = mapCalloutSafeRectClient(activeSceneId || "intro", snap);
    var safeCx = (safe.left + safe.right) * 0.5;
    var safeCy = (safe.top + safe.bottom) * 0.5;
    var viewportCx = (lay.w || 0) * 0.5;
    var viewportCy = (lay.h || 0) * 0.5;
    var centerLift = safeCy - viewportCy;
    root.style.setProperty("--home-center-lift-y", round4(centerLift) + "px");
    root.style.setProperty("--home-intro-shift-x", "0px");
    root.style.setProperty("--home-intro-shift-y", "0px");
    root.style.setProperty("--home-contact-shift-x", "0px");
    root.style.setProperty("--home-contact-shift-y", "0px");

    var introLayout = root.getAttribute("data-home-intro-layout") || "split";
    var introMode = root.getAttribute("data-home-intro-mode") || "embedded";
    var contactMode = root.getAttribute("data-home-contact-mode") || "embedded";
    var introFocus = LOTOR_HOME_MAP_TUNING.introProcyon;
    var introFocusClient = introFocus ? skyMapPointToClient(introFocus.x, introFocus.y) : null;

    var introPanel = introMode !== "embedded" ? null : document.querySelector(".home-fo--intro .home-fo__panel--hero");
    if (introPanel) {
      var introRect = introPanel.getBoundingClientRect();
      if (introRect.width > 2) {
        var introFocusRect =
          unionClientRects([
            introPanel.querySelector(".intro-hero"),
            introPanel.querySelector(".hero-cta--below-start"),
          ]) || introRect;
        var introCx = (introFocusRect.left + introFocusRect.right) * 0.5;
        var introCy = (introFocusRect.top + introFocusRect.bottom) * 0.5;
        /* Single-column intro should center to the live safe viewport, not the constellation focal point. */
        var introTargetCx = safeCx;
        var introShift = clampRectShiftToSafeRect(
          introFocusRect,
          introTargetCx - introCx,
          safeCy - introCy,
          safe
        );
        root.style.setProperty("--home-intro-shift-x", round4(introShift.x) + "px");
        root.style.setProperty("--home-intro-shift-y", round4(introShift.y) + "px");
      }
    }

    var contactPanel =
      contactMode !== "embedded" ? null : document.querySelector('.home-fo[data-fo-scene="contact"] .home-fo__panel');
    if (contactPanel) {
      var contactRect = contactPanel.getBoundingClientRect();
      if (contactRect.width > 2 && contactRect.height > 2) {
        var contactFocusRect =
          unionClientRects(
            [].slice.call(
              contactPanel.querySelectorAll(".contact-fo__head, .contact-card, .home-fo__footer")
            )
          ) || contactRect;
        var contactCx = (contactFocusRect.left + contactFocusRect.right) * 0.5;
        var contactCy = (contactFocusRect.top + contactFocusRect.bottom) * 0.5;
        var contactShift = clampRectShiftToSafeRect(
          contactFocusRect,
          safeCx - contactCx,
          safeCy - contactCy,
          safe
        );
        root.style.setProperty("--home-contact-shift-x", round4(contactShift.x) + "px");
        root.style.setProperty("--home-contact-shift-y", round4(contactShift.y) + "px");
      }
    }
  }

  /**
   * Map callout bases from the scene focus used by applySky(), not just the raw constellation centroid.
   * That keeps the initial label organization aligned with where the viewport will center for each scene.
   * Capabilities: west of focus → left rail, else right. Qualifications: 4 western / 5 eastern by star
   * sort; west 32±dx·G (left edge); east 76±dx·G (right edge, biased for star-side gap vs box width).
   * Vertical % from star latitude; duplicate stars staggered; both flanks get min vertical gap when tight.
   */
  function applyCentroidMapLabelBases(sceneId, layoutSnapshot) {
    if (!lotorHome || detailOpen) return;
    var root = fixedCelestial || document;
    var gSel = sceneId === "quals" ? ".home-quals-leaders" : ".home-cap-leaders";
    var g = root.querySelector(gSel);
    if (!g) return;

    var lines = g.querySelectorAll("line[data-leader-anchor]");
    var pts = [];
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      var lid = line.getAttribute("data-leader-anchor");
      var sx = parseFloat(line.getAttribute("x1"));
      var sy = parseFloat(line.getAttribute("y1"));
      if (!lid || !Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      pts.push({ id: lid, sx: sx, sy: sy });
    }
    if (!pts.length) return;

    var cx = 0;
    for (i = 0; i < pts.length; i++) {
      cx += pts[i].sx;
    }
    cx /= pts.length;

    var focalMap = sceneFocalMapXY(sceneId);
    var focusCxMap = focalMap && Number.isFinite(focalMap.cx) ? focalMap.cx : cx;
    var focusCyMap = focalMap && Number.isFinite(focalMap.cy) ? focalMap.cy : null;
    var ncx = (focusCxMap - VB_X0) / SKY_W;
    var P = LOTOR_HOME_MAP_TUNING.placement;
    var horizGain = P.horizGain;
    var dupSpread = sceneId === "quals" ? P.dupSpreadQuals : P.dupSpreadCap;

    var byStar = Object.create(null);
    for (i = 0; i < pts.length; i++) {
      var key = pts[i].sx.toFixed(2) + "," + pts[i].sy.toFixed(2);
      if (!byStar[key]) byStar[key] = [];
      byStar[key].push(pts[i].id);
    }
    var duIdx = Object.create(null);
    var duCount = Object.create(null);
    var key;
    for (key in byStar) {
      if (!Object.prototype.hasOwnProperty.call(byStar, key)) continue;
      var ids = byStar[key].slice().sort();
      var u;
      for (u = 0; u < ids.length; u++) {
        duIdx[ids[u]] = u;
        duCount[ids[u]] = ids.length;
      }
    }

    var qualsLeftId = Object.create(null);
    if (sceneId === "quals") {
      var sortedWest = pts.slice().sort(function (a, b) {
        if (a.sx !== b.sx) return a.sx - b.sx;
        if (a.sy !== b.sy) return a.sy - b.sy;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      var nQualLeft = Math.min(P.qualsNLeft, sortedWest.length);
      for (i = 0; i < nQualLeft; i++) {
        qualsLeftId[sortedWest[i].id] = true;
      }
      var forceL = P.qualsForceLeftAnchorIds;
      if (forceL && forceL.length) {
        var pi;
        for (pi = 0; pi < forceL.length; pi++) {
          var fid = forceL[pi];
          if (qualsLeftId[fid]) continue;
          var hasStar = false;
          for (i = 0; i < pts.length; i++) {
            if (pts[i].id === fid) {
              hasStar = true;
              break;
            }
          }
          if (!hasStar) continue;
          var leftRows = sortedWest.filter(function (p) {
            return qualsLeftId[p.id];
          });
          leftRows.sort(function (a, b) {
            return b.sx - a.sx;
          });
          if (leftRows.length) {
            delete qualsLeftId[leftRows[0].id];
          }
          qualsLeftId[fid] = true;
        }
      }
    }

    var capLeftId = Object.create(null);
    var Cap2 = P.capabilities2x2;
    if (sceneId === "capabilities" && Cap2) {
      var sortedCap = pts.slice().sort(function (a, b) {
        if (a.sx !== b.sx) return a.sx - b.sx;
        if (a.sy !== b.sy) return a.sy - b.sy;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      var nCapLeft = Math.min(Cap2.nPerFlank, sortedCap.length);
      for (i = 0; i < nCapLeft; i++) {
        capLeftId[sortedCap[i].id] = true;
      }
    }

    var capNcxLeft = 0;
    var capNcxRight = 0;
    var capNL = 0;
    var capNR = 0;
    if (sceneId === "capabilities" && Cap2) {
      for (i = 0; i < pts.length; i++) {
        if (capLeftId[pts[i].id]) {
          capNcxLeft += pts[i].sx;
          capNL++;
        } else {
          capNcxRight += pts[i].sx;
          capNR++;
        }
      }
      if (capNL) capNcxLeft /= capNL;
      if (capNR) capNcxRight /= capNR;
    }

    var qualsNcxLeft = 0;
    var qualsNcxRight = 0;
    var qNL = 0;
    var qNR = 0;
    if (sceneId === "quals") {
      for (i = 0; i < pts.length; i++) {
        if (qualsLeftId[pts[i].id]) {
          qualsNcxLeft += pts[i].sx;
          qNL++;
        } else {
          qualsNcxRight += pts[i].sx;
          qNR++;
        }
      }
      if (qNL) qualsNcxLeft /= qNL;
      if (qNR) qualsNcxRight /= qNR;
    }

    var placed = [];

    for (i = 0; i < pts.length; i++) {
      var p = pts[i];
      var el = document.getElementById(p.id);
      if (!el) continue;

      /* Map units: keeps stars just east of scene focus x on the left rail. */
      var flankEpsX = P.flankEpsXMapUnits;
      var isLeft =
        sceneId === "quals"
          ? !!qualsLeftId[p.id]
          : sceneId === "capabilities" && Cap2
            ? !!capLeftId[p.id]
            : p.sx < focusCxMap + flankEpsX;

      var nx = (p.sx - VB_X0) / SKY_W;
      var ny = (p.sy - VB_Y0) / SKY_H;
      var dx;
      if (sceneId === "capabilities" && Cap2 && capNL && capNR) {
        var refCxMap = isLeft ? capNcxLeft : capNcxRight;
        var ncxFlank = (refCxMap - VB_X0) / SKY_W;
        dx = nx - ncxFlank;
      } else if (sceneId === "quals" && qNL && qNR) {
        /* Per-flank mean x (like capabilities 2×2): symmetric spread vs global centroid, which skewed west % . */
        var refQxMap = isLeft ? qualsNcxLeft : qualsNcxRight;
        var nqxFlank = (refQxMap - VB_X0) / SKY_W;
        dx = nx - nqxFlank;
      } else {
        dx = nx - ncx;
      }

      var topPct = ny * 100;
      if (focusCyMap != null) {
        var focusNy = (focusCyMap - VB_Y0) / SKY_H;
        topPct += (ny - focusNy) * 6;
      }
      var dc = duCount[p.id] || 1;
      var di = duIdx[p.id] || 0;
      if (dc > 1) {
        topPct += (di - (dc - 1) * 0.5) * dupSpread;
      }

      var leftPct;
      var qualsHx = horizGain * P.qualsHorizGainScale;
      if (isLeft) {
        if (sceneId === "capabilities" && Cap2) {
          leftPct = Cap2.leftBase + dx * horizGain;
          leftPct = Math.max(Cap2.leftClampLo, Math.min(Cap2.leftClampHi, leftPct));
        } else {
          leftPct = P.capLeftBase + dx * horizGain;
          if (sceneId === "quals") {
            /* West group: ~18% inset from map center, same horizontal gain as east (mirror clamps). */
            leftPct = P.qualsLeftBase + dx * qualsHx;
            leftPct = Math.max(P.qualsLeftClampLo, Math.min(P.qualsLeftClampHi, leftPct));
          } else {
            leftPct = Math.max(P.capLeftClampLo, Math.min(P.capLeftClampHi, leftPct));
          }
        }
        el.classList.remove("const-label--right");
        el.classList.add("const-label--left");
      } else {
        if (sceneId === "capabilities" && Cap2) {
          leftPct = Cap2.rightBase + dx * horizGain;
          if (Cap2.rightFlankInsetPct) {
            leftPct -= Cap2.rightFlankInsetPct;
          }
          leftPct = Math.max(Cap2.rightClampLo, Math.min(Cap2.rightClampHi, leftPct));
        } else if (sceneId === "quals") {
          /* East: --right anchors the box’s right edge at left%; base 70 mirrors west base 30 (L+R=100). */
          leftPct = P.qualsRightBase + dx * qualsHx;
          leftPct = Math.max(P.qualsRightClampLo, Math.min(P.qualsRightClampHi, leftPct));
        } else {
          leftPct = P.capRightBase + dx * horizGain;
          leftPct = Math.max(P.capRightClampLo, Math.min(P.capRightClampHi, leftPct));
        }
        el.classList.remove("const-label--left");
        el.classList.add("const-label--right");
      }

      topPct = Math.max(P.topClampLo, Math.min(P.topClampHi, topPct));
      placed.push({ el: el, isLeft: isLeft, leftPct: leftPct, topPct: topPct, sx: p.sx, sy: p.sy });
    }

    if (sceneId === "capabilities" && placed.length && Cap2) {
      enforceCentroidFlankVerticalSpacing(placed, {
        minGap: Cap2.minVertGap,
        lo: Cap2.vertLo,
        hi: Cap2.vertHi,
        flank: "both",
      });
    }

    if (sceneId === "quals" && placed.length) {
      enforceCentroidFlankVerticalSpacing(placed, {
        minGap: P.qualsMinVertGap,
        lo: P.qualsVertLo,
        hi: P.qualsVertHi,
        flank: "both",
      });
      if (P.qualsEastTopNudge) {
        for (i = 0; i < placed.length; i++) {
          if (!placed[i].isLeft) {
            placed[i].topPct = Math.max(
              P.topClampLo,
              Math.min(P.topClampHi, placed[i].topPct + P.qualsEastTopNudge)
            );
          }
        }
      }
    }

    var anchored = viewportAnchoredLabelBases(
      sceneId,
      placed,
      focusCxMap,
      focusCyMap != null ? focusCyMap : pts[0].sy,
      layoutSnapshot
    );

    for (i = 0; i < placed.length; i++) {
      var q = placed[i];
      var existingBase = readMapLabelBase(q.el);
      var pxLeft = anchored && Number.isFinite(q.leftPx) ? q.leftPx : null;
      var pxTop = anchored && Number.isFinite(q.topPx) ? q.topPx : null;
      if (
        pxLeft == null &&
        pxTop == null &&
        existingBase &&
        existingBase.unit === "px" &&
        canLayoutHomeMapCalloutScene(sceneId) &&
        Number.isFinite(existingBase.left) &&
        Number.isFinite(existingBase.top)
      ) {
        pxLeft = existingBase.left;
        pxTop = existingBase.top;
      }
      if (pxLeft != null && pxTop != null) {
        q.el.setAttribute("data-base-unit", "px");
        q.el.setAttribute("data-base-left", String(round4(pxLeft)));
        q.el.setAttribute("data-base-top", String(round4(pxTop)));
        setMapLabelPx(q.el, pxLeft, pxTop);
      } else {
        q.el.setAttribute("data-base-unit", "%");
        q.el.setAttribute("data-base-left", String(round4(q.leftPct)));
        q.el.setAttribute("data-base-top", String(round4(q.topPct)));
        setMapLabelPct(q.el, q.leftPct, q.topPct);
      }
    }
  }

  /**
   * Enforce min vertical % between callouts on one or both flanks (order preserved by star latitude).
   * If raw tops span less than (n−1)·minGap, distribute evenly in [lo, hi] centered on that cluster.
   * opts.flank: "both" (default), "left", or "right".
   */
  function enforceCentroidFlankVerticalSpacing(placed, opts) {
    var minGap = opts.minGap != null ? opts.minGap : 6;
    var lo = opts.lo != null ? opts.lo : 8;
    var hi = opts.hi != null ? opts.hi : 90;
    var flankOpt = opts.flank;
    var sides =
      flankOpt === "right" ? [false] : flankOpt === "left" ? [true] : [true, false];
    var si;
    for (si = 0; si < sides.length; si++) {
      var wantLeft = sides[si];
      var arr = placed.filter(function (row) {
        return row.isLeft === wantLeft;
      });
      if (arr.length <= 1) continue;
      arr.sort(function (a, b) {
        return a.topPct - b.topPct;
      });
      var n = arr.length;
      var needSpan = (n - 1) * minGap;
      var geoLo = arr[0].topPct;
      var geoHi = arr[n - 1].topPct;
      var geoSpan = geoHi - geoLo;
      var j;
      if (geoSpan < needSpan - 0.01) {
        var mid = (geoLo + geoHi) * 0.5;
        var start = mid - needSpan * 0.5;
        if (start < lo) start = lo;
        if (start + needSpan > hi) start = hi - needSpan;
        start = Math.max(lo, Math.min(hi - needSpan, start));
        for (j = 0; j < n; j++) {
          arr[j].topPct = start + j * minGap;
        }
      } else {
        for (j = 1; j < n; j++) {
          if (arr[j].topPct - arr[j - 1].topPct < minGap) {
            arr[j].topPct = arr[j - 1].topPct + minGap;
          }
        }
        if (arr[n - 1].topPct > hi) {
          var shift = arr[n - 1].topPct - hi;
          for (j = 0; j < n; j++) {
            arr[j].topPct -= shift;
          }
          for (j = 0; j < n; j++) {
            if (arr[j].topPct < lo) {
              var bump = lo - arr[j].topPct;
              for (var k = 0; k < n; k++) {
                arr[k].topPct += bump;
              }
              break;
            }
          }
          for (j = 1; j < n; j++) {
            if (arr[j].topPct - arr[j - 1].topPct < minGap) {
              arr[j].topPct = arr[j - 1].topPct + minGap;
            }
          }
        }
        for (j = 0; j < n; j++) {
          arr[j].topPct = Math.max(lo, Math.min(hi, arr[j].topPct));
        }
      }
    }
  }

  /**
   * Leader lines: star end (x1,y1) fixed; box end (x2,y2) tracks label edge in map space after layout.
   */
  function syncHomeMapLeaderLines(sceneId) {
    if (!lotorHome || detailOpen) return;
    if (sceneId !== "capabilities" && sceneId !== "quals") return;
    var svg = document.querySelector(".home-map-overlay.sky-unified");
    if (!svg || typeof svg.getScreenCTM !== "function" || typeof svg.createSVGPoint !== "function") return;
    var ctm = svg.getScreenCTM();
    if (!ctm) return;
    var inv = ctm.inverse();
    var sceneG = svg.querySelector('.home-sky-scene[data-scene="' + sceneId + '"]');
    if (!sceneG || sceneG.style.display === "none") return;
    var gSel = sceneId === "quals" ? ".home-quals-leaders" : ".home-cap-leaders";
    var g = sceneG.querySelector(gSel);
    if (!g) return;

    function starToClient(sx, sy) {
      var pt = svg.createSVGPoint();
      pt.x = sx;
      pt.y = sy;
      var p = pt.matrixTransform(ctm);
      return { x: p.x, y: p.y };
    }

    function clientToMap(x, y) {
      var pt = svg.createSVGPoint();
      pt.x = x;
      pt.y = y;
      var p = pt.matrixTransform(inv);
      return { x: p.x, y: p.y };
    }

    /** Pick y on [yMin,yMax] along a vertical edge so distance from sc to (xe,y) ≈ L (px). */
    function attachYForTargetLength(sc, xe, yMin, yMax, L) {
      var lo = yMin;
      var hi = yMax;
      var dx = xe - sc.x;
      var absDx = Math.abs(dx);
      if (L <= absDx + 0.5) {
        return Math.max(lo, Math.min(hi, sc.y));
      }
      var sq = L * L - dx * dx;
      if (sq < 0) sq = 0;
      var root = Math.sqrt(sq);
      var yA = sc.y + root;
      var yB = sc.y - root;
      var cand = [yA, yB, lo, hi, Math.max(lo, Math.min(hi, sc.y))];
      var best = Math.max(lo, Math.min(hi, sc.y));
      var bestErr = Infinity;
      var k;
      for (k = 0; k < cand.length; k++) {
        var y = Math.max(lo, Math.min(hi, cand[k]));
        var d = Math.hypot(xe - sc.x, y - sc.y);
        var err = Math.abs(d - L);
        if (err < bestErr) {
          bestErr = err;
          best = y;
        }
      }
      return best;
    }

    var Ld = LOTOR_HOME_MAP_TUNING.leaders;
    var yPad = Ld.boxEdgeYPadPx;
    var linesArr = [].slice.call(g.querySelectorAll("line[data-leader-anchor]"));
    var prep = [];
    var idx;
    for (idx = 0; idx < linesArr.length; idx++) {
      var line = linesArr[idx];
      var id = line.getAttribute("data-leader-anchor");
      if (!id) continue;
      var el = document.getElementById(id);
      if (!el) continue;
      var x1 = parseFloat(line.getAttribute("x1"));
      var y1 = parseFloat(line.getAttribute("y1"));
      if (!(x1 > -1e8) || !(y1 > -1e8)) continue;
      var sc = starToClient(x1, y1);
      var r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      var isLeft = el.classList.contains("const-label--left");
      var yLo = r.top + yPad;
      var yHi = r.bottom - yPad;
      if (yHi <= yLo) yHi = r.top + r.height * 0.5 + 1;
      var edgeY0 = Math.max(yLo, Math.min(yHi, sc.y));
      var ax0 = isLeft ? r.right : r.left;
      var len0 = Math.hypot(ax0 - sc.x, edgeY0 - sc.y);
      prep.push({ line: line, el: el, sc: sc, isLeft: isLeft, len0: len0 });
    }

    var lengths = prep.map(function (p) {
      return p.len0;
    });
    lengths.sort(function (a, b) {
      return a - b;
    });
    var targetLen =
      lengths.length === 0
        ? Ld.targetLenFallbackPx
        : lengths.length % 2 === 1
          ? lengths[(lengths.length - 1) / 2]
          : (lengths[lengths.length / 2 - 1] + lengths[lengths.length / 2]) * 0.5;
    targetLen = Math.max(Ld.targetLenPxMin, Math.min(Ld.targetLenPxMax, targetLen));

    for (idx = 0; idx < prep.length; idx++) {
      var p = prep[idx];
      var r2 = p.el.getBoundingClientRect();
      if (r2.width < 2 || r2.height < 2) continue;
      var yLo2 = r2.top + yPad;
      var yHi2 = r2.bottom - yPad;
      if (yHi2 <= yLo2) yHi2 = r2.top + r2.height * 0.5 + 1;
      var xe = p.isLeft ? r2.right : r2.left;
      var ay = attachYForTargetLength(p.sc, xe, yLo2, yHi2, targetLen);
      var mp = clientToMap(xe, ay);
      p.line.setAttribute("x2", mp.x.toFixed(2));
      p.line.setAttribute("y2", mp.y.toFixed(2));
    }
  }

  /** Leader lines after sky transform has applied; not on every scroll (avoids SVG attr churn / jitter). */
  function scheduleHomeMapLeaderSyncAfterSky(sceneId) {
    if (!lotorHome || detailOpen) return;
    if (sceneId !== "capabilities" && sceneId !== "quals") return;
    requestAnimationFrame(function () {
      syncHomeMapLeaderLines(sceneId);
    });
  }

  /**
   * Client-space rectangle where callout boxes must fit (header bottom, rail, margins).
   * Uses layoutViewportDimensions() — same w/h as clampSkyNormals / --sky-layout-* (not CSS 100vh alone).
   */
  function captureHomeBoxLayoutSnapshot() {
    var lay = layoutViewportDimensions();
    var hdr = document.querySelector(".site-header");
    var headerBottom = 0;
    if (hdr) {
      var hb = hdr.getBoundingClientRect().bottom;
      if (Number.isFinite(hb)) headerBottom = hb;
    }
    return {
      lay: lay,
      headerBottom: headerBottom,
      headerHeight: headerHeightForSky(),
    };
  }

  function mapCalloutSafeRectClient(sceneId, layoutSnapshot) {
    var S = LOTOR_HOME_MAP_TUNING.safeRect;
    var snap = layoutSnapshot || null;
    var lay = (snap && snap.lay) || layoutViewportDimensions();
    var w = lay.w || 800;
    var h = lay.h || 600;
    var m = Math.max(S.marginMin, Math.min(S.marginMax, S.marginFrac * Math.min(w, h)));
    var hdr = document.querySelector(".site-header");
    var topSafe = m;
    if (snap && snap.headerBottom) {
      var hb = snap.headerBottom;
      if (hb >= 24 && hb < h * 0.45) topSafe = Math.max(topSafe, hb + S.headerExtraBelow);
    } else if (hdr) {
      var hbLive = hdr.getBoundingClientRect().bottom;
      if (hbLive >= 24 && hbLive < h * 0.45) topSafe = Math.max(topSafe, hbLive + S.headerExtraBelow);
    } else {
      var hHdr = snap && snap.headerHeight ? snap.headerHeight : headerHeightForSky();
      topSafe = Math.max(topSafe, hHdr + S.headerFallbackExtra);
    }
    try {
      var sl = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("padding-left")) || 0;
      var sr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("padding-right")) || 0;
      if (sl > 0) m = Math.max(m, sl);
      if (sr > 0) m = Math.max(m, sr);
    } catch (e) {}
    var railReserve =
      w >= S.railViewportMin ? Math.min(S.railReserveMax, w * S.railReserveFrac) : 0;
    var left = m;
    var top = topSafe;
    var right = w - railReserve - m;
    var bottom = h - m;
    /* Qualifications: rail shrinks safe.right only; mirror that inset on the left so L/R columns relax symmetrically. */
    if (sceneId === "quals" && railReserve > 0) {
      left = m + railReserve;
    }
    if (right - left < S.minInner || bottom - top < S.minInner) {
      left = S.collapseMargin;
      top = Math.min(top, S.collapseTopMax);
      right = w - S.collapseMargin;
      bottom = h - S.collapseMargin;
    }
    return { left: left, top: top, right: right, bottom: bottom };
  }

  /**
   * Nudge % anchors to stay inside the viewport and separate overlapping pairs.
   * Ends with a hard viewport clamp so overlap resolution cannot leave boxes off-screen.
   */
  function relaxHomeMapCallouts(sceneId, layoutSnapshot) {
    if (!lotorHome || detailOpen) return;
    if (sceneId !== "capabilities" && sceneId !== "quals") return;

    var container = document.querySelector('.home-map-const-labels[data-fo-labels="' + sceneId + '"]');
    if (!container) return;
    var layer = container.closest(".home-map-label-layer");
    if (!layer) return;

    var els = [].slice.call(container.querySelectorAll("a.home-map-const-label"));
    if (!els.length) return;

    var bases = els.map(readMapLabelBase);
    var usePx = bases.some(function (base) {
      return base.unit === "px";
    });
    var R = LOTOR_HOME_MAP_TUNING.relax;
    var maxDev = sceneId === "quals" ? R.maxDevPctQuals : R.maxDevPctCap;
    var iters = sceneId === "quals" ? R.iterQuals : R.iterCap;
    var constellation = mapCalloutConstellationExclusionRectClient(sceneId, layoutSnapshot);
    var lr = layer.getBoundingClientRect();
    if (lr.width < 80 || lr.height < 80) return;
    /* Same box as each pass’s `lr` — clientWidth can disagree (padding, zoom); breaks delta→% / px mapping. */
    var localW = lr.width;
    var localH = lr.height;
    var maxDevX = usePx ? (maxDev / 100) * localW : maxDev;
    var maxDevY = usePx ? (maxDev / 100) * localH : maxDev;

    var dl = bases.map(function () {
      return 0;
    });
    var dt = bases.map(function () {
      return 0;
    });
    var isLeftFlank = els.map(function (el) {
      return el.classList.contains("const-label--left");
    });

    function deltaClientToBaseX(dx, rectWidth) {
      if (!(rectWidth > 1)) return 0;
      return usePx ? dx * (localW / rectWidth) : (dx / rectWidth) * 100;
    }

    function deltaClientToBaseY(dy, rectHeight) {
      if (!(rectHeight > 1)) return 0;
      return usePx ? dy * (localH / rectHeight) : (dy / rectHeight) * 100;
    }

    function applyDeltas(devCapX, devCapY) {
      devCapX = devCapX == null ? maxDevX : devCapX;
      devCapY = devCapY == null ? maxDevY : devCapY;
      var pxClampX = localW + Math.max(160, localW * 0.45);
      var pxClampY = localH + Math.max(180, localH * 0.7);
      var i;
      for (i = 0; i < els.length; i++) {
        var nl = bases[i].left + dl[i];
        var nt = bases[i].top + dt[i];
        nl = Math.max(bases[i].left - devCapX, Math.min(bases[i].left + devCapX, nl));
        nt = Math.max(bases[i].top - devCapY, Math.min(bases[i].top + devCapY, nt));
        if (usePx) {
          nl = Math.max(-pxClampX, Math.min(pxClampX, nl));
          nt = Math.max(-pxClampY, Math.min(pxClampY, nt));
          setMapLabelPx(els[i], nl, nt);
        } else {
          nl = Math.max(1, Math.min(99, nl));
          nt = Math.max(1, Math.min(99, nt));
          setMapLabelPct(els[i], nl, nt);
        }
      }
    }

    function pushOutOfConstellation(rect, wantLeft) {
      if (!constellation || !rect) return { x: 0, y: 0 };
      var ix = Math.min(rect.right, constellation.right) - Math.max(rect.left, constellation.left);
      var iy = Math.min(rect.bottom, constellation.bottom) - Math.max(rect.top, constellation.top);
      if (ix <= 0 || iy <= 0) return { x: 0, y: 0 };
      return wantLeft
        ? { x: constellation.left - rect.right, y: 0 }
        : { x: constellation.right - rect.left, y: 0 };
    }

    applyDeltas();

    var pass;
    for (pass = 0; pass < iters; pass++) {
      lr = layer.getBoundingClientRect();
      if (lr.width < 80 || lr.height < 80) break;
      var safe = mapCalloutSafeRectClient(sceneId, layoutSnapshot);
      var rects = els.map(function (el) {
        return el.getBoundingClientRect();
      });
      var ndl = dl.slice();
      var ndt = dt.slice();
      var i, j;

      for (i = 0; i < els.length; i++) {
        var r = rects[i];
        var dx = 0;
        var dy = 0;
        if (r.left < safe.left) dx += safe.left - r.left;
        if (r.right > safe.right) dx += safe.right - r.right;
        if (r.top < safe.top) dy += safe.top - r.top;
        if (r.bottom > safe.bottom) dy += safe.bottom - r.bottom;
        var exclusionPush = pushOutOfConstellation(r, isLeftFlank[i]);
        dx += exclusionPush.x;
        dy += exclusionPush.y;
        ndl[i] += deltaClientToBaseX(dx, lr.width);
        ndt[i] += deltaClientToBaseY(dy, lr.height);
      }

      var gapPxEarly = Math.max(R.gapMin, Math.min(R.gapMax, R.gapFrac * Math.min(lr.width, lr.height)));
      for (i = 0; i < els.length; i++) {
        for (j = i + 1; j < els.length; j++) {
          var a = rects[i];
          var b = rects[j];
          var ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          var iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ix <= 0 || iy <= 0) continue;
          var push = (Math.min(ix, iy) + gapPxEarly) * R.pushEarlyScale;
          var ax = (a.left + a.right) / 2;
          var ay = (a.top + a.bottom) / 2;
          var bx = (b.left + b.right) / 2;
          var by = (b.top + b.bottom) / 2;
          var len = Math.hypot(bx - ax, by - ay) || 1;
          var pdx = ((bx - ax) / len) * push;
          var pdy = ((by - ay) / len) * push;
          ndl[i] -= deltaClientToBaseX(pdx, lr.width);
          ndt[i] -= deltaClientToBaseY(pdy, lr.height);
          ndl[j] += deltaClientToBaseX(pdx, lr.width);
          ndt[j] += deltaClientToBaseY(pdy, lr.height);
        }
      }

      for (i = 0; i < els.length; i++) {
        dl[i] = Math.max(-maxDevX, Math.min(maxDevX, ndl[i]));
        dt[i] = Math.max(-maxDevY, Math.min(maxDevY, ndt[i]));
      }

      applyDeltas();
    }

    /* Hard clamp: large dev cap so overlap resolution cannot leave boxes past header / rail / edges. */
    var hardMax = R.hardMaxPct;
    var hardMaxX = usePx ? (hardMax / 100) * localW : hardMax;
    var hardMaxY = usePx ? (hardMax / 100) * localH : hardMax;
    var hp;
    var safe;
    var rects;
    var ndl;
    var ndt;
    var allIn;
    var i;
    var r;
    var dx;
    var dy;
    for (hp = 0; hp < R.hardPasses; hp++) {
      lr = layer.getBoundingClientRect();
      if (lr.width < 80 || lr.height < 80) break;
      safe = mapCalloutSafeRectClient(sceneId, layoutSnapshot);
      rects = els.map(function (el) {
        return el.getBoundingClientRect();
      });
      allIn = true;
      ndl = dl.slice();
      ndt = dt.slice();
      for (i = 0; i < els.length; i++) {
        r = rects[i];
        dx = 0;
        dy = 0;
        if (r.left < safe.left) {
          dx += safe.left - r.left;
          allIn = false;
        }
        if (r.right > safe.right) {
          dx += safe.right - r.right;
          allIn = false;
        }
        if (r.top < safe.top) {
          dy += safe.top - r.top;
          allIn = false;
        }
        if (r.bottom > safe.bottom) {
          dy += safe.bottom - r.bottom;
          allIn = false;
        }
        var hardPush = pushOutOfConstellation(r, isLeftFlank[i]);
        if (hardPush.x || hardPush.y) allIn = false;
        dx += hardPush.x;
        dy += hardPush.y;
        ndl[i] += deltaClientToBaseX(dx, lr.width);
        ndt[i] += deltaClientToBaseY(dy, lr.height);
      }
      if (allIn) break;
      for (i = 0; i < els.length; i++) {
        dl[i] = Math.max(-hardMaxX, Math.min(hardMaxX, ndl[i]));
        dt[i] = Math.max(-hardMaxY, Math.min(hardMaxY, ndt[i]));
      }
      applyDeltas(hardMaxX, hardMaxY);
    }

    /* Overlap + viewport: any AABB intersection is resolved; keep a few px gap. */
    var laySep = (layoutSnapshot && layoutSnapshot.lay) || layoutViewportDimensions();
    var gapPx = Math.max(
      R.finalGapMin,
      Math.min(R.finalGapMax, R.finalGapFrac * Math.min(laySep.w || 400, laySep.h || 400))
    );
    var sep;
    var j;
    var a;
    var b;
    var ix;
    var iy;
    var ax;
    var ay;
    var bx;
    var by;
    var len;
    var pdx;
    var pdy;
    for (sep = 0; sep < R.sepPasses; sep++) {
      lr = layer.getBoundingClientRect();
      if (lr.width < 80 || lr.height < 80) break;
      safe = mapCalloutSafeRectClient(sceneId, layoutSnapshot);
      rects = els.map(function (el) {
        return el.getBoundingClientRect();
      });
      ndl = dl.slice();
      ndt = dt.slice();
      var hadOverlap = false;
      for (i = 0; i < els.length; i++) {
        for (j = i + 1; j < els.length; j++) {
          a = rects[i];
          b = rects[j];
          ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ix <= 0 || iy <= 0) continue;
          hadOverlap = true;
          var pushSep = (Math.min(ix, iy) + gapPx) * R.pushSepScale;
          ax = (a.left + a.right) / 2;
          ay = (a.top + a.bottom) / 2;
          bx = (b.left + b.right) / 2;
          by = (b.top + b.bottom) / 2;
          len = Math.hypot(bx - ax, by - ay) || 1;
          pdx = ((bx - ax) / len) * pushSep;
          pdy = ((by - ay) / len) * pushSep;
          ndl[i] -= deltaClientToBaseX(pdx, lr.width);
          ndt[i] -= deltaClientToBaseY(pdy, lr.height);
          ndl[j] += deltaClientToBaseX(pdx, lr.width);
          ndt[j] += deltaClientToBaseY(pdy, lr.height);
        }
      }
      for (i = 0; i < els.length; i++) {
        r = rects[i];
        dx = 0;
        dy = 0;
        if (r.left < safe.left) dx += safe.left - r.left;
        if (r.right > safe.right) dx += safe.right - r.right;
        if (r.top < safe.top) dy += safe.top - r.top;
        if (r.bottom > safe.bottom) dy += safe.bottom - r.bottom;
        var sepPush = pushOutOfConstellation(r, isLeftFlank[i]);
        dx += sepPush.x;
        dy += sepPush.y;
        ndl[i] += deltaClientToBaseX(dx, lr.width);
        ndt[i] += deltaClientToBaseY(dy, lr.height);
      }
      for (i = 0; i < els.length; i++) {
        dl[i] = Math.max(-hardMaxX, Math.min(hardMaxX, ndl[i]));
        dt[i] = Math.max(-hardMaxY, Math.min(hardMaxY, ndt[i]));
      }
      applyDeltas(hardMaxX, hardMaxY);
      if (!hadOverlap) {
        rects = els.map(function (el) {
          return el.getBoundingClientRect();
        });
        allIn = true;
        for (i = 0; i < rects.length; i++) {
          r = rects[i];
          var stillCovering = pushOutOfConstellation(r, isLeftFlank[i]);
          if (
            r.left < safe.left ||
            r.right > safe.right ||
            r.top < safe.top ||
            r.bottom > safe.bottom ||
            stillCovering.x ||
            stillCovering.y
          ) {
            allIn = false;
            break;
          }
        }
        if (allIn) break;
      }
    }
  }

  /** Undo relax() pushing east capability cards outward (overlap separation uses box centers). */
  function clampCapabilitiesRightFlankAfterRelax() {
    var Cap2 = LOTOR_HOME_MAP_TUNING.placement.capabilities2x2;
    if (!Cap2 || Cap2.postRelaxMaxRightEdgePct == null) return;
    var container = document.querySelector('.home-map-const-labels[data-fo-labels="capabilities"]');
    if (!container) return;
    var sample = container.querySelector("a.home-map-const-label.const-label--right");
    if (!sample) return;
    var baseSample = readMapLabelBase(sample);
    var usePx = baseSample.unit === "px";
    var localW = container.clientWidth || container.offsetWidth || 0;
    var maxR = usePx ? (Cap2.postRelaxMaxRightEdgePct / 100) * localW : Cap2.postRelaxMaxRightEdgePct;
    var els = [].slice.call(container.querySelectorAll("a.home-map-const-label.const-label--right"));
    var i;
    for (i = 0; i < els.length; i++) {
      var el = els[i];
      var base = readMapLabelBase(el);
      var left = base.left;
      var top = base.top;
      if (left > maxR) {
        setMapLabelPos(el, maxR, top, usePx ? "px" : base.unit);
      }
    }
  }

  function syncVisibleHomeMapCalloutScene(sceneId, layoutSnapshot) {
    if (!lotorHome || detailOpen || !canLayoutHomeMapCalloutScene(sceneId)) return false;
    var sceneG = document.querySelector('.home-sky-scene[data-scene="' + sceneId + '"]');
    if (!sceneG || sceneG.style.display === "none") return false;
    applyCentroidMapLabelBases(sceneId, layoutSnapshot);
    relaxHomeMapCallouts(sceneId, layoutSnapshot);
    if (sceneId === "capabilities") {
      clampCapabilitiesRightFlankAfterRelax();
    }
    syncHomeMapLeaderLines(sceneId);
    return true;
  }

  function syncActiveHomeSceneLayoutOnce(sceneId) {
    sceneId = sceneId || activeSceneId;
    if (!lotorHome || detailOpen || activeSceneId !== sceneId) return false;

    syncHomeLayoutViewport();
    syncHomeMapViewportCss();
    syncHomeMapOverlay(sceneId);

    if (sceneId === "capabilities" || sceneId === "quals") {
      ensureHomeMobileStackDeck(sceneId);
    } else if (sceneId === "contact") {
      ensureHomeContactStackDeck();
    }

    if (isHomeMapCalloutScene(sceneId) && canLayoutHomeMapCalloutScene(sceneId)) {
      var f = focalNormals(sceneId);
      applySky({
        nx: f.nx,
        ny: f.ny,
        zoom: measureZoomForSection(sceneId),
        sceneId: sceneId,
        parallaxScrollTopOverride: parallaxScrollTopForHomeScene(sceneId),
      });
      var snap = captureHomeBoxLayoutSnapshot();
      syncVisibleHomeMapCalloutScene(sceneId, snap);
      syncViewportFocusedHomePanels(snap);
      return true;
    }

    applySkyForScene(sceneId);
    syncViewportFocusedHomePanels(captureHomeBoxLayoutSnapshot());
    return true;
  }

  function scheduleActiveHomeSceneLayoutSync(sceneId, delays) {
    sceneId = sceneId || activeSceneId;
    if (!lotorHome || detailOpen || !sceneId) return;
    cancelHomeActiveSceneLayoutSyncs();
    var runs = delays && delays.length ? delays : [0, 160, 360];
    var i;
    for (i = 0; i < runs.length; i++) {
      (function (delayMs) {
        var timerId = setTimeout(function () {
          homeActiveSceneLayoutTimers = homeActiveSceneLayoutTimers.filter(function (id) {
            return id !== timerId;
          });
          if (activeSceneId !== sceneId || detailOpen) return;
          syncActiveHomeSceneLayoutOnce(sceneId);
        }, Math.max(0, delayMs || 0));
        homeActiveSceneLayoutTimers.push(timerId);
      })(runs[i]);
    }
  }

  function scheduleVisibleHomeMapCalloutSync(sceneId, delayMs) {
    if (!isHomeMapCalloutScene(sceneId)) return;

    function run() {
      if (activeSceneId !== sceneId || detailOpen || !canLayoutHomeMapCalloutScene(sceneId)) return;
      syncVisibleHomeMapCalloutScene(sceneId, captureHomeBoxLayoutSnapshot());
    }

    setTimeout(run, delayMs != null && delayMs > 0 ? delayMs : 0);
  }

  function layoutHomeMapCalloutScene(sceneId, done) {
    if (
      !lotorHome ||
      detailOpen ||
      activeSceneId !== sceneId ||
      !canLayoutHomeMapCalloutScene(sceneId) ||
      !isHomeMapCalloutDirty(sceneId)
    ) {
      if (done) done(false);
      return;
    }
    cancelHomeMapCalloutRelayout();
    if (homeMapCalloutPrecomputePending) {
      if (done) done(false);
      return;
    }
    homeMapCalloutPrecomputePending = true;
    var dirtyVersion = homeMapCalloutDirtyVersion[sceneId];
    syncHomeLayoutViewport();
    syncHomeMapViewportCss();
    syncHomeMapOverlay(sceneId);
    var layoutSnapshot = captureHomeBoxLayoutSnapshot();
    var f = focalNormals(sceneId);
    applySky({
      nx: f.nx,
      ny: f.ny,
      zoom: measureZoomForSection(sceneId),
      sceneId: sceneId,
      parallaxScrollTopOverride: parallaxScrollTopForHomeScene(sceneId),
    });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (activeSceneId !== sceneId) {
          homeMapCalloutPrecomputePending = false;
          if (done) done(false);
          return;
        }
        syncVisibleHomeMapCalloutScene(sceneId, layoutSnapshot);
        syncViewportFocusedHomePanels(layoutSnapshot);
        if (homeMapCalloutDirtyVersion[sceneId] === dirtyVersion) {
          markHomeMapCalloutClean(sceneId);
        } else if (canLayoutHomeMapCalloutScene(sceneId) && activeSceneId === sceneId) {
          scheduleHomeMapCalloutRelayout(sceneId, 0);
        }
        homeMapCalloutPrecomputePending = false;
        if (done) done(true);
      });
    });
  }

  function scheduleHomeMapCalloutRelayout(sceneId, delayMs) {
    if (!canLayoutHomeMapCalloutScene(sceneId) || !isHomeMapCalloutDirty(sceneId)) return;
    cancelHomeMapCalloutRelayout();
    homeMapCalloutRelayoutTimer = setTimeout(function () {
      homeMapCalloutRelayoutTimer = null;
      layoutHomeMapCalloutScene(sceneId);
    }, delayMs == null ? 90 : delayMs);
  }

  /**
   * Clears the “hide sky while precomputing” state if init stalls (fonts.ready hang, rAF error, slow narrow devices).
   */
  function forceReleaseHomeSkyPrecompute() {
    if (homePrecomputeSafetyTimer) {
      clearTimeout(homePrecomputeSafetyTimer);
      homePrecomputeSafetyTimer = null;
    }
    var root = document.documentElement;
    if (!root.classList.contains("lotor-home")) return;
    if (root.getAttribute("data-home-sky-precompute") !== "1" && !homeMapCalloutPrecomputePending) return;
    root.removeAttribute("data-home-sky-precompute");
    homeMapCalloutPrecomputePending = false;
    homeMapCalloutsPrecomputed = true;
    markHomeMapCalloutDirty("capabilities");
    markHomeMapCalloutDirty("quals");
    syncHomeMapOverlay(activeSceneId);
    applySkyForScene(activeSceneId);
    requestAnimationFrame(function () {
      var sid = activeSceneId;
      if (sid === "capabilities" || sid === "quals") {
        syncHomeMapLeaderLines(sid);
      }
    });
  }

  /**
   * Run overlap/safe-rect relaxation once per map scene at load, under that scene’s zoom/pan, then restore
   * the active scene. Uses parallaxScrollTopOverride so pan matches viewing that section (not scrollTop=0 on intro).
   * Later viewport changes can mark a scene dirty and trigger the same placement flow again on demand.
   */
  function precomputeHomeMapCalloutLayouts(done) {
    if (!lotorHome || detailOpen || homeMapCalloutsPrecomputed) {
      if (done) done();
      return;
    }
    cancelHomeMapCalloutRelayout();
    if (homeMapCalloutPrecomputePending) {
      if (done) done();
      return;
    }
    homeMapCalloutPrecomputePending = true;
    document.documentElement.setAttribute("data-home-sky-precompute", "1");
    if (homePrecomputeSafetyTimer) clearTimeout(homePrecomputeSafetyTimer);
    homePrecomputeSafetyTimer = window.setTimeout(function () {
      homePrecomputeSafetyTimer = null;
      forceReleaseHomeSkyPrecompute();
    }, 5000);
    syncHomeLayoutViewport();
    syncHomeMapViewportCss();
    var layoutSnapshot = captureHomeBoxLayoutSnapshot();
    var scenes = ["capabilities", "quals"];
    var ix = 0;

    function finish() {
      if (homePrecomputeSafetyTimer) {
        clearTimeout(homePrecomputeSafetyTimer);
        homePrecomputeSafetyTimer = null;
      }
      syncHomeMapOverlay(activeSceneId);
      applySkyForScene(activeSceneId);
      requestAnimationFrame(function () {
        var sid = activeSceneId;
        if (sid === "capabilities" || sid === "quals") {
          syncHomeMapLeaderLines(sid);
        }
        syncViewportFocusedHomePanels(layoutSnapshot);
        document.documentElement.removeAttribute("data-home-sky-precompute");
        homeMapCalloutPrecomputePending = false;
        homeMapCalloutsPrecomputed = true;
        if (canLayoutHomeMapCalloutScene(activeSceneId)) {
          markHomeMapCalloutDirty(activeSceneId);
          scheduleHomeMapCalloutRelayout(activeSceneId, 0);
          scheduleVisibleHomeMapCalloutSync(activeSceneId, 0);
          scheduleVisibleHomeMapCalloutSync(activeSceneId, 900);
        }
        if (done) done();
      });
    }

    function stepScene() {
      if (ix >= scenes.length) {
        finish();
        return;
      }
      var sid = scenes[ix++];
      var dirtyVersion = homeMapCalloutDirtyVersion[sid];
      syncHomeMapOverlay(sid);
      var f = focalNormals(sid);
      applySky({
        nx: f.nx,
        ny: f.ny,
        zoom: measureZoomForSection(sid),
        sceneId: sid,
        parallaxScrollTopOverride: parallaxScrollTopForHomeScene(sid),
      });
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          try {
            syncVisibleHomeMapCalloutScene(sid, layoutSnapshot);
            if (homeMapCalloutDirtyVersion[sid] === dirtyVersion) {
              markHomeMapCalloutClean(sid);
            }
          } catch (e) {}
          stepScene();
        });
      });
    }

    stepScene();
  }

  function syncHomeMapOverlay(sceneId) {
    var svg = document.querySelector(".home-map-overlay");
    if (!svg) return;
    if (detailOpen) {
      svg.querySelectorAll(".home-sky-scene").forEach(function (g) {
        g.style.display = "none";
      });
      return;
    }
    svg.querySelectorAll(".home-sky-scene").forEach(function (g) {
      var sid = g.getAttribute("data-scene");
      g.style.display = sid === sceneId ? "block" : "none";
    });
  }

  /** Matches styles.css: translate uses the full layout viewport center, independent of the header. */
  function headerHeightForSky() {
    var raw = getComputedStyle(document.documentElement).getPropertyValue("--lotor-header-h").trim();
    var px = parseFloat(raw);
    if (px >= 32 && px <= 260) return px;
    var hdr = document.querySelector(".site-header");
    if (hdr) {
      var h = hdr.getBoundingClientRect().height;
      if (h >= 32 && h <= 260) return h;
    }
    return 69.6;
  }

  /**
   * Keep the scaled map covering the fixed viewport (no void past the SVG).
   * X: pivot at vw/2. Y: pivot at vh/2 to match .celestial-mover transform.
   * May raise zoom to the minimum that still allows full cover at some pan.
   */
  function clampSkyNormals(nx, ny, z, lay) {
    lay = lay || layoutViewportDimensions();
    var sc = LOTOR_HOME_MAP_TUNING.skyClamp;
    var C = coverScaleFromLayout(lay);
    var vw = Math.max(200, lay.w || 0);
    var vh = Math.max(200, lay.h || 0);
    var Wm = C * SKY_W;
    var Hm = C * SKY_H;
    var margin = sc.margin;
    var inner = Math.max(sc.innerMin, 1 - 2 * margin);
    /* Minimum zoom so viewport fits inside scaled map (same condition as minX <= maxX / minY <= maxY). */
    var zCover = Math.max(vw / (Wm * inner), vh / (Hm * inner));
    var zEff = Math.min(ZOOM_MAX, Math.max(1e-6, z, zCover));

    var y0 = vh * 0.5;

    function boundsForZ(zz) {
      var halfX = vw * 0.5 / (zz * Wm);
      var minX = halfX + margin;
      var maxX = 1 - halfX - margin;
      var minY = y0 / (zz * Hm) + margin;
      var maxY = 1 - (vh - y0) / (zz * Hm) - margin;
      return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    }

    var b = boundsForZ(zEff);
    if (b.minX > b.maxX || b.minY > b.maxY) {
      zEff = Math.min(ZOOM_MAX, Math.max(zEff, zCover * sc.zCoverSlack));
      b = boundsForZ(zEff);
    }

    /* Wide viewports at low zoom: pan range can be empty or too tight for off-center focals (e.g. intro → Procyon). */
    for (var guard = 0; guard < sc.guardMax; guard++) {
      b = boundsForZ(zEff);
      var okX = b.minX <= b.maxX && nx + 1e-9 >= b.minX && nx - 1e-9 <= b.maxX;
      var okY = b.minY <= b.maxY && ny + 1e-9 >= b.minY && ny - 1e-9 <= b.maxY;
      if (okX && okY) break;
      var bump = Math.min(ZOOM_MAX, zEff * sc.zoomBump);
      if (bump <= zEff + 1e-9) break;
      zEff = bump;
    }
    b = boundsForZ(zEff);

    if (b.minX <= b.maxX) nx = Math.min(b.maxX, Math.max(b.minX, nx));
    else nx = 0.5;
    if (b.minY <= b.maxY) ny = Math.min(b.maxY, Math.max(b.minY, ny));
    else ny = 0.5;

    return { nx: nx, ny: ny, zoom: zEff };
  }

  function applySky(sky) {
    if (!fixedCelestial) return;
    var layPan = layoutViewportDimensions();
    var C = coverScaleFromLayout(layPan);
    var W = SKY_W * C;
    var H = SKY_H * C;
    if (mover) {
      syncSkyLayoutViewportCssVars(layPan);
    } else if (fixedCelestial && fixedCelestial.querySelector && fixedCelestial.querySelector(".celestial-svg")) {
      /* Inner pages (img-only sky): keep --sky-layout-* aligned with measured viewport for any CSS that reads it. */
      syncSkyLayoutViewportCssVars(layPan);
    }
    var nx = sky.nx;
    var ny = sky.ny;
    /* Scroll “parallax” must live in the same transform as pan/zoom; a separate inner translate broke focal alignment */
    if (lotorHome && !detailOpen && !reduceMotion) {
      var root = homeScrollRoot();
      if (root) {
        var st = root.scrollTop;
        if (sky.parallaxScrollTopOverride != null && Number.isFinite(sky.parallaxScrollTopOverride)) {
          st = sky.parallaxScrollTopOverride;
        }
        var sceneForParallax = sky.sceneId != null ? sky.sceneId : activeSceneId;
        var spAll = LOTOR_HOME_MAP_TUNING.scrollParallaxScene;
        var mul = (spAll && spAll[sceneForParallax]) || (spAll && spAll.default) || { xMul: 1, yMul: 1 };
        var xMul = typeof mul.xMul === "number" ? mul.xMul : 1;
        var yMul = typeof mul.yMul === "number" ? mul.yMul : 1;
        var px = st * 0.034 * xMul;
        var py = -st * 0.092 * yMul;
        nx = sky.nx + px / W;
        ny = sky.ny + py / H;
      }
    }
    var panClamped = clampSkyNormals(nx, ny, sky.zoom, layPan);
    nx = panClamped.nx;
    ny = panClamped.ny;
    var z = panClamped.zoom;
    var panX = roundToDevicePixel((layPan.w || 0) * 0.5 - z * nx * W);
    var panY = roundToDevicePixel((layPan.h || 0) * 0.5 - z * ny * H);
    fixedCelestial.style.setProperty("--sky-cover", String(round4(C)));
    fixedCelestial.style.setProperty("--sky-nx", String(round4(nx)));
    fixedCelestial.style.setProperty("--sky-ny", String(round4(ny)));
    fixedCelestial.style.setProperty("--sky-zoom-mult", String(round4(z)));
    fixedCelestial.style.setProperty("--sky-pan-x", round4(panX) + "px");
    fixedCelestial.style.setProperty("--sky-pan-y", round4(panY) + "px");
    var zSpan = Math.max(ZOOM_MAX - 1, 0.05);
    var veil = 1 - 0.5 * Math.min(1, Math.max(0, (z - 1) / zSpan));
    document.documentElement.style.setProperty("--sky-veil", String(round4(veil)));
    /* foreignObject HTML inherits from document, not #fixed-celestial — inverse UI scale uses this */
    if (lotorHome) {
      document.documentElement.style.setProperty("--sky-zoom", String(round4(z)));
    } else if (pageQual && fixedCelestial) {
      document.documentElement.style.setProperty("--sky-zoom", String(round4(z)));
    } else {
      document.documentElement.style.removeProperty("--sky-zoom");
    }
  }

  function qualPageManifestKey() {
    var path = location.pathname || "";
    var segs = path.split("/").filter(Boolean);
    var last = segs[segs.length - 1] || "";
    if (!last) return "";
    return "quals/" + last;
  }

  function applySkyFromQualManifest() {
    if (!pageQual || !fixedCelestial) return;
    var k = qualPageManifestKey();
    var d = detailFocals[k];
    if (d && typeof d.nx === "number" && typeof d.ny === "number" && typeof d.zoom === "number") {
      applySky({ nx: d.nx, ny: d.ny, zoom: d.zoom });
    } else {
      applySky({ nx: 0.52, ny: 0.72, zoom: 2.05 });
    }
  }

  function mergeSkyManifest(manifest) {
    if (manifest && manifest.viewBox) {
      var vb = manifest.viewBox;
      if (typeof vb.x === "number") VB_X0 = vb.x;
      if (typeof vb.y === "number") VB_Y0 = vb.y;
      if (typeof vb.w === "number") SKY_W = vb.w;
      else if (typeof vb.width === "number") SKY_W = vb.width;
      if (typeof vb.h === "number") SKY_H = vb.h;
      else if (typeof vb.height === "number") SKY_H = vb.height;
    }
    if (manifest && manifest.detailFocals && typeof manifest.detailFocals === "object") {
      Object.keys(manifest.detailFocals).forEach(function (k) {
        detailFocals[k] = manifest.detailFocals[k];
      });
    }
  }

  var mainStage = document.querySelector(".site-main--stage");
  var sceneSections = document.querySelectorAll(".lotor-scene[data-scene]");
  var activeSceneId = "intro";

  var detailDialog = document.getElementById("lotor-detail");
  var detailTitleEl = detailDialog && detailDialog.querySelector(".lotor-detail__title");
  var detailBodyEl = detailDialog && detailDialog.querySelector(".lotor-detail__body");
  var detailLoadingEl = detailDialog && detailDialog.querySelector(".lotor-detail__loading");
  var detailBackBtn = detailDialog && detailDialog.querySelector(".lotor-detail__back");
  var detailOpen = false;
  var detailPathOpen = "";
  var lastFocusBeforeDetail = null;
  var baseDocumentTitle = document.title;
  var prefetched = Object.create(null);
  var historySceneTimer;
  var scrollScheduled;
  var HOME_SCENE_ENTRY_LAYOUT_DELAYS = [0, 120, 280];
  var HOME_VIEWPORT_SETTLE_LAYOUT_DELAYS = [0, 180, 420, 900];
  /** Require this many consecutive rAF polls with the same dominant scene before setScene (reduces boundary flicker). */
  var dominantSceneHoldCandidate = null;
  var dominantSceneHoldCount = 0;
  var DOMINANT_SCENE_HOLD_FRAMES = 2;
  var detailFetchAbort;
  var skyTransformEaseTimer;
  /** While set, scroll-spy must not call setScene() for a different section (smooth scroll vs geometry). */
  var programmaticScrollSceneId = null;
  var programmaticScrollIdleTimer = null;
  /** Before initHomeAfterManifest, header/progress still need #home-scrollport scroll. */
  var homeScrollChromeOnlyFn = null;

  function beginProgrammaticScrollTo(sceneId) {
    programmaticScrollSceneId = sceneId;
    if (programmaticScrollIdleTimer) {
      clearTimeout(programmaticScrollIdleTimer);
      programmaticScrollIdleTimer = null;
    }
  }

  function clearProgrammaticScrollLock() {
    programmaticScrollSceneId = null;
    if (programmaticScrollIdleTimer) {
      clearTimeout(programmaticScrollIdleTimer);
      programmaticScrollIdleTimer = null;
    }
  }

  function armProgrammaticScrollIdleFallback() {
    if (!programmaticScrollSceneId) return;
    if (programmaticScrollIdleTimer) clearTimeout(programmaticScrollIdleTimer);
    programmaticScrollIdleTimer = setTimeout(function () {
      programmaticScrollIdleTimer = null;
      clearProgrammaticScrollLock();
    }, 420);
  }

  /** Smooth pan/zoom only for deliberate scene changes — not scroll (see styles.css). */
  function beginSkyTransformEase() {
    if (reduceMotion || !lotorHome) return;
    var root = document.documentElement;
    root.setAttribute("data-sky-transform-ease", "1");
    if (skyTransformEaseTimer) clearTimeout(skyTransformEaseTimer);
    skyTransformEaseTimer = setTimeout(function () {
      skyTransformEaseTimer = null;
      root.removeAttribute("data-sky-transform-ease");
    }, 700);
  }

  /** Scroll drift is folded into applySky (nx/ny); keep CSS parallax at 0 on home. */
  function updateSkyParallaxFromScroll() {
    if (!fixedCelestial) return;
    fixedCelestial.style.setProperty("--sky-parallax-x", "0px");
    fixedCelestial.style.setProperty("--sky-parallax-y", "0px");
    if (!lotorHome || detailOpen || reduceMotion) return;
    if (programmaticScrollSceneId && document.documentElement.getAttribute("data-sky-transform-ease") === "1") {
      return;
    }
    applySkyForScene(activeSceneId);
  }

  function applySkyForScene(id) {
    var f = focalNormals(id);
    var z = measureZoomForSection(id);
    applySky({ nx: f.nx, ny: f.ny, zoom: z, sceneId: id });
  }

  function applySkyDetail(relPath) {
    beginSkyTransformEase();
    var d = detailFocals[relPath];
    if (d && typeof d.nx === "number" && typeof d.ny === "number" && typeof d.zoom === "number") {
      applySky({ nx: d.nx, ny: d.ny, zoom: d.zoom });
      return;
    }
    applySkyForScene(activeSceneId);
  }

  function setScene(id, opts) {
    opts = opts || {};
    if (!document.querySelector('.lotor-scene[data-scene="' + id + '"]')) return;
    var sceneAlreadyActive =
      activeSceneId === id && document.documentElement.getAttribute("data-home-scene") === id;
    if (sceneAlreadyActive && !opts.force) {
      setActiveNav(id);
      return;
    }
    cancelHomeActiveSceneLayoutSyncs();
    activeSceneId = id;
    sceneSections.forEach(function (sec) {
      var on = sec.getAttribute("data-scene") === id;
      sec.classList.toggle("is-active", on);
    });
    if (mainStage) mainStage.setAttribute("data-active-scene", id);
    document.documentElement.setAttribute("data-home-scene", id);
    syncHomeMapOverlay(id);
    syncHomeQualsStrip();
    syncHomeFixedStackLayer();
    if (!detailOpen) {
      beginSkyTransformEase();
      scheduleActiveHomeSceneLayoutSync(id, HOME_SCENE_ENTRY_LAYOUT_DELAYS);
    }
    setActiveNav(id);
  }

  function syncHomeQualsStrip() {
    var qualsEl = document.getElementById("home-quals-strip");
    if (qualsEl) {
      var showQ = activeSceneId === "quals" && !detailOpen;
      qualsEl.hidden = !showQ;
      qualsEl.setAttribute("aria-hidden", showQ ? "false" : "true");
    }
    var capEl = document.getElementById("home-capabilities-strip");
    if (capEl) {
      var showC = activeSceneId === "capabilities" && !detailOpen;
      capEl.hidden = !showC;
      capEl.setAttribute("aria-hidden", showC ? "false" : "true");
    }
  }

  function scheduleHistoryScene(id) {
    if (detailOpen) return;
    clearTimeout(historySceneTimer);
    historySceneTimer = setTimeout(function () {
      if (detailOpen) return;
      var want = "#" + id;
      if ((location.hash || "").indexOf("#detail/") === 0) return;
      if (location.hash !== want) {
        try {
          history.replaceState(null, "", want);
        } catch (e) {}
      }
    }, 160);
  }

  function enableSkyTransitionsSoon() {
    if (reduceMotion) {
      document.documentElement.classList.add("lotor-sky-ready");
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.documentElement.classList.add("lotor-sky-ready");
      });
    });
  }

  var railLinks = document.querySelectorAll(".scroll-rail__link[data-scene-target]");
  var navLinks = document.querySelectorAll("#site-nav .nav-links a[href^='#']");

  function setActiveNav(id) {
    railLinks.forEach(function (a) {
      var t = a.getAttribute("data-scene-target");
      a.classList.toggle("is-active", t === id);
    });
    navLinks.forEach(function (a) {
      var href = a.getAttribute("href") || "";
      var hash = href.charAt(0) === "#" ? href.slice(1) : "";
      if (hash === id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function dominantSceneId() {
    var root = homeScrollRoot();
    var vh;
    var topBound;
    var bottomBound;
    if (root && root.clientHeight > 0) {
      var rr = root.getBoundingClientRect();
      vh = rr.height;
      topBound = rr.top;
      bottomBound = rr.bottom;
    } else {
      vh = layoutViewportDimensions().h || window.innerHeight || 1;
      topBound = 0;
      bottomBound = vh;
    }
    var targetY = topBound + vh * 0.32;
    var best = "intro";
    var bestScore = -1;
    sceneSections.forEach(function (sec) {
      var sid = sec.getAttribute("data-scene");
      if (!sid) return;
      var r = sec.getBoundingClientRect();
      var visible = Math.max(0, Math.min(r.bottom, bottomBound) - Math.max(r.top, topBound));
      if (visible < vh * 0.08) return;
      var cy = (r.top + r.bottom) / 2;
      var score = visible / vh - Math.abs(cy - targetY) / vh * 0.35;
      if (score > bestScore) {
        bestScore = score;
        best = sid;
      }
    });
    if (bestScore < 0 && root && root.scrollTop + root.clientHeight >= root.scrollHeight - 16) {
      return "contact";
    }
    if (bestScore < 0) return activeSceneId;
    return best;
  }

  function updateAmbientScrollFraction() {
    var root = homeScrollRoot();
    var max;
    var st;
    if (root && root.scrollHeight > root.clientHeight) {
      max = root.scrollHeight - root.clientHeight;
      st = root.scrollTop;
    } else {
      var doc = document.documentElement;
      max = doc.scrollHeight - doc.clientHeight;
      st = doc.scrollTop || document.body.scrollTop || 0;
    }
    var p = max > 0 ? st / max : 0;
    document.documentElement.style.setProperty("--ambient-scroll", String(round4(Math.min(1, Math.max(0, p)))));
  }

  function scheduleDominantSceneCheck() {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(function () {
      scrollScheduled = false;
      if (detailOpen) return;
      var d = dominantSceneId();
      if (d !== activeSceneId) {
        if (programmaticScrollSceneId && d !== programmaticScrollSceneId) {
          /* Smooth scroll in progress: viewport still reads previous section. */
          dominantSceneHoldCandidate = null;
          dominantSceneHoldCount = 0;
        } else {
          if (d === dominantSceneHoldCandidate) {
            dominantSceneHoldCount++;
          } else {
            dominantSceneHoldCandidate = d;
            dominantSceneHoldCount = 1;
          }
          if (dominantSceneHoldCount >= DOMINANT_SCENE_HOLD_FRAMES) {
            setScene(d, {});
            dominantSceneHoldCandidate = null;
            dominantSceneHoldCount = 0;
          }
        }
      } else {
        dominantSceneHoldCandidate = null;
        dominantSceneHoldCount = 0;
      }
      if (programmaticScrollSceneId && d === programmaticScrollSceneId && activeSceneId === programmaticScrollSceneId) {
        clearProgrammaticScrollLock();
      }
      scheduleHistoryScene(dominantSceneId());
    });
  }

  function isQualPageHref(href) {
    return /^quals\/[^/]+\.html$/i.test((href || "").replace(/^\.\//, ""));
  }

  function isCapabilityDetailHref(href) {
    return /^capabilities\/[^/]+\.html$/i.test((href || "").replace(/^\.\//, ""));
  }

  function redirectQualPageFromHash(path) {
    if (!isQualPageHref(path)) return false;
    try {
      location.replace(path);
    } catch (e) {
      try {
        location.href = path;
      } catch (e2) {}
    }
    return true;
  }

  function fitQualSheetIn(host) {
    if (!host || !host.classList.contains("qual-sheet")) return;
    var wrap = host.querySelector(".qual-sheet__scale-wrap");
    var fit = host.querySelector(".qual-sheet__fit");
    if (!wrap || !fit) return;
    /* Full qual pages: natural scroll + full-size type (no scale-to-fit). */
    if (document.documentElement.classList.contains("page-qual")) {
      fit.style.transform = "";
      fit.style.width = "100%";
      return;
    }
    var aw = wrap.clientWidth;
    var ah = wrap.clientHeight;
    if (aw < 2) return;
    /* First frames / some browsers: flex slot not measured yet; use layout box or viewport fallback */
    if (ah < 8) {
      var br = wrap.getBoundingClientRect();
      ah = br.height;
      if (ah < 8) {
        var mainEl = document.getElementById("main");
        if (mainEl) {
          var mr = mainEl.getBoundingClientRect();
          ah = Math.max(0, mr.height - 8);
        }
      }
      if (ah < 8) {
        ah = Math.max(280, (window.innerHeight || document.documentElement.clientHeight || 600) * 0.62);
      }
    }

    /* Reset transform; measure natural size off-screen (abs + flex min-heights under-report scrollHeight). */
    fit.style.transform = "";
    fit.style.width = "100%";
    var prev = {
      pos: fit.style.position,
      left: fit.style.left,
      top: fit.style.top,
      vis: fit.style.visibility,
      pe: fit.style.pointerEvents,
      w: fit.style.width,
    };
    fit.style.position = "fixed";
    fit.style.left = "0";
    fit.style.top = "0";
    fit.style.visibility = "hidden";
    fit.style.pointerEvents = "none";
    fit.style.width = aw + "px";
    void fit.offsetHeight;
    var nw = Math.max(fit.scrollWidth, fit.offsetWidth);
    var nh = Math.max(fit.scrollHeight, fit.offsetHeight);
    fit.style.position = prev.pos;
    fit.style.left = prev.left;
    fit.style.top = prev.top;
    fit.style.visibility = prev.vis;
    fit.style.pointerEvents = prev.pe;
    fit.style.width = prev.w;
    void fit.offsetHeight;

    if (nh < 2) return;
    var s = Math.min(1, aw / Math.max(nw, 1), ah / Math.max(nh, 1));
    if (s < 0.997) {
      fit.style.transformOrigin = "top center";
      fit.style.width = (100 / s).toFixed(5) + "%";
      fit.style.transform = "scale(" + s.toFixed(5) + ")";
    }
  }

  var qualSheetFitRaf = 0;
  function scheduleQualSheetFit() {
    if (!document.querySelector(".qual-sheet")) return;
    if (qualSheetFitRaf) return;
    qualSheetFitRaf = requestAnimationFrame(function () {
      qualSheetFitRaf = 0;
      document.querySelectorAll(".qual-sheet").forEach(fitQualSheetIn);
    });
  }

  function bindQualSheetResizeObserve(host) {
    if (!host || typeof ResizeObserver === "undefined") return;
    var w = host.querySelector(".qual-sheet__scale-wrap");
    if (!w || w.dataset.qualSheetRo) return;
    w.dataset.qualSheetRo = "1";
    var ro = new ResizeObserver(function () {
      scheduleQualSheetFit();
    });
    ro.observe(w);
  }

  function buildQualSheetCapGrid() {
    document.querySelectorAll(".qual-sheet").forEach(function (sheet) {
      sheet.querySelectorAll(".qual-sheet__cap-grid").forEach(function (g) {
        g.remove();
      });
      var intro = sheet.querySelector(".qual-sheet__intro");
      var hero = sheet.querySelector(".qual-sheet__hero");
      if (!intro || !hero) return;
      var strip = intro.querySelector(".qual-sheet__title-strip");
      if (!strip) {
        strip = document.createElement("div");
        strip.className = "qual-sheet__title-strip";
        hero.parentNode.insertBefore(strip, hero);
        strip.appendChild(hero);
      }
      var allNodes = sheet.querySelectorAll(".qual-sky__nodes .qual-sky-node");
      if (!allNodes.length) return;
      var nav = document.createElement("nav");
      nav.className = "qual-sheet__cap-grid";
      nav.setAttribute("aria-label", "Related capabilities");
      for (var i = 0; i < allNodes.length; i++) {
        var src = allNodes[i];
        var link = document.createElement("a");
        link.href = src.getAttribute("href") || "#";
        var label = (src.textContent || "").replace(/\s+/g, " ").trim();
        link.textContent = label;
        link.setAttribute("title", label);
        link.className = "qual-sheet__cap-cell";
        if (src.classList.contains("qual-sky-node--active")) {
          link.classList.add("qual-sheet__cap-cell--active");
        }
        if (src.classList.contains("qual-sky-node--core")) {
          link.classList.add("qual-sheet__cap-cell--core");
        }
        nav.appendChild(link);
      }
      strip.appendChild(nav);
    });
    scheduleQualSheetFit();
  }

  function rewriteFragmentRoots(el) {
    el.querySelectorAll("[href],[src]").forEach(function (node) {
      ["href", "src"].forEach(function (attr) {
        var v = node.getAttribute(attr);
        if (!v || v.charAt(0) === "#" || /^[a-z][a-z0-9+.-]*:/i.test(v)) return;
        if (v.indexOf("../") === 0) {
          node.setAttribute(attr, v.replace(/^\.\.\//, ""));
        } else if (v.indexOf("./") === 0) {
          node.setAttribute(attr, v.slice(2));
        }
      });
    });
  }

  function getFocusableInDialog() {
    if (!detailDialog) return [];
    var sel =
      'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';
    return Array.prototype.slice.call(detailDialog.querySelectorAll(sel)).filter(function (n) {
      return n.offsetParent !== null || n === detailBackBtn;
    });
  }

  function onDetailKeydown(ev) {
    if (!detailDialog || !detailDialog.open) return;
    if (ev.key !== "Tab") return;
    var list = getFocusableInDialog();
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (ev.shiftKey) {
      if (document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  }

  function pulseSkyJump() {
    if (reduceMotion || detailOpen) return;
    document.documentElement.classList.remove("lotor-sky-pulse");
    void document.documentElement.offsetWidth;
    document.documentElement.classList.add("lotor-sky-pulse");
    setTimeout(function () {
      document.documentElement.classList.remove("lotor-sky-pulse");
    }, 220);
  }

  function runWithViewTransition(fn) {
    if (reduceMotion || typeof document.startViewTransition !== "function") {
      fn();
      return;
    }
    try {
      var vt = document.startViewTransition(function () {
        fn();
      });
      if (!vt || !vt.finished || typeof vt.finished.finally !== "function") {
        /* no-op */
      }
    } catch (e) {
      fn();
    }
  }

  function openDetail(relPath, opts) {
    opts = opts || {};
    if (isQualPageHref(relPath)) {
      try {
        location.href = relPath;
      } catch (e) {}
      return;
    }
    if (!detailDialog || !detailBodyEl) return;
    if (detailFetchAbort) {
      try {
        detailFetchAbort.abort();
      } catch (e) {}
    }
    detailFetchAbort = typeof AbortController !== "undefined" ? new AbortController() : null;
    detailOpen = true;
    detailPathOpen = relPath;
    applySkyDetail(relPath);
    syncHomeMapOverlay(activeSceneId);
    syncHomeQualsStrip();
    syncHomeFixedStackLayer();
    updateSkyParallaxFromScroll();
    if (detailLoadingEl) {
      detailLoadingEl.hidden = false;
      detailLoadingEl.textContent = "Loading…";
      detailLoadingEl.setAttribute("aria-busy", "true");
    }
    detailBodyEl.innerHTML = "";
    if (!detailDialog.open) {
      try {
        detailDialog.showModal();
      } catch (e) {}
    }

    fetch(relPath, {
      credentials: "same-origin",
      signal: detailFetchAbort ? detailFetchAbort.signal : undefined,
    })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then(function (html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, "text/html");
        var mainEl = doc.querySelector("#main");
        if (!mainEl) throw new Error("no main");
        var block =
          mainEl.querySelector(".qual-page__wrap") || mainEl.querySelector(".panel__inner--deck");
        if (!block) throw new Error("no content block");
        var titleText = "";
        var h1 = doc.querySelector("h1");
        if (h1) titleText = h1.textContent.trim();
        if (!titleText) {
          var t = doc.querySelector("title");
          if (t) titleText = t.textContent.replace(/\s*—\s*lotor lab\s*$/i, "").trim();
        }
        if (detailTitleEl) detailTitleEl.textContent = titleText || relPath;
        document.title = (titleText || relPath) + " — lotor lab";

        var clone = block.cloneNode(true);
        var backNav = clone.querySelector(".page-back-nav");
        if (backNav) backNav.remove();
        rewriteFragmentRoots(clone);
        detailBodyEl.innerHTML = "";
        detailBodyEl.appendChild(clone);
        bindQualSheetResizeObserve(clone);
        buildQualSheetCapGrid();
        scheduleQualSheetFit();
        requestAnimationFrame(scheduleQualSheetFit);
        setTimeout(scheduleQualSheetFit, 200);

        if (detailLoadingEl) {
          detailLoadingEl.hidden = true;
          detailLoadingEl.setAttribute("aria-busy", "false");
        }

        function reveal() {
          if (detailBackBtn) detailBackBtn.focus();
          if (!opts.skipHistory) {
            try {
              history.pushState({ lotorDetail: relPath }, "", "#detail/" + relPath);
            } catch (e) {}
          }
        }

        if (opts.useViewTransition) runWithViewTransition(reveal);
        else reveal();
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        if (detailLoadingEl) {
          detailLoadingEl.hidden = false;
          detailLoadingEl.textContent = "Could not load this page.";
          detailLoadingEl.setAttribute("aria-busy", "false");
        }
        detailOpen = false;
        detailPathOpen = "";
        document.title = baseDocumentTitle;
        beginSkyTransformEase();
        applySkyForScene(activeSceneId);
        scheduleHomeMapLeaderSyncAfterSky(activeSceneId);
        syncHomeMapOverlay(activeSceneId);
        syncHomeQualsStrip();
        syncHomeFixedStackLayer();
        try {
          detailDialog.close();
        } catch (e) {}
      });
  }

  function openDetailFromUser(relPath) {
    lastFocusBeforeDetail = document.activeElement;
    openDetail(relPath, { useViewTransition: !reduceMotion });
  }

  function closeDetailUi() {
    if (detailFetchAbort) {
      try {
        detailFetchAbort.abort();
      } catch (e) {}
      detailFetchAbort = null;
    }
    if (detailDialog && detailDialog.open) {
      try {
        detailDialog.close();
      } catch (e) {}
    }
    detailOpen = false;
    detailPathOpen = "";
    if (detailBodyEl) detailBodyEl.innerHTML = "";
    document.title = baseDocumentTitle;
    beginSkyTransformEase();
    syncHomeMapOverlay(activeSceneId);
    syncHomeQualsStrip();
    syncHomeFixedStackLayer();
    if (lotorHome) scheduleActiveHomeSceneLayoutSync(activeSceneId, HOME_SCENE_ENTRY_LAYOUT_DELAYS);
    if (lastFocusBeforeDetail && typeof lastFocusBeforeDetail.focus === "function") {
      try {
        lastFocusBeforeDetail.focus();
      } catch (e) {}
    }
    lastFocusBeforeDetail = null;
  }

  function parseHash() {
    var raw = (location.hash || "").replace(/^#/, "");
    if (raw.indexOf("detail/") === 0) {
      var path = raw.slice(7);
      if (isCapabilityDetailHref(path) || isQualPageHref(path)) return { kind: "detail", path: path };
    }
    if (raw && document.querySelector('.lotor-scene[data-scene="' + raw + '"]')) {
      return { kind: "scene", id: raw };
    }
    return { kind: "scene", id: "intro" };
  }

  function syncHomeLayoutViewport() {
    if (!document.documentElement.classList.contains("lotor-home")) return;
    var lay = layoutViewportDimensions();
    var hdr = document.querySelector(".site-header");
    var h = hdr ? hdr.getBoundingClientRect().height : 0;
    var hb = hdr ? hdr.getBoundingClientRect().bottom : 0;
    if (h >= 40 && h <= 220) {
      document.documentElement.style.setProperty("--lotor-header-h", Math.ceil(h * 1000) / 1000 + "px");
    }
    syncViewportComponentCssVars(lay);
    syncViewportFocusedHomePanels({
      lay: lay,
      headerHeight: h >= 40 && h <= 220 ? h : headerHeightForSky(),
      headerBottom: hb >= 0 ? hb : 0,
    });
    syncHomeFixedStackLayer();
  }

  /** Header scrim + progress bar from one scroll read (home: #home-scrollport, inner: window). */
  function updateChromeScrollDerived() {
    var hsr = document.getElementById("home-scrollport");
    var isHome = document.documentElement.classList.contains("lotor-home") && hsr;
    var scrollTop;
    var height;
    if (isHome) {
      scrollTop = hsr.scrollTop;
      height = hsr.scrollHeight - hsr.clientHeight;
    } else {
      var doc = document.documentElement;
      scrollTop = doc.scrollTop || document.body.scrollTop || 0;
      height = doc.scrollHeight - doc.clientHeight;
    }
    var hdr = document.querySelector(".site-header");
    if (hdr) hdr.classList.toggle("is-scrolled", scrollTop > 32);
    var pf = document.querySelector(".scroll-progress__fill");
    if (pf) {
      var p = height > 0 ? scrollTop / height : 0;
      pf.style.width = Math.min(100, Math.max(0, p * 100)) + "%";
    }
  }

  function initHomeAfterManifest() {
    applySkyMapSize();
    applyLeaderLineSceneFocals();
    applyHomeMapLeaderStrokeFromTuning();
    applyHomeMapLabelCssVars();
    ensureHomeMobileStackDecks();
    applyCentroidMapLabelBases("capabilities");
    applyCentroidMapLabelBases("quals");
    syncHomeMapViewportCss();
    syncHomeLayoutViewport();
    requestAnimationFrame(function () {
      ensureHomeMobileStackDecks();
    });

    function initFromHash() {
      var ph = parseHash();
      if (ph.kind === "detail" && ph.path) {
        if (redirectQualPageFromHash(ph.path)) return;
        openDetail(ph.path, { skipHistory: true, useViewTransition: false });
        enableSkyTransitionsSoon();
        return;
      }
      var id = ph.id || "intro";
      setScene(id, {});
      beginProgrammaticScrollTo(id);
      var el = document.getElementById(id);
      if (el) {
        requestAnimationFrame(function () {
          el.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "instant" });
          requestAnimationFrame(function () {
            clearProgrammaticScrollLock();
          });
        });
      } else {
        clearProgrammaticScrollLock();
      }
      try {
        if ((location.hash || "").indexOf("#detail/") !== 0 && location.hash !== "#" + id) {
          history.replaceState(null, "", "#" + id);
        }
      } catch (e) {}
      enableSkyTransitionsSoon();
    }

    initFromHash();

    sceneSections.forEach(function (sec) {
      if (reduceMotion) {
        sec.classList.add("lotor-scene--entered");
        return;
      }
      var ioRoot = homeScrollRoot();
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting && en.intersectionRatio > 0.06) {
              en.target.classList.add("lotor-scene--entered");
            }
          });
        },
        { root: ioRoot || null, rootMargin: "0px", threshold: [0, 0.06, 0.12] }
      );
      io.observe(sec);
    });

    function onHomeScrollUnified() {
      updateAmbientScrollFraction();
      updateSkyParallaxFromScroll();
      updateChromeScrollDerived();
      armProgrammaticScrollIdleFallback();
      scheduleDominantSceneCheck();
    }

    function onHomeScrollEnd() {
      clearProgrammaticScrollLock();
    }

    var scrollHomeEl = homeScrollRoot();
    if (scrollHomeEl && homeScrollChromeOnlyFn) {
      scrollHomeEl.removeEventListener("scroll", homeScrollChromeOnlyFn, { passive: true });
      homeScrollChromeOnlyFn = null;
    }
    if (scrollHomeEl) {
      scrollHomeEl.addEventListener("scroll", onHomeScrollUnified, { passive: true });
      scrollHomeEl.addEventListener("scrollend", onHomeScrollEnd, { passive: true });
    } else {
      window.addEventListener("scroll", onHomeScrollUnified, { passive: true });
    }
    var viewportRaf;
    function onViewportResize() {
      if (viewportRaf) return;
      viewportRaf = requestAnimationFrame(function () {
        viewportRaf = null;
        clearProgrammaticScrollLock();
        cancelHomeActiveSceneLayoutSyncs();
        beginSkyTransformEase();
        if (detailOpen) applySkyDetail(detailPathOpen);
        else scheduleActiveHomeSceneLayoutSync(activeSceneId, HOME_VIEWPORT_SETTLE_LAYOUT_DELAYS);
        updateAmbientScrollFraction();
        updateChromeScrollDerived();
        scheduleDominantSceneCheck();
      });
    }

    window.addEventListener("resize", onViewportResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onViewportResize);
      window.visualViewport.addEventListener("scroll", onViewportResize);
    }
    onHomeScrollUnified();

    window.addEventListener("load", function () {
      syncHomeLayoutViewport();
      if (detailOpen) applySkyDetail(detailPathOpen);
      else scheduleActiveHomeSceneLayoutSync(activeSceneId, HOME_VIEWPORT_SETTLE_LAYOUT_DELAYS);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          if (!detailOpen) scheduleActiveHomeSceneLayoutSync(activeSceneId, HOME_SCENE_ENTRY_LAYOUT_DELAYS);
        }).catch(function () {
          if (!detailOpen) scheduleActiveHomeSceneLayoutSync(activeSceneId, HOME_SCENE_ENTRY_LAYOUT_DELAYS);
        });
      }
    });

    function applySceneFromHashPop(ph) {
      var id = ph.id || "intro";
      setScene(id, {});
      beginProgrammaticScrollTo(id);
      var el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "auto" });
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            clearProgrammaticScrollLock();
          });
        });
      } else {
        clearProgrammaticScrollLock();
      }
      scheduleHistoryScene(id);
    }

    window.addEventListener("popstate", function () {
      var ph = parseHash();
      if (ph.kind === "detail" && ph.path) {
        if (redirectQualPageFromHash(ph.path)) return;
        openDetail(ph.path, { skipHistory: true, useViewTransition: false });
        return;
      }
      function closeAndScene() {
        closeDetailUi();
        applySceneFromHashPop(ph);
      }
      if (reduceMotion || typeof document.startViewTransition !== "function") {
        closeAndScene();
      } else {
        runWithViewTransition(closeAndScene);
      }
    });

    document.addEventListener(
      "click",
      function (ev) {
        var a = ev.target.closest && ev.target.closest('a[href^="#"]');
        if (!a) return;
        var href = a.getAttribute("href");
        if (!href || href === "#") return;
        if (href.charAt(0) !== "#") return;
        var id = href.slice(1);
        if (id === "main") return;
        if (!document.querySelector('.lotor-scene[data-scene="' + id + '"]')) return;
        if (ev.defaultPrevented) return;
        if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
        ev.preventDefault();
        var hdr = document.querySelector(".site-header");
        if (hdr && a.closest("#site-nav")) {
          hdr.classList.remove("is-open");
          var nt = document.querySelector(".nav-toggle");
          if (nt) nt.setAttribute("aria-expanded", "false");
        }
        beginProgrammaticScrollTo(id);
        var target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
        }
        setScene(id, {});
        pulseSkyJump();
        scheduleHistoryScene(id);
      },
      false
    );

    document.addEventListener(
      "click",
      function (ev) {
        var a = ev.target.closest && ev.target.closest("a.const-label--link[href]");
        if (!a) return;
        var href = a.getAttribute("href") || "";
        if (!isCapabilityDetailHref(href)) return;
        if (ev.defaultPrevented) return;
        if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
        ev.preventDefault();
        openDetailFromUser(href);
      },
      false
    );

    document.addEventListener(
      "mouseover",
      function (ev) {
        if (!lotorHome || detailOpen) return;
        var a = ev.target.closest && ev.target.closest("a.const-label--link[href]");
        if (!a) return;
        var href = a.getAttribute("href") || "";
        if (!isCapabilityDetailHref(href) || prefetched[href]) return;
        prefetched[href] = true;
        var link = document.createElement("link");
        link.rel = "prefetch";
        link.href = href;
        document.head.appendChild(link);
      },
      true
    );

    document.addEventListener("keydown", function (ev) {
      if (!lotorHome || detailOpen) return;
      var navKey =
        ev.key === "ArrowDown" ||
        ev.key === "ArrowUp" ||
        ev.key === "PageDown" ||
        ev.key === "PageUp";
      if (!navKey) return;
      var ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
      if (ae && ae.closest && ae.closest(".lotor-detail[open]")) return;
      var order = ["intro", "capabilities", "quals", "contact"];
      var ix = order.indexOf(activeSceneId);
      if (ix < 0) ix = 0;
      var next = ix;
      if (ev.key === "ArrowDown" || ev.key === "PageDown") next = Math.min(order.length - 1, ix + 1);
      else next = Math.max(0, ix - 1);
      if (next === ix) return;
      ev.preventDefault();
      var tid = order[next];
      beginProgrammaticScrollTo(tid);
      var el = document.getElementById(tid);
      if (el) el.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
      setScene(tid, {});
      pulseSkyJump();
      scheduleHistoryScene(tid);
    });

    if (detailDialog) {
      detailDialog.addEventListener("keydown", onDetailKeydown);
      detailDialog.addEventListener("cancel", function (ev) {
        ev.preventDefault();
        history.back();
      });
    }
    if (detailBodyEl) {
      detailBodyEl.addEventListener(
        "click",
        function (ev) {
          var a = ev.target.closest && ev.target.closest("a[href]");
          if (!a) return;
          var href = a.getAttribute("href") || "";
          if (!isCapabilityDetailHref(href)) return;
          if (ev.defaultPrevented) return;
          if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
          ev.preventDefault();
          openDetail(href, { useViewTransition: !reduceMotion, skipHistory: false });
        },
        false
      );
    }
    if (detailBackBtn) {
      detailBackBtn.addEventListener("click", function () {
        history.back();
      });
    }

    function onMotionChange() {
      reduceMotion = reduceMotionMq.matches;
      if (reduceMotion) document.documentElement.classList.add("lotor-sky-ready");
      if (!detailOpen) {
        applySkyForScene(activeSceneId);
        scheduleHomeMapLeaderSyncAfterSky(activeSceneId);
      } else applySkyDetail(detailPathOpen);
      updateSkyParallaxFromScroll();
    }
    if (reduceMotionMq.addEventListener) reduceMotionMq.addEventListener("change", onMotionChange);
    else if (reduceMotionMq.addListener) reduceMotionMq.addListener(onMotionChange);
  }

  if (lotorHome && fixedCelestial && sceneSections.length) {
    document.documentElement.classList.add("sky-journey");
    fetch("sky-manifest.json", { credentials: "same-origin" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      })
      .then(function (manifest) {
        if (manifest) mergeSkyManifest(manifest);
        initHomeAfterManifest();
      });
  }

  if (pageQual && fixedCelestial && fixedCelestial.querySelector(".celestial-mover")) {
    fetch("../sky-manifest.json", { credentials: "same-origin" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      })
      .then(function (manifest) {
        if (manifest) mergeSkyManifest(manifest);
        applySkyMapSize();
        applySkyFromQualManifest();
        if (reduceMotion) document.documentElement.classList.add("lotor-sky-ready");
        else {
          requestAnimationFrame(function () {
            document.documentElement.classList.add("lotor-sky-ready");
          });
        }
      });
  }

  /* ─── Shared chrome ─── */
  var header = document.querySelector(".site-header");
  var progressFill = document.querySelector(".scroll-progress__fill");
  if (header || progressFill) {
    var homeSp = lotorHome ? document.getElementById("home-scrollport") : null;
    if (!lotorHome || !homeSp) {
      window.addEventListener("scroll", updateChromeScrollDerived, { passive: true });
      window.addEventListener("resize", function () {
        updateChromeScrollDerived();
        scheduleQualSheetFit();
        if (pageQual && fixedCelestial && fixedCelestial.querySelector(".celestial-mover")) {
          applySkyMapSize();
          applySkyFromQualManifest();
        }
      }, { passive: true });
      updateChromeScrollDerived();
    } else {
      homeScrollChromeOnlyFn = function () {
        updateChromeScrollDerived();
      };
      homeSp.addEventListener("scroll", homeScrollChromeOnlyFn, { passive: true });
      window.addEventListener("resize", function () {
        updateChromeScrollDerived();
        scheduleQualSheetFit();
        if (pageQual && fixedCelestial && fixedCelestial.querySelector(".celestial-mover")) {
          applySkyMapSize();
          applySkyFromQualManifest();
        }
      }, { passive: true });
      updateChromeScrollDerived();
    }
  }

  document.querySelectorAll(".qual-sheet").forEach(bindQualSheetResizeObserve);

  var detailBodyForQual = document.querySelector(".lotor-detail__body");
  if (detailBodyForQual && typeof MutationObserver !== "undefined") {
    var moQual = new MutationObserver(function () {
      document.querySelectorAll(".lotor-detail .qual-sheet").forEach(bindQualSheetResizeObserve);
      buildQualSheetCapGrid();
      scheduleQualSheetFit();
    });
    moQual.observe(detailBodyForQual, { childList: true, subtree: true });
  }

  if (document.querySelector(".qual-sheet")) {
    buildQualSheetCapGrid();
    window.addEventListener("load", scheduleQualSheetFit, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(scheduleQualSheetFit);
    }
    scheduleQualSheetFit();
    setTimeout(scheduleQualSheetFit, 200);
    setTimeout(scheduleQualSheetFit, 600);
  }

  var toggle = document.querySelector(".nav-toggle");
  if (header && toggle) {
    toggle.addEventListener("click", function () {
      var open = header.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    header.querySelectorAll(".nav-links a").forEach(function (link) {
      link.addEventListener("click", function () {
        header.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* Inner pages: scroll spy for rail (if present) */
  var sections = document.querySelectorAll("[data-scroll-section]");
  var railScroll = document.querySelectorAll(".scroll-rail__link[data-scroll-target]");
  var navLinksInner = document.querySelectorAll("#site-nav .nav-links a[href^='#']");

  if (!lotorHome && sections.length && railScroll.length) {
    function sectionTop(el) {
      return el.getBoundingClientRect().top + window.scrollY;
    }

    function activeSectionIdScroll() {
      var sy = window.scrollY;
      var trigger = sy + window.innerHeight * 0.22;
      var current = sections[0].getAttribute("data-scroll-section");
      for (var i = 0; i < sections.length; i++) {
        var el = sections[i];
        if (sectionTop(el) <= trigger) current = el.getAttribute("data-scroll-section");
      }
      var doc = document.documentElement;
      if (doc.scrollHeight - sy - window.innerHeight < 4) {
        current = sections[sections.length - 1].getAttribute("data-scroll-section");
      }
      return current;
    }

    function setActiveScroll(id) {
      railScroll.forEach(function (a) {
        var t = a.getAttribute("data-scroll-target");
        a.classList.toggle("is-active", t === id);
      });
      navLinksInner.forEach(function (a) {
        var href = a.getAttribute("href") || "";
        var hash = href.charAt(0) === "#" ? href.slice(1) : "";
        if (hash === id) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
    }

    var scheduled = false;
    function onScrollSpy() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        setActiveScroll(activeSectionIdScroll());
      });
    }

    window.addEventListener("scroll", onScrollSpy, { passive: true });
    window.addEventListener("resize", onScrollSpy, { passive: true });
    onScrollSpy();
  }

  var supportsViewTimeline =
    typeof CSS !== "undefined" && CSS.supports && CSS.supports("animation-timeline", "view()");
  if (!lotorHome && !mover && !reduceMotion && !supportsViewTimeline && "IntersectionObserver" in window) {
    var ioInners = document.querySelectorAll(".panel[data-scroll-section] > .panel__inner");
    if (ioInners.length) {
      var seen = Object.create(null);
      var enterIo = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            var el = en.target;
            var panel = el.closest(".panel");
            var id = panel && panel.id;
            if (id && seen[id]) return;
            if (id) seen[id] = true;
            el.classList.add("lotor-enter");
            enterIo.unobserve(el);
          });
        },
        { root: null, rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
      );
      ioInners.forEach(function (inner) {
        var panel = inner.closest(".panel");
        var id = panel && panel.id;
        if (id === "intro") {
          inner.classList.add("lotor-enter");
          return;
        }
        enterIo.observe(inner);
      });
    }
  }

  if (lotorHome && typeof window !== "undefined") {
    window.LOTOR_HOME_MAP_TUNING = LOTOR_HOME_MAP_TUNING;
  }
})();
