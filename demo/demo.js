/* Hidden demo: a self-playing walk through Predict -> Optimize -> Decide, centred on the
   optimization. Not linked from the dashboard; open /demo/ from the lecture slides.
   Space pauses, arrows or a clicker skip steps, R restarts, F toggles full screen.
   ?pace=1.5 makes every step 1.5x longer, ?step=3 opens at step 3, ?autoplay=1 skips the start screen.
   Data: ../data/optimization.json (team-script/build_optimization_scenarios.py). */

const qs = new URLSearchParams(location.search);
const PACE = Math.min(4, Math.max(0.25, +qs.get("pace") || 1));
const DATA_VERSION = "2026-09-30s";
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const $ = (id) => document.getElementById(id);
const V = {
  paper: css("--paper"), wash: css("--wash"), ink: css("--ink"), ink2: css("--ink-2"), axis: css("--axis"), rule: css("--rule"),
  nodata: css("--nodata"), cand: css("--cand"), lantern: css("--lantern"), bad: css("--bad"), series: css("--series"),
  ramp: [1, 2, 3, 4, 5].map((i) => css(`--ramp-${i}`)),
  areas: [1, 2, 3, 4, 5].map((i) => css(`--area-${i}`)),
  budget: ["low", "mid", "high"].map((k) => css(`--budget-${k}`)),
};
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen"];
const words = (n) => WORDS[n] ?? String(n);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const full = (n) => Math.round(n).toLocaleString("en-US");
const short = (n) => (n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);
const signed = (v) => (Math.round(v * 100) === 0 ? "0%" : `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))}%`);
const listJoin = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
const ease = (p) => 1 - (1 - p) ** 3;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}
const NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}
function tex(src, cls) {
  const node = el("div", cls ? { class: cls } : {});
  if (window.katex) katex.render(src, node, { displayMode: true, throwOnError: false });
  else node.textContent = src;
  return node;
}

let O, P, R, GEO, REC, CAND;
const byHood = {};
const hoodLayers = [];
const scenario = (goal, K = R.K, r = R.r, D = R.D) => O.scenarios[`${goal}|${K}|${r}|${D}`];
const nice = (p) => p.name.replace(" (City Neighborhood)", "").replaceAll(" - ", " – ");
// long merged areas ("Arlington-Arlington Heights-Mount Oliver-St. Clair") read better by their first name
const shortName = (p) => { const parts = nice(p).split(/\s*[-–]\s*/); return parts.length > 2 ? `${parts[0]} area` : parts.join("–"); };
const dateLabel = (t) => { const d = O.season[t]; return `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`; };
const byDate = (picks) => picks.slice().sort((a, b) => a[1] - b[1]);
function km(a, b) {
  const r = Math.PI / 180, dl = (b.lon - a.lon) * r;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dl / 2) ** 2));
}

/* ---------- the clock: cues are relative to the current step and stop while paused ---------- */
const T = { i: 0, t: 0, playing: false, last: 0, cues: [], tweens: [], gen: 0 };
const at = (sec, fn) => T.cues.push({ t: sec * PACE, fn, done: false });
const tween = (sec, dur, fn) => T.tweens.push({ t0: sec * PACE, d: Math.max(0.01, dur * PACE), fn, done: false });

function frame(now) {
  const dt = T.last ? Math.max(0, Math.min(0.1, (now - T.last) / 1000)) : 0;
  T.last = Math.max(T.last, now);
  if (T.playing) T.t += dt;
  for (const c of T.cues) if (!c.done && T.t >= c.t) { c.done = true; c.fn(); }
  for (const w of T.tweens) if (!w.done && T.t >= w.t0) { const p = Math.min(1, (T.t - w.t0) / w.d); w.fn(ease(p)); if (p >= 1) w.done = true; }
  const bar = document.querySelector(`#flow [data-step="${T.i}"] i`);
  if (bar) bar.style.width = `${Math.min(100, (T.t / (STEPS[T.i].dur * PACE)) * 100)}%`;
  if (T.playing && T.t >= STEPS[T.i].dur * PACE && T.i < STEPS.length - 1) go(T.i + 1);
  requestAnimationFrame(frame);
}

function go(i) {
  i = Math.max(0, Math.min(STEPS.length - 1, i));
  T.i = i; T.t = 0; T.cues = []; T.tweens = []; T.gen++;
  const s = STEPS[i];
  document.querySelectorAll("#flow [data-step]").forEach((b) => {
    const k = +b.dataset.step;
    b.querySelector("i").style.width = k < i ? "100%" : "0";
    b.setAttribute("aria-current", k === i ? "step" : "false");
  });
  document.querySelectorAll("#flow > li").forEach((li) => li.classList.toggle("on", li.dataset.phase === s.phase));
  const story = $("story");
  story.classList.add("out");
  const gen = T.gen;
  setTimeout(() => {
    if (gen !== T.gen) return;
    const n = STEPS.filter((q) => q.phase === s.phase), k = n.indexOf(s) + 1;
    $("step-no").textContent = n.length > 1 ? `${s.phase}, ${k} of ${n.length}: ${s.name}` : `${s.phase}: ${s.name}`;
    $("headline").textContent = s.head;
    $("caption").textContent = s.cap;
    $("fig").replaceChildren();
    s.enter($("fig"));
    requestAnimationFrame(() => story.classList.remove("out"));
  }, reduceMotion ? 0 : 220);
}

