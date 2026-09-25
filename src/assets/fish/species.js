// Reef fish species definitions (Great Barrier Reef residents).
// Coordinates are in the normalised side view described in fishBuilder.js.

// ---------------------------------------------------------------------------
// Painting helpers (all coordinates in fish space: nose at x=+0.5, y up)
// ---------------------------------------------------------------------------

function finPath(ctx, fin, n = 60) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const p = fin.base(i / n);
    if (i === 0) ctx.moveTo(p[0], p[1]);
    else ctx.lineTo(p[0], p[1]);
  }
  for (let i = n; i >= 0; i--) {
    const p = fin.outline(i / n);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
}

function outlinePath(ctx, fin, n = 60) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const p = fin.outline(i / n);
    if (i === 0) ctx.moveTo(p[0], p[1]);
    else ctx.lineTo(p[0], p[1]);
  }
}

/**
 * Generic fin painter: membrane fill, rays, edge band.
 * `fill` can be a function (ctx, fin) for custom gradients.
 */
function paintFin(ctx, fin, o) {
  ctx.save();
  finPath(ctx, fin);
  ctx.clip();
  finPath(ctx, fin);
  ctx.fillStyle = typeof o.fill === 'function' ? o.fill(ctx, fin) : o.fill;
  ctx.fill();
  if (o.extra) o.extra(ctx, fin);
  // Rays
  const rays = o.rays ?? 18;
  ctx.lineWidth = o.rayWidth ?? 0.006;
  ctx.strokeStyle = o.rayColor ?? 'rgba(0,0,0,0.25)';
  for (let i = 0; rays > 0 && i <= rays; i++) {
    const s = i / rays;
    const b = fin.base(s);
    const t = fin.outline(s);
    ctx.beginPath();
    ctx.moveTo(b[0], b[1]);
    ctx.lineTo(t[0], t[1]);
    ctx.stroke();
  }
  // Edge band (drawn on the outline, clipped to inside the fin)
  if (o.edge) {
    ctx.lineWidth = o.edgeWidth ?? 0.04;
    ctx.strokeStyle = o.edge;
    outlinePath(ctx, fin);
    ctx.stroke();
  }
  if (o.edge2) {
    ctx.lineWidth = o.edge2Width ?? 0.012;
    ctx.strokeStyle = o.edge2;
    outlinePath(ctx, fin);
    ctx.stroke();
  }
  ctx.restore();
}

function fillAll(ctx, api, style) {
  const b = api.bounds;
  ctx.fillStyle = style;
  ctx.fillRect(b.xmin, b.ymin, b.xmax - b.xmin, b.ymax - b.ymin);
}

