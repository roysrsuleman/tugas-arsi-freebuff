/* Tab Diagram PERT: jaringan (activity-on-node) digambar dengan SVG.
 * Node  = kegiatan (kode + durasi); panah = dependensi (FS/SS + delay);
 * node & panah pada jalur kritis diberi warna merah. */
'use strict';

const PERT_NODE_W = 96;
const PERT_NODE_H = 72;
const PERT_GAP_X = 96;
const PERT_GAP_Y = 28;
const PERT_PAD = 34;

async function renderPert() {
  const container = document.getElementById('pert-content');

  if (!state.currentProjectId) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon"><svg class="ic ic-20" aria-hidden="true"><use href="#ic-network"></use></svg></span>
        <p>Pilih atau buat <strong>proyek</strong> terlebih dahulu untuk melihat diagram PERT.</p>
        <button type="button" class="btn primary" data-empty-action="go-projects">
          <svg class="ic" aria-hidden="true"><use href="#ic-folder"></use></svg>Buka tab Proyek
        </button>
      </div>`;
    container.querySelector('[data-empty-action="go-projects"]')
      .addEventListener('click', () => showTab('projects'));
    return;
  }
  if (!state.tasks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon"><svg class="ic ic-20" aria-hidden="true"><use href="#ic-network"></use></svg></span>
        <p>Belum ada kegiatan. Tambahkan kegiatan di tab <strong>Kegiatan</strong> terlebih dahulu.</p>
        <button type="button" class="btn primary" data-empty-action="new-task">
          <svg class="ic" aria-hidden="true"><use href="#ic-plus"></use></svg>Kegiatan Baru
        </button>
      </div>`;
    container.querySelector('[data-empty-action="new-task"]')
      .addEventListener('click', () => openTaskModal());
    return;
  }

  let cp;
  try {
    cp = await ensureCriticalPath();
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon"><svg class="ic ic-20" aria-hidden="true"><use href="#ic-alert-triangle"></use></svg></span>
        <p>${esc(err.message)}</p>
      </div>`;
    return;
  }

  const tasks = [...state.tasks].sort((a, b) => a.id - b.id);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const criticalIds = new Set(cp.tasks.filter((t) => t.isCritical).map((t) => t.id));

  // Layering: rank = jarak terpanjang dari kegiatan sumber
  const predsOf = new Map(tasks.map((t) => [t.id, t.predecessors.map((p) => p.predecessorId)]));
  const rankMemo = new Map();
  const rankOf = (id) => {
    if (rankMemo.has(id)) return rankMemo.get(id);
    const preds = predsOf.get(id) || [];
    const rank = preds.length ? Math.max(...preds.map((pid) => taskById.has(pid) ? rankOf(pid) : 0)) + 1 : 0;
    rankMemo.set(id, rank);
    return rank;
  };

  const layers = new Map();
  for (const t of tasks) {
    const rank = rankOf(t.id);
    if (!layers.has(rank)) layers.set(rank, []);
    layers.get(rank).push(t);
  }
  const maxRank = Math.max(...layers.keys());
  const maxLayerSize = Math.max(...[...layers.values()].map((l) => l.length));
  const width = PERT_PAD * 2 + (maxRank + 1) * PERT_NODE_W + maxRank * PERT_GAP_X;
  const height = PERT_PAD * 2 + maxLayerSize * PERT_NODE_H + (maxLayerSize - 1) * PERT_GAP_Y;

  // Posisi tiap node
  const pos = new Map(); // id -> {x, y} (kiri-atas)
  for (const [rank, list] of layers) {
    const stackH = list.length * PERT_NODE_H + (list.length - 1) * PERT_GAP_Y;
    const y0 = (height - stackH) / 2;
    const x = PERT_PAD + rank * (PERT_NODE_W + PERT_GAP_X);
    list.forEach((t, i) => {
      pos.set(t.id, { x, y: y0 + i * (PERT_NODE_H + PERT_GAP_Y) });
    });
  }

  // Node (kartu: kode, durasi, ES/EF)
  const cpById = new Map(cp.tasks.map((t) => [t.id, t]));
  const nodesHtml = tasks.map((t) => {
    const p = pos.get(t.id);
    const crit = criticalIds.has(t.id);
    const cpt = cpById.get(t.id);
    const cx = p.x + PERT_NODE_W / 2;
    const title = `${t.code} — ${t.name}\n${formatDateID(t.startDate)} s/d ${formatDateID(t.endDate)} (${t.duration} hari kerja)`;
    const esEf = cpt && cpt.es && cpt.ef
      ? `<text class="pnode-es" x="${cx - p.x}" y="54" text-anchor="middle">ES ${formatShortID(cpt.es)}</text>
         <text class="pnode-es" x="${cx - p.x}" y="67" text-anchor="middle">EF ${formatShortID(cpt.ef)}</text>`
      : '';
    return `
      <g class="pnode ${crit ? 'crit' : ''}" transform="translate(${p.x}, ${p.y})">
        <title>${esc(title)}</title>
        <rect width="${PERT_NODE_W}" height="${PERT_NODE_H}" rx="9"></rect>
        <text class="pnode-code" x="${cx - p.x}" y="23" text-anchor="middle">${esc(t.code)}</text>
        <text class="pnode-dur" x="${cx - p.x}" y="39" text-anchor="middle">${t.duration} hari</text>
        ${esEf}
      </g>`;
  }).join('');

  // Panah dependensi
  const edgeParts = [];
  for (const t of tasks) {
    const tp = pos.get(t.id);
    for (const dep of t.predecessors) {
      const pred = taskById.get(dep.predecessorId);
      if (!pred) continue;
      const pp = pos.get(pred.id);
      const x1 = pp.x + PERT_NODE_W;
      const y1 = pp.y + PERT_NODE_H / 2;
      const x2 = tp.x;
      const y2 = tp.y + PERT_NODE_H / 2;
      const bothCrit = criticalIds.has(pred.id) && criticalIds.has(t.id);
      const critCls = bothCrit ? ' critical' : '';
      const marker = bothCrit ? 'arw-crit' : 'arw';

      // Elbow jika sejajar, kurva jika berbeda baris
      const d = Math.abs(y2 - y1) < 2
        ? `M ${x1} ${y1} L ${x2} ${y2}`
        : `M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`;

      const showLabel = dep.type === 'SS' || (dep.delay || 0) > 0;
      const label = `${dep.type}${dep.delay > 0 ? `+${dep.delay}` : ''}`;
      edgeParts.push(
        `<path class="pedge${critCls}" d="${d}" marker-end="url(#${marker})"/>`
        + (showLabel
          ? `<text class="pedge-label${critCls}" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle">${label}</text>`
          : '')
      );
    }
  }

  container.innerHTML = `
    <div class="pert-wrap">
      <svg class="pert-svg" width="${width}" height="${height}" role="img" aria-label="Diagram jaringan PERT">
        <defs>
          <marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/>
          </marker>
          <marker id="arw-crit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#dc2626"/>
          </marker>
        </defs>
        ${edgeParts.join('')}
        ${nodesHtml}
      </svg>
    </div>
    <div class="gantt-legend">
      <span class="lg"><span class="sw sw-node"></span> Kegiatan</span>
      <span class="lg"><span class="sw sw-node-crit"></span> Kegiatan kritis (slack = 0)</span>
      <span class="lg">→ Panah = dependensi (label muncul untuk SS / delay)</span>
    </div>
    <p class="hint" style="margin-top:8px;">
      Node menampilkan kode, durasi, dan ES/EF kegiatan (arahkan kursor untuk nama + tanggal).
      Total durasi proyek: <strong>${cp.project.durationWorkingDays} hari kerja</strong>
      (${formatDateID(cp.project.startDate)} – ${formatDateID(cp.project.endDate)}).
    </p>`;
}
