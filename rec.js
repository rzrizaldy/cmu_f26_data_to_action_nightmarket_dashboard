/* Recommendation tab: a short policy brief built from data/optimization.json
   (team-script/build_optimization_scenarios.py). Uses helpers from app.js. */

const Rec = (() => {
  let O, P, R, S, map, ready = false;
  const nice = (p) => p.name.replace(" (City Neighborhood)", "").replaceAll(" - ", " – ");
  const signed = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))}%`;
  const listJoin = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
  const dayLabel = (d) => `${MONTH_NAMES[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
  const plotStyle = () => ({ fontFamily: css("--font"), fontSize: "12px", color: C.ink2, background: "transparent", overflow: "visible" });

  function text() {
    const F = R.frontier, top = F[0], bal = F.find((f) => f.w_lift === 0.5), low = F[F.length - 1];
    const ids = [...new Set(S.picks.map(([p]) => p))];
    const areas = new Set(ids.map((id) => P[id].area));
    const hosts = R.hosts.slice().sort((a, b) => b.lift - a.lift);
    const up = hosts.filter((h) => h.low > 0.2), down = hosts.filter((h) => h.high < 0);
    const stable = ids.filter((id) => (R.robust[id] || 0) >= 0.99).length;

    document.getElementById("rec-dek").textContent =
      `Night markets help some neighborhoods much more than others. A schedule that gives equal weight to crowd size and to lift keeps ${Math.round((bal.visitors / top.visitors) * 100)}% of the most visitors the city could draw, and roughly doubles the typical lift, from ${signed(top.avg_lift)} to ${signed(bal.avg_lift)}.`;
    document.getElementById("rec-p1").textContent =
      `Past markets changed evening footfall by anywhere from ${signed(hosts[hosts.length - 1].lift)} to ${signed(hosts[0].lift)}. ${listJoin(up.map((h) => h.name))} drew about half again their usual Saturday evening crowd. In ${listJoin(down.map((h) => h.name))}, already among the city's busiest evening areas, footfall was lower than on comparable days. Across the seven hosts, lift was larger where there are fewer businesses and less spending.`;
    document.getElementById("rec-p2").textContent =
      `Aim only for the most visitors and the model sends markets to big crowds, where a market adds people but barely changes the evening (${signed(top.avg_lift)} on average). Aim only for lift and it picks quiet corners, where a market matters more but draws ${({ 1: "about a quarter", 2: "about half", 3: "about three quarters" })[Math.round((low.visitors / top.visitors) * 4)] ?? "far fewer"} as many people. The curve bends in the middle: until then each step toward lift costs few visitors, and after it visitors fall off fast.`;
    document.getElementById("rec-p3").textContent =
      `Twelve Saturdays, May to October 2027, in ${words(ids.length)} neighborhoods across ${words(areas.size)} of the city's five areas: about ${full(Math.round(S.added_visitors / 100) * 100)} more evening visitors in total, with an average lift of ${signed(bal.avg_lift)}. ${stable === ids.length ? `The same ${words(ids.length)} neighborhoods come up` : `${cap(words(stable))} of the ${words(ids.length)} come up`} under every budget (6 to 16 markets) and spacing rule (1 to 3 km) we tested.`;

    const pastHosts = ids.filter((id) => R.hosts.some((h) => h.id === id)).map((id) => R.hosts.find((h) => h.id === id));
    const actions = [
      `<b>Back ${S.picks.length} Saturday markets</b> in ${listJoin(ids.map((id) => nice(P[id])))}, May through October 2027.`,
      ...pastHosts.map((h) => `<b>Keep ${h.name}.</b> It is the only recommended site with a track record: its past markets raised evening footfall by ${signed(h.lift)} (range ${signed(h.low)} to ${signed(h.high)}).`),
      `<b>Run the season as a test.</b> Count footfall and card spending at each market against similar Saturdays, keep a few eligible dates without a market for comparison, and refit the model before planning 2028.`,
      ...(ids.some((id) => /north_shore/.test(id)) ? [`<b>Check stadium schedules before booking North Shore.</b> Its Saturday crowds include Steelers and Pirates game days, which likely inflate its estimate.`] : []),
      `<b>Ask each neighborhood's business association before fixing dates.</b> The model sees footfall, not whether vendors and residents want a market.`,
    ];
    document.getElementById("rec-actions").innerHTML = actions.map((a) => `<li>${a}</li>`).join("");
    document.getElementById("rec-source").textContent =
      `Sources: Dewey footfall and card spend (licensed; shown only as totals), Pittsburgh Regional Transit, UCSUR population profiles, and the team's inventory of past markets. Lift estimates from notebook 03, schedules from notebook 04 (${O.solver.name}). Estimates are rough; see "What could change this".`;
  }
  const words = (n) => (["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"][n] ?? String(n));
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  function hostChart() {
    const box = document.getElementById("rec-hosts");
    const picked = new Set(S.picks.map(([p]) => p));
    const data = R.hosts.slice().sort((a, b) => b.lift - a.lift);
    box.replaceChildren(Plot.plot({
      width: Math.max(300, box.clientWidth), height: 40 + 34 * data.length,
      marginLeft: 118, marginRight: 52, marginTop: 24, marginBottom: 8,
      style: plotStyle(),
      x: { axis: "top", grid: true, ticks: 5, label: null, tickFormat: (d) => signed(d) },
      y: { domain: data.map((d) => d.name), label: null, tickSize: 0 },
      marks: [
        Plot.gridX({ stroke: C.grid, strokeOpacity: 1, ticks: 5 }),
        Plot.ruleX([0], { stroke: C.ink, strokeOpacity: 0.6 }),
        Plot.ruleY(data, { y: "name", x1: "low", x2: "high", stroke: C.axis, strokeWidth: 3 }),
        Plot.dot(data, { y: "name", x: "lift", r: 6, fill: (d) => (picked.has(d.id) ? C.pop : C.series), stroke: C.ink, strokeWidth: 1 }),
        Plot.text(data, { y: "name", x: "high", text: (d) => signed(d.lift), dx: 8, textAnchor: "start", fill: C.ink, fontWeight: 700 }),
      ],
    }));
  }

  function frontierChart() {
    const box = document.getElementById("rec-frontier");
    const F = R.frontier;
    const named = [
      { ...F[0], label: "Most visitors", anchor: "start", line: "bottom", dx: 2, dy: -10 },
      { ...F.find((f) => f.w_lift === 0.5), label: "Balanced (recommended)", anchor: "end", line: "top", dx: -10, dy: 10, rec: true },
      { ...F[F.length - 1], label: "Biggest lift", anchor: "end", line: "middle", dx: -12, dy: 0 },
    ];
    box.replaceChildren(Plot.plot({
      width: Math.max(300, box.clientWidth), height: 280,
      marginLeft: 50, marginRight: 24, marginTop: 34, marginBottom: 40,
      style: plotStyle(),
      x: { label: "Average lift per market →", tickFormat: (d) => signed(d), ticks: 5, grid: true },
      y: { label: "↑ Added evening visitors", tickFormat: (d) => short(d), ticks: 5, grid: true, domain: [0, Math.max(...F.map((f) => f.visitors)) * 1.18] },
      marks: [
        Plot.line(F, { x: "avg_lift", y: "visitors", stroke: C.series, strokeWidth: 2 }),
        Plot.dot(F, { x: "avg_lift", y: "visitors", r: 3, fill: C.surface, stroke: C.series, strokeWidth: 1.5 }),
        Plot.dot(named, { x: "avg_lift", y: "visitors", r: (d) => (d.rec ? 8 : 5), fill: (d) => (d.rec ? C.pop : C.series), stroke: C.ink, strokeWidth: 1 }),
        // Plot takes anchor and offsets as constants, so each label is its own mark
        ...named.map((d) => Plot.text([d], { x: "avg_lift", y: "visitors", text: (d) => `${d.label}\n${short(d.visitors)} · ${signed(d.avg_lift)}`,
          textAnchor: d.anchor, lineAnchor: d.line, dx: d.dx, dy: d.dy, fill: C.ink, fontWeight: d.rec ? 700 : 500, lineHeight: 1.25,
          stroke: C.surface, strokeWidth: 4, paintOrder: "stroke" })),
      ],
    }));
  }

  function mapAndSchedule() {
    const byHood = {};
    for (const p of O.profiles) for (const h of p.neighborhoods) byHood[h] = p;
    const count = {}, order = {};
    let k = 0;
    for (const [p] of S.picks) { count[p] = (count[p] || 0) + 1; if (!(p in order)) order[p] = ++k; }
    map = L.map("rec-map", { zoomControl: false, scrollWheelZoom: false, dragging: !L.Browser.mobile, minZoom: 10, maxZoom: 15, zoomSnap: 0.25, attributionControl: true });
    const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
    L.tileLayer(`${esri}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { attribution: "Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors", maxZoom: 16 }).addTo(map);
    const layer = L.geoJSON(D.geo, {
      style: (f) => {
        const p = byHood[f.properties.id], on = p && count[p.id];
        return { weight: on ? 1.6 : 0.6, color: on ? C.ink : C.axis, fillColor: on ? C.ramp[2] : C.surface, fillOpacity: on ? 0.75 : 0.35 };
      },
      interactive: false,
    }).addTo(map);
    for (const [id, n] of Object.entries(count)) {
      const p = P[id];
      const icon = L.divIcon({ className: "", html: `<div class="pin"><span>${order[id]}</span>${n > 1 ? `<em>×${n}</em>` : ""}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker([p.lat, p.lon], { icon, keyboard: false, interactive: false }).addTo(map);
    }
    const fit = () => { map.invalidateSize(); map.fitBounds(layer.getBounds(), { padding: [8, 8] }); };
    fit();
    requestAnimationFrame(fit);

    const rows = Object.keys(order).map((id) => {
      const p = P[id], dates = S.picks.filter(([q]) => q === id).map(([, t]) => dayLabel(O.season[t]));
      const add = S.picks.filter(([q]) => q === id).reduce((a, [, , v]) => a + v, 0);
      return el("li", {},
        el("span", { class: "s-pin", text: String(order[id]) }),
        el("span", { class: "s-name" }, nice(p), el("span", { class: "s-meta", text: `${dates.join(", ")} · ${p.area}` })),
        el("span", { class: "s-val" }, signed(Math.max(0, p.lift)), el("span", { class: "s-meta", text: `≈${short(add)} visitors` })));
    });
    document.getElementById("rec-schedule").replaceChildren(...rows);
  }

  async function show() {
    if (ready) { map.invalidateSize(); return; }
    ready = true;
    O = await fetch(`data/optimization.json?v=${DATA_VERSION}`).then((r) => { if (!r.ok) throw new Error(`optimization.json: ${r.status}`); return r.json(); });
    P = Object.fromEntries(O.profiles.map((p) => [p.id, p]));
    R = O.recommendation;
    S = O.scenarios[R.key];
    text();
    hostChart();
    frontierChart();
    mapAndSchedule();
    let t;
    window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { hostChart(); frontierChart(); }, 150); });
  }
  return { show };
})();