function vGrad(ctx, api, stops) {
  const b = api.bounds;
  const g = ctx.createLinearGradient(0, b.ymax, 0, b.ymin);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

// Soft speckle noise overlay so bodies are not flat colour.
function speckle(ctx, api, color, count = 1800, size = 0.006, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const b = api.bounds;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = b.xmin + rnd() * (b.xmax - b.xmin);
    const y = b.ymin + rnd() * (b.ymax - b.ymin);
    ctx.globalAlpha = 0.25 + rnd() * 0.4;
    ctx.beginPath();
    ctx.arc(x, y, size * (0.5 + rnd()), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Closed band between two smooth vertical-ish edges given as point lists.
function bandPath(ctx, left, right) {
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length - 1; i++) {
    const [x, y] = left[i];
    const [nx, ny] = left[i + 1];
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  ctx.lineTo(...left[left.length - 1]);
  const r = [...right].reverse();
  ctx.lineTo(r[0][0], r[0][1]);
  for (let i = 1; i < r.length - 1; i++) {
    const [x, y] = r[i];
    const [nx, ny] = r[i + 1];
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  ctx.lineTo(...r[r.length - 1]);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Clown anemonefish — Amphiprion percula
// ---------------------------------------------------------------------------
export const clownfish = {
  name: 'Clown anemonefish',
  latin: 'Amphiprion percula',
  length: 0.11,
  top: [[0.5, 0.0], [0.485, 0.045], [0.44, 0.11], [0.32, 0.18], [0.1, 0.215], [-0.15, 0.19], [-0.35, 0.12], [-0.5, 0.075]],
  bottom: [[0.5, -0.03], [0.48, -0.075], [0.4, -0.13], [0.25, -0.165], [0.0, -0.175], [-0.2, -0.145], [-0.38, -0.09], [-0.5, -0.065]],
  width: [[0.5, 0.0], [0.47, 0.05], [0.36, 0.1], [0.1, 0.12], [-0.2, 0.085], [-0.5, 0.03]],
  eye: { x: 0.37, y: 0.045, r: 0.045 },
  eyeColors: { iris: '#e0762a', ring: '#140a04' },
  dorsal: [
    { base: [0.22, -0.02], outline: [[0.22, 0.2], [0.19, 0.265], [0.1, 0.295], [0.02, 0.285], [-0.02, 0.24]] },
    { base: [-0.02, -0.42], outline: [[-0.02, 0.24], [-0.07, 0.33], [-0.17, 0.37], [-0.29, 0.34], [-0.38, 0.25], [-0.42, 0.12]] },
  ],
  anal: { base: [-0.12, -0.38], outline: [[-0.12, -0.16], [-0.16, -0.27], [-0.25, -0.31], [-0.34, -0.25], [-0.38, -0.1]] },
  caudal: { outline: [[-0.47, -0.055], [-0.6, -0.16], [-0.73, -0.19], [-0.79, -0.08], [-0.8, 0.0], [-0.79, 0.09], [-0.73, 0.2], [-0.6, 0.18], [-0.47, 0.065]] },
  pectoral: { base: [[0.17, -0.01], [0.15, -0.085]], outline: [[0.17, -0.01], [0.06, 0.02], [-0.04, -0.02], [-0.05, -0.09], [0.03, -0.13], [0.15, -0.085]], splay: 0.035 },
  pelvic: { base: [[0.14, -0.15], [0.1, -0.16]], outline: [[0.14, -0.15], [0.07, -0.22], [0.01, -0.26], [0.03, -0.2], [0.1, -0.16]], splay: 0.020 },
  swim: { amp: 0.1, waveK: 5.0 },
  roughness: 0.38,
  clearcoat: 0.5,
  paintBody(ctx, api) {
    fillAll(ctx, api, vGrad(ctx, api, [[0, '#e85a0c'], [0.45, '#ff7a1c'], [0.8, '#ff9a40'], [1, '#ffb060']]));
    speckle(ctx, api, '#b83c00', 1400, 0.005);
    const black = '#0b0806';
    const white = '#fbf8f2';
    // Head band (bulges forward mid-body), mid band (arrow toward head), tail band.
    const bands = [
      { l: [[0.235, 0.26], [0.285, 0.05], [0.235, -0.2]], r: [[0.165, 0.26], [0.205, 0.05], [0.165, -0.2]], rim: 0.028 },
      { l: [[0.045, 0.3], [0.1, 0.12], [0.06, -0.02], [-0.01, -0.2]], r: [[-0.045, 0.3], [0.01, 0.12], [-0.03, -0.02], [-0.1, -0.2]], rim: 0.03 },
      { l: [[-0.4, 0.15], [-0.38, 0.0], [-0.4, -0.12]], r: [[-0.455, 0.15], [-0.44, 0.0], [-0.455, -0.12]], rim: 0.026 },
    ];
    for (const b of bands) {
      bandPath(ctx, b.l, b.r);
      ctx.lineWidth = b.rim * 2;
      ctx.strokeStyle = black;
      ctx.stroke();
      ctx.fillStyle = black;
      ctx.fill();
    }
    for (const b of bands) {
      bandPath(ctx, b.l, b.r);
      ctx.fillStyle = white;
      ctx.fill();
    }
    // Subtle darker back.
    const g = vGrad(ctx, api, [[0, 'rgba(90,20,0,0.35)'], [0.3, 'rgba(90,20,0,0)'], [1, 'rgba(0,0,0,0)']]);
    fillAll(ctx, api, g);
  },
  paintFins(ctx, api) {
    for (const f of api.fins) {
      const isCaudal = f.kind === 'caudal';
      paintFin(ctx, f, {
        fill: 'rgba(255,110,20,0.95)',
        rayColor: 'rgba(160,50,0,0.45)',
        edge: 'rgba(12,8,6,0.97)',
        edgeWidth: isCaudal ? 0.07 : f.kind === 'pectoral' ? 0.04 : 0.06,
        edge2: 'rgba(255,255,255,0.9)',
        edge2Width: 0.012,
        rays: isCaudal ? 16 : 12,
      });
    }
  },
};

// ---------------------------------------------------------------------------
// Blue tang / palette surgeonfish — Paracanthurus hepatus
// ---------------------------------------------------------------------------
export const blueTang = {
  name: 'Blue tang',
  latin: 'Paracanthurus hepatus',
  length: 0.24,
  top: [[0.5, 0.0], [0.485, 0.06], [0.43, 0.17], [0.3, 0.27], [0.1, 0.3], [-0.15, 0.26], [-0.35, 0.15], [-0.5, 0.06]],
  bottom: [[0.5, -0.05], [0.47, -0.11], [0.38, -0.2], [0.2, -0.26], [0.0, -0.27], [-0.2, -0.22], [-0.38, -0.12], [-0.5, -0.05]],
  width: [[0.5, 0.0], [0.46, 0.045], [0.3, 0.075], [0.0, 0.075], [-0.3, 0.05], [-0.5, 0.02]],
  sectionPower: 0.7,
  eye: { x: 0.36, y: 0.075, r: 0.04 },
  eyeColors: { iris: '#6a5a30', ring: '#05070d' },
  dorsal: { base: [0.3, -0.45], outline: [[0.3, 0.27], [0.2, 0.345], [0.0, 0.375], [-0.2, 0.355], [-0.36, 0.28], [-0.45, 0.13]] },
  anal: { base: [0.05, -0.45], outline: [[0.05, -0.27], [-0.05, -0.33], [-0.2, -0.345], [-0.35, -0.26], [-0.45, -0.11]] },
  caudal: { outline: [[-0.47, -0.045], [-0.61, -0.19], [-0.75, -0.28], [-0.7, -0.13], [-0.685, 0.0], [-0.7, 0.14], [-0.75, 0.29], [-0.61, 0.2], [-0.47, 0.055]] },
  pectoral: { base: [[0.2, 0.0], [0.18, -0.08]], outline: [[0.2, 0.0], [0.07, 0.035], [-0.07, -0.01], [-0.04, -0.07], [0.18, -0.08]], splay: 0.030 },
  swim: { amp: 0.1, waveK: 4.6 },
  roughness: 0.35,
  clearcoat: 0.6,
  paintBody(ctx, api) {
    fillAll(ctx, api, vGrad(ctx, api, [[0, '#1848c8'], [0.5, '#2b66f0'], [1, '#4a8cff']]));
    speckle(ctx, api, '#123a9e', 1200, 0.006);
    // Black "palette" pattern.
    ctx.strokeStyle = '#06070c';
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.moveTo(0.4, 0.09);
    ctx.bezierCurveTo(0.25, 0.26, 0.0, 0.3, -0.2, 0.22);
    ctx.bezierCurveTo(-0.34, 0.16, -0.42, 0.08, -0.5, 0.02);
    ctx.stroke();
    ctx.lineWidth = 0.075;
    ctx.beginPath();
    ctx.moveTo(0.22, 0.16);
    ctx.bezierCurveTo(0.12, 0.02, -0.02, -0.03, -0.18, -0.02);
    ctx.bezierCurveTo(-0.32, -0.01, -0.42, 0.02, -0.5, 0.0);
    ctx.stroke();
    // Yellow wedge at the tail base.
    ctx.fillStyle = '#ffd21a';
    ctx.beginPath();
    ctx.moveTo(-0.43, 0.12);
    ctx.quadraticCurveTo(-0.39, 0.0, -0.43, -0.12);
    ctx.lineTo(-0.6, -0.12);
    ctx.lineTo(-0.6, 0.12);
    ctx.closePath();
    ctx.fill();
    // Lighter belly wash.
    fillAll(ctx, api, vGrad(ctx, api, [[0, 'rgba(0,0,0,0)'], [0.65, 'rgba(0,0,0,0)'], [1, 'rgba(140,190,255,0.35)']]));
  },
  paintFins(ctx, api) {
    for (const f of api.fins) {
      if (f.kind === 'caudal') {
        paintFin(ctx, f, {
          fill: '#ffd21a',
          rayColor: 'rgba(170,120,0,0.4)',
          rays: 16,
          extra: (c) => {
            // Black upper and lower lobes' leading edges.
            c.strokeStyle = '#06070c';
            c.lineWidth = 0.06;
            c.beginPath();
            c.moveTo(-0.47, 0.06);
            c.lineTo(-0.61, 0.19);
            c.lineTo(-0.76, 0.29);
            c.moveTo(-0.47, -0.05);
            c.lineTo(-0.61, -0.18);
            c.lineTo(-0.76, -0.28);
            c.stroke();
          },
        });
      } else if (f.kind === 'pectoral') {
        paintFin(ctx, f, { fill: 'rgba(255,214,40,0.9)', rayColor: 'rgba(150,110,0,0.4)', rays: 10 });
      } else {
        paintFin(ctx, f, {
          fill: '#07080e',
          rayColor: 'rgba(40,70,160,0.35)',
          edge: 'rgba(60,140,255,0.95)',
          edgeWidth: 0.03,
          rays: 22,
        });
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Blue-green chromis — Chromis viridis (small schooling damselfish)
// ---------------------------------------------------------------------------
export const chromis = {
  name: 'Blue-green chromis',
  latin: 'Chromis viridis',
  length: 0.085,
  top: [[0.5, 0.0], [0.48, 0.06], [0.41, 0.14], [0.25, 0.215], [0.05, 0.235], [-0.2, 0.18], [-0.4, 0.1], [-0.5, 0.065]],
  bottom: [[0.5, -0.035], [0.46, -0.085], [0.35, -0.15], [0.15, -0.19], [-0.05, -0.18], [-0.3, -0.12], [-0.5, -0.055]],
  width: [[0.5, 0.0], [0.46, 0.05], [0.3, 0.09], [0.0, 0.09], [-0.3, 0.05], [-0.5, 0.02]],
  eye: { x: 0.35, y: 0.055, r: 0.044 },
  eyeColors: { iris: '#6fb7b0', ring: '#0a1414' },
  dorsal: { base: [0.25, -0.38], outline: [[0.25, 0.215], [0.18, 0.29], [0.0, 0.32], [-0.2, 0.31], [-0.3, 0.29], [-0.38, 0.15]] },
  anal: { base: [-0.02, -0.38], outline: [[-0.02, -0.18], [-0.1, -0.265], [-0.25, -0.285], [-0.38, -0.12]] },
  caudal: { outline: [[-0.47, -0.05], [-0.66, -0.21], [-0.82, -0.32], [-0.72, -0.12], [-0.63, 0.0], [-0.72, 0.13], [-0.82, 0.33], [-0.66, 0.22], [-0.47, 0.06]] },
  pectoral: { base: [[0.18, 0.0], [0.16, -0.06]], outline: [[0.18, 0.0], [0.05, 0.02], [-0.07, -0.02], [0.04, -0.075], [0.16, -0.06]], splay: 0.030 },
  swim: { amp: 0.12, waveK: 5.5 },
  roughness: 0.3,
  clearcoat: 0.7,
  iridescence: 0.8,
  paintBody(ctx, api) {
    fillAll(ctx, api, vGrad(ctx, api, [[0, '#4fb8c0'], [0.3, '#8ff0e0'], [0.6, '#c0fff0'], [1, '#f0fffa']]));
    speckle(ctx, api, 'rgba(60,170,190,0.6)', 700, 0.005);
    ctx.globalAlpha = 0.25;
    speckle(ctx, api, '#e8fffb', 600, 0.005, 13);
    ctx.globalAlpha = 1;
  },
  paintFins(ctx, api) {
    for (const f of api.fins) {
      paintFin(ctx, f, {
        fill: f.kind === 'pectoral' ? 'rgba(200,255,245,0.35)' : 'rgba(110,210,200,0.7)',
        rayColor: 'rgba(40,120,130,0.5)',
        rays: f.kind === 'caudal' ? 18 : 14,
        edge: f.kind === 'caudal' ? 'rgba(20,70,90,0.6)' : undefined,
        edgeWidth: 0.02,
      });
    }
  },
};

// ---------------------------------------------------------------------------
// Threadfin butterflyfish — Chaetodon auriga
// ---------------------------------------------------------------------------
export const butterflyfish = {
  name: 'Threadfin butterflyfish',
  latin: 'Chaetodon auriga',
  length: 0.19,
  top: [[0.5, 0.02], [0.47, 0.045], [0.4, 0.1], [0.3, 0.2], [0.12, 0.315], [-0.08, 0.34], [-0.28, 0.28], [-0.42, 0.15], [-0.5, 0.07]],
  bottom: [[0.5, -0.005], [0.47, -0.03], [0.4, -0.08], [0.25, -0.21], [0.05, -0.3], [-0.15, -0.29], [-0.35, -0.18], [-0.5, -0.06]],
  width: [[0.5, 0.0], [0.47, 0.02], [0.3, 0.06], [0.0, 0.065], [-0.3, 0.045], [-0.5, 0.018]],
  sectionPower: 0.65,
  eye: { x: 0.31, y: 0.06, r: 0.036 },
  eyeColors: { iris: '#20140c', ring: '#050302' },
  dorsal: {
    base: [0.25, -0.45],
    outline: [[0.25, 0.25], [0.15, 0.36], [0.0, 0.4], [-0.18, 0.4], [-0.33, 0.36], [-0.44, 0.3], [-0.6, 0.25], [-0.49, 0.22], [-0.46, 0.14]],
  },
  anal: { base: [0.0, -0.45], outline: [[0.0, -0.3], [-0.1, -0.395], [-0.28, -0.425], [-0.42, -0.33], [-0.46, -0.12]] },
  caudal: { outline: [[-0.47, -0.05], [-0.58, -0.155], [-0.665, -0.17], [-0.67, 0.0], [-0.665, 0.17], [-0.58, 0.16], [-0.47, 0.06]] },
  pectoral: { base: [[0.18, -0.02], [0.16, -0.09]], outline: [[0.18, -0.02], [0.06, 0.0], [-0.06, -0.05], [0.04, -0.11], [0.16, -0.09]], splay: 0.025 },
  pelvic: { base: [[0.12, -0.24], [0.06, -0.26]], outline: [[0.12, -0.24], [0.05, -0.34], [-0.01, -0.38], [0.02, -0.3], [0.06, -0.26]], splay: 0.015 },
  swim: { amp: 0.075, waveK: 4.2 },
  roughness: 0.4,
  clearcoat: 0.45,
  paintBody(ctx, api) {
    fillAll(ctx, api, vGrad(ctx, api, [[0, '#f2efe6'], [0.6, '#fbfaf4'], [1, '#f4f2ea']]));
    // Yellow rear.
    const g = ctx.createLinearGradient(0.05, 0, -0.35, 0);
    g.addColorStop(0, 'rgba(255,205,20,0)');
    g.addColorStop(1, 'rgba(255,205,20,1)');
    ctx.fillStyle = g;
    ctx.fillRect(-0.7, -0.5, 0.75, 1.0);
    // Chevron lines: upper set slopes down-back, lower set up-back.
    ctx.save();
    ctx.lineWidth = 0.006;
    ctx.strokeStyle = 'rgba(90,80,70,0.55)';
    for (let k = -8; k <= 10; k++) {
      const x0 = 0.3 - k * 0.06;
      ctx.beginPath();
      ctx.moveTo(x0, 0.4);
      ctx.lineTo(x0 - 0.3, 0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0 - 0.3, 0.05);
      ctx.lineTo(x0 - 0.02, -0.35);
      ctx.stroke();
    }
    ctx.restore();
    // Black eye bar.
    ctx.fillStyle = '#0c0a08';
    bandPath(ctx, [[0.36, 0.3], [0.345, 0.06], [0.37, -0.2]], [[0.27, 0.3], [0.265, 0.06], [0.29, -0.2]]);
    ctx.fill();
    speckle(ctx, api, 'rgba(120,110,80,0.5)', 700, 0.004);
  },
  paintFins(ctx, api) {
    for (const f of api.fins) {
      if (f.kind === 'dorsal') {
        paintFin(ctx, f, {
          fill: (c) => {
            const g = c.createLinearGradient(0.2, 0, -0.4, 0);
            g.addColorStop(0, 'rgba(250,248,238,0.95)');
            g.addColorStop(0.55, 'rgba(255,208,30,0.95)');
            g.addColorStop(1, 'rgba(255,200,20,0.9)');
            return g;
          },
          rays: 24,
          rayColor: 'rgba(120,100,40,0.3)',
          extra: (c) => {
            // Black ocellus on the soft dorsal.
            c.fillStyle = '#0b0908';
            c.beginPath();
            c.ellipse(-0.43, 0.29, 0.03, 0.022, -0.4, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.8)';
            c.lineWidth = 0.008;
            c.stroke();
          },
          edge: 'rgba(40,30,20,0.6)',
          edgeWidth: 0.012,
        });
      } else if (f.kind === 'anal') {
        paintFin(ctx, f, { fill: 'rgba(255,205,25,0.95)', rays: 18, rayColor: 'rgba(140,100,0,0.3)', edge: 'rgba(30,20,10,0.7)', edgeWidth: 0.02 });
      } else if (f.kind === 'caudal') {
        paintFin(ctx, f, {
          fill: 'rgba(255,210,40,0.9)',
          rays: 16,
          rayColor: 'rgba(140,100,0,0.35)',
          extra: (c) => {
            c.fillStyle = 'rgba(40,30,20,0.85)';
            c.fillRect(-0.62, -0.3, 0.02, 0.6);
            c.fillStyle = 'rgba(255,255,255,0.35)';
            c.fillRect(-0.7, -0.3, 0.06, 0.6);
          },
        });
      } else if (f.kind === 'pelvic') {
        paintFin(ctx, f, { fill: 'rgba(250,245,230,0.85)', rays: 8 });
      } else {
        paintFin(ctx, f, { fill: 'rgba(250,250,240,0.35)', rays: 10, rayColor: 'rgba(100,100,80,0.3)' });
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Moorish idol — Zanclus cornutus
// ---------------------------------------------------------------------------
export const moorishIdol = {
  name: 'Moorish idol',
  latin: 'Zanclus cornutus',
  length: 0.18,
  top: [[0.5, 0.02], [0.46, 0.05], [0.36, 0.1], [0.25, 0.28], [0.1, 0.43], [-0.05, 0.46], [-0.25, 0.35], [-0.4, 0.18], [-0.5, 0.07]],
  bottom: [[0.5, -0.01], [0.46, -0.04], [0.36, -0.08], [0.2, -0.28], [0.0, -0.41], [-0.2, -0.35], [-0.38, -0.18], [-0.5, -0.06]],
  width: [[0.5, 0.0], [0.45, 0.02], [0.3, 0.05], [0.0, 0.055], [-0.3, 0.04], [-0.5, 0.015]],
  sectionPower: 0.6,
  eye: { x: 0.27, y: 0.13, r: 0.034 },
  eyeColors: { iris: '#e8d8a0', ring: '#050505' },
  dorsal: {
    base: [0.12, -0.42],
    // A tall sail that sweeps back into the long white streamer.
    outline: [[0.12, 0.43], [0.04, 0.68], [-0.12, 0.92], [-0.38, 1.08], [-0.82, 1.14], [-0.46, 0.94], [-0.3, 0.6], [-0.37, 0.34], [-0.42, 0.15]],
  },
  anal: { base: [-0.02, -0.42], outline: [[-0.02, -0.41], [-0.12, -0.62], [-0.3, -0.7], [-0.42, -0.45], [-0.44, -0.14]] },
  caudal: { outline: [[-0.47, -0.05], [-0.58, -0.14], [-0.66, -0.15], [-0.665, 0.0], [-0.66, 0.15], [-0.58, 0.14], [-0.47, 0.06]] },
  pectoral: { base: [[0.18, -0.02], [0.16, -0.09]], outline: [[0.18, -0.02], [0.06, 0.0], [-0.05, -0.05], [0.05, -0.11], [0.16, -0.09]], splay: 0.025 },
  pelvic: { base: [[0.14, -0.3], [0.08, -0.33]], outline: [[0.14, -0.3], [0.08, -0.42], [0.02, -0.46], [0.04, -0.38], [0.08, -0.33]], splay: 0.015 },
  swim: { amp: 0.06, waveK: 4.0 },
  roughness: 0.4,
  clearcoat: 0.45,
  paintBody(ctx, api) {
    // White front, lemon-yellow rear, two broad black bars, orange snout saddle.
    const g = ctx.createLinearGradient(0.3, 0, -0.5, 0);
    g.addColorStop(0, '#f6f4ea');
    g.addColorStop(0.45, '#fbf2c8');
    g.addColorStop(1, '#ffd84a');
    ctx.fillStyle = g;
    ctx.fillRect(-0.9, -0.9, 1.6, 1.8);
    ctx.fillStyle = '#0a0a0a';
    bandPath(ctx, [[0.33, 0.6], [0.3, 0.1], [0.24, -0.5]], [[0.12, 0.6], [0.12, 0.1], [0.06, -0.5]]);
    ctx.fill();
    bandPath(ctx, [[-0.1, 0.6], [-0.12, 0.0], [-0.16, -0.5]], [[-0.33, 0.6], [-0.33, 0.0], [-0.34, -0.5]]);
    ctx.fill();
    // Thin white line inside the rear bar.
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.01;
    ctx.beginPath();
    ctx.moveTo(-0.3, 0.5);
    ctx.lineTo(-0.3, -0.5);
    ctx.stroke();
    ctx.fillStyle = '#ff8a1c';
    ctx.beginPath();
    ctx.ellipse(0.4, 0.075, 0.06, 0.03, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#101010';
    ctx.fillRect(0.46, -0.04, 0.06, 0.08); // dark snout tip
    speckle(ctx, api, 'rgba(120,110,80,0.35)', 400, 0.004);
  },
  paintFins(ctx, api) {
    for (const f of api.fins) {
      if (f.kind === 'dorsal') {
        paintFin(ctx, f, {
          fill: 'rgba(250,248,240,0.95)',
          rays: 22,
          rayColor: 'rgba(120,120,100,0.25)',
          extra: (c) => {
            c.fillStyle = '#0a0a0a';
            c.fillRect(-0.33, 0.3, 0.23, 0.4); // rear bar continues into the sail
            c.fillStyle = 'rgba(255,215,60,0.9)';
            c.fillRect(-0.45, 0.3, 0.12, 0.25);
          },
        });
      } else if (f.kind === 'anal') {
        paintFin(ctx, f, {
          fill: 'rgba(255,220,70,0.95)',
          rays: 16,
          extra: (c) => {
            c.fillStyle = '#0a0a0a';
            c.fillRect(-0.33, -0.8, 0.23, 0.7);
          },
          edge: 'rgba(250,250,250,0.9)',
          edgeWidth: 0.02,
        });
      } else if (f.kind === 'caudal') {
        paintFin(ctx, f, { fill: '#0c0c0c', rays: 14, rayColor: 'rgba(80,80,80,0.4)', edge: 'rgba(250,250,245,0.95)', edgeWidth: 0.025 });
      } else if (f.kind === 'pelvic') {
        paintFin(ctx, f, { fill: '#0c0c0c', rays: 8 });
      } else {
        paintFin(ctx, f, { fill: 'rgba(250,250,240,0.35)', rays: 10 });
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Steephead parrotfish (terminal-phase male) — Chlorurus microrhinos
// ---------------------------------------------------------------------------
export const parrotfish = {
  name: 'Steephead parrotfish',
  latin: 'Chlorurus microrhinos',
  length: 0.45,
  top: [[0.5, 0.0], [0.495, 0.07], [0.46, 0.15], [0.34, 0.2], [0.1, 0.22], [-0.2, 0.18], [-0.4, 0.1], [-0.5, 0.06]],
  bottom: [[0.5, -0.05], [0.47, -0.1], [0.38, -0.15], [0.2, -0.19], [-0.05, -0.19], [-0.3, -0.13], [-0.5, -0.055]],
  width: [[0.5, 0.0], [0.47, 0.07], [0.3, 0.11], [0.0, 0.11], [-0.3, 0.07], [-0.5, 0.025]],
  eye: { x: 0.37, y: 0.08, r: 0.028 },
  eyeColors: { iris: '#e0a040', ring: '#0a0a0a' },
  dorsal: { base: [0.26, -0.38], outline: [[0.26, 0.2], [0.2, 0.26], [0.0, 0.28], [-0.2, 0.25], [-0.38, 0.14]] },
  anal: { base: [-0.05, -0.38], outline: [[-0.05, -0.19], [-0.12, -0.25], [-0.3, -0.22], [-0.38, -0.1]] },
  caudal: { outline: [[-0.47, -0.05], [-0.6, -0.17], [-0.73, -0.27], [-0.66, -0.1], [-0.63, 0.0], [-0.66, 0.1], [-0.73, 0.28], [-0.6, 0.18], [-0.47, 0.06]] },
  pectoral: { base: [[0.22, -0.01], [0.2, -0.08]], outline: [[0.22, -0.01], [0.1, 0.01], [0.0, -0.03], [0.08, -0.09], [0.2, -0.08]], splay: 0.04 },
  pelvic: { base: [[0.18, -0.17], [0.14, -0.18]], outline: [[0.18, -0.17], [0.1, -0.24], [0.06, -0.26], [0.08, -0.21], [0.14, -0.18]], splay: 0.02 },
  swim: { amp: 0.07, waveK: 4.6 },
  roughness: 0.38,
  clearcoat: 0.55,
  scaleSize: 0.05,
  bumpScale: 0.9,
  paintBody(ctx, api) {
    fillAll(ctx, api, vGrad(ctx, api, [[0, '#127a70'], [0.45, '#22b0a0'], [1, '#6ad8c0']]));
    // Big scales, each outlined in salmon pink.
    ctx.save();
    ctx.lineWidth = 0.008;
    ctx.strokeStyle = 'rgba(255,140,120,0.85)';
    const size = 0.05;
    for (let r = 0; r < 20; r++) {
      const y = -0.3 + r * size * 0.55;
      const shift = (r % 2) * size * 0.5;
      for (let x = -0.5 + shift; x < 0.28; x += size) {
        ctx.beginPath();
        ctx.arc(x, y, size * 0.55, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Head: blue-green with orange cheek stripes.
    const hg = ctx.createLinearGradient(0.5, 0, 0.25, 0);
    hg.addColorStop(0, '#2a8ab0');
    hg.addColorStop(1, 'rgba(42,138,176,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0.2, -0.3, 0.35, 0.6);
    ctx.strokeStyle = '#ff9a4a';
    ctx.lineWidth = 0.014;
    for (const [y0, y1] of [[0.02, 0.1], [-0.05, 0.0]]) {
      ctx.beginPath();
      ctx.moveTo(0.49, y0);
      ctx.quadraticCurveTo(0.4, y1 + 0.02, 0.3, y1);
      ctx.stroke();
    }
    // Fused-tooth beak.
    ctx.fillStyle = '#b8f0e0';
    ctx.beginPath();
    ctx.ellipse(0.49, -0.02, 0.025, 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  paintFins(ctx, api) {
    for (const f of api.fins) {
      if (f.kind === 'caudal') {
        paintFin(ctx, f, {
          fill: 'rgba(40,170,160,0.95)',
          rays: 16,
          rayColor: 'rgba(255,150,120,0.5)',
          extra: (c) => {
            c.strokeStyle = 'rgba(255,140,90,0.9)';
            c.lineWidth = 0.03;
            c.beginPath();
            c.moveTo(-0.55, 0.14);
            c.quadraticCurveTo(-0.6, 0.0, -0.55, -0.14);
            c.stroke();
          },
          edge: 'rgba(80,150,255,0.9)',
          edgeWidth: 0.025,
        });
      } else if (f.kind === 'pectoral' || f.kind === 'pelvic') {
        paintFin(ctx, f, { fill: 'rgba(120,220,210,0.5)', rays: 10, edge: 'rgba(60,140,255,0.8)', edgeWidth: 0.02 });
      } else {
        paintFin(ctx, f, { fill: 'rgba(255,140,110,0.92)', rays: 18, rayColor: 'rgba(40,160,150,0.5)', edge: 'rgba(60,150,255,0.95)', edgeWidth: 0.035 });
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Whitetip reef shark — Triaenodon obesus
// ---------------------------------------------------------------------------
export const whitetipShark = {
  name: 'Whitetip reef shark',
  latin: 'Triaenodon obesus',
  length: 1.45,
  top: [[0.5, 0.0], [0.47, 0.03], [0.4, 0.055], [0.25, 0.08], [0.1, 0.09], [-0.1, 0.078], [-0.3, 0.05], [-0.5, 0.022]],
  bottom: [[0.5, -0.012], [0.46, -0.035], [0.38, -0.055], [0.2, -0.072], [0.0, -0.072], [-0.2, -0.055], [-0.4, -0.03], [-0.5, -0.018]],
  width: [[0.5, 0.0], [0.46, 0.045], [0.35, 0.075], [0.1, 0.082], [-0.2, 0.06], [-0.5, 0.018]],
  sectionPower: 0.9,
  eye: { x: 0.415, y: 0.018, r: 0.009 },
  eyeColors: { iris: '#6a7a60', ring: '#050505' },
  dorsal: [
    { base: [0.06, -0.1], outline: [[0.06, 0.089], [0.02, 0.2], [-0.05, 0.235], [-0.08, 0.2], [-0.08, 0.13], [-0.1, 0.083]] },
    { base: [-0.3, -0.37], outline: [[-0.3, 0.046], [-0.33, 0.11], [-0.37, 0.115], [-0.37, 0.042]] },
  ],
  anal: { base: [-0.3, -0.38], outline: [[-0.3, -0.042], [-0.33, -0.1], [-0.37, -0.1], [-0.38, -0.036]] },
  caudal: {
    inset: 0.01,
    // Heterocercal: the upper lobe is much longer.
    outline: [[-0.49, -0.017], [-0.56, -0.09], [-0.61, -0.12], [-0.6, -0.065], [-0.6, -0.02], [-0.67, 0.05], [-0.8, 0.165], [-0.72, 0.125], [-0.58, 0.055], [-0.49, 0.02]],
  },
  pectoral: { base: [[0.28, -0.045], [0.2, -0.055]], outline: [[0.28, -0.045], [0.21, -0.07], [0.12, -0.085], [0.1, -0.072], [0.2, -0.055]], splay: 0.2 },
  pelvic: { base: [[-0.18, -0.06], [-0.24, -0.05]], outline: [[-0.18, -0.06], [-0.24, -0.1], [-0.27, -0.09], [-0.24, -0.05]], splay: 0.04 },
  swim: { amp: 0.06, waveK: 3.2 },
  roughness: 0.55,
  clearcoat: 0.15,
  scaleSize: 0.006,
  bumpScale: 0.25,
  paintBody(ctx, api) {
    // Grey-brown back, sharp countershading to a white belly.
    fillAll(ctx, api, vGrad(ctx, api, [[0, '#5f5a52'], [0.42, '#7a746a'], [0.5, '#c9c6bc'], [0.56, '#f2f0ea'], [1, '#f6f4ee']]));
    speckle(ctx, api, 'rgba(60,55,48,0.25)', 40, 0.006, 3);
    // Gill slits.
    ctx.strokeStyle = 'rgba(40,35,30,0.7)';
    ctx.lineWidth = 0.004;
    for (let i = 0; i < 5; i++) {
      const x = 0.33 - i * 0.017;
      ctx.beginPath();
      ctx.moveTo(x, 0.035);
      ctx.quadraticCurveTo(x - 0.008, 0.0, x, -0.04);
      ctx.stroke();
    }
    // Mouth line.
    ctx.strokeStyle = 'rgba(60,50,45,0.6)';
    ctx.beginPath();
    ctx.moveTo(0.45, -0.03);
    ctx.quadraticCurveTo(0.42, -0.05, 0.39, -0.04);
    ctx.stroke();
  },
  paintFins(ctx, api) {
    for (const f of api.fins) {
      const tipWhite = (f.kind === 'dorsal' && f.def.base[0] > 0) || f.kind === 'caudal';
      paintFin(ctx, f, {
        fill: f.kind === 'pectoral' || f.kind === 'pelvic' ? 'rgba(120,114,104,0.98)' : 'rgba(104,98,90,0.98)',
        rays: 0,
        extra: tipWhite
          ? (c) => {
              c.fillStyle = 'rgba(250,250,248,0.98)';
              c.beginPath();
              if (f.kind === 'caudal') c.arc(-0.8, 0.165, 0.065, 0, Math.PI * 2);
              else c.arc(-0.05, 0.24, 0.065, 0, Math.PI * 2);
              c.fill();
            }
          : null,
      });
    }
  },
};

export const SPECIES = { clownfish, blueTang, chromis, butterflyfish, moorishIdol, parrotfish, whitetipShark };
