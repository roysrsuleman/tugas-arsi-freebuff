/* Tab Resource: CRUD anggota tim, posisi, tarif per hari, hari libur pribadi. */
'use strict';

let draftDaysOff = []; // hari libur pribadi pada form resource

/* ---------- Tampilan resource ---------- */

function renderResources() {
  const container = document.getElementById('resources-content');
  const btnNew = document.getElementById('btn-new-resource');
  btnNew.disabled = !state.currentProjectId;

  if (!state.currentProjectId) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">👥</span>
        Pilih atau buat <strong>proyek</strong> terlebih dahulu untuk mengelola resource.
      </div>`;
    return;
  }
  if (!state.resources.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">👥</span>
        Belum ada resource di proyek ini. Klik <strong>＋ Resource Baru</strong> untuk menambahkan.
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="card-grid">
      ${state.resources.map((r) => `
        <article class="card project-card">
          <h3>${esc(r.name)}</h3>
          <span class="badge info">${esc(r.position)}</span>
          <div class="desc">
            ${r.email ? `✉️ ${esc(r.email)}<br>` : ''}
            ${r.phone ? `📞 ${esc(r.phone)}` : ''}
            ${!r.email && !r.phone ? '<span class="cell-muted">Tidak ada kontak.</span>' : ''}
          </div>
          <div class="meta-row">
            <span>💰 Tarif: <strong>${formatRp(r.dailyRate)}</strong>/hari</span>
            <span>📌 <strong>${r.assignedTaskCount}</strong> kegiatan</span>
          </div>
          ${r.daysOff.length ? `
            <div class="chips">
              ${r.daysOff.slice().sort().map((d) => `<span class="chip">🌴 ${formatDateID(d)}</span>`).join('')}
            </div>` : ''}
          <div class="card-actions">
            <button class="btn ghost small" data-action="edit" data-id="${r.id}">Edit</button>
            <button class="btn danger small" data-action="delete" data-id="${r.id}">Hapus</button>
          </div>
        </article>`).join('')}
    </div>`;
}

/* ---------- Form resource ---------- */

function openResourceModal(id = null) {
  if (!state.currentProjectId) {
    toast('Pilih proyek terlebih dahulu.', 'error');
    return;
  }
  const form = document.getElementById('resource-form');
  form.reset();
  document.getElementById('resource-id').value = '';
  document.getElementById('resource-modal-title').textContent = id ? 'Edit Resource' : 'Resource Baru';
  document.getElementById('btn-delete-resource').hidden = !id;

  const r = id ? state.resources.find((x) => x.id === id) : null;
  if (r) {
    document.getElementById('resource-id').value = r.id;
    document.getElementById('resource-name').value = r.name;
    document.getElementById('resource-email').value = r.email || '';
    document.getElementById('resource-phone').value = r.phone || '';
    document.getElementById('resource-position').value = r.position;
    document.getElementById('resource-rate').value = r.dailyRate;
    draftDaysOff = [...(r.daysOff || [])];
  } else {
    document.getElementById('resource-rate').value = 0;
    document.getElementById('resource-position').value = 'Programmer';
    draftDaysOff = [];
  }

  renderDaysOffChips();
  openModal('resource-modal');
  document.getElementById('resource-name').focus();
}

function renderDaysOffChips() {
  const container = document.getElementById('days-off-chips');
  if (!draftDaysOff.length) {
    container.innerHTML = '<span class="hint" style="margin:0;">Belum ada hari libur pribadi.</span>';
    return;
  }
  const sorted = [...draftDaysOff].sort();
  container.innerHTML = sorted.map((d) => `
    <span class="chip">
      🌴 ${formatDateID(d)}
      <button type="button" data-dayoff="${d}" aria-label="Hapus hari libur ${d}">✕</button>
    </span>`).join('');

  container.querySelectorAll('[data-dayoff]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draftDaysOff = draftDaysOff.filter((x) => x !== btn.dataset.dayoff);
      renderDaysOffChips();
    });
  });
}

function addDayOffDraft() {
  const input = document.getElementById('resource-dayoff');
  const date = input.value;
  if (!date) {
    toast('Pilih tanggal hari libur pribadi.', 'error');
    input.focus();
    return;
  }
  if (draftDaysOff.includes(date)) {
    toast('Tanggal tersebut sudah ada.', 'error');
    return;
  }
  draftDaysOff.push(date);
  input.value = '';
  renderDaysOffChips();
}

async function saveResource() {
  const id = Number(document.getElementById('resource-id').value) || null;
  const payload = {
    name: document.getElementById('resource-name').value,
    email: document.getElementById('resource-email').value,
    phone: document.getElementById('resource-phone').value,
    position: document.getElementById('resource-position').value,
    dailyRate: Number(document.getElementById('resource-rate').value),
    daysOff: draftDaysOff,
  };

  if (id) {
    await API.put(`/api/resources/${id}`, payload);
    toast('Resource diperbarui.');
  } else {
    await API.post(`/api/projects/${state.currentProjectId}/resources`, payload);
    toast('Resource ditambahkan.');
  }

  await Promise.all([refreshResources(), refreshTasks()]); // biaya kegiatan ikut berubah
  renderResources();
  renderTasks();
  closeModal('resource-modal');
}

async function deleteResource(id) {
  const r = state.resources.find((x) => x.id === id);
  if (!r) return;
  if (!window.confirm(`Hapus resource "${r.name}"? Penugasan pada kegiatan ikut dilepas.`)) return;
  await API.del(`/api/resources/${id}`);
  await Promise.all([refreshResources(), refreshTasks()]);
  renderResources();
  renderTasks();
  closeModal('resource-modal');
  toast('Resource dihapus.');
}

/* ---------- Event ---------- */

function bindResourceEvents() {
  document.getElementById('btn-new-resource').addEventListener('click', () => openResourceModal());
  document.getElementById('btn-add-dayoff').addEventListener('click', addDayOffDraft);

  document.getElementById('resource-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handle(saveResource)();
  });

  document.getElementById('btn-delete-resource').addEventListener('click', () => {
    const id = Number(document.getElementById('resource-id').value);
    if (id) handle(deleteResource)(id);
  });

  document.getElementById('resources-content').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === 'edit') handle(openResourceModal)(id);
    if (btn.dataset.action === 'delete') handle(deleteResource)(id);
  });
}
