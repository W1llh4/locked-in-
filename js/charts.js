// Tiny dependency-free SVG charts (single series) with hover tooltips.
(function () {
  let W = 520; // set per chart from the container width
  const H = 210;
  const M = { top: 16, right: 16, bottom: 28, left: 44 };

  function niceScale(min, max, ticks = 4) {
    if (min === max) {
      const pad = Math.abs(min) * 0.1 || 1;
      min -= pad;
      max += pad;
    }
    const span = max - min;
    const step0 = span / ticks;
    const mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return { lo, hi, ticks: out };
  }

  function empty(el, msg) {
    el.innerHTML = `<div class="chart-empty">${Util.esc(msg)}</div>`;
  }

  function frame(scale, yFmt) {
    const ih = H - M.top - M.bottom;
    const y = (v) => M.top + ih - ((v - scale.lo) / (scale.hi - scale.lo)) * ih;
    const grid = scale.ticks
      .map(
        (t) => `<line class="grid" x1="${M.left}" x2="${W - M.right}" y1="${y(t)}" y2="${y(t)}"/>
        <text class="axis" x="${M.left - 8}" y="${y(t) + 4}" text-anchor="end">${yFmt(t)}</text>`
      )
      .join('');
    return { y, grid };
  }

  function attachTooltip(el, svg, points, fmt) {
    const w = W;
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    el.appendChild(tip);
    const cross = svg.querySelector('.crosshair');
    const dot = svg.querySelector('.hover-dot');

    function show(i) {
      const p = points[i];
      tip.innerHTML = fmt(p);
      tip.hidden = false;
      const rect = svg.getBoundingClientRect();
      const sx = rect.width / w;
      const sy = rect.height / H;
      const left = Math.min(Math.max(p.x * sx, 60), rect.width - 60);
      tip.style.left = `${left}px`;
      tip.style.top = `${p.y * sy}px`;
      if (cross) {
        cross.setAttribute('x1', p.x);
        cross.setAttribute('x2', p.x);
        cross.style.opacity = 1;
      }
      if (dot) {
        dot.setAttribute('cx', p.x);
        dot.setAttribute('cy', p.y);
        dot.style.opacity = 1;
      }
      svg.querySelectorAll('.bar').forEach((b, j) => b.classList.toggle('active', j === i));
    }
    function hide() {
      tip.hidden = true;
      if (cross) cross.style.opacity = 0;
      if (dot) dot.style.opacity = 0;
      svg.querySelectorAll('.bar').forEach((b) => b.classList.remove('active'));
    }
    function nearest(evt) {
      const rect = svg.getBoundingClientRect();
      const x = ((evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left) * (w / rect.width);
      let best = 0;
      points.forEach((p, i) => {
        if (Math.abs(p.x - x) < Math.abs(points[best].x - x)) best = i;
      });
      return best;
    }
    svg.addEventListener('mousemove', (e) => show(nearest(e)));
    svg.addEventListener('touchstart', (e) => show(nearest(e)), { passive: true });
    svg.addEventListener('mouseleave', hide);
  }

  function goalLine(goal, y, label) {
    if (goal == null) return '';
    return `<line class="goal" x1="${M.left}" x2="${W - M.right}" y1="${y(goal)}" y2="${y(goal)}"/>
      <text class="axis goal-label" x="${W - M.right}" y="${y(goal) - 6}" text-anchor="end">${Util.esc(label)}</text>`;
  }

  function setWidth(el) {
    W = Math.max(280, Math.round(el.clientWidth || 520));
  }

  // Evenly spaced x labels; drop one that would collide with the final label.
  const labelIdx = (n, step) => (_, i) => i === n - 1 || (i % step === 0 && n - 1 - i >= step * 0.75);

  const Charts = {
    // data: [{label, value}] ; opts: {yFmt, tipFmt, goal, goalLabel, emptyMsg}
    line(el, data, opts = {}) {
      if (!data.length) return empty(el, opts.emptyMsg || 'No data yet');
      setWidth(el);
      const yFmt = opts.yFmt || ((v) => v);
      const vals = data.map((d) => d.value).concat(opts.goal != null ? [opts.goal] : []);
      const scale = niceScale(Math.min(...vals), Math.max(...vals));
      const { y, grid } = frame(scale, yFmt);
      const iw = W - M.left - M.right;
      const x = (i) => M.left + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
      const points = data.map((d, i) => ({ ...d, x: x(i), y: y(d.value) }));
      const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
      const step = Math.ceil(data.length / Math.max(2, Math.floor(W / 90)));
      const xLabels = points
        .filter(labelIdx(points.length, step))
        .map((p) => `<text class="axis" x="${p.x}" y="${H - 8}" text-anchor="middle">${Util.esc(p.label)}</text>`)
        .join('');
      const markers =
        data.length <= 20 ? points.map((p) => `<circle class="marker" cx="${p.x}" cy="${p.y}" r="4"/>`).join('') : '';
      el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${Util.esc(opts.ariaLabel || 'Line chart')}">
        ${grid}${goalLine(opts.goal, y, opts.goalLabel || 'Goal')}
        <line class="crosshair" x1="0" x2="0" y1="${M.top}" y2="${H - M.bottom}" style="opacity:0"/>
        <path class="line" d="${path}"/>${markers}
        <circle class="hover-dot" r="6" style="opacity:0"/>
        ${xLabels}
        <rect x="${M.left}" y="${M.top}" width="${iw}" height="${H - M.top - M.bottom}" fill="transparent"/>
      </svg>`;
      el.style.position = 'relative';
      attachTooltip(el, el.querySelector('svg'), points, opts.tipFmt || ((p) => `<b>${yFmt(p.value)}</b><span>${Util.esc(p.label)}</span>`));
    },

    bar(el, data, opts = {}) {
      if (!data.length) return empty(el, opts.emptyMsg || 'No data yet');
      setWidth(el);
      const yFmt = opts.yFmt || ((v) => v);
      const vals = data.map((d) => d.value).concat(opts.goal != null ? [opts.goal] : [], [0]);
      const scale = niceScale(0, Math.max(...vals, 1));
      const { y, grid } = frame(scale, yFmt);
      const iw = W - M.left - M.right;
      const slot = iw / data.length;
      const bw = Math.max(4, Math.min(32, slot * 0.7));
      const r = Math.min(4, bw / 2);
      const base = y(0);
      const points = data.map((d, i) => ({ ...d, x: M.left + slot * i + slot / 2, y: y(d.value) }));
      const bars = points
        .map((p) => {
          const h = Math.max(0, base - p.y);
          if (h <= 0) return `<rect class="bar" x="${p.x - bw / 2}" y="${base}" width="${bw}" height="0"/>`;
          const rr = Math.min(r, h);
          const x0 = p.x - bw / 2;
          const x1 = p.x + bw / 2;
          // Rounded top, square base anchored to the baseline.
          return `<path class="bar" d="M${x0},${base} V${p.y + rr} Q${x0},${p.y} ${x0 + rr},${p.y} H${x1 - rr} Q${x1},${p.y} ${x1},${p.y + rr} V${base} Z"/>`;
        })
        .join('');
      const step = Math.ceil(data.length / Math.max(2, Math.floor(W / 70)));
      const xLabels = points
        .filter(labelIdx(points.length, step))
        .map((p) => `<text class="axis" x="${p.x}" y="${H - 8}" text-anchor="middle">${Util.esc(p.label)}</text>`)
        .join('');
      el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${Util.esc(opts.ariaLabel || 'Bar chart')}">
        ${grid}${bars}${goalLine(opts.goal, y, opts.goalLabel || 'Goal')}
        <line class="baseline" x1="${M.left}" x2="${W - M.right}" y1="${base}" y2="${base}"/>
        ${xLabels}
        <rect x="${M.left}" y="${M.top}" width="${iw}" height="${H - M.top - M.bottom}" fill="transparent"/>
      </svg>`;
      el.style.position = 'relative';
      attachTooltip(el, el.querySelector('svg'), points, opts.tipFmt || ((p) => `<b>${yFmt(p.value)}</b><span>${Util.esc(p.label)}</span>`));
    },
  };

  window.Charts = Charts;
})();
