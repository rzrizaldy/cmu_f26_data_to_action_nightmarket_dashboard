/* Optimization lab tab. Every combination of controls was solved offline with Gurobi
   (team-script/build_optimization_scenarios.py); this page only switches between the
   saved answers. Uses helpers from app.js (el, css, C, full, short, DATA_VERSION, D). */

const Lab = (() => {
  const GOALS = {
    visitors: { label: "most visitors", short: "Most visitors", legend: "Added evening visitors per market", fmt: (v) => full(v) },
    balanced: { label: "a balance", short: "Balanced", legend: "Balanced score: half visitors, half lift (100 = best)", fmt: (v) => Math.round(v) },
    lift: { label: "biggest lift", short: "Biggest lift", legend: "Predicted evening lift from a market", fmt: (v) => `+${Math.round(v * 100)}%` },
  };
  const S = { goal: null, K: null, r: null, D: null, focus: null };
  let O, P, map, hoodLayer, pinLayer, ringLayer, ready = false, byHood = {};

  const niceName = (p) => p.name.replace(" (City Neighborhood)", "").replaceAll(" - ", " – ");
  const scenario = (s = S) => O.scenarios[`${s.goal}|${s.K}|${s.r}|${s.D}`];
  const dateOf = (t) => O.season[t];
  const dayLabel = (t) => { const d = dateOf(t); return `${MONTH_NAMES[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`; };
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen"];
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  function metric(p) {
    if (!p.candidate) return null;
    const maxA = Math.max(...O.profiles.filter((q) => q.candidate).map((q) => q.added_per_market));
    const maxL = Math.max(...O.profiles.filter((q) => q.candidate).map((q) => q.lift));
    if (S.goal === "visitors") return p.added_per_market;
    if (S.goal === "lift") return Math.max(0, p.lift);
    return 100 * (0.5 * p.added_per_market / maxA + 0.5 * Math.max(0, p.lift) / maxL);
  }
  let cuts = [];
  function makeCuts() {
    const v = O.profiles.map(metric).filter((x) => x != null).sort((a, b) => a - b);
    cuts = [1, 2, 3, 4].map((k) => v[Math.floor((k / 5) * (v.length - 1))]);
  }
  const ramp = () => [C.ramp[0], C.ramp[1], C.ramp[3], C.ramp[4], C.ramp[6]];
  const bin = (v) => { const i = cuts.findIndex((c) => v < c); return i === -1 ? cuts.length : i; };

  /* ---------- map ---------- */
  function initMap() {
    map = L.map("lab-map", { zoomControl: true, scrollWheelZoom: false, minZoom: 10, maxZoom: 16, zoomSnap: 0.25 }).setView([40.44, -79.98], 12);
    const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
    L.tileLayer(`${esri}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { attribution: "Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors", maxZoom: 16 }).addTo(map);
    hoodLayer = L.geoJSON(D.geo, {
      style: () => ({ weight: 0.8, color: C.surface, fillOpacity: 0.85 }),
      onEachFeature: (f, layer) => {
        layer.on({
          mouseover: () => layer.setStyle({ weight: 2, color: C.ink }),
          mouseout: () => { styleHood(layer); layer.closeTooltip(); },
          click: () => setFocus(S.focus === byHood[f.properties.id].id ? null : byHood[f.properties.id].id),
        });
        layer.bindTooltip(() => tip(byHood[f.properties.id]), { sticky: true, direction: "top" });
      },
    }).addTo(map);
    map.createPane("labLabels");
    map.getPane("labLabels").style.zIndex = 450;
    map.getPane("labLabels").style.pointerEvents = "none";
    L.tileLayer(`${esri}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { pane: "labLabels", maxZoom: 16, opacity: 0.9 }).addTo(map);
    const ns = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(ns, "defs");
    defs.innerHTML = `<pattern id="lab-out" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${css("--nodata")}"/><line x1="0" y1="0" x2="0" y2="6" stroke="${C.axis}" stroke-width="1.5"/></pattern>`;
    map.getPanes().overlayPane.querySelector("svg").prepend(defs);
    ringLayer = L.layerGroup().addTo(map);
    pinLayer = L.layerGroup().addTo(map);
    const fit = () => { map.invalidateSize(); map.fitBounds(hoodLayer.getBounds(), { padding: [10, 10] }); };
    fit();
    requestAnimationFrame(fit);
    new ResizeObserver(() => map.invalidateSize()).observe(document.getElementById("lab-map"));
  }

  function tip(p) {
    const n = counts()[p.id] || 0;
    const lines = [el("div", { class: "tip-label", text: niceName(p) })];
    if (!p.candidate) {
      lines.push(el("div", { class: "tip-value", text: "Not considered" }));
      lines.push(el("div", { class: "tip-label", text: p.excluded === "unlike any past host" ? "Its traits are outside the range of the 7 past hosts, so the prediction would be a guess." : "Not enough footfall or spending data to predict a lift." }));
    } else {
      lines.push(el("div", { class: "tip-value", text: n ? `${n} market${n > 1 ? "s" : ""} in this plan` : "Not picked" }));
      lines.push(el("div", { class: "tip-label", text: `Predicted lift ${p.lift >= 0 ? "+" : ""}${Math.round(p.lift * 100)}% · usual Saturday evening ${short(p.typical_sat_evening)} visits · about ${full(p.added_per_market)} added per market` }));
    }
    if (p.host) lines.push(el("div", { class: "tip-label", text: `Past host: ${p.host}${p.observed_lift != null ? ` (measured lift ${p.observed_lift >= 0 ? "+" : ""}${Math.round(p.observed_lift * 100)}%)` : ""}` }));
    return el("div", {}, ...lines);
  }

  function styleHood(layer) {
    const p = byHood[layer.feature.properties.id];
    const v = metric(p);
    const picked = !!counts()[p.id];
    const focused = S.focus === p.id;
    layer.setStyle({
      fillColor: v == null ? "url(#lab-out)" : ramp()[bin(v)],
      fillOpacity: v == null ? 0.7 : 0.82,
      weight: focused ? 3 : picked ? 2 : 0.8,
      color: picked || focused ? C.ink : C.surface,
    });
  }

  let _counts = null;
  function counts() {
    if (_counts) return _counts;
    _counts = {};
    for (const [p] of scenario().picks) _counts[p] = (_counts[p] || 0) + 1;
    return _counts;
  }

  function renderMap() {
    hoodLayer.eachLayer(styleHood);
    ringLayer.clearLayers();
    pinLayer.clearLayers();
    const c = counts();
    const order = firstOrder();
    for (const [id, n] of Object.entries(c)) {
      const p = P[id];
      const focused = S.focus === id;
      ringLayer.addLayer(L.circle([p.lat, p.lon], { radius: S.r * 1000, color: C.ink, weight: focused ? 1.6 : 1, dashArray: "4 5", fill: false, opacity: focused ? 0.9 : 0.45, interactive: false }));
      const icon = L.divIcon({ className: "", html: `<div class="pin${focused ? " on" : ""}"><span>${order[id]}</span>${n > 1 ? `<em>×${n}</em>` : ""}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
      const m = L.marker([p.lat, p.lon], { icon, keyboard: false, riseOnHover: true }).addTo(pinLayer);
      m.bindTooltip(() => tip(p), { direction: "top", offset: [0, -12] });
      m.on("click", () => setFocus(S.focus === id ? null : id));
    }
  }

  // pin number = order of first appearance in the season (matches the schedule list)
  function firstOrder() {
    const o = {};
    let k = 0;
    for (const [p] of scenario().picks) if (!(p in o)) o[p] = ++k;
    return o;
  }

  function renderLegend() {
    const g = GOALS[S.goal];
    const r = ramp();
    const lo = GOALS[S.goal].fmt(Math.min(...O.profiles.map(metric).filter((x) => x != null)));
    const hi = GOALS[S.goal].fmt(Math.max(...O.profiles.map(metric).filter((x) => x != null)));
    document.getElementById("lab-legend").replaceChildren(
      el("div", { class: "legend-title", text: g.legend }),
      el("div", { class: "legend-scale" }, ...r.map((c) => { const s = el("span"); s.style.background = c; return s; })),
      el("div", { class: "legend-labels" }, el("span", { text: lo }), el("span", { text: hi })),
      el("div", { class: "legend-extra" },
        el("span", {}, el("i", { class: "swatch-pin" }), "picked (number = order)"),
        el("span", {}, el("i", { class: "swatch-ring" }), `${S.r} km zone, kept clear for 3 weeks`),
        el("span", {}, el("i", { class: "swatch-nodata" }), "not considered")),
    );
  }

  /* ---------- the string of lights: 27 Saturdays ---------- */
  function renderLights() {
    const svg = document.getElementById("lab-lights");
    const W = svg.clientWidth || 600, n = O.season.length, pad = 10, top = 12, sag = 10;
    const x = (i) => pad + (i / (n - 1)) * (W - 2 * pad);
    const posts = O.season.map((d, i) => (i === 0 || i === n - 1 || +d.slice(8, 10) <= 7 ? i : null)).filter((i) => i != null);
    const wireY = (i) => { const a = posts.filter((p) => p <= i).pop(), b = posts.find((p) => p > i) ?? a; return a === b ? top : top + sag * Math.sin(Math.PI * (i - a) / (b - a)); };
    let d = `M ${x(0)} ${top}`;
    for (let k = 0; k < posts.length - 1; k++) d += ` Q ${(x(posts[k]) + x(posts[k + 1])) / 2} ${top + 2 * sag} ${x(posts[k + 1])} ${top}`;
    const at = Object.fromEntries(scenario().picks.map(([p, t]) => [t, p]));
    const ns = "http://www.w3.org/2000/svg";
    const node = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text) e.textContent = text; return e; };
    const parts = [node("path", { class: "wire", d })];
    O.season.forEach((date, i) => {
      const cx = x(i), wy = wireY(i), cy = wy + 9, p = at[i];
      const on = p && S.focus === p;
      parts.push(node("line", { class: "drop", x1: cx, y1: wy, x2: cx, y2: cy - 3 }));
      if (on) parts.push(node("circle", { class: "halo", cx, cy, r: 11 }));
      const b = node("circle", { class: `bulb${p ? " lit" : ""}`, cx, cy, r: p ? 5 : 3 });
      b.append(node("title", {}, p ? `${dayLabel(i)}: ${niceName(P[p])}` : `${dayLabel(i)}: no market`));
      if (p) { b.style.cursor = "pointer"; b.addEventListener("click", () => setFocus(S.focus === p ? null : p)); }
      parts.push(b);
      if (+date.slice(8, 10) <= 7) parts.push(node("text", { class: "year", x: cx, y: 62, "text-anchor": i === 0 ? "start" : "middle" }, MONTH_NAMES[+date.slice(5, 7) - 1]));
    });
    svg.setAttribute("viewBox", `0 0 ${W} 70`);
    svg.replaceChildren(...parts);
    const f = S.focus && scenario().picks.filter(([p]) => p === S.focus).map(([, t]) => dayLabel(t));
    document.getElementById("lab-date").textContent = f && f.length ? f.join(" · ") : "May–Oct 2027";
  }

  /* ---------- panel ---------- */
  function renderPanel() {
    const s = scenario(), c = counts(), ids = Object.keys(c);
    const areas = new Set(ids.map((id) => P[id].area));
    document.getElementById("lab-total").textContent = `≈${full(Math.round(s.added_visitors / 100) * 100)}`;
    const top = ids.filter((id) => c[id] === Math.max(...Object.values(c))).map((id) => niceName(P[id]));
    const hosts = ids.filter((id) => P[id].host).map((id) => niceName(P[id]));
    document.getElementById("lab-lede").replaceChildren(
      `${cap(words[s.picks.length] ?? String(s.picks.length))} markets in `, el("b", { text: `${ids.length} neighborhoods` }),
      `, across ${areas.size} of the 5 city areas. `,
      top.length && Math.max(...Object.values(c)) > 1 ? `${listJoin(top)} ${top.length > 1 ? "each host" : "hosts"} ${words[Math.max(...Object.values(c))]}. ` : "",
      hosts.length ? `${listJoin(hosts)} ${hosts.length > 1 ? "have" : "has"} hosted a market before; the rest would be new.` : "None of them has hosted a market before.",
    );
    const stat = (label, value, foot) => el("div", {}, el("dt", { text: label }), el("dd", {}, value, foot ? el("span", { class: "foot", text: foot }) : null));
    const avgLift = s.picks.reduce((a, [p]) => a + Math.max(0, P[p].lift), 0) / s.picks.length;
    document.getElementById("lab-stats").replaceChildren(
      stat("Markets", String(s.picks.length), `budget ${S.K}`),
      stat("Neighborhoods", String(ids.length), `at least ${Math.min(O.fixed.min_neighborhoods, S.K)}`),
      stat("City areas", `${areas.size} of 5`, `at least ${S.D}`),
      stat("Avg. lift", `+${Math.round(avgLift * 100)}%`, "per market"),
    );

    // same rules, other goals
    const others = Object.keys(GOALS).map((g) => ({ g, s: scenario({ ...S, goal: g }) }));
    const max = Math.max(...others.map((o) => o.s.added_visitors));
    document.getElementById("lab-goals").replaceChildren(...others.map(({ g, s: o }) => {
      const hoods = new Set(o.picks.map(([p]) => p)).size;
      const b = el("button", { type: "button", class: `goal-bar${g === S.goal ? " on" : ""}`, "aria-pressed": String(g === S.goal) },
        el("span", { class: "gb-name", text: GOALS[g].short }),
        el("span", { class: "gb-track" }, (() => { const i = el("i"); i.style.width = `${(o.added_visitors / max) * 100}%`; return i; })()),
        el("span", { class: "gb-val", text: `≈${short(o.added_visitors)}` }),
        el("span", { class: "gb-foot", text: `${hoods} neighborhoods, average lift +${Math.round(o.picks.reduce((a, [p]) => a + Math.max(0, P[p].lift), 0) / o.picks.length * 100)}%` }));
      b.addEventListener("click", () => set("goal", g));
      return b;
    }));

    // schedule
    const order = firstOrder();
    document.getElementById("lab-schedule").replaceChildren(...s.picks.map(([id, t, gain]) => {
      const p = P[id];
      const li = el("li", { class: S.focus === id ? "on" : "", tabindex: "0" },
        el("span", { class: "s-date", text: dayLabel(t) }),
        el("span", { class: "s-pin", text: String(order[id]) }),
        el("span", { class: "s-name" }, niceName(p), el("span", { class: "s-meta", text: `${p.area}${p.host ? " · past host" : ""}${/north_shore/.test(id) ? " · crowd includes stadium game days" : ""}` })),
        el("span", { class: "s-val" }, `+${Math.round(Math.max(0, p.lift) * 100)}%`, el("span", { class: "s-meta", text: `≈${short(gain)} visitors` })));
      const go = () => setFocus(S.focus === id ? null : id);
      li.addEventListener("click", go);
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      li.addEventListener("mouseenter", () => highlight(id, true));
      li.addEventListener("mouseleave", () => highlight(id, false));
      return li;
    }));

    // rules, recomputed from the schedule
    const per = Math.max(...Object.values(c));
    const minGap = minSpacing(s.picks);
    const rule = (ok, text, detail) => el("li", { class: ok ? "ok" : "bad" }, el("span", { class: "r-mark", "aria-hidden": "true", text: ok ? "✓" : "✕" }), el("span", {}, text, el("span", { class: "s-meta", text: detail })));
    document.getElementById("lab-rules").replaceChildren(
      rule(true, "One market a night", "one city-backed market per Saturday"),
      rule(s.picks.length <= S.K, `At most ${S.K} markets`, `uses ${s.picks.length}`),
      rule(per <= O.fixed.cap_per_neighborhood, `At most ${O.fixed.cap_per_neighborhood} per neighborhood`, `busiest gets ${per}`),
      rule(minGap.ok, `Spaced out: within any 3 weeks, at most one market within ${S.r} km of any neighborhood`, minGap.text),
      rule(ids.length >= Math.min(O.fixed.min_neighborhoods, S.K), `At least ${Math.min(O.fixed.min_neighborhoods, S.K)} different neighborhoods`, `gets ${ids.length}`),
      rule(areas.size >= S.D, `At least ${S.D} of 5 city areas`, `reaches ${areas.size}: ${[...areas].join(", ")}`),
    );
    const n = O.profiles.filter((p) => p.candidate).length;
    document.getElementById("lab-solver").textContent = `${n} candidate neighborhoods × ${O.season.length} Saturdays. ${O.solver.name} proved every one of the ${Object.keys(O.scenarios).length} settings optimal in under ${Math.max(0.1, O.solver.max_seconds).toFixed(1)} s each (at most ${full(O.solver.max_vars)} variables). Solved ${O.built}; predictions come from 7 past hosts, so treat the numbers as rough.`;
  }

  function minSpacing(picks) {
    let closest = null;
    for (let i = 0; i < picks.length; i++) for (let j = i + 1; j < picks.length; j++) {
      const [a, ta] = picks[i], [b, tb] = picks[j];
      if (Math.abs(ta - tb) >= 3) continue;
      const km = dist(P[a], P[b]);
      if (closest == null || km < closest) closest = km;
    }
    return { ok: closest == null || closest >= S.r, text: closest == null ? "no two markets fall within 3 weeks of each other" : `closest pair within 3 weeks is ${closest.toFixed(1)} km apart` };
  }
  function dist(a, b) {
    const r = Math.PI / 180, dl = (b.lon - a.lon) * r;
    return 2 * 6371 * Math.asin(Math.sqrt(Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dl / 2) ** 2));
  }
  const listJoin = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

  function highlight(id, on) {
    pinLayer.eachLayer((m) => {
      const ll = m.getLatLng();
      if (ll.lat === P[id].lat && ll.lng === P[id].lon) m.getElement()?.firstChild?.classList.toggle("hover", on);
    });
  }

  /* ---------- controls ---------- */
  function seg(id, key, options, fmt) {
    const box = document.getElementById(id);
    box.replaceChildren(...options.map((v) => {
      const b = el("button", { type: "button", "aria-pressed": String(v === S[key]), text: fmt(v) });
      b.addEventListener("click", () => set(key, v));
      return b;
    }));
  }
  function renderControls() {
    seg("lab-k", "K", O.grid.K, String);
    seg("lab-goal", "goal", O.grid.goal, (g) => GOALS[g].label);
    seg("lab-r", "r", O.grid.r, (r) => `${r} km`);
  }
  function set(key, v) {
    S[key] = v;
    _counts = null;
    if (S.focus && !counts()[S.focus]) S.focus = null;
    render();
  }
  function setFocus(id) {
    S.focus = id;
    renderMap();
    renderLights();
    renderPanel();
  }
  function render() {
    makeCuts();
    renderControls();
    renderMap();
    renderLegend();
    renderLights();
    renderPanel();
  }

  async function show() {
    if (ready) { map.invalidateSize(); return; }
    ready = true;
    O = await fetch(`data/optimization.json?v=${DATA_VERSION}`).then((r) => { if (!r.ok) throw new Error(`optimization.json: ${r.status}`); return r.json(); });
    P = Object.fromEntries(O.profiles.map((p) => [p.id, p]));
    for (const p of O.profiles) for (const h of p.neighborhoods) byHood[h] = p;
    Object.assign(S, O.default);
    initMap();
    render();
    let t;
    window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(renderLights, 150); });
  }
  return { show };
})();
