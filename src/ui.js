// Minimal overlay: title, controls hint and an asset picker for feedback.

export function setupUI(app, { asset, DECOR, FISH, onSelect }) {
  const el = document.getElementById('ui');
  const opts = [
    `<option value="">Full aquarium</option>`,
    `<optgroup label="Fish">${Object.entries(FISH)
      .map(([k, v]) => `<option value="${k}" ${k === asset ? 'selected' : ''}>${v.label}</option>`)
      .join('')}</optgroup>`,
    `<optgroup label="Coral & plants">${Object.entries(DECOR)
      .map(([k, v]) => `<option value="${k}" ${k === asset ? 'selected' : ''}>${v.label}</option>`)
      .join('')}</optgroup>`,
  ].join('');
  const info = asset ? FISH[asset]?.latin ?? DECOR[asset]?.label ?? '' : 'Great Barrier Reef, proof of concept';
  el.innerHTML = `
    <div class="panel">
      <div class="title">Reef Aquarium</div>
      <div class="sub">${info}</div>
      <label class="pick">View
        <select id="assetPick">${opts}</select>
      </label>
      <div class="hint">Drag to look around · scroll / pinch to zoom · right-drag to pan</div>
    </div>`;
  el.querySelector('#assetPick').addEventListener('change', (e) => onSelect(e.target.value || null));
}
