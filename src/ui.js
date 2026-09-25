// Overlay: title, scene/asset picker, controls hint and tour indicator.

export function setupUI(app, { asset, DECOR, FISH, RAYS, ANIMALS, onSelect }) {
  const el = document.getElementById('ui');
  const opt = (k, label) => `<option value="${k}" ${k === (asset || '') ? 'selected' : ''}>${label}</option>`;
  const opts = [
    `<optgroup label="Dive sites">${opt('', 'Great Barrier Reef')}${opt('aquarium', 'Aquarium (proof of concept)')}</optgroup>`,
    `<optgroup label="Fish">${Object.entries(FISH).map(([k, v]) => opt(k, v.label)).join('')}</optgroup>`,
    `<optgroup label="Rays">${Object.entries(RAYS).map(([k, v]) => opt(k, v.label)).join('')}</optgroup>`,
    `<optgroup label="Turtles & octopus">${Object.entries(ANIMALS).map(([k, v]) => opt(k, v.label)).join('')}</optgroup>`,
    `<optgroup label="Coral, clams & plants">${Object.entries(DECOR).map(([k, v]) => opt(k, v.label)).join('')}</optgroup>`,
  ].join('');
  const swim = Boolean(app.controls.isSwim);
  const info = !asset
    ? 'Fringing reef, Great Barrier Reef'
    : asset === 'aquarium'
      ? 'Great Barrier Reef, proof of concept'
      : FISH[asset]?.latin ?? RAYS[asset]?.latin ?? ANIMALS[asset]?.latin ?? DECOR[asset]?.label ?? '';
  const touch = matchMedia('(pointer: coarse)').matches;
  const hint = swim
    ? touch
      ? 'Drag to look · left stick to swim · ▲ ▼ to rise and sink'
      : 'Drag to look · WASD to swim · Space / Q to rise and sink · Shift to kick harder'
    : 'Drag to look around · scroll / pinch to zoom · right-drag to pan';
  el.innerHTML = `
    <div class="panel">
      <div class="title">Reef Aquarium</div>
      <div class="sub">${info}</div>
      <label class="pick">View
        <select id="assetPick">${opts}</select>
      </label>
      <div class="hint">${hint}</div>
      ${swim ? '<div class="tour" id="tourBadge" hidden>Auto-tour · move or look to take over</div>' : ''}
    </div>`;
  el.querySelector('#assetPick').addEventListener('change', (e) => onSelect(e.target.value || null));
  if (swim) {
    const badge = el.querySelector('#tourBadge');
    const set = (on) => (badge.hidden = !on);
    app.controls.onTourChange = set;
    set(app.controls.touring);
  }
}