function setPlaying(on) {
  T.playing = on;
  document.body.classList.toggle("paused", !on && $("start").hidden);
  $("toggle").setAttribute("aria-label", on ? "Pause" : "Play");
  $("toggle-icon").setAttribute("d", on ? "M5 3v10M11 3v10" : "M5 2.5v11l8.5-5.5z");
  $("hint").textContent = on ? "Space pauses · arrows skip · F full screen" : "Paused. Space to play";
}

/* ---------- map ---------- */
let map, hoodGroup, ringLayer, pinLayer, fxLayer;
function initMap() {
  map = L.map("map", { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.1 });
  const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
  L.tileLayer(`${esri}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { attribution: "Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors", maxZoom: 16 }).addTo(map);
  hoodGroup = L.geoJSON(GEO, { style: () => ({ className: "hood", ...look.dim() }), interactive: false });
  map.fitBounds(hoodGroup.getBounds(), { padding: [14, 14] }); // the SVG renderer needs a view before layers are added
  hoodGroup.addTo(map);
  hoodGroup.eachLayer((l) => hoodLayers.push(l));
  map.createPane("labels");
  map.getPane("labels").style.zIndex = 450;
  map.getPane("labels").style.pointerEvents = "none";
  L.tileLayer(`${esri}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { pane: "labels", maxZoom: 16, opacity: 0.8 }).addTo(map);
  const defs = svg("defs");
  defs.innerHTML = `<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${V.nodata}"/><line x1="0" y1="0" x2="0" y2="6" stroke="${V.axis}" stroke-width="1.5"/></pattern>`;
  map.getPanes().overlayPane.querySelector("svg").prepend(defs);
  ringLayer = L.layerGroup().addTo(map);
  fxLayer = L.layerGroup().addTo(map);
  pinLayer = L.layerGroup().addTo(map);
  const fit = () => { map.invalidateSize(); map.fitBounds(hoodGroup.getBounds(), { padding: [14, 14] }); };
  fit();
  new ResizeObserver(fit).observe($("map"));
}

const hatch = () => ({ fillColor: "url(#hatch)", fillOpacity: 1, color: V.paper, weight: 0.6 });
const blocked = () => ({ fillColor: V.nodata, fillOpacity: 0.95, color: V.paper, weight: 0.8 });
const look = {
  dim: () => ({ fillColor: V.nodata, fillOpacity: 0.7, color: V.paper, weight: 0.8 }),
  candidates: (p) => (p?.candidate ? { fillColor: V.cand, fillOpacity: 0.95, color: V.paper, weight: 0.9 } : hatch()),
  value: (get, cuts, fade = 1) => (p) => (p?.candidate ? { fillColor: V.ramp[bin(get(p), cuts)], fillOpacity: 0.85 * fade, color: V.paper, weight: 0.8 } : hatch()),
  areas: (p) => (p ? { fillColor: V.areas[O.areas.indexOf(p.area)], fillOpacity: 0.75, color: V.paper, weight: 0.8 } : look.dim()),
};
const quintiles = (get) => {
  const v = CAND.map(get).sort((a, b) => a - b);
  return [1, 2, 3, 4].map((k) => v[Math.floor((k / 5) * (v.length - 1))]);
};
const bin = (v, cuts) => { const i = cuts.findIndex((c) => v < c); return i === -1 ? cuts.length : i; };
const liftOf = (p) => Math.max(0, p.lift);
const addedOf = (p) => p.added_per_market;

// repaint every neighborhood; with a stagger it sweeps west to east
function paint(fn, stagger = 0) {
  const gen = T.gen;
  const order = stagger ? hoodLayers.slice().sort((a, b) => a.feature.properties.lon - b.feature.properties.lon) : hoodLayers;
  order.forEach((layer, k) => {
    const apply = () => { if (gen === T.gen) layer.setStyle(fn(byHood[layer.feature.properties.id], layer.feature.properties)); };
    if (stagger && !reduceMotion) setTimeout(apply, k * stagger * PACE); else apply();
  });
}

