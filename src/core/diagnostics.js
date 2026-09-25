// Visible failure reporting. A WebGL app that fails usually shows an empty
// screen; this puts the actual reason on screen so problems on a particular
// device or browser can be reported and fixed.

const seen = new Set();

export function showError(title, detail = '') {
  const key = title + detail;
  if (seen.has(key)) return;
  seen.add(key);
  const el = document.getElementById('error');
  if (!el) return;
  el.hidden = false;
  const item = document.createElement('div');
  item.className = 'err-item';
  const h = document.createElement('strong');
  h.textContent = title;
  item.appendChild(h);
  if (detail) {
    const pre = document.createElement('pre');
    pre.textContent = String(detail).slice(0, 1500);
    item.appendChild(pre);
  }
  el.appendChild(item);
}

export function clearErrors() {
  const el = document.getElementById('error');
  if (!el) return;
  el.replaceChildren();
  el.hidden = true;
  seen.clear();
}

export function installGlobalHandlers() {
  window.addEventListener('error', (e) => showError('Script error', `${e.message}\n${e.filename || ''}:${e.lineno || ''}`));
  window.addEventListener('unhandledrejection', (e) => showError('Unhandled error', String(e.reason?.stack || e.reason)));
}

/** Returns null when WebGL2 is usable, otherwise a human-readable reason. */
export function webgl2Problem() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) {
      return c.getContext('webgl')
        ? 'This browser supports only WebGL 1. The aquarium needs WebGL 2 (Chrome, Edge, Firefox, or Safari on iOS 15 or later).'
        : 'WebGL is not available. It may be switched off in the browser settings, or hardware acceleration may be disabled.';
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  } catch (e) {
    return `WebGL could not start: ${e.message}`;
  }
}

/** Route three.js shader compile failures to the screen. */
export function watchRenderer(renderer) {
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const logs = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)]
      .map((s) => (s || '').trim())
      .filter(Boolean)
      .join('\n');
    console.error('Shader compile failed:\n' + logs);
    showError('A shader failed to compile on this GPU', logs || 'No log available');
  };
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showError('The GPU reset the 3D view (WebGL context lost)', 'This usually means the device ran out of graphics memory. Reload the page to try again.');
  });
}

/**
 * Rendering tier. Everyone gets the full look by default; `?quality=low` is an
 * opt-in for devices that struggle (lower resolution, no MSAA, smaller shadows).
 */
export function pickQuality() {
  return new URLSearchParams(location.search).get('quality') === 'low' ? 'low' : 'high';
}
