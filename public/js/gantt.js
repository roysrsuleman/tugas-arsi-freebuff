/* Tab Gantt Chart: daftar kegiatan (kiri) + timeline bar (kanan),
 * kolom weekend/hari libur diarsir, panah dependensi FS/SS,
 * tombol Show/Hide Critical Path, dan tabel analisis jalur. */
'use strict';

const GANTT_COL_W = 34;   // lebar kolom satu hari (px)
const GANTT_ROW_H = 38;   // tinggi satu baris (px)
const GANTT_HEAD_H = 54;  // tinggi header timeline (px)
const GANTT_WD = 'MSSRKJS'; // huruf hari: 0=Minggu .. 6=Sabtu
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

let ganttCriticalVisible = false;

/* ---------- util tanggal (lokal, tanpa timezone) ---------- */

function ganttParse(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function ganttAddDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}
function ganttIso(date) {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function formatShortID(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** Penanda hari non-kerja sesuai kalender proyek (mirror logika server). */
function dayFlag(iso, cal) {
  const date = ganttParse(iso);
  const weekend = cal.weekendMode !== 'work' && cal.weekendDays.includes(date.getDay());
  const md = iso.slice(5);
  const holiday = (cal.holidays || []).find((h) => (
    h.type === 'recurring' ? h.date.slice(5) === md : h.date === iso
  ));
  return { weekend, holiday };
}

/* ---------- critical path ---------- */

async function ensureCriticalPath() {
  if (!state.currentProjectId) return null;
  if (!state.criticalPath) {
    state.criticalPath = await API.get(`/api/projects/${state.currentProjectId}/critical-path`);
  }
  return state.criticalPath;
}

/* ---------- render ---------- */

async function renderGantt() {
  const container = document.getElementById('gantt-content');
  const analysis = document.getElementById('gantt-analysis');
  const btn = document.getElementById('btn-critical');

  btn.disabled = !state.currentProjectId || !state.tasks.length;
  btn.setAttribute('aria-pressed', String(ganttCriticalVisible));
  const btnLabel = btn.querySelector('.btn-label');
  if (btnLabel) btnLabel.textContent = ganttCriticalVisible ? 'Sembunyikan Critical Path' : 'Tampilkan Critical Path';
  const btnUse = btn.querySelector('use');
  if (btnUse) btnUse.setAttribute('href', ganttCriticalVisible ? '#ic-eye-off' : '#ic-eye');
  hideGanttTip();

  if (!state.currentProjectId) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon"><svg class="ic ic-20" aria-hidden="true"><use href="#ic-gantt"></use></svg></span>
        <p>Pilih atau buat <strong>proyek</strong> terlebih dahulu untuk melihat Gantt chart.</p>
        <button type="button" class="btn primary" data-empty-action="go-projects">
          <svg class="ic" aria-hidden="true"><use href="#ic-folder"></use></svg>Buka tab Proyek
        </button>
      </div>`;
    container.querySelector('[data-empty-action="go-projects"]')
      .addEventListener('click', () => showTab('projects'));
    analysis.innerHTML = '';
    return;
  }
  if (!state.tasks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon"><svg class="ic ic-20" aria-hidden="true"><use href="#ic-gantt"></use></svg></span>
        <p>Belum ada kegiatan. Tambahkan kegiatan di tab <strong>Kegiatan</strong> terlebih dahulu.</p>
        <button type="button" class="btn primary" data-empty-action="new-task">
          <svg class="ic" aria-hidden="true"><use href="#ic-plus"></use></svg>Kegiatan Baru
        </button>
      </div>`;
    container.querySelector('[data-empty-action="new-task"]')
      .addEventListener('click', () => openTaskModal());
    analysis.innerHTML = '';
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
    analysis.innerHTML = '';
    return;
  }

  const cal = state.currentProject.calendar;
  const tasks = state.tasks;
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const rowIndex = new Map(tasks.map((t, i) => [t.id, i]));
  const criticalIds = new Set(cp.tasks.filter((t) => t.isCritical).map((t) => t.id));

  // Rentang tanggal timeline (buffer 1 hari tiap sisi)
  const allDates = tasks.flatMap((t) => [t.startDate, t.endDate]).filter(Boolean).sort();
  const rangeStart = ganttAddDays(ganttParse(allDates[0]), -1);
  const rangeEnd = ganttAddDays(ganttParse(allDates[allDates.length - 1]), 1);
  const days = [];
  for (let d = rangeStart; d <= rangeEnd; d = ganttAddDays(d, 1)) days.push(ganttIso(d));
  const dayIndexMap = new Map(days.map((iso, i) => [iso, i]));
  const totalW = days.length * GANTT_COL_W;
  const plotH = tasks.length * GANTT_ROW_H;
  const idx = (iso) => dayIndexMap.has(iso) ? dayIndexMap.get(iso)
    : Math.round((ganttParse(iso) - rangeStart) / 86400000);

  // Penanda hari ini (bila berada di rentang timeline)
  const todayIso = ganttIso(new Date());
  const todayIdx = dayIndexMap.has(todayIso) ? dayIndexMap.get(todayIso) : -1;

  // --- header bulan + hari ---
  const monthSegments = [];
  for (const iso of days) {
    const key = iso.slice(0, 7);
    const last = monthSegments[monthSegments.length - 1];
    if (last && last.key === key) last.count += 1;
    else monthSegments.push({ key, count: 1 });
  }
  let cursor = 0;
  const monthsHtml = monthSegments.map((seg) => {
    const [y, m] = seg.key.split('-').map(Number);
    const html = `<div class="gmonth" style="left:${cursor * GANTT_COL_W}px; width:${seg.count * GANTT_COL_W}px">${MONTHS_SHORT[m - 1]} ${y}</div>`;
    cursor += seg.count;
    return html;
  }).join('');

  const daysHtml = days.map((iso, i) => {
    const flag = dayFlag(iso, cal);
    const cls = flag.holiday ? 'gday hol' : flag.weekend ? 'gday we' : 'gday';
    const title = flag.holiday ? (flag.holiday.label || 'Hari libur') : (flag.weekend ? 'Weekend' : '');
    const d = ganttParse(iso);
    const todayCls = iso === todayIso ? ' today' : '';
    return `<div class="${cls}${todayCls}" style="left:${i * GANTT_COL_W}px; width:${GANTT_COL_W}px" title="${esc(title)}">
      <span class="gd-num">${d.getDate()}</span><span class="gd-wd">${GANTT_WD[d.getDay()]}</span>
    </div>`;
  }).join('');

  // --- panel kiri ---
  const leftRows = tasks.map((t) => {
    const isCrit = criticalIds.has(t.id);
    const resNames = t.resources.map((r) => r.name).join(', ');
    return `
      <div class="gantt-cols gl-row ${isCrit ? 'is-critical' : ''}" data-task-id="${t.id}">
        <span class="gl-code"><span class="code-pill">${esc(t.code)}</span></span>
        <span class="gl-name" title="${esc(t.name)}">${esc(t.name)}</span>
        <span class="gl-dur">${t.duration} hari</span>
        <span class="gl-date" title="${esc(formatDateID(t.startDate))}">${formatShortID(t.startDate)}</span>
        <span class="gl-date" title="${esc(formatDateID(t.endDate))}">${formatShortID(t.endDate)}</span>
        <span class="gl-res" title="${esc(resNames)}">${resNames ? esc(resNames) : '—'}</span>
      </div>`;
  }).join('');

  // --- kolom arsip (weekend/libur) + bar ---
  const colsHtml = days.map((iso, i) => {
    const flag = dayFlag(iso, cal);
    if (!flag.holiday && !flag.weekend) return '';
    const cls = flag.holiday ? 'gcol hol' : 'gcol we';
    return `<div class="${cls}" style="left:${i * GANTT_COL_W}px; width:${GANTT_COL_W}px"></div>`;
  }).join('');

  const barsHtml = tasks.map((t) => {
    const left = idx(t.startDate) * GANTT_COL_W + 2;
    const width = Math.max((idx(t.endDate) - idx(t.startDate) + 1) * GANTT_COL_W - 4, 12);
    const top = rowIndex.get(t.id) * GANTT_ROW_H + 7;
    const crit = criticalIds.has(t.id) && ganttCriticalVisible ? ' critical' : '';
    const inside = width >= 30; // bar sempit -> label kode di samping bar
    const bar = `<div class="gbar${crit}" data-task-id="${t.id}"
      style="left:${left}px; width:${width}px; top:${top}px; background:${esc(t.color)}">${inside ? esc(t.code) : ''}</div>`;
    const out = inside ? '' : `<span class="gbar-out${crit ? ' is-critical' : ''}" data-task-id="${t.id}"
      style="left:${left + width + 5}px; top:${top}px">${esc(t.code)}</span>`;
    return bar + out;
  }).join('');

  const todayHtml = todayIdx >= 0
    ? `<div class="gtoday" style="left:${todayIdx * GANTT_COL_W + GANTT_COL_W / 2}px"></div>`
    : '';

  // --- panah dependensi (SVG overlay) ---
  const linkParts = [];
  for (const t of tasks) {
    const sRow = rowIndex.get(t.id);
    const sLeft = idx(t.startDate) * GANTT_COL_W;
    const y2 = sRow * GANTT_ROW_H + GANTT_ROW_H / 2;
    for (const p of t.predecessors) {
      const pred = taskById.get(p.predecessorId);
      if (!pred) continue;
      const pRow = rowIndex.get(pred.id);
      const pLeft = idx(pred.startDate) * GANTT_COL_W;
      const pRight = (idx(pred.endDate) + 1) * GANTT_COL_W;
      const y1 = pRow * GANTT_ROW_H + GANTT_ROW_H / 2;
      const x1 = p.type === 'SS' ? pLeft : pRight;
      const x2 = sLeft;
      const bothCrit = criticalIds.has(pred.id) && criticalIds.has(t.id);
      const critCls = bothCrit && ganttCriticalVisible ? ' critical' : '';
      const marker = critCls ? 'arw-crit' : 'arw';

      let d;
      let labelX;
      if (Math.abs(x2 - x1) < 2) {
        d = `M ${x1} ${y1} L ${x2} ${y2}`;
        labelX = x1 + 5;
      } else {
        const midX = x2 > x1 ? x1 + 11 : x1 - 11;
        d = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
        labelX = midX;
      }
      const showLabel = p.type === 'SS' || (p.delay || 0) > 0;
      const label = `${p.type}${p.delay > 0 ? `+${p.delay}` : ''}`;
      linkParts.push(
        `<path class="glink${critCls}" d="${d}" marker-end="url(#${marker})"/>`
        + (showLabel
          ? `<text class="glink-label${critCls}" x="${labelX}" y="${(y1 + y2) / 2 - 4}" text-anchor="middle">${label}</text>`
          : '')
      );
    }
  }

  const critCount = cp.tasks.filter((t) => t.isCritical).length;
  const toolbar = `
    <div class="gantt-toolbar">
      <div class="gt-stat"><span class="gt-label">Total durasi</span><span class="gt-value">${cp.project.durationWorkingDays} hari kerja</span></div>
      <div class="gt-stat"><span class="gt-label">Rentang proyek</span><span class="gt-value">${formatShortID(cp.project.startDate)} – ${formatShortID(cp.project.endDate)}</span></div>
      <div class="gt-stat"><span class="gt-label">Kegiatan kritis</span><span class="gt-value">${critCount} dari ${cp.tasks.length}</span></div>
    </div>`;

  container.innerHTML = `
    ${toolbar}
    <div class="gantt-wrap">
      <div class="gantt-left">
        <div class="gantt-cols gl-head">
          <span class="gl-code">Kode</span><span class="gl-name">Kegiatan</span><span class="gl-dur">Durasi</span>
          <span class="gl-date">Mulai</span><span class="gl-date">Selesai</span><span class="gl-res">Resource</span>
        </div>
        ${leftRows}
      </div>
      <div class="gantt-right" style="width:${totalW}px">
        <div class="gantt-head" style="height:${GANTT_HEAD_H}px">
          <div class="gmonths">${monthsHtml}</div>
          <div class="gdays">${daysHtml}</div>
        </div>
        <div class="gantt-plot" style="width:${totalW}px; height:${plotH}px">
          ${colsHtml}
          ${todayHtml}
          ${barsHtml}
          <svg class="glinks" width="${totalW}" height="${plotH}">
            <defs>
              <marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/>
              </marker>
              <marker id="arw-crit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#dc2626"/>
              </marker>
            </defs>
            ${linkParts.join('')}
          </svg>
        </div>
      </div>
    </div>
    <div class="gantt-legend">
      <span class="lg"><span class="sw sw-we"></span> Weekend</span>
      <span class="lg"><span class="sw sw-hol"></span> Hari libur</span>
      <span class="lg"><span class="sw sw-crit"></span> Kegiatan kritis (saat tombol aktif)</span>
      <span class="lg">→ Panah = dependensi (FS/SS + delay)</span>
    </div>`;

  renderGanttAnalysis(cp);
}

/* ---------- tabel analisis: ES/EF/LS/LF/slack + semua jalur ---------- */

function renderGanttAnalysis(cp) {
  const el = document.getElementById('gantt-analysis');
  const critCount = cp.tasks.filter((t) => t.isCritical).length;

  const statRow = `
    <div class="stat-row">
      <div class="stat">Total durasi proyek<b>${cp.project.durationWorkingDays} hari kerja</b>
        <span class="sub">${formatDateID(cp.project.startDate)} – ${formatDateID(cp.project.endDate)}</span></div>
      <div class="stat">Jumlah jalur<b>${cp.paths.length} jalur</b>
        <span class="sub">Total estimasi terpanjang: ${cp.maxPathTotal} hari</span></div>
      <div class="stat">Kegiatan kritis<b>${critCount} dari ${cp.tasks.length}</b>
        <span class="sub">slack = 0 hari kerja</span></div>
    </div>`;

  const detailRows = cp.tasks.map((t) => `
    <tr class="${t.isCritical ? 'row-critical' : ''}">
      <td data-label="Kode"><span class="code-pill">${esc(t.code)}</span></td>
      <td data-label="Kegiatan">${esc(t.name)}</td>
      <td data-label="Durasi" class="numeric">${t.duration} hari</td>
      <td data-label="ES" class="numeric">${formatShortID(t.es)}</td>
      <td data-label="EF" class="numeric">${formatShortID(t.ef)}</td>
      <td data-label="LS" class="numeric">${formatShortID(t.ls)}</td>
      <td data-label="LF" class="numeric">${formatShortID(t.lf)}</td>
      <td data-label="Slack" class="numeric">${t.slack} hari</td>
      <td data-label="Status">${t.isCritical ? '<span class="badge crit">Kritis</span>' : '<span class="badge neutral">Float</span>'}</td>
    </tr>`).join('');

  const pathRows = cp.paths.map((p, i) => `
    <tr class="${p.isCritical ? 'row-critical' : ''}">
      <td data-label="No" class="numeric">${i + 1}</td>
      <td data-label="Jalur" class="cell-strong">${p.codes.map(esc).join(' → ')}</td>
      <td data-label="Durasi kegiatan">${p.items.map((it) => `${esc(it.code)} (${it.duration})`).join(' → ')}</td>
      <td data-label="Total estimasi" class="numeric cell-strong">${p.total} hari</td>
      <td data-label="Rentang" class="numeric">${formatShortID(p.start)} – ${formatShortID(p.end)}</td>
      <td data-label="Keterangan">${p.isCritical ? '<span class="badge crit">Kritis</span>' : '<span class="cell-muted">—</span>'}</td>
    </tr>`).join('');

  el.innerHTML = `
    ${statRow}
    <h3 class="table-title"><svg class="ic" aria-hidden="true"><use href="#ic-table"></use></svg>Rincian Critical Path (per kegiatan)</h3>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Kode</th><th>Kegiatan</th><th class="numeric">Durasi</th>
          <th class="numeric">ES (mulai tercepat)</th><th class="numeric">EF (selesai tercepat)</th>
          <th class="numeric">LS (mulai terlambat)</th><th class="numeric">LF (selesai terlambat)</th>
          <th class="numeric">Slack</th><th>Status</th>
        </tr></thead>
        <tbody>${detailRows}</tbody>
      </table>
    </div>
    <h3 class="table-title"><svg class="ic" aria-hidden="true"><use href="#ic-route"></use></svg>Semua Jalur (awal → akhir proyek)</h3>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th class="numeric">No</th><th>Jalur</th><th>Durasi tiap kegiatan</th>
          <th class="numeric">Total estimasi</th><th class="numeric">Rentang tanggal</th><th>Keterangan</th>
        </tr></thead>
        <tbody>${pathRows}</tbody>
      </table>
    </div>
    ${cp.truncatedPaths ? '<p class="hint" style="margin-top:8px;"><svg class="ic ic-14" aria-hidden="true"><use href="#ic-alert-triangle"></use></svg> Jumlah jalur sangat banyak — hanya ditampilkan sebagian (batas 500 jalur).</p>' : ''}
    <p class="hint" style="margin-top:8px;">
      ES/EF dihitung dari jadwal otomatis; LS/LF dari backward pass; slack = hari kerja
      yang bisa digeser tanpa menggeser akhir proyek. Jalur dengan total estimasi
      terpanjang ditandai sebagai critical path.
    </p>`;
}

/* ---------- tooltip hover bar (kode, nama, tanggal, durasi, resource) ---------- */

let ganttTip = null;

function getGanttTip() {
  if (!ganttTip) {
    ganttTip = document.createElement('div');
    ganttTip.className = 'gantt-tip';
    ganttTip.setAttribute('role', 'tooltip');
    document.body.appendChild(ganttTip);
  }
  return ganttTip;
}

function positionGanttTip(x, y) {
  const tip = getGanttTip();
  const rect = tip.getBoundingClientRect();
  let left = x + 14;
  let top = y + 18;
  if (left + rect.width > window.innerWidth - 8) left = x - rect.width - 14;
  if (left < 8) left = 8;
  if (top + rect.height > window.innerHeight - 8) top = y - rect.height - 14;
  if (top < 8) top = 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function showGanttTip(task, x, y) {
  const tip = getGanttTip();
  const resNames = task.resources.map((r) => r.name).join(', ') || '—';
  tip.innerHTML = `
    <div class="tip-head"><span class="tip-code">${esc(task.code)}</span>${esc(task.name)}</div>
    <div class="tip-row"><span class="tip-key">Mulai</span><span class="tip-val">${formatDateID(task.startDate)}</span></div>
    <div class="tip-row"><span class="tip-key">Selesai</span><span class="tip-val">${formatDateID(task.endDate)}</span></div>
    <div class="tip-row"><span class="tip-key">Durasi</span><span class="tip-val">${task.duration} hari kerja</span></div>
    <div class="tip-row"><span class="tip-key">Resource</span><span class="tip-val">${esc(resNames)}</span></div>`;
  tip.classList.add('show');
  positionGanttTip(x, y);
}

function hideGanttTip() {
  if (ganttTip) ganttTip.classList.remove('show');
}

/* ---------- event ---------- */

function bindGanttEvents() {
  document.getElementById('btn-critical').addEventListener('click', () => {
    ganttCriticalVisible = !ganttCriticalVisible;
    renderGantt();
  });

  // sorot baris timeline saat hover di panel kiri (dan sebaliknya)
  document.getElementById('gantt-content').addEventListener('mouseover', (e) => {
    const row = e.target.closest('.gl-row');
    if (!row) return;
    document.querySelectorAll('.gbar').forEach((bar) => {
      bar.style.filter = bar.dataset.taskId === row.dataset.taskId ? 'brightness(1.12)' : '';
    });
  });
  document.getElementById('gantt-content').addEventListener('mouseout', () => {
    document.querySelectorAll('.gbar').forEach((bar) => { bar.style.filter = ''; });
  });

  // Tooltip bar: kode, nama, mulai, selesai, durasi, resource
  const content = document.getElementById('gantt-content');
  content.addEventListener('mouseover', (e) => {
    const bar = e.target.closest('.gbar, .gbar-out');
    if (!bar) return;
    const task = state.tasks.find((t) => t.id === Number(bar.dataset.taskId));
    if (task) showGanttTip(task, e.clientX, e.clientY);
  });
  content.addEventListener('mousemove', (e) => {
    if (!ganttTip || !ganttTip.classList.contains('show')) return;
    if (e.target.closest('.gbar, .gbar-out')) positionGanttTip(e.clientX, e.clientY);
    else hideGanttTip();
  });
  content.addEventListener('mouseleave', hideGanttTip);
}
