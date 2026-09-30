/* Recommendation tab: a short policy brief built from data/optimization.json
   (team-script/build_optimization_scenarios.py). Uses helpers from app.js. */

const Rec = (() => {
  let O, P, R, S, map, ready = false;
  const nice = (p) => p.name.replace(" (City Neighborhood)", "").replaceAll(" - ", " – ");
  const signed = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))}%`;
  const listJoin = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
  const dayLabel = (d) => `${MONTH_NAMES[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
  const plotStyle = () => ({ fontFamily: css("--font"), fontSize: "12px", color: C.ink2, background: "transparent", overflow: "visible" });

  const W = { visitors: 0, balanced: 0.5, lift: 1 };
  const GOAL = {
    visitors: { name: "Most visitors", head: (n, k) => `Put next summer's ${k} night markets where Saturday crowds are biggest, and run the season as a test`,
      why: "We chose visitors: it brings the most new customers to the markets and the shops around them." },
    balanced: { name: "Balanced", head: (n, k) => `Spread next summer's ${k} night markets across ${n} neighborhoods, and run the season as a test`,
      why: "We chose the balance: it keeps most of the visitors while doubling the typical lift." },
    lift: { name: "Biggest lift", head: (n, k) => `Put next summer's ${k} night markets where evenings are quietest, and run the season as a test`,
      why: "We chose lift: a market matters most where evenings are quiet." },
  };
  function eq(id, tex) {
    const node = document.getElementById(id);
    if (window.katex) katex.render(tex, node, { displayMode: true, throwOnError: false });
    else node.textContent = tex;
  }

  function text() {
    const F = R.frontier, top = F[0], low = F[F.length - 1], rec = F.find((f) => f.w_lift === W[R.goal]);
    const ids = [...new Set(S.picks.map(([p]) => p))];
    const hosts = R.hosts.slice().sort((a, b) => b.lift - a.lift);
    const down = hosts.filter((h) => h.high < 0);
    const stable = ids.filter((id) => (R.robust[id] || 0) >= 0.99).length;
    const total = full(Math.round(S.added_visitors / 100) * 100);

    document.getElementById("rec-head").textContent = GOAL[R.goal].head(words(ids.length), S.picks.length);
    document.getElementById("rec-dek").textContent =
      `We first predicted how much a night market lifts evening footfall in each neighborhood, then let an optimizer choose where and when to hold them. Its answer: ${words(ids.length)} neighborhoods, ${S.picks.length} Saturdays, about ${total} more evening visitors.`;
    document.getElementById("rec-p1").textContent =
      `Seven neighborhoods have hosted markets. Evening footfall rose as much as ${signed(hosts[0].lift)} (${hosts[0].name}) and fell where evenings are already busy (${listJoin(down.map((h) => `${h.name} ${signed(h.lift)}`))}). A regression on those seven explains the gap: lift is larger where there are fewer businesses and less spending. That gives every other neighborhood a predicted lift, which we turn into people:`;
    eq("rec-eq1", String.raw`\text{added visitors}_{p,t} \;=\; \underbrace{\left(e^{\hat\theta_p}-1\right)}_{\text{predicted lift}} \;\times\; \underbrace{\bar y_{p,t}}_{\text{usual Saturday evening crowd}}`);
    document.getElementById("rec-p2").textContent =
      `The prediction is only an input. The decision is the schedule: for each neighborhood p and Saturday t, hold a market (x = 1) or not (x = 0). The optimizer picks the schedule with the most added visitors that still follows the city's rules.`;
    eq("rec-eq2", String.raw`\max_{x}\;\sum_{p,\,t}\ \text{added visitors}_{p,t}\cdot x_{p,t}, \qquad x_{p,t}\in\{0,1\}`);
    document.getElementById("rec-p3").textContent =
      `Gurobi proves no better schedule exists under these rules. ${stable === ids.length ? `The same ${words(ids.length)} neighborhoods win` : `${cap(words(stable))} of the ${words(ids.length)} neighborhoods win`} under every budget from 6 to 16 markets and every spacing from 1 to 3 km, so the answer doesn't hinge on those settings.`;
    document.getElementById("rec-p4").textContent =
      `Aiming for visitors favors big crowds with a modest lift (${signed(top.avg_lift)}). Aiming for percent lift favors quiet corners (${signed(low.avg_lift)}) that draw ${({ 1: "about a quarter", 2: "about half", 3: "about three quarters" })[Math.round((low.visitors / top.visitors) * 4)] ?? "far fewer"} as many people. Same data, same rules, different maps: the objective is a value judgment, not a technical detail. ${GOAL[R.goal].why}`;

    const actions = [
      `<b>Fund ${S.picks.length} Saturday markets</b> in ${listJoin(ids.map((id) => nice(P[id])))}, May to October 2027.`,
      `<b>Run 2027 as a pilot, not a final answer.</b> Measure each market against similar Saturdays, leave a few eligible dates without one for comparison, and update the lift estimates before 2028. Each season makes the next prediction better.`,
      ...ids.filter((id) => /north_shore/.test(id)).map((id) => {
        const share = S.picks.filter(([q]) => q === id).reduce((a, [, , v]) => a + v, 0) / S.added_visitors;
        return `<b>Check the biggest bet first.</b> North Shore supplies ${Math.round(share * 100)}% of the expected visitors, and its Saturday crowds include Steelers and Pirates games. Confirm its numbers without game days before booking.`;
      }),
      `<b>Ask each neighborhood's business association before fixing dates.</b> The model sees footfall, not whether vendors and residents want a market.`,
    ];
    document.getElementById("rec-actions").innerHTML = actions.map((a) => `<li>${a}</li>`).join("");
    document.getElementById("rec-source").textContent =
      `Sources: Dewey footfall and card spend (licensed; shown only as totals), Pittsburgh Regional Transit, UCSUR population profiles, and the team's inventory of past markets. Prediction: notebook 03 (fixed-effects lift per host, ridge regression across areas). Optimization: notebook 04 (${O.solver.name}).`;
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
    const Ks = Object.keys(R.frontiers).map(Number).sort((a, b) => a - b);
    // repeated weights can land on the same schedule; keep one point per distinct schedule outcome
    const curve = (k) => R.frontiers[k].filter((f, i, a) => i === 0 || f.visitors !== a[i - 1].visitors || f.avg_lift !== a[i - 1].avg_lift);
    const lines = Ks.flatMap((k) => curve(k).map((f) => ({ ...f, K: k })));
    const color = (k) => (k === R.K ? C.series : C.ramp[Math.min(6, Math.max(1, Math.round((k / Math.max(...Ks)) * 6)))]);
    const starts = Ks.map((k) => ({ ...curve(k)[0], K: k }));
    const F = R.frontier;
    const named = [
      { ...F[0], goal: "visitors" },
      { ...F.find((f) => f.w_lift === 0.5), goal: "balanced" },
      { ...F[F.length - 1], goal: "lift" },
    ].map((d) => ({ ...d, rec: d.goal === R.goal }));
    const recPt = named.find((d) => d.rec), atStart = R.goal === "visitors";
    const xs = lines.map((d) => d.avg_lift), ymax = Math.max(...lines.map((d) => d.visitors));
    const plot = Plot.plot({
      width: Math.max(300, box.clientWidth), height: 320,
      marginLeft: 50, marginRight: 24, marginTop: 34, marginBottom: 40,
      style: plotStyle(),
      x: { label: "Average lift per market →", tickFormat: (d) => signed(d), ticks: 5, grid: true, domain: [Math.min(...xs) - 0.09, Math.max(...xs) + 0.01] },
      y: { label: "↑ Added evening visitors", tickFormat: (d) => short(d), ticks: 5, grid: true, domain: [0, ymax * 1.12] },
      marks: [
        ...Ks.map((k) => Plot.line(lines.filter((d) => d.K === k), { x: "avg_lift", y: "visitors", stroke: color(k), strokeWidth: k === R.K ? 3 : 1.6 })),
        Plot.dot(lines, { x: "avg_lift", y: "visitors", r: 2.5, fill: C.surface, stroke: (d) => color(d.K), strokeWidth: 1.3 }),
        Plot.text(starts.filter((d) => d.K !== R.K), { x: "avg_lift", y: "visitors", text: (d) => `${d.K} markets`, textAnchor: "end", dx: -8, fill: C.ink2 }),
        // when the recommendation is the left end of its line, the line label carries it
        Plot.text(starts.filter((d) => d.K === R.K), { x: "avg_lift", y: "visitors", text: (d) => (atStart ? `${d.K} markets\nrecommended\n${short(d.visitors)} · ${signed(d.avg_lift)}` : `${d.K} markets`),
          textAnchor: "end", lineAnchor: "middle", dx: -12, fill: C.ink, fontWeight: 700, lineHeight: 1.25, stroke: C.surface, strokeWidth: 4, paintOrder: "stroke" }),
        Plot.dot(named, { x: "avg_lift", y: "visitors", r: (d) => (d.rec ? 8 : 4.5), fill: (d) => (d.rec ? C.pop : C.series), stroke: C.ink, strokeWidth: 1,
          title: (d) => `${GOAL[d.goal].name}, ${R.K} markets: ${full(d.visitors)} visitors, average lift ${signed(d.avg_lift)}` }),
        Plot.text(atStart ? [] : [recPt], { x: "avg_lift", y: "visitors", text: (d) => `${GOAL[d.goal].name} (recommended)\n${short(d.visitors)} · ${signed(d.avg_lift)}`,
          textAnchor: "start", lineAnchor: "top", dx: 10, dy: 8, fill: C.ink, fontWeight: 700, lineHeight: 1.25, stroke: C.surface, strokeWidth: 4, paintOrder: "stroke" }),
      ],
    });
    // Caulkins' convention: a smiley marks the ideal corner of a trade-off plot (here: more visitors AND more lift)
    const tip = "As Caulkins said: the smiley is the ideal corner, and it is usually infeasible.";
    const smiley = el("span", { class: "smiley", tabindex: "0", role: "img", "aria-label": tip });
    smiley.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="var(--lantern)" stroke="var(--ink)" stroke-width="1.5"/><circle cx="8.5" cy="9.5" r="1.4" fill="var(--ink)"/><circle cx="15.5" cy="9.5" r="1.4" fill="var(--ink)"/><path d="M7.5 14.2c1.1 1.9 2.7 2.8 4.5 2.8s3.4-.9 4.5-2.8" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round"/></svg><span class="smiley-tip">${tip}</span>`;
    box.replaceChildren(plot, smiley);
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
