// Small curve helpers for procedural modelling.

/**
 * Monotone cubic interpolation (Fritsch–Carlson) through [[x, y], ...].
 * Points may be given in any x order. Returns f(x), clamped at the ends.
 */
export function monotone(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const d = new Array(n - 1);
  const m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * m[i + 1]
    );
  };
}

/**
 * Centripetal Catmull–Rom through 2D control points, re-parameterised by arc
 * length. Returns p(s) for s in [0, 1] as [x, y].
 */
export function smoothPath2(points, samples = 200) {
  const P = points;
  const n = P.length;
  if (n === 2) {
    return (s) => [P[0][0] + (P[1][0] - P[0][0]) * s, P[0][1] + (P[1][1] - P[0][1]) * s];
  }
  const get = (i) => P[Math.max(0, Math.min(n - 1, i))];
  const seg = (i, t) => {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const t2 = t * t, t3 = t2 * t;
    const f = (a, b, c, d) =>
      0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
  };
  // Dense sampling + cumulative length table.
  const dense = [];
  for (let i = 0; i < n - 1; i++) {
    const k = Math.ceil(samples / (n - 1));
    for (let j = 0; j < k; j++) dense.push(seg(i, j / k));
  }
  dense.push(P[n - 1]);
  const len = [0];
  for (let i = 1; i < dense.length; i++) {
    len.push(len[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  }
  const total = len[len.length - 1];
  return (s) => {
    const target = Math.min(Math.max(s, 0), 1) * total;
    let lo = 0, hi = len.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (len[mid] < target) lo = mid;
      else hi = mid;
    }
    const t = (target - len[lo]) / Math.max(len[hi] - len[lo], 1e-9);
    return [dense[lo][0] + (dense[hi][0] - dense[lo][0]) * t, dense[lo][1] + (dense[hi][1] - dense[lo][1]) * t];
  };
}