function legend(kind) {
  const box = $("legend");
  box.hidden = !kind;
  if (!kind) return;
  const scale = (title, lo, hi) => [el("b", { text: title }), el("div", { class: "scale" }, ...V.ramp.map((c) => { const s = el("span"); s.style.background = c; return s; })), el("div", { class: "ends" }, el("span", { text: lo }), el("span", { text: hi }))];
  const key = (color, text, cls = "") => { const i = el("i", { class: cls }); if (color) i.style.background = color; return el("span", {}, i, text); };
  const parts = {
    candidates: () => [el("div", { class: "keys" }, key(V.cand, `${CAND.length} candidate neighborhoods`), key(null, "left out: too little data, or unlike any past host", "hatch"))],
    added: () => [...scale("Added evening visitors per market, from the prediction", short(Math.min(...CAND.map(addedOf))), short(Math.max(...CAND.map(addedOf)))), el("div", { class: "keys", style: "margin-top:6px" }, key(null, "not a candidate", "hatch"))],
    areas: () => [el("b", { text: "The 5 city areas" }), el("div", { class: "keys" }, ...O.areas.map((a, k) => key(V.areas[k], a)))],
    blocked: () => [el("div", { class: "keys" }, key(null, "market, numbered by first date", "pin-key"), key(V.nodata, `blocked: within ${R.r} km of a market in the last ${words(O.fixed.gap_weeks)} weeks, or full`), key(null, "has hosted before", "was-key"))],
    plan: () => [el("div", { class: "keys" }, key(null, "market, numbered by first date", "pin-key"), key(null, "has hosted a market before", "was-key"))],
  };
  box.replaceChildren(...parts[kind]());
}

/* pins, spacing rings and probes */
let pins = {}, rings = [];
function clearPins() { pinLayer.clearLayers(); ringLayer.clearLayers(); fxLayer.clearLayers(); pins = {}; rings = []; }
function addPick(id, t, { drop = true, ring = false } = {}) {
  const p = P[id];
  let s = pins[id];
  if (!s) {
    const order = Object.keys(pins).length + 1;
    const icon = L.divIcon({ className: "", html: `<div class="pin${drop && !reduceMotion ? " drop" : ""}${p.host ? " was" : ""}"><span>${order}</span><em hidden></em></div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    s = pins[id] = { marker: L.marker([p.lat, p.lon], { icon, interactive: false, keyboard: false, zIndexOffset: 1000 - order }).addTo(pinLayer), n: 0 };
  }
  s.n++;
  const node = s.marker.getElement()?.firstChild;
  if (node) {
    const em = node.querySelector("em");
    em.hidden = s.n < 2;
    em.textContent = `×${s.n}`;
    if (s.n > 1 && drop && !reduceMotion) { node.classList.remove("drop", "bump"); void node.offsetWidth; node.classList.add("bump"); }
  }
  if (ring) {
    // the spacing zone stays up for the gap weeks, then clears
    rings = rings.filter((g) => { if (t - g.t >= O.fixed.gap_weeks) { ringLayer.removeLayer(g.layer); return false; } return true; });
    rings.push({ t, id, layer: L.circle([p.lat, p.lon], { radius: R.r * 1000, className: "ring", color: V.ink, weight: 1.4, dashArray: "4 6", fillColor: V.lantern, fillOpacity: 0.1, interactive: false }).addTo(ringLayer) });
  }
}
function showPlan(picks, opts = {}) {
  clearPins();
  byDate(picks).forEach(([id, t]) => addPick(id, t, opts));
}
function tag(p, text) {
  L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: `<div class="tag">${text}</div>`, iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(fxLayer);
}
function probe(p) {
  const m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: `<div class="probe"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }), interactive: false, keyboard: false }).addTo(fxLayer);
  setTimeout(() => fxLayer.removeLayer(m), 800);
}

/* ---------- the string of lights: 27 Saturdays ---------- */
const LIGHTS = { shown: 0, lit: new Set() };
function drawLights() {
  const box = $("lights");
  const W = box.clientWidth || 900, H = box.clientHeight || 80, n = O.season.length, pad = 12, top = 10, sag = Math.min(14, H * 0.16);
  const x = (i) => pad + (i / (n - 1)) * (W - 2 * pad);
  const posts = O.season.map((d, i) => (i === 0 || i === n - 1 || +d.slice(8, 10) <= 7 ? i : null)).filter((i) => i != null);
  const wireY = (i) => { const a = posts.filter((q) => q <= i).pop(), b = posts.find((q) => q > i) ?? a; return a === b ? top : top + sag * Math.sin((Math.PI * (i - a)) / (b - a)); };
  let d = `M ${x(0)} ${top}`;
  for (let k = 0; k < posts.length - 1; k++) d += ` Q ${(x(posts[k]) + x(posts[k + 1])) / 2} ${top + 2 * sag} ${x(posts[k + 1])} ${top}`;
  const parts = [svg("path", { class: "wire", d })];
  O.season.forEach((date, i) => {
    const cx = x(i), wy = wireY(i), cy = wy + 14;
    const g = svg("g", { class: `hang${i < LIGHTS.shown ? " shown" : ""}`, style: `transform-origin:${cx}px ${wy}px;--d:${(-(i * 0.37) % 3.2).toFixed(2)}s` });
    g.append(svg("line", { class: "drop", x1: cx, y1: wy, x2: cx, y2: cy - 5 }));
    const lit = LIGHTS.lit.has(i);
    g.append(svg("circle", { class: `bulb${lit ? " lit" : ""}`, cx, cy, r: lit ? 7 : 4.5 }));
    parts.push(g);
    if (+date.slice(8, 10) <= 7) parts.push(svg("text", { class: "mo", x: cx, y: H - 2, "text-anchor": i === 0 ? "start" : "middle" }, MONTHS[+date.slice(5, 7) - 1]));
  });
  box.setAttribute("viewBox", `0 0 ${W} ${H}`);
  box.replaceChildren(...parts);
}
function lightsShow(n) {
  LIGHTS.shown = n;
  document.querySelectorAll("#lights .hang").forEach((g, i) => g.classList.toggle("shown", i < n));
}
function lightsSet(ts) {
  LIGHTS.lit = new Set(ts);
  document.querySelectorAll("#lights .bulb").forEach((b, i) => { const on = LIGHTS.lit.has(i); b.classList.toggle("lit", on); b.setAttribute("r", on ? 7 : 4.5); });
}
const note = (html) => { $("lights-note").innerHTML = html; };
const seasonNote = () => note(`<b>${O.season.length} Saturdays</b><br>May to October ${O.season[0].slice(0, 4)}`);

