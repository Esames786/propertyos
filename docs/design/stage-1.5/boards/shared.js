/* Shared drawing helpers for the Stage 1.5 art-direction boards.
 * All imagery is generated here (no third-party photos), so the boards carry no licensing risk. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs, parent) => {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  };
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  /** Architectural scene: sky, towers with floor lines / windows, landscape. */
  function scene(svg, o) {
    seed = o.seed || 7;
    const W = +svg.getAttribute('data-w') || 800;
    const H = +svg.getAttribute('data-h') || 500;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    const defs = el('defs', {}, svg);
    const sky = el('linearGradient', { id: `${o.id}-sky`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    o.sky.forEach((c, i) => el('stop', { offset: i / (o.sky.length - 1), 'stop-color': c }, sky));
    el('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#${o.id}-sky)` }, svg);
    if (o.sun) el('circle', { cx: W * o.sun.x, cy: H * o.sun.y, r: o.sun.r, fill: o.sun.color, opacity: o.sun.opacity ?? 0.9 }, svg);
    if (o.stars) for (let i = 0; i < 70; i++) el('circle', { cx: rand() * W, cy: rand() * H * 0.45, r: rand() * 1.2 + 0.2, fill: '#fff', opacity: rand() * 0.7 }, svg);
    // distant skyline
    if (o.far) {
      let x = 0;
      while (x < W) {
        const w = 30 + rand() * 60;
        const h = H * (0.12 + rand() * 0.18);
        el('rect', { x, y: H * o.horizon - h, width: w - 4, height: h, fill: o.far }, svg);
        x += w;
      }
    }
    for (const t of o.towers) {
      const x = W * t.x, w = W * t.w, h = H * t.h, base = H * o.horizon, y = base - h;
      const g = el('linearGradient', { id: `${o.id}-${t.x}`, x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
      t.body.forEach((c, i) => el('stop', { offset: i / (t.body.length - 1), 'stop-color': c }, g));
      el('rect', { x, y, width: w, height: h, rx: t.rx || 0, fill: `url(#${o.id}-${t.x})` }, svg);
      const floors = t.floors;
      const fh = h / floors;
      for (let f = 1; f < floors; f++) {
        el('line', { x1: x, y1: y + f * fh, x2: x + w, y2: y + f * fh, stroke: o.floorLine, 'stroke-width': 1, opacity: 0.55 }, svg);
      }
      if (o.windows) {
        const cols = t.cols || 6;
        const cw = w / cols;
        for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
          if (rand() < (o.windows.p ?? 0.4)) el('rect', { x: x + c * cw + cw * 0.18, y: y + f * fh + fh * 0.22, width: cw * 0.64, height: fh * 0.56, fill: o.windows.color, opacity: 0.35 + rand() * 0.6 }, svg);
        }
      }
      if (t.fins) for (let c = 1; c < t.fins; c++) el('line', { x1: x + (w / t.fins) * c, y1: y, x2: x + (w / t.fins) * c, y2: base, stroke: o.fin, 'stroke-width': 1.4, opacity: 0.7 }, svg);
      if (t.crown) el('rect', { x: x + w * 0.2, y: y - 10, width: w * 0.6, height: 10, fill: t.crown }, svg);
    }
    el('rect', { x: 0, y: H * o.horizon, width: W, height: H * (1 - o.horizon), fill: o.ground }, svg);
    if (o.trees) for (let i = 0; i < 40; i++) {
      const tx = rand() * W, r = 8 + rand() * 18;
      el('circle', { cx: tx, cy: H * o.horizon + r * 0.2, r, fill: o.trees, opacity: 0.85 }, svg);
    }
    if (o.water) el('rect', { x: 0, y: H * o.horizon + 6, width: W, height: H, fill: o.water, opacity: 0.55 }, svg);
  }

  /** Smooth area chart. */
  function area(svg, data, o) {
    const W = +svg.getAttribute('data-w'), H = +svg.getAttribute('data-h');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const max = Math.max(...data) * 1.1, step = W / (data.length - 1);
    const pts = data.map((v, i) => [i * step, H - (v / max) * (H - 8)]);
    const d = pts.reduce((s, [x, y], i) => (i ? `${s} C ${x - step / 2} ${pts[i - 1][1]}, ${x - step / 2} ${y}, ${x} ${y}` : `M ${x} ${y}`), '');
    const defs = el('defs', {}, svg);
    const g = el('linearGradient', { id: o.id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': o.color, 'stop-opacity': o.fillOpacity ?? 0.22 }, g);
    el('stop', { offset: 1, 'stop-color': o.color, 'stop-opacity': 0 }, g);
    if (o.grid) for (let i = 1; i < 4; i++) el('line', { x1: 0, x2: W, y1: (H / 4) * i, y2: (H / 4) * i, stroke: o.grid, 'stroke-dasharray': '3 4' }, svg);
    el('path', { d: `${d} L ${W} ${H} L 0 ${H} Z`, fill: `url(#${o.id})` }, svg);
    el('path', { d, fill: 'none', stroke: o.color, 'stroke-width': o.width ?? 2.2, 'stroke-linecap': 'round' }, svg);
    if (o.compare) {
      const p2 = o.compare.map((v, i) => [i * step, H - (v / max) * (H - 8)]);
      el('polyline', { points: p2.map((p) => p.join(',')).join(' '), fill: 'none', stroke: o.compareColor, 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, svg);
    }
    const last = pts[pts.length - 1];
    el('circle', { cx: last[0] - 3, cy: last[1], r: 4, fill: o.dot || o.color, stroke: '#fff', 'stroke-width': 2 }, svg);
  }

  function bars(svg, data, o) {
    const W = +svg.getAttribute('data-w'), H = +svg.getAttribute('data-h');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const max = Math.max(...data.flat()) * 1.1, gw = W / data.length;
    data.forEach((group, i) => {
      const bw = (gw * 0.62) / group.length;
      group.forEach((v, j) => {
        const h = (v / max) * H;
        el('rect', { x: i * gw + gw * 0.19 + j * bw, y: H - h, width: bw - 2, height: h, rx: o.rx ?? 3, fill: o.colors[j] }, svg);
      });
    });
  }

  function ring(svg, pct, o) {
    const S = +svg.getAttribute('data-w');
    svg.setAttribute('viewBox', `0 0 ${S} ${S}`);
    const r = S / 2 - o.width, c = 2 * Math.PI * r;
    el('circle', { cx: S / 2, cy: S / 2, r, fill: 'none', stroke: o.track, 'stroke-width': o.width }, svg);
    el('circle', { cx: S / 2, cy: S / 2, r, fill: 'none', stroke: o.color, 'stroke-width': o.width, 'stroke-dasharray': `${c * pct} ${c}`, 'stroke-linecap': 'round', transform: `rotate(-90 ${S / 2} ${S / 2})` }, svg);
  }

  /** Simple 2D floor plan (unit outlines + status fills) for the inventory sample. */
  function plan(svg, o) {
    const W = +svg.getAttribute('data-w'), H = +svg.getAttribute('data-h');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    el('rect', { x: 2, y: 2, width: W - 4, height: H - 4, rx: 10, fill: o.bg, stroke: o.wall, 'stroke-width': 3 }, svg);
    el('rect', { x: W * 0.42, y: H * 0.36, width: W * 0.16, height: H * 0.28, fill: o.core, rx: 4 }, svg);
    const units = [[0, 0, 0.3, 0.5], [0.3, 0, 0.4, 0.36], [0.7, 0, 0.3, 0.5], [0, 0.5, 0.3, 0.5], [0.3, 0.64, 0.4, 0.36], [0.7, 0.5, 0.3, 0.5]];
    units.forEach(([x, y, w, h], i) => {
      el('rect', { x: W * x + 6, y: H * y + 6, width: W * w - 12, height: H * h - 12, rx: 6, fill: o.status[i], stroke: o.wall, 'stroke-width': i === o.selected ? 3 : 1.2 }, svg);
    });
  }

  window.Board = { scene, area, bars, ring, plan };
})();
