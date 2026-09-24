/* Pittsburgh Night Market Explorer: Exploration tab.
   Data: data/*.json, built by team-script/build_dashboard_data.py (aggregates only). */

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const C = {
  ink: css("--ink"), ink2: css("--ink-2"), muted: css("--muted"), grid: css("--rule"), axis: css("--axis"),
  surface: css("--paper"), series: css("--series"), seriesDark: css("--series-deep"), pop: css("--lantern"),
  ramp: [1, 2, 3, 4, 5, 6, 7].map((i) => css(`--ramp-${i}`)),
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m) => `${MONTH_NAMES[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const monthDate = (m) => new Date(`${m}-01T00:00:00Z`);
const dayLabel = (d) => `${MONTH_NAMES[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
const classLabel = (c) => ({ night_market: "night market", special_night_market: "special market", large_evening_festival: "evening festival" })[c] ?? c.replaceAll("_", " ");

function short(n) {
  if (n == null || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}
const money = (n) => (n == null ? "–" : `$${short(n)}`);
const count = (n) => (n == null ? "–" : short(n));
const pct = (n) => (n == null ? "–" : `${Math.round(n * 100)}%`);
const full = (n) => (n == null ? "–" : Math.round(n).toLocaleString("en-US"));

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

function tipNode(title, value, label) {
  return el("div", {}, el("div", { class: "tip-label", text: title }), el("div", { class: "tip-value", text: value }), label ? el("div", { class: "tip-label", text: label }) : null);
}

const state = { month: 0, layer: "spend", dayType: "SAT.", hood: null, playing: null };
let D; // all data

async function load() {
  const names = ["neighborhoods.geojson", "spend_month.json", "visits_month.json", "transit_month.json", "stops.json", "events.json", "meta.json", "routes.json"];
  const [geo, spend, visits, transit, stops, events, meta, routes] = await Promise.all(
    names.map((n) => fetch(`data/${n}`).then((r) => { if (!r.ok) throw new Error(`${n}: ${r.status}`); return r.json(); })),
  );
  const months = spend.months;
  const props = Object.fromEntries(geo.features.map((f) => [f.properties.id, f.properties]));
  const lastTransit = months.indexOf(meta.ridership_last_month);
  for (const e of events) e.month = e.date.slice(0, 7);
  return { geo, spend, visits, transit, stops, events, meta, routes, months, props, lastTransit };
}

/* ---------- layers ---------- */

const LAYERS = {
  spend: { label: "Spending", legend: "Card spend this month", fmt: money, get: (h, i) => D.spend.by_hood[h].value[i] },
  visits: { label: "Footfall", legend: "Visits this month", fmt: count, get: (h, i) => D.visits.by_hood[h].visits[i] },
  evening: { label: "Evening footfall", legend: "Visits between 5 and 10 pm this month (estimate)", fmt: count, get: (h, i) => D.visits.by_hood[h].evening_visits[i] },
  transit: {
    label: "Bus traffic",
    legend: () => `Riders on buses that stop here, average ${dayName()}`,
    fmt: count,
    get: (h, i) => D.transit.by_hood[h][state.dayType][transitIndex(i)],
  },
  density: { label: "Population density", legend: "People per km², 2020–24", fmt: (n) => (n == null ? "–" : full(n)), get: (h) => D.props[h].density_per_sqkm, static: true },
};
const dayName = () => ({ "SAT.": "Saturday", "SUN.": "Sunday", WEEKDAY: "weekday" })[state.dayType];
const transitIndex = (i) => Math.min(i, D.lastTransit);

function breaks(layer) {
  const values = [];
  for (const h of Object.keys(D.props)) {
    if (layer.static) { const v = layer.get(h); if (v != null) values.push(v); continue; }
    for (let i = 0; i < D.months.length; i++) { const v = layer.get(h, i); if (v != null && v > 0) values.push(v); }
  }
  values.sort((a, b) => a - b);
  return [1, 2, 3, 4, 5, 6].map((k) => values[Math.floor((k / 7) * (values.length - 1))]);
}
const binOf = (v, cuts) => cuts.findIndex((c) => v < c) === -1 ? cuts.length : cuts.findIndex((c) => v < c);

/* ---------- map ---------- */

let map, hoodLayer, marketLayer, stopLayer, cuts;

function initMap() {
  map = L.map("map", { zoomControl: true, scrollWheelZoom: false, minZoom: 10, maxZoom: 16, zoomSnap: 0.25 }).setView([40.44, -79.98], 12);
  const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
  L.tileLayer(`${esri}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
    attribution: "Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
    maxZoom: 16,
  }).addTo(map);

  hoodLayer = L.geoJSON(D.geo, {
    style: () => ({ weight: 0.8, color: C.surface, fillOpacity: 0.85 }),
    onEachFeature: (f, layer) => {
      layer.on({
        click: () => select(state.hood === f.properties.id ? null : f.properties.id),
        mouseover: () => layer.setStyle({ weight: 2, color: C.ink }),
        mouseout: () => { styleHood(layer); layer.closeTooltip(); },
      });
      layer.bindTooltip(() => hoodTip(f.properties.id), { sticky: true, direction: "top" });
    },
  }).addTo(map);
  const fit = () => { map.invalidateSize(); map.fitBounds(hoodLayer.getBounds(), { padding: [10, 10] }); };
  fit();
  requestAnimationFrame(fit);
  new ResizeObserver(() => map.invalidateSize()).observe(document.getElementById("map"));

  map.createPane("labels");
  map.getPane("labels").style.zIndex = 450;
  map.getPane("labels").style.pointerEvents = "none";
  L.tileLayer(`${esri}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { pane: "labels", maxZoom: 16, opacity: 0.9 }).addTo(map);

  // hatch pattern for neighborhoods with no data
  const svg = map.getPanes().overlayPane.querySelector("svg");
  const ns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(ns, "defs");
  defs.innerHTML = `<pattern id="nodata" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${css("--nodata")}"/><line x1="0" y1="0" x2="0" y2="6" stroke="${C.axis}" stroke-width="1.5"/></pattern>`;
  svg.prepend(defs);

  const canvas = L.canvas({ padding: 0.5 });
  stopLayer = L.layerGroup(D.stops.stops.map(([lat, lon]) => L.circleMarker([lat, lon], { renderer: canvas, radius: 1.6, stroke: false, fillColor: C.ink2, fillOpacity: 0.55, interactive: false })));
  marketLayer = L.layerGroup().addTo(map);
}

function styleHood(layer) {
  const h = layer.feature.properties.id;
  const layerDef = LAYERS[state.layer];
  const v = layerDef.get(h, state.month);
  const selected = state.hood === h;
  layer.setStyle({
    fillColor: v == null ? "url(#nodata)" : C.ramp[binOf(v, cuts)],
    fillOpacity: v == null ? 1 : state.layer === "transit" ? 0.35 : 0.85,
    weight: selected ? 3 : 0.8,
    color: selected ? C.ink : C.surface,
  });
  if (selected) layer.bringToFront();
}

function hoodTip(h) {
  const p = D.props[h];
  const layer = LAYERS[state.layer];
  const v = layer.get(h, state.month);
  const when = layer.static ? "" : monthLabel(D.months[state.layer === "transit" ? transitIndex(state.month) : state.month]);
  const legend = typeof layer.legend === "function" ? layer.legend() : layer.legend;
  return tipNode(p.name, v == null ? "No places in the data" : layer.fmt(v), `${legend.replace(" this month", "")}${when ? `, ${when}` : ""}`);
}

function renderMap() {
  hoodLayer.eachLayer(styleHood);
  renderMarkets();
  renderFlow();
  renderLegend();
}

function renderLegend() {
  const layer = LAYERS[state.layer];
  const box = document.getElementById("legend");
  const title = typeof layer.legend === "function" ? layer.legend() : layer.legend;
  const scale = el("div", { class: "legend-scale" }, ...C.ramp.map((c) => { const s = el("span"); s.style.background = c; return s; }));
  const labels = el("div", { class: "legend-labels" }, el("span", { text: `under ${layer.fmt(cuts[0])}` }), el("span", { text: `${layer.fmt(cuts[5])} or more` }));
  const extra = el("div", { class: "legend-extra" },
    el("span", {}, el("i", { class: "swatch-nodata" }), "no data"),
    el("span", {}, (() => { const i = el("i"); i.style.background = C.pop; i.style.boxShadow = `0 0 0 1.5px ${C.ink}`; return i; })(), "market this month"),
    el("span", {}, (() => { const i = el("i"); i.style.background = C.surface; i.style.boxShadow = `0 0 0 1.5px ${C.ink}`; return i; })(), "earlier market"),
  );
  if (state.layer === "transit") {
    const line = el("i", { class: "swatch-line" });
    const bus = el("i", { class: "swatch-bus" });
    extra.prepend(
      el("span", {}, line, "route, wider = more riders"),
      el("span", {}, bus, reduceMotion ? `bus dot = ${full(RIDERS_PER_DOT)} daily riders` : `moving dot = ${full(RIDERS_PER_DOT)} daily riders`),
    );
  }
  box.replaceChildren(el("div", { class: "legend-title", text: title }), scale, labels, extra);
}

function marketStatus(series) {
  const m = D.months[state.month];
  const now = series.events.filter((e) => e.month === m);
  const before = series.events.filter((e) => e.month < m);
  return { now, before };
}

function seriesList() {
  const bySeries = new Map();
  for (const e of D.events) {
    if (!bySeries.has(e.series)) bySeries.set(e.series, { name: e.series, hood: e.neighborhood_id, neighborhood: e.neighborhood, cls: e.class, events: [] });
    bySeries.get(e.series).events.push(e);
  }
  // spread series that share a neighborhood so pins don't sit on top of each other
  const seen = {};
  for (const s of bySeries.values()) {
    const k = seen[s.hood] = (seen[s.hood] ?? -1) + 1;
    const p = D.props[s.hood];
    s.latlng = [p.lat + k * 0.0022, p.lon + k * 0.0032];
  }
  return [...bySeries.values()];
}

function renderMarkets() {
  marketLayer.clearLayers();
  for (const s of D.series) {
    const { now, before } = marketStatus(s);
    if (!now.length && !before.length) continue;
    const active = now.length > 0;
    const marker = L.circleMarker(s.latlng, {
      radius: active ? 8 : 5,
      color: C.ink, weight: 1.5,
      fillColor: active ? C.pop : C.surface, fillOpacity: 1,
      className: active ? "market-on" : "",
    });
    const dates = active ? now.map((e) => dayLabel(e.date)).join(", ") : `${before.length} night${before.length > 1 ? "s" : ""} so far`;
    marker.bindTooltip(tipNode(s.name, active ? `On ${dates}` : dates, `${s.neighborhood}, ${classLabel(s.cls)}`), { direction: "top" });
    marker.on("click", () => select(s.hood));
    marketLayer.addLayer(marker);
  }
}

/* ---------- bus flow: route lines + moving buses (Bus traffic layer) ---------- */

const RIDERS_PER_DOT = 1000; // one moving dot per 1,000 average daily riders on the route
const BUS_SPEED_KM_S = 0.6; // animation speed, not real bus speed
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let routeLayer, busCanvas, busCtx, flowFrame = null;

const kmBetween = ([aLat, aLon], [bLat, bLon]) => {
  const dy = (bLat - aLat) * 111.32;
  const dx = (bLon - aLon) * 111.32 * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
};

function routeRiders(r) {
  return r.riders[state.dayType][transitIndex(state.month)];
}

function routeName(r) {
  const rail = { RED: "Red Line (T)", BLUE: "Blue Line (T)", SLVR: "Silver Line (T)" };
  if (rail[r.id]) return rail[r.id];
  if (r.mode === "incline") return r.name;
  return r.name ? `${r.id} ${r.name}` : `Route ${r.id}`;
}

function initFlow() {
  map.createPane("routes").style.zIndex = 420;
  const buses = map.createPane("buses");
  buses.style.zIndex = 430;
  buses.style.pointerEvents = "none";
  const renderer = L.svg({ pane: "routes", padding: 0.3 });
  routeLayer = L.layerGroup();
  for (const r of D.routes.routes) {
    r.cum = [0];
    for (let k = 1; k < r.coords.length; k++) r.cum.push(r.cum[k - 1] + kmBetween(r.coords[k - 1], r.coords[k]));
    r.length = r.cum[r.cum.length - 1];
    r.line = L.polyline(r.coords, { renderer, pane: "routes", color: C.ink, opacity: 0.5, weight: 1, lineCap: "round", lineJoin: "round" });
    r.line.bindTooltip(() => {
      const v = routeRiders(r);
      return tipNode(routeName(r), v == null ? "No ridership data" : `${full(v)} daily riders`, `Average ${dayName()}, ${monthLabel(D.months[transitIndex(state.month)])}`);
    }, { sticky: true, direction: "top" });
    r.line.on("mouseover", () => { r.line.setStyle({ opacity: 0.9 }); r.line.bringToFront(); });
    r.line.on("mouseout", () => { r.line.setStyle({ opacity: routeRiders(r) ? 0.38 : 0.15 }); r.line.closeTooltip(); });
    routeLayer.addLayer(r.line);
  }
  busCanvas = L.DomUtil.create("canvas", "bus-canvas", buses);
  busCtx = busCanvas.getContext("2d");
  map.on("move zoom resize", () => { if (state.layer === "transit" && !flowFrame) drawBuses(0); });
}

function renderFlow() {
  const on = state.layer === "transit";
  if (!on) {
    routeLayer.remove();
    if (flowFrame) cancelAnimationFrame(flowFrame);
    flowFrame = null;
    busCtx.clearRect(0, 0, busCanvas.width, busCanvas.height);
    return;
  }
  const max = Math.max(...D.routes.routes.map((r) => routeRiders(r) ?? 0));
  for (const r of D.routes.routes) {
    const v = routeRiders(r);
    r.line.setStyle({ weight: v ? 0.75 + 5.5 * Math.sqrt(v / max) : 0.5, opacity: v ? 0.38 : 0.15 });
  }
  if (!map.hasLayer(routeLayer)) routeLayer.addTo(map);
  if (reduceMotion) { drawBuses(0); return; }
  if (!flowFrame) {
    const tick = (ts) => { drawBuses(ts); flowFrame = requestAnimationFrame(tick); };
    flowFrame = requestAnimationFrame(tick);
  }
}

function pointAlong(r, km) {
  let lo = 0, hi = r.cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (r.cum[mid] <= km) lo = mid; else hi = mid; }
  const span = r.cum[hi] - r.cum[lo] || 1;
  const t = (km - r.cum[lo]) / span;
  const [aLat, aLon] = r.coords[lo], [bLat, bLon] = r.coords[hi];
  return [aLat + (bLat - aLat) * t, aLon + (bLon - aLon) * t];
}

function drawBuses(ts) {
  const size = map.getSize();
  const ratio = window.devicePixelRatio || 1;
  if (busCanvas.width !== size.x * ratio || busCanvas.height !== size.y * ratio) {
    busCanvas.width = size.x * ratio;
    busCanvas.height = size.y * ratio;
    busCanvas.style.width = `${size.x}px`;
    busCanvas.style.height = `${size.y}px`;
  }
  L.DomUtil.setPosition(busCanvas, map.containerPointToLayerPoint([0, 0]));
  busCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  busCtx.clearRect(0, 0, size.x, size.y);
  busCtx.lineWidth = 1.25;
  busCtx.strokeStyle = C.ink;
  busCtx.fillStyle = C.surface;
  const travelled = (ts / 1000) * BUS_SPEED_KM_S;
  for (const r of D.routes.routes) {
    const v = routeRiders(r);
    if (!v || r.length === 0) continue;
    const n = Math.max(1, Math.round(v / RIDERS_PER_DOT));
    for (let k = 0; k < n; k++) {
      const km = (travelled + (k * r.length) / n) % r.length;
      const p = map.latLngToContainerPoint(pointAlong(r, km));
      if (p.x < -5 || p.y < -5 || p.x > size.x + 5 || p.y > size.y + 5) continue;
      busCtx.beginPath();
      busCtx.arc(p.x, p.y, 2.75, 0, Math.PI * 2);
      busCtx.fill();
      busCtx.stroke();
    }
  }
}

/* ---------- cards ---------- */

function selectionSeries() {
  const h = state.hood;
  return {
    spend: h ? D.spend.by_hood[h].value : D.spend.city.value,
    spendPlaces: h ? D.spend.by_hood[h].places : D.spend.city.places,
    visits: h ? D.visits.by_hood[h].visits : D.visits.city.visits,
    evening: h ? D.visits.by_hood[h].evening_share : D.visits.city.evening_share,
    visitPlaces: h ? D.visits.by_hood[h].places : D.visits.city.places,
  };
}

function marketMonths() {
  const set = new Set(D.events.filter((e) => !state.hood || e.neighborhood_id === state.hood).map((e) => e.month));
  return D.months.filter((m) => set.has(m));
}

function stat(label, value, foot) {
  return el("div", {}, el("dt", { text: label }), el("dd", {}, value, foot ? el("span", { class: "foot", text: foot }) : null));
}

function renderSelection() {
  const i = state.month;
  const h = state.hood;
  const s = selectionSeries();
  const p = h ? D.props[h] : null;
  document.getElementById("sel-name").textContent = p ? p.name : "City of Pittsburgh";
  document.getElementById("clear-sel").hidden = !h;
  document.getElementById("sel-sub").textContent = h ? `${monthLabel(D.months[i])}. Click another neighborhood to compare.` : `${monthLabel(D.months[i])}. Click a neighborhood on the map to see it here.`;

  const cityPop = Object.values(Object.fromEntries(Object.values(D.props).filter((x) => x.population != null).map((x) => [x.population_profile, x.population]))).reduce((a, b) => a + b, 0);
  const popValue = p ? (p.population == null ? "–" : full(p.population)) : full(cityPop);
  const popFoot = p ? (p.population == null ? "not reported" : p.combined_profile ? `counted with ${p.population_profile}` : "2020–24") : "2020–24";
  const transitValue = h ? D.transit.by_hood[h][state.dayType][transitIndex(i)] : null;
  const hosted = D.events.filter((e) => !h || e.neighborhood_id === h).length;

  document.getElementById("sel-stats").replaceChildren(
    stat("Population", popValue, popFoot),
    stat("Card spend", money(s.spend[i]), s.spendPlaces[i] ? `at ${full(s.spendPlaces[i])} places` : "no places in the data"),
    stat("Visits", count(s.visits[i]), s.visitPlaces[i] ? `to ${full(s.visitPlaces[i])} places` : "no places in the data"),
    stat("Evening share", pct(s.evening[i]), "of time spent, 5 to 10 pm"),
    stat(`Bus riders, ${dayName()}`, h ? count(transitValue) : "–", h ? `${D.transit.routes[h]} routes stop here` : "pick a neighborhood"),
    stat("Market nights", `${hosted}`, "on the calendar, 2023–26"),
  );
}

function lineChart(id, values, format, label) {
  const box = document.getElementById(id);
  const data = D.months.map((m, i) => ({ date: monthDate(m), month: m, value: values[i] })).filter((d) => d.value != null);
  if (!data.length) { box.replaceChildren(el("p", { class: "note", text: "No places here in the Dewey data, so there's no trend to show." })); return; }
  const marks = new Set(marketMonths());
  const markets = data.filter((d) => marks.has(d.month));
  const now = monthDate(D.months[state.month]);
  const plot = Plot.plot({
    width: Math.max(260, box.clientWidth), height: 160,
    marginLeft: 44, marginRight: 10, marginTop: 10, marginBottom: 26,
    style: { fontFamily: css("--font"), fontSize: "11px", color: C.muted, background: "transparent", overflow: "visible" },
    x: { type: "utc", ticks: 4, label: null, tickFormat: "%Y" },
    y: { zero: true, grid: true, ticks: 4, label: null, tickFormat: format },
    marks: [
      Plot.gridY({ stroke: C.grid, strokeOpacity: 1, ticks: 4 }),
      Plot.ruleY([0], { stroke: C.axis }),
      Plot.ruleX([now], { stroke: C.ink, strokeOpacity: 0.35 }),
      Plot.lineY(data, { x: "date", y: "value", stroke: C.series, strokeWidth: 2, curve: "monotone-x" }),
      Plot.dot(markets, { x: "date", y: "value", r: 4.5, fill: C.pop, stroke: C.ink, strokeWidth: 1.2 }),
      Plot.ruleX(data, Plot.pointerX({ x: "date", stroke: C.muted })),
      Plot.tip(data, Plot.pointerX({
        x: "date", y: "value",
        title: (d) => `${format(d.value)} ${label}\n${monthLabel(d.month)}${marks.has(d.month) ? ", market month" : ""}`,
        fill: C.surface, stroke: C.axis,
      })),
    ],
  });
  box.replaceChildren(plot);
}

function tableView(id, columns) {
  const head = el("tr", {}, el("th", { text: "Month" }), ...columns.map((c) => el("th", { text: c.name })));
  const rows = D.months.map((m, i) => el("tr", {}, el("td", { text: monthLabel(m) }), ...columns.map((c) => el("td", { text: c.fmt(c.values[i]) })))).reverse();
  document.getElementById(id).replaceChildren(el("table", {}, el("thead", {}, head), el("tbody", {}, ...rows)));
}

function renderTrends() {
  const s = selectionSeries();
  lineChart("chart-spend", s.spend, money, "card spend");
  lineChart("chart-visits", s.visits, count, "visits");
  tableView("table-spend", [{ name: "Card spend", values: s.spend, fmt: full }, { name: "Places", values: s.spendPlaces, fmt: full }]);
  tableView("table-visits", [{ name: "Visits", values: s.visits, fmt: full }, { name: "Evening share", values: s.evening, fmt: pct }]);
}

function renderTransit() {
  const i = transitIndex(state.month);
  const m = D.months[i];
  const rows = Object.keys(D.props)
    .map((h) => ({ id: h, name: D.props[h].name, value: D.transit.by_hood[h][state.dayType][i] }))
    .filter((r) => r.value != null)
    .sort((a, b) => b.value - a.value);
  const top = rows.slice(0, 10);
  document.getElementById("transit-sub").textContent = `The 10 neighborhoods with the most riders on buses that stop there, on an average ${dayName()} in ${monthLabel(m)}.`;
  const box = document.getElementById("chart-transit");
  const plot = Plot.plot({
    width: Math.max(260, box.clientWidth), height: 250,
    marginLeft: 150, marginRight: 44, marginTop: 4, marginBottom: 4,
    style: { fontFamily: css("--font"), fontSize: "12px", color: C.ink2, background: "transparent" },
    x: { axis: null },
    y: { domain: top.map((d) => d.name), label: null, tickSize: 0 },
    marks: [
      Plot.barX(top, { x: "value", y: "name", fill: (d) => (d.id === state.hood ? C.seriesDark : C.series), insetTop: 3, insetBottom: 3, rx: 2 }),
      Plot.text(top, { x: "value", y: "name", text: (d) => short(d.value), dx: 4, textAnchor: "start", fill: C.ink2 }),
      Plot.tip(top, Plot.pointerY({ x: "value", y: "name", title: (d) => `${full(d.value)} daily riders\n${d.name}, ${D.transit.routes[d.id]} routes`, fill: C.surface, stroke: C.axis })),
    ],
  });
  box.replaceChildren(plot);
  const note = [];
  if (state.hood) {
    const rank = rows.findIndex((r) => r.id === state.hood);
    if (rank >= 10) note.push(`${D.props[state.hood].name} ranks ${rank + 1} of ${rows.length}, with ${full(rows[rank].value)} riders.`);
  }
  if (state.month > D.lastTransit) note.push(`Ridership data ends ${monthLabel(D.months[D.lastTransit])}.`);
  note.push("This counts riders passing through, not people getting off.");
  document.getElementById("transit-note").textContent = note.join(" ");
}

function renderMarketList() {
  const list = document.getElementById("market-list");
  const items = [...D.series]
    .sort((a, b) => a.events[0].date.localeCompare(b.events[0].date))
    .map((s) => {
      const { now } = marketStatus(s);
      const first = s.events[0].date.slice(0, 4);
      const last = s.events[s.events.length - 1].date.slice(0, 4);
      const li = el("li", { class: now.length ? "active" : "", tabindex: "0" },
        el("span", { class: "m-dot" }),
        el("div", {}, el("div", { class: "m-name", text: s.name }), el("div", { class: "m-meta", text: `${s.neighborhood}, ${classLabel(s.cls)}` })),
        el("span", { class: "m-count", text: `${s.events.length} ${s.events.length > 1 ? "nights" : "night"}, ${first === last ? first : `${first}–${last.slice(2)}`}` }),
      );
      const go = () => select(s.hood);
      li.addEventListener("click", go);
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      return li;
    });
  list.replaceChildren(...items);
}

/* ---------- the string of lights (timeline) ---------- */

function renderLights() {
  const svg = document.getElementById("lights");
  const W = svg.clientWidth || 600;
  const n = D.months.length;
  const pad = 8;
  const x = (i) => pad + (i / (n - 1)) * (W - 2 * pad);
  const top = 12;
  const sag = 12;
  // the wire hangs between posts at each January, sagging in between
  const posts = D.months.map((m, i) => (i === 0 || m.endsWith("-01") || i === n - 1 ? i : null)).filter((i) => i != null);
  const wireY = (i) => {
    const a = posts.filter((p) => p <= i).pop();
    const b = posts.find((p) => p > i) ?? a;
    if (a === b) return top;
    const t = (i - a) / (b - a);
    return top + sag * Math.sin(Math.PI * t);
  };
  let d = `M ${x(0)} ${top}`;
  for (let k = 0; k < posts.length - 1; k++) {
    const a = posts[k], b = posts[k + 1];
    d += ` Q ${(x(a) + x(b)) / 2} ${top + 2 * sag} ${x(b)} ${top}`;
  }
  const withMarkets = new Set(D.events.map((e) => e.month));
  const ns = "http://www.w3.org/2000/svg";
  const node = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const parts = [node("path", { class: "wire", d })];
  D.months.forEach((m, i) => {
    const cx = x(i), wy = wireY(i), cy = wy + 9;
    const lit = withMarkets.has(m);
    const current = i === state.month;
    parts.push(node("line", { class: "drop", x1: cx, y1: wy, x2: cx, y2: cy - 3 }));
    if (current && lit) parts.push(node("circle", { class: "halo", cx, cy, r: 11 }));
    parts.push(node("circle", { class: `bulb${lit ? " lit" : ""}`, cx, cy, r: lit ? 4.5 : 3 }));
    if (current) parts.push(node("circle", { class: "cursor", cx, cy, r: 8 }));
    if (m.endsWith("-01")) { const t = node("text", { class: "year", x: cx, y: 62, "text-anchor": i === 0 ? "start" : "middle" }); t.textContent = m.slice(0, 4); parts.push(t); }
  });
  svg.setAttribute("viewBox", `0 0 ${W} 70`);
  svg.replaceChildren(...parts);
}

/* ---------- controls ---------- */

function renderAll() {
  cuts = breaks(LAYERS[state.layer]);
  document.getElementById("month-label").textContent = monthLabel(D.months[state.month]);
  renderLights();
  document.getElementById("month").value = state.month;
  renderMap();
  renderSelection();
  renderTrends();
  renderTransit();
  renderMarketList();
}

function renderMonthOnly() {
  document.getElementById("month-label").textContent = monthLabel(D.months[state.month]);
  document.getElementById("month").setAttribute("aria-valuetext", monthLabel(D.months[state.month]));
  renderLights();
  renderMap();
  renderSelection();
  renderTrends();
  renderTransit();
  renderMarketList();
}

function select(h) {
  state.hood = h;
  renderAll();
}

function initControls() {
  const picker = document.getElementById("layer-picker");
  for (const [key, layer] of Object.entries(LAYERS)) {
    const b = el("button", { type: "button", "aria-pressed": String(key === state.layer), text: layer.label });
    b.addEventListener("click", () => {
      state.layer = key;
      picker.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      renderAll();
    });
    picker.append(b);
  }
  document.getElementById("day-type").addEventListener("change", (e) => { state.dayType = e.target.value; renderAll(); });
  document.getElementById("stops-toggle").addEventListener("change", (e) => (e.target.checked ? stopLayer.addTo(map) : stopLayer.remove()));
  document.getElementById("clear-sel").addEventListener("click", () => select(null));

  const slider = document.getElementById("month");
  slider.max = D.months.length - 1;
  slider.addEventListener("input", () => { state.month = +slider.value; renderMonthOnly(); });


  const play = document.getElementById("play");
  const icon = document.getElementById("play-icon");
  play.addEventListener("click", () => {
    if (state.playing) {
      clearInterval(state.playing);
      state.playing = null;
      icon.setAttribute("d", "M4 2.5v11l9-5.5z");
      play.setAttribute("aria-label", "Play through the months");
      return;
    }
    if (state.month >= D.months.length - 1) state.month = 0;
    icon.setAttribute("d", "M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z");
    play.setAttribute("aria-label", "Pause");
    state.playing = setInterval(() => {
      state.month += 1;
      slider.value = state.month;
      renderMonthOnly();
      if (state.month >= D.months.length - 1) play.click();
    }, 900);
  });

  const tabs = document.querySelectorAll('[role="tab"]');
  tabs.forEach((t) => t.addEventListener("click", () => {
    tabs.forEach((x) => {
      const on = x === t;
      x.setAttribute("aria-selected", String(on));
      document.getElementById(x.getAttribute("aria-controls")).hidden = !on;
    });
    if (t.dataset.tab === "explore") map.invalidateSize();
  }));


  let resize;
  window.addEventListener("resize", () => { clearTimeout(resize); resize = setTimeout(() => { renderLights(); renderTrends(); renderTransit(); }, 150); });
}

function renderFooter() {
  document.getElementById("sources").textContent = `Sources: ${D.meta.sources.join("; ")}. Built ${D.meta.built}.`;
}

load()
  .then((data) => {
    D = data;
    D.series = seriesList();
    // start on the latest month that had a night market
    const lastMarket = D.events.map((e) => e.month).filter((m) => D.months.includes(m)).sort().pop();
    state.month = D.months.indexOf(lastMarket);
    initMap();
    initFlow();
    initControls();
    renderFooter();
    renderAll();
  })
  .catch((err) => {
    document.querySelector("main").prepend(el("p", { class: "card", text: `Could not load the dashboard data (${err.message}).` }));
    console.error(err);
  });