/* ---------- figure helpers ---------- */
function reveal(node, sec) { node.classList.add("reveal"); at(sec, () => node.classList.add("in")); return node; }
function barRows(rows, max, start, step, fmt) {
  return el("ol", { class: "rows" }, ...rows.map((r, k) => {
    const li = el("li", { class: "bar-row" }, el("span", { class: "name", text: r.name }), el("span", { class: "track" }, el("i")), el("span", { class: "val", text: fmt(r.v) }));
    li.style.setProperty("--w", `${Math.max(2, (r.v / max) * 100)}%`);
    li.style.opacity = 0;
    li.style.transition = "opacity .4s ease";
    at(start + k * step, () => { li.style.opacity = 1; li.classList.add("in"); });
    r.node = li;
    return li;
  }));
}
function counter(node, from, to, sec, dur = 0.7) {
  tween(sec, dur, (p) => { node.textContent = full(from + (to - from) * p); });
}

// trade-off curves, one per budget (green = small, red = large, like the Recommendation tab)
function frontierChart(box) {
  const Ks = Object.keys(R.frontiers).map(Number).sort((a, b) => a - b);
  const curve = (k) => R.frontiers[k].filter((f, i, a) => i === 0 || f.visitors !== a[i - 1].visitors || f.avg_lift !== a[i - 1].avg_lift);
  const all = Ks.flatMap((k) => curve(k));
  const used = [...box.children].reduce((a, c) => a + c.offsetHeight, 0);
  const W = Math.max(300, box.clientWidth), H = Math.max(180, Math.min(360, box.clientHeight - used - 92)); // leave room for the closing note
  const m = { l: 46, r: 14, t: 18, b: 36 };
  const xs = all.map((d) => d.avg_lift), ys = all.map((d) => d.visitors);
  const x0 = Math.min(...xs) - 0.1, x1 = Math.max(...xs) + 0.02, y1 = Math.max(...ys) * 1.08;
  const x = (v) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r);
  const y = (v) => H - m.b - (v / y1) * (H - m.t - m.b);
  const mix = (a, b, t) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`; };
  const color = (k) => { const t = (k - Ks[0]) / (Ks[Ks.length - 1] - Ks[0] || 1); return t < 0.5 ? mix(V.budget[0], V.budget[1], t * 2) : mix(V.budget[1], V.budget[2], (t - 0.5) * 2); };
  const s = svg("svg", { class: "frontier", viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  for (let v = 0; v <= y1; v += 10000) {
    s.append(svg("line", { class: "grid", x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
    s.append(svg("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, short(v)));
  }
  for (const v of [0.1, 0.2, 0.3, 0.4].filter((v) => v >= x0 && v <= x1)) s.append(svg("text", { x: x(v), y: H - m.b + 18, "text-anchor": "middle" }, signed(v)));
  s.append(svg("text", { x: W - m.r, y: H - 3, "text-anchor": "end" }, "Average lift per market →"));
  s.append(svg("text", { x: m.l, y: m.t - 6 }, "↑ Added evening visitors"));
  Ks.forEach((k, j) => {
    const pts = curve(k), main = k === R.K;
    const line = svg("polyline", { class: `curve${main ? " main" : ""}`, stroke: color(k), points: pts.map((d) => `${x(d.avg_lift)},${y(d.visitors)}`).join(" ") });
    const len = pts.reduce((a, d, i) => (i ? a + Math.hypot(x(d.avg_lift) - x(pts[i - 1].avg_lift), y(d.visitors) - y(pts[i - 1].visitors)) : 0), 0);
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = len;
    tween(0.3 + j * 0.25, 1.2, (p) => { line.style.strokeDashoffset = len * (1 - p); });
    s.append(line);
    pts.forEach((d) => s.append(svg("circle", { class: "dot", cx: x(d.avg_lift), cy: y(d.visitors), r: main ? 3.2 : 2.2, stroke: color(k) })));
    s.append(svg("text", { class: "k", x: x(pts[0].avg_lift) - 8, y: y(pts[0].visitors) + 4, "text-anchor": "end" }, `${k} markets`));
  });
  const marker = svg("g", { class: "marker" });
  marker.append(svg("circle", { class: "halo", r: 15 }), svg("circle", { r: 7.5 }));
  s.append(marker);
  return { node: s, move: (d) => { marker.style.transform = `translate(${x(d.avg_lift)}px, ${y(d.visitors)}px)`; } };
}

/* ---------- the steps ---------- */
let STEPS = [];
function buildSteps() {
  const K = R.K, year = +O.season[0].slice(0, 4), nT = O.season.length, nA = O.areas.length;
  const left = O.profiles.length - CAND.length;
  const ids = [...new Set(byDate(REC.picks).map(([p]) => p))];
  const addCuts = quintiles(addedOf);
  const stable = ids.filter((id) => (R.robust[id] || 0) >= 0.99).length;
  const roundTotal = (v) => full(Math.round(v / 100) * 100);
  // model size, counted the way build_optimization_scenarios.py builds it: x, z, w and each constraint family
  const nVars = CAND.length * nT + CAND.length + nA;
  const nCons = nT + 1 + CAND.length + CAND.length * nT + CAND.length + 1 + nA + 1;
  const quiet = CAND.slice().sort((a, b) => b.lift - a.lift)[0];
  const busy = CAND.slice().sort((a, b) => b.added_per_market - a.added_per_market)[0];
  const fade = look.value(addedOf, addCuts, 0.55);

  STEPS = [
    {
      phase: "Predict", name: "what the optimizer is given", dur: 15,
      head: "The prediction hands the optimizer one number per neighborhood and Saturday",
      cap: "Seven past markets trained a ridge regression that predicts each candidate's lift in evening footfall. Multiplied by the usual Saturday evening crowd, that is the value of a market there.",
      enter(fig) {
        clearPins(); lightsSet([]); lightsShow(nT); seasonNote(); legend(null);
        paint(look.candidates);
        at(0.6, () => { paint(look.value(addedOf, addCuts), 18); legend("added"); });
        const input = (sym, title, meta) => el("li", {}, tex(sym, "sym"), el("span", {}, el("b", { text: title }), el("span", { class: "meta", text: meta })));
        const vals = CAND.map(addedOf);
        fig.append(
          reveal(tex(String.raw`v_{p,t} \;=\; \underbrace{\big(e^{\hat\theta_p}-1\big)}_{\text{predicted lift}} \times \underbrace{\bar y_{p,t}}_{\text{usual crowd}}`, "eq"), 1),
          el("ul", { class: "inputs" },
            reveal(input(String.raw`v_{p,t}`, "Added evening visitors", `${CAND.length} neighborhoods × ${nT} Saturdays, up to ${short(Math.max(...vals))} per market`), 2.6),
            reveal(input(String.raw`d_{pq}`, "Distance between neighborhoods", "km between centers, for the spacing rule"), 3.6),
            reveal(input(String.raw`a(p)`, "City area of each neighborhood", `${nA} areas, for the coverage rule`), 4.6)),
          reveal(el("p", { class: "punch", html: `${shortName(quiet)} has the biggest lift (${signed(quiet.lift)}) but adds only ${short(quiet.added_per_market)} people. ${shortName(busy)} lifts ${signed(busy.lift)} and adds <b>${short(busy.added_per_market)}</b>, because it already draws a crowd.` }), 7.5),
          reveal(el("p", { class: "note", text: `${cap(words(left))} areas are left out: too little data, or unlike any place that has hosted.` }), 10));
        at(7.5, () => { tag(quiet, `${shortName(quiet)} ${signed(quiet.lift)}`); tag(busy, `${shortName(busy)} ${signed(busy.lift)}`); });
      },
    },
    {
      phase: "Optimize", name: "the decision", dur: 11,
      head: `${cap(words(K))} Saturdays next summer. Which neighborhoods get a night market?`,
      cap: `The city can back ${K} markets between May and October ${year}. Each neighborhood on each Saturday is a yes-or-no choice.`,
      enter(fig) {
        clearPins(); lightsSet([]); lightsShow(0); seasonNote(); legend(null);
        paint(look.dim);
        at(0.5, () => { paint(look.candidates, 14); legend("candidates"); });
        tween(1.2, 3.2, (p) => lightsShow(Math.round(p * nT)));
        const block = (num, label, cls = "") => el("div", { class: cls }, el("span", { class: "num", text: num }), el("small", { text: label }));
        fig.append(
          el("div", { class: "choices" },
            reveal(block(String(CAND.length), "candidate neighborhoods"), 1.2),
            reveal(el("span", { class: "op", text: "×" }), 2.4),
            reveal(block(String(nT), "Saturdays"), 2.4),
            reveal(el("span", { class: "op", text: "=" }), 4),
            reveal(block(full(CAND.length * nT), "yes-or-no choices", "total"), 4)),
          reveal(tex(String.raw`x_{p,t} = \begin{cases} 1 & \text{market in neighborhood } p \text{ on Saturday } t \\ 0 & \text{otherwise} \end{cases}`, "eq"), 5.6),
          reveal(el("p", { class: "punch", html: `Far more schedules than anyone could check by hand. <b>A solver can.</b>` }), 7.6));
      },
    },
    {
      phase: "Optimize", name: "the model", dur: 20,
      head: "A mixed-integer program: one objective, six rules",
      cap: "Maximize added visitors over the yes-or-no choices. Two helper switches, z and w, count neighborhoods and city areas.",
      enter(fig) {
        clearPins(); lightsSet([]); lightsShow(nT); seasonNote();
        paint(look.value(addedOf, addCuts)); legend("added");
        const rows = [
          [String.raw`\max_{x,z,w}\ \textstyle\sum_{p,t} v_{p,t}\, x_{p,t}`, "Most added evening visitors", "obj"],
          [String.raw`\textstyle\sum_{p} x_{p,t} \le 1 \quad \forall t`, "One market a night"],
          [String.raw`\textstyle\sum_{p,t} x_{p,t} \le K = ${K}`, `Budget: ${K} markets`],
          [String.raw`\textstyle\sum_{t} x_{p,t} \le ${O.fixed.cap_per_neighborhood} \quad \forall p`, `At most ${O.fixed.cap_per_neighborhood} in one neighborhood`],
          [String.raw`\textstyle\sum_{q:\,d_{pq}<${R.r}}\ \sum_{s=t}^{t+${O.fixed.gap_weeks - 1}} x_{q,s} \le 1 \quad \forall p,t`, `Within ${R.r} km, one market per ${words(O.fixed.gap_weeks)} weeks`],
          [String.raw`z_p \le \textstyle\sum_t x_{p,t},\ \ \sum_p z_p \ge ${O.fixed.min_neighborhoods}`, `At least ${O.fixed.min_neighborhoods} neighborhoods`],
          [String.raw`w_a \le \textstyle\sum_{p \in a} z_p,\ \ \sum_a w_a \ge ${R.D}`, `At least ${R.D} of ${nA} city areas`],
          [String.raw`x_{p,t},\ z_p,\ w_a \in \{0,1\}`, "Every decision is yes or no"],
        ];
        const lis = rows.map(([src, say, cls]) => el("li", { class: cls || "" }, tex(src, "tex"), el("span", { class: "say", text: say })));
        lis.forEach((li, k) => {
          const sec = 0.6 + k * 1.75;
          reveal(li, sec);
          at(sec, () => lis.forEach((q) => q.classList.toggle("now", q === li)));
        });
        fig.append(el("ol", { class: "milp" }, ...lis),
          reveal(el("p", { class: "note", text: `For this season: ${full(nVars)} binary variables and ${full(nCons)} constraints.` }), 0.6 + rows.length * 1.75));
        // the map follows the rule being read
        const demo = P[ids[0]];
        at(0.6 + 4 * 1.75, () => {
          addPick(demo.id, 0, { ring: true });
          paint((p) => (p?.candidate && p.id !== demo.id && km(p, demo) < R.r ? blocked() : fade(p)));
          legend("blocked");
        });
        at(0.6 + 6 * 1.75, () => { clearPins(); paint(look.areas, 8); legend("areas"); });
        at(0.6 + 7 * 1.75, () => { paint(look.value(addedOf, addCuts)); legend("added"); });
      },
    },
    {
      phase: "Optimize", name: "solve", dur: 21,
      head: "Gurobi finds the best schedule and proves nothing beats it",
      cap: "It solves the whole season at once. We replay its answer Saturday by Saturday so you can watch the rules close off neighbors.",
      enter(fig) {
        clearPins(); lightsSet([]); lightsShow(nT);
        paint(fade); legend("blocked");
        note(`<b>Solving</b><br>${O.solver.name}`);
        const status = el("span", { class: "live", html: "<b>Searching</b>" });
        fig.append(el("p", { class: "solver" },
          el("span", { html: `<b>${O.solver.name}</b>` }), el("span", { text: `${full(nVars)} variables` }), el("span", { text: `${full(nCons)} constraints` }), status));
        // the search touches every candidate before settling
        const order = CAND.slice().sort(() => Math.random() - 0.5);
        order.forEach((p, k) => at(0.3 + (k / order.length) * 2.2, () => probe(p)));
        at(2.6, () => { status.innerHTML = `<b>Optimal in ${O.solver.max_seconds < 0.1 ? "under 0.1" : O.solver.max_seconds.toFixed(1)} s</b>, gap ${Math.round((REC.gap || 0) * 100)}%`; });
        const num = el("span", { class: "num", text: "0" });
        const ledger = el("ol", { class: "ledger" });
        ledger.style.gridTemplateRows = `repeat(${Math.ceil(REC.picks.length / 2)}, auto)`; // read down, then across
        fig.append(el("div", { class: "tally" }, num, el("small", { text: "added evening visitors" })), ledger);
        const picks = byDate(REC.picks), count = {};
        let sum = 0;
        picks.forEach(([id, t, v], k) => {
          const sec = 3.2 + k * 1.15;
          at(sec, () => {
            addPick(id, t, { ring: true });
            count[id] = (count[id] || 0) + 1;
            lightsSet(picks.slice(0, k + 1).map(([, q]) => q));
            // blocked: near a market in the last gap weeks, or already at the per-neighborhood cap
            const recent = picks.slice(0, k + 1).filter(([, q]) => t - q < O.fixed.gap_weeks).map(([q]) => P[q]);
            paint((p) => (p?.candidate && !pins[p.id] && recent.some((q) => km(p, q) < R.r) ? blocked()
              : p && count[p.id] >= O.fixed.cap_per_neighborhood ? { ...blocked(), color: V.ink, weight: 1.2 } : fade(p)));
            note(`<b>${dateLabel(t)}</b><br>${nice(P[id])}`);
            ledger.append(el("li", {}, el("span", { class: "d", text: dateLabel(t) }), el("span", { class: "w", text: shortName(P[id]) }), el("span", { class: "v", text: `+${short(v)}` })));
          });
          counter(num, sum, sum + v, sec, 0.6);
          sum += v;
        });
        const end = 3.2 + picks.length * 1.15 + 0.3;
        at(end, () => {
          num.textContent = full(REC.added_visitors); // per-pick values are rounded; end on the solver's total
          ringLayer.clearLayers(); paint(fade); legend("plan");
          note(`<b>${picks.length} markets</b><br>${words(ids.length)} neighborhoods`);
        });
        if (REC.check) fig.append(reveal(el("p", { class: "stamp", text: "Checked again without the solver: every rule holds." }), end + 0.6));
      },
    },
    {
      phase: "Decide", name: "the trade-off", dur: 19,
      head: "Change the goal and the map changes",
      cap: "Same data, same rules. Aiming for visitors picks big crowds; aiming for lift picks quiet corners that draw far fewer people. Each line is a budget.",
      enter(fig) {
        clearPins(); lightsShow(nT); lightsSet([]);
        paint(fade); legend("plan");
        const name = el("p", { class: "goal-name" });
        const num = el("span", { class: "num", text: "0" });
        const sub = el("small");
        fig.append(name, el("div", { class: "tally" }, num, sub));
        const ch = frontierChart(fig);
        fig.append(ch.node);
        const goals = [
          { goal: "visitors", label: "Goal: most visitors", w: 0 },
          { goal: "balanced", label: "Goal: half visitors, half lift", w: 0.5 },
          { goal: "lift", label: "Goal: biggest lift", w: 1 },
        ];
        let prev = 0;
        goals.forEach((g, k) => {
          const s = scenario(g.goal), f = R.frontier.find((d) => d.w_lift === g.w), sec = 1.6 + k * 5.2;
          at(sec, () => {
            showPlan(s.picks);
            lightsSet(s.picks.map(([, t]) => t));
            name.textContent = g.label;
            sub.textContent = `added visitors with ${K} markets, average lift ${signed(f.avg_lift)}, ${new Set(s.picks.map(([p]) => p)).size} neighborhoods`;
            ch.move(f);
            note(`<b>${g.label.replace("Goal: ", "")}</b><br>${listJoin([...new Set(byDate(s.picks).map(([p]) => shortName(P[p])))].slice(0, 3))}…`);
          });
          counter(num, prev, s.added_visitors, sec, 0.9);
          prev = s.added_visitors;
        });
        fig.append(reveal(el("p", { class: "note", text: "The goal is a value judgment, not a technical detail. We chose visitors." }), 16.4));
      },
    },
    {
      phase: "Decide", name: "budgets", dur: 15,
      head: `Bigger or smaller budget, the same ${words(stable)} neighborhoods win`,
      cap: `We re-solved with ${O.grid.K[0]} to ${O.grid.K[O.grid.K.length - 1]} markets and ${O.grid.r[0]} to ${O.grid.r[O.grid.r.length - 1]} km spacing. Only the number of nights changes.`,
      enter(fig) {
        clearPins(); lightsShow(nT);
        paint(fade); legend("plan");
        const Ks = O.grid.K;
        const rows = Ks.map((k) => ({ K: k, name: `${k} markets`, v: scenario(R.goal, k).added_visitors }));
        fig.append(barRows(rows, Math.max(...rows.map((r) => r.v)), 0.6, 1.9, short));
        rows.forEach((r, k) => at(0.6 + k * 1.9, () => {
          const s = scenario(R.goal, r.K);
          showPlan(s.picks, { drop: k === 0 });
          lightsSet(s.picks.map(([, t]) => t));
          rows.forEach((q) => q.node.classList.toggle("on", q === r));
          note(`<b>${r.K} markets</b><br>${words(new Set(s.picks.map(([p]) => p)).size)} neighborhoods`);
        }));
        const last = 0.6 + Ks.length * 1.9;
        at(last, () => {
          showPlan(REC.picks, { drop: false }); lightsSet(REC.picks.map(([, t]) => t));
          rows.forEach((q) => q.node.classList.toggle("on", q.K === R.K));
          note(`<b>${R.K} markets</b><br>the recommended budget`);
        });
        fig.append(reveal(el("p", { class: "punch", html: `${stable === ids.length ? `<b>All ${R.robust_runs} runs</b> pick the same ${words(ids.length)}` : `<b>${cap(words(stable))} of the ${words(ids.length)}</b> win in every run`}. The answer doesn't hinge on the settings.` }), last + 0.2));
      },
    },
    {
      phase: "Decide", name: "the plan", dur: 10,
      head: `Fund ${K} Saturday markets in ${words(ids.length)} neighborhoods, and run ${year} as a pilot`,
      cap: `About ${roundTotal(REC.added_visitors)} more evening visitors. Measure each night against similar Saturdays and update the lift before ${year + 1}.`,
      enter(fig) {
        clearPins(); lightsShow(nT); lightsSet([]);
        paint(fade); legend("plan");
        const picks = byDate(REC.picks);
        at(0.3, () => { showPlan(picks); lightsSet(picks.map(([, t]) => t)); });
        const list = el("ol", { class: "plan" }, ...ids.map((id, k) => {
          const p = P[id], mine = picks.filter(([q]) => q === id);
          const add = mine.reduce((a, [, , v]) => a + v, 0);
          return reveal(el("li", {},
            el("span", { class: `p${p.host ? " was" : ""}`, text: String(k + 1) }),
            el("span", { class: "w" }, nice(p), el("span", { class: "meta", text: mine.map(([, t]) => dateLabel(t)).join(", ") })),
            el("span", { class: "v" }, `+${short(add)}`, el("span", { class: "meta", text: `lift ${signed(liftOf(p))}` }))), 0.6 + k * 0.45);
        }));
        const risks = ["Seven past hosts is a small base: read every number as a range."];
        if (ids.some((id) => /north_shore/.test(id))) risks.push("North Shore crowds include stadium game days; check its numbers without them first.");
        fig.append(list, reveal(el("p", { class: "note", text: risks.join(" ") }), 4.5));
        at(3, () => note(`<b>About ${roundTotal(REC.added_visitors)} more visitors</b><br>End of demo. Press R to replay.`));
      },
    },
  ];
}

