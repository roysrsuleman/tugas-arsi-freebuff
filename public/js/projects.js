/* Tab Proyek: daftar kartu, form CRUD, dan pengaturan kalender (weekend + libur). */
'use strict';

let draftHolidays = []; // hari libur proyek aktif (draft sampai disimpan)

/* ---------- Kartu proyek ---------- */

function renderProjectCards() {
  const container = document.getElementById('project-cards');
  if (!state.projects.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <span class="empty-icon">📁</span>
        Belum ada proyek. Klik <strong>＋ Proyek Baru</strong> untuk memulai.
      </div>`;
    return;
  }

  container.innerHTML = state.projects.map((p) => `
    <article class="card project-card ${p.id === state.currentProjectId ? 'active' : ''}" data-project-id="${p.id}">
      ${p.id === state.currentProjectId ? '<span class="active-flag">AKTIF</span>' : ''}
      <h3>${esc(p.name)}</h3>
      ${p.organization ? `<span class="org">🏢 ${esc(p.organization)}</span>` : ''}
      <p class="desc">${esc(p.description || 'Tidak ada deskripsi.')}</p>
      <div class="meta-row">
        <span>🗓 Mulai: <strong>${formatDateID(p.startDate)}</strong></span>
        <span>✅ <strong>${p.taskCount}</strong> kegiatan</span>
      </div>
      <div class="card-actions">
        <button class="btn ghost small" data-action="edit" data-id="${p.id}">Edit</button>
        <button class="btn danger small" data-action="delete" data-id="${p.id}">Hapus</button>
      </div>
    </article>
  `).join('');
}

/* ---------- Form proyek ---------- */

function openProjectModal(id = null) {
  const form = document.getElementById('project-form');
  form.reset();
  document.getElementById('project-id').value = '';
  document.getElementById('project-modal-title').textContent = id ? 'Edit Proyek' : 'Proyek Baru';

  if (id) {
    const p = state.projects.find((x) => x.id === id);
    if (!p) return;
    document.getElementById('project-id').value = p.id;
    document.getElementById('project-name').value = p.name;
    document.getElementById('project-org').value = p.organization || '';
    document.getElementById('project-start').value = p.startDate;
    document.getElementById('project-desc').value = p.description || '';
  } else {
    document.getElementById('project-start').value = new Date().toISOString().slice(0, 10);
  }
  openModal('project-modal');
  document.getElementById('project-name').focus();
}

async function saveProject() {
  const id = Number(document.getElementById('project-id').value) || null;
  const payload = {
    name: document.getElementById('project-name').value,
    organization: document.getElementById('project-org').value,
    description: document.getElementById('project-desc').value,
    startDate: document.getElementById('project-start').value,
  };

  if (id) {
    const updated = await API.put(`/api/projects/${id}`, payload);
    await refreshProjects();
    if (state.currentProjectId === id) {
      state.currentProject = updated;
      renderCalendarPanel();
    }
    toast('Proyek berhasil diperbarui.');
  } else {
    const created = await API.post('/api/projects', payload);
    await refreshProjects();
    await selectProject(created.id);
    showTab('projects');
    toast('Proyek berhasil dibuat.');
  }
  closeModal('project-modal');
}

async function deleteProject(id) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return;
  if (!window.confirm(`Hapus proyek "${p.name}"? Semua kegiatan, resource, dan jadwalnya ikut terhapus.`)) return;
  await API.del(`/api/projects/${id}`);
  await refreshProjects();
  if (state.currentProjectId === id) {
    const next = state.projects[0];
    await selectProject(next ? next.id : null);
  } else {
    renderProjectCards();
  }
  toast('Proyek berhasil dihapus.');
}

/* ---------- Pengaturan kalender ---------- */

function renderCalendarPanel() {
  const panel = document.getElementById('calendar-panel');
  const head = document.getElementById('calendar-head');
  const project = state.currentProject;

  if (!project) {
    head.style.display = 'none';
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }
  head.style.display = '';
  panel.style.display = '';

  draftHolidays = (project.calendar.holidays || []).map((h) => ({ ...h }));
  const weekendDays = project.calendar.weekendDays;
  const mode = project.calendar.weekendMode;

  panel.innerHTML = `
    <div class="cal-section">
      <h3>Hari Weekend</h3>
      <div class="day-checks">
        ${DAY_NAMES_ID.map((day, idx) => `
          <label class="day-check">
            <input type="checkbox" name="weekend-day" value="${idx}" ${weekendDays.includes(idx) ? 'checked' : ''}>
            ${day}
          </label>`).join('')}
      </div>
    </div>

    <div class="cal-section">
      <h3>Perlakuan Weekend</h3>
      <div class="radio-row">
        <label class="radio-pill">
          <input type="radio" name="weekend-mode" value="off" ${mode === 'off' ? 'checked' : ''}>
          🌴 Weekend libur (tidak dihitung durasi)
        </label>
        <label class="radio-pill">
          <input type="radio" name="weekend-mode" value="work" ${mode === 'work' ? 'checked' : ''}>
          💼 Tetap bekerja (weekend = hari kerja)
        </label>
      </div>
    </div>

    <div class="cal-section">
      <h3>Hari Libur Custom</h3>
      <div class="inline-form">
        <input type="date" id="holiday-date" aria-label="Tanggal hari libur">
        <input type="text" id="holiday-label" placeholder="Keterangan (cth: HUT RI)" maxlength="120"
               style="flex:1; min-width:170px; padding:8px 10px; border:1px solid var(--border); border-radius:8px; font-family:inherit;">
        <select id="holiday-type" aria-label="Tipe hari libur"
                style="padding:8px 10px; border:1px solid var(--border); border-radius:8px; font-family:inherit; background:#fff;">
          <option value="one_off">Sekali saja</option>
          <option value="recurring">Berulang tiap tahun</option>
        </select>
        <button type="button" class="btn ghost" id="btn-add-holiday">Tambah</button>
      </div>
      <div id="holiday-list" class="list-rows"></div>
    </div>

    <div class="cal-section" style="display:flex; justify-content:flex-end;">
      <button type="button" class="btn primary" id="btn-save-calendar">💾 Simpan Pengaturan Kalender</button>
    </div>
  `;

  renderHolidayList();

  document.getElementById('btn-add-holiday').addEventListener('click', handle(addHolidayDraft));
  document.getElementById('btn-save-calendar').addEventListener('click', handle(saveCalendar));
}

function renderHolidayList() {
  const list = document.getElementById('holiday-list');
  if (!list) return;

  if (!draftHolidays.length) {
    list.innerHTML = '<p class="hint" style="margin-top:10px;">Belum ada hari libur custom.</p>';
    return;
  }

  const sorted = [...draftHolidays].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  list.innerHTML = sorted.map((h, i) => {
    const idx = draftHolidays.indexOf(h);
    return `
      <div class="list-row">
        <div class="row-main">
          <span class="row-date">🗓 ${formatDateID(h.date)}</span>
          <span class="row-label">${esc(h.label || 'Tanpa keterangan')}</span>
          <span class="badge ${h.type === 'recurring' ? 'info' : 'neutral'}">
            ${h.type === 'recurring' ? 'Tiap tahun' : 'Sekali saja'}
          </span>
        </div>
        <button type="button" class="btn danger small" data-holiday-idx="${idx}">Hapus</button>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-holiday-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draftHolidays.splice(Number(btn.dataset.holidayIdx), 1);
      renderHolidayList();
    });
  });
}