/* ---------- start ---------- */
function controls() {
  const phases = [...new Set(STEPS.map((s) => s.phase))];
  $("flow").replaceChildren(...phases.map((ph) => el("li", { "data-phase": ph },
    el("span", { class: "phase", text: ph }),
    el("span", { class: "segs" }, ...STEPS.map((s, k) => [s, k]).filter(([s]) => s.phase === ph).map(([s, k]) => {
      const b = el("button", { type: "button", "data-step": String(k), "aria-label": `Step ${k + 1}: ${s.name}`, title: `${k + 1}. ${cap(s.name)}` }, el("i"));
      b.addEventListener("click", () => go(k));
      return b;
    })))));
  $("prev").addEventListener("click", () => go(T.i - 1));
  $("next").addEventListener("click", () => go(T.i + 1));
  $("toggle").addEventListener("click", () => setPlaying(!T.playing));
  $("start-go").addEventListener("click", () => begin(false));
  $("start-full").addEventListener("click", () => begin(true));
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (!$("start").hidden) {
      if (e.target.closest?.("button")) return; // let the focused start button handle Enter and Space itself
      if (k === "Enter" || k === " " || k === "ArrowRight" || k === "PageDown") { e.preventDefault(); begin(false); }
      return;
    }
    if (k === " " || k === "k" || k === "K") { e.preventDefault(); setPlaying(!T.playing); }
    else if (k === "ArrowRight" || k === "PageDown" || k === "ArrowDown") { e.preventDefault(); go(T.i + 1); }
    else if (k === "ArrowLeft" || k === "PageUp" || k === "ArrowUp") { e.preventDefault(); go(T.i - 1); }
    else if (k === "r" || k === "R" || k === "Home") { go(0); setPlaying(true); }
    else if (k === "End") go(STEPS.length - 1);
    else if (k === "f" || k === "F") toggleFull();
    else if (/^[1-9]$/.test(k)) go(+k - 1);
  });
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(drawLights, 150); });
}
function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
const FIRST = () => Math.max(0, (+qs.get("step") || 1) - 1);
function begin(fullscreen) {
  if (fullscreen && !document.fullscreenElement) toggleFull();
  $("start").classList.add("gone");
  setTimeout(() => { $("start").hidden = true; }, 500);
  go(FIRST());
  setPlaying(true);
  $("hint").classList.remove("gone");
  setTimeout(() => $("hint").classList.add("gone"), 5000);
}

Promise.all(["optimization.json", "neighborhoods.geojson"].map((n) => fetch(`../data/${n}?v=${DATA_VERSION}`).then((r) => { if (!r.ok) throw new Error(`${n}: ${r.status}`); return r.json(); })))
  .then(([opt, geo]) => {
    O = opt; GEO = geo;
    P = Object.fromEntries(O.profiles.map((p) => [p.id, p]));
    CAND = O.profiles.filter((p) => p.candidate);
    for (const p of O.profiles) for (const h of p.neighborhoods) byHood[h] = p;
    R = O.recommendation;
    REC = O.scenarios[R.key];
    buildSteps();
    initMap();
    drawLights();
    controls();
    requestAnimationFrame(frame);
    if (qs.get("autoplay") === "1") begin(false);
    else { $("start").hidden = false; go(FIRST()); setPlaying(false); $("start-go").focus(); }
  })
  .catch((err) => {
    $("headline").textContent = "Could not load the demo data";
    $("caption").textContent = err.message;
    console.error(err);
  });