function addHolidayDraft() {
  const dateEl = document.getElementById('holiday-date');
  const labelEl = document.getElementById('holiday-label');
  const typeEl = document.getElementById('holiday-type');
  const date = dateEl.value;

  if (!date) {
    toast('Pilih tanggal hari libur terlebih dahulu.', 'error');
    dateEl.focus();
    return;
  }
  const dup = draftHolidays.some((h) => h.date === date && h.type === typeEl.value);
  if (dup) {
    toast('Tanggal tersebut sudah ada di daftar hari libur.', 'error');
    return;
  }
  draftHolidays.push({ date, label: labelEl.value.trim(), type: typeEl.value });
  dateEl.value = '';
  labelEl.value = '';
  renderHolidayList();
}

async function saveCalendar() {
  const weekendDays = [...document.querySelectorAll('input[name="weekend-day"]:checked')]
    .map((el) => Number(el.value));
  const modeEl = document.querySelector('input[name="weekend-mode"]:checked');
  const payload = {
    weekendDays,
    weekendMode: modeEl ? modeEl.value : 'off',
    holidays: draftHolidays.map(({ date, label, type }) => ({ date, label, type })),
  };

  state.currentProject = await API.put(`/api/projects/${state.currentProjectId}/calendar`, payload);
  await refreshTasks(); // semua tanggal kegiatan dihitung ulang
  renderCalendarPanel();
  renderTasks();
  renderGantt();
  renderPert();
  toast('Kalender disimpan. Jadwal kegiatan dihitung ulang.');
}

/* ---------- Data contoh (seed) ---------- */

async function loadSampleData() {
  const ok = window.confirm(
    'Muat data contoh bawaan?\n\n'
    + '1. Proyek A-J: "Sistem Informasi Kelola Pemberkasan" (critical path 33 hari)\n'
    + '2. Proyek SDLC: 6 tahap, dependensi SS + delay, 7 anggota tim\n\n'
    + 'Proyek dengan nama yang sama tidak akan dibuat ulang.'
  );
  if (!ok) return;

  const res = await API.post('/api/seed', {});
  await refreshProjects();
  if (res.created.length) await selectProject(res.created[0].id);

  const parts = [];
  if (res.created.length) parts.push(`${res.created.length} proyek contoh dimuat.`);
  if (res.skipped.length) parts.push(`Dilewati (sudah ada): ${res.skipped.map((s) => s.name).join(', ')}.`);
  toast(parts.join(' ') || 'Tidak ada data contoh yang dimuat.', res.created.length ? 'ok' : 'info');
}

/* ---------- Event ---------- */

function bindProjectEvents() {
  document.getElementById('btn-new-project').addEventListener('click', () => openProjectModal());
  document.getElementById('btn-seed').addEventListener('click', () => handle(loadSampleData)());

  document.getElementById('project-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handle(saveProject)();
  });

  document.getElementById('project-cards').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (btn) {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      if (btn.dataset.action === 'edit') handle(openProjectModal)(id);
      if (btn.dataset.action === 'delete') handle(deleteProject)(id);
      return;
    }
    const card = e.target.closest('[data-project-id]');
    if (card) handle(selectProject)(Number(card.dataset.projectId));
  });
}
