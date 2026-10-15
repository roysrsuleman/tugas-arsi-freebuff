/* Tab Kegiatan: tabel CRUD, dependensi (FS/SS + delay), penugasan resource, biaya. */
'use strict';

let draftPreds = [];      // pendahulu pada form kegiatan
let draftResourceIds = []; // resource terpilih pada form kegiatan

/* ---------- Tabel kegiatan ---------- */

function priorityBadge(priority) {
  const label = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' }[priority] || priority;
  return `<span class="badge ${esc(priority)}">${label}</span>`;
}

function renderTasks() {
  const container = document.getElementById('tasks-content');
  const btnNew = document.getElementById('btn-new-task');
  btnNew.disabled = !state.currentProjectId;

  if (!state.currentProjectId) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">✅</span>
        Pilih atau buat <strong>proyek</strong> terlebih dahulu untuk mengelola kegiatan.
      </div>`;
    return;
  }
  if (!state.tasks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🗒️</span>
        Belum ada kegiatan di proyek ini. Klik <strong>＋ Kegiatan Baru</strong> untuk menambahkan.
      </div>`;
    return;
  }

  const rows = state.tasks.map((t) => {
    const preds = t.predecessors.length
      ? t.predecessors.map((p) => `<span class="dep-tag"><b>${esc(p.code)}</b> · ${esc(p.type)}${t.predecessors.length > 1 || p.delay ? ` +${p.delay}h` : ''}</span>`).join('<br>')
      : '<span class="cell-muted">—</span>';

    const resources = t.resources.length
      ? t.resources.map((r) => `<span class="badge neutral" title="${esc(r.position)}">${esc(r.name)}</span>`).join(' ')
      : '<span class="cell-muted">—</span>';

    return `
      <tr>
        <td data-label="Kode"><span class="code-pill">${esc(t.code)}</span></td>
        <td data-label="Nama">
          <div class="cell-stack">
            <span class="cell-strong">${esc(t.name)}</span>
          </div>
        </td>
        <td data-label="Durasi" class="numeric">${t.duration} hari</td>
        <td data-label="Prioritas">${priorityBadge(t.priority)}</td>
        <td data-label="Warna"><span class="swatch" style="background:${esc(t.color)}"></span></td>
        <td data-label="Pendahulu">${preds}</td>
        <td data-label="Resource">${resources}</td>
        <td data-label="Mulai" class="numeric">${formatDateID(t.startDate)}</td>
        <td data-label="Selesai" class="numeric">${formatDateID(t.endDate)}</td>
        <td data-label="Biaya" class="numeric cell-strong">${formatRp(t.cost)}</td>
        <td data-label="Aksi">
          <div class="row-btns">
            <button class="btn ghost small" data-action="edit" data-id="${t.id}">Edit</button>
            <button class="btn danger small" data-action="delete" data-id="${t.id}">Hapus</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Kode</th><th>Nama</th><th>Durasi</th><th>Prioritas</th><th>Warna</th>
            <th>Pendahulu</th><th>Resource</th><th>Mulai</th><th>Selesai</th><th>Biaya</th><th>Aksi</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="hint" style="margin-top:10px;">
      Total biaya = durasi (hari kerja) × jumlah tarif resource yang ditugaskan.
      Ubah kegiatan → kegiatan turunannya dihitung ulang otomatis.
    </p>`;
}

/* ---------- Form kegiatan ---------- */

function openTaskModal(id = null) {
  if (!state.currentProjectId) {
    toast('Pilih proyek terlebih dahulu.', 'error');
    return;
  }
  const form = document.getElementById('task-form');
  form.reset();
  document.getElementById('task-id').value = '';
  document.getElementById('task-modal-title').textContent = id ? 'Edit Kegiatan' : 'Kegiatan Baru';
  document.getElementById('btn-delete-task').hidden = !id;

  const task = id ? state.tasks.find((t) => t.id === id) : null;

  if (task) {
    document.getElementById('task-id').value = task.id;
    document.getElementById('task-code').value = task.code;
    document.getElementById('task-name').value = task.name;
    document.getElementById('task-duration').value = task.duration;
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('task-color').value = task.color;
    draftPreds = task.predecessors.map((p) => ({ ...p }));
    draftResourceIds = task.resources.map((r) => r.id);
  } else {
    document.getElementById('task-duration').value = 1;
    document.getElementById('task-priority').value = 'sedang';
    document.getElementById('task-color').value = '#4e79a7';
    draftPreds = [];
    draftResourceIds = [];
    document.getElementById('task-code').value = nextTaskCode();
  }

  renderPredRows();
  renderResourceChoices();
  openModal('task-modal');
  document.getElementById('task-name').focus();
}

/** Kode berikutnya: A, B, C, ... Z, lalu AA, AB, ... */
function nextTaskCode() {
  const used = new Set(state.tasks.map((t) => t.code));
  for (let i = 0; i < 26; i += 1) {
    const code = String.fromCharCode(65 + i);
    if (!used.has(code)) return code;
  }
  for (let i = 0; i < 26; i += 1) {
    for (let j = 0; j < 26; j += 1) {
      const code = String.fromCharCode(65 + i) + String.fromCharCode(65 + j);
      if (!used.has(code)) return code;
    }
  }
  return '';
}

function renderPredRows() {
  const container = document.getElementById('pred-rows');
  const currentId = Number(document.getElementById('task-id').value) || null;
  const options = state.tasks.filter((t) => t.id !== currentId);

  if (!options.length) {
    container.innerHTML = '<p class="hint">Belum ada kegiatan lain yang bisa dijadikan pendahulu.</p>';
    return;
  }

  if (!draftPreds.length) {
    container.innerHTML = '<p class="hint">Tanpa pendahulu — kegiatan dimulai dari tanggal mulai proyek.</p>';
    return;
  }

  container.innerHTML = draftPreds.map((p, i) => {
    const opts = options.map((t) => `
      <option value="${t.id}" ${t.id === p.predecessorId ? 'selected' : ''}>
        ${esc(t.code)} — ${esc(t.name)}
      </option>`).join('');
    return `
      <div class="pred-row" data-idx="${i}">
        <select class="pred-task" aria-label="Kegiatan pendahulu">${opts}</select>
        <select class="pred-type" aria-label="Tipe dependensi">
          <option value="FS" ${p.type === 'FS' ? 'selected' : ''}>FS (Finish-Start)</option>
          <option value="SS" ${p.type === 'SS' ? 'selected' : ''}>SS (Start-Start)</option>
        </select>
        <input type="number" class="pred-delay" min="0" max="3650" value="${p.delay || 0}"
               aria-label="Delay (hari kerja)" title="Delay dalam hari kerja">
        <span class="hint" style="margin:0;">hari</span>
        <button type="button" class="icon-btn" data-remove-pred="${i}" aria-label="Hapus pendahulu">✕</button>
      </div>`;
  }).join('');

  container.querySelectorAll('.pred-row').forEach((row) => {
    const i = Number(row.dataset.idx);
    row.querySelector('.pred-task').addEventListener('change', (e) => {
      draftPreds[i].predecessorId = Number(e.target.value);
    });
    row.querySelector('.pred-type').addEventListener('change', (e) => {
      draftPreds[i].type = e.target.value;
    });
    row.querySelector('.pred-delay').addEventListener('change', (e) => {
      draftPreds[i].delay = Math.max(0, Number(e.target.value) || 0);
    });
  });
  container.querySelectorAll('[data-remove-pred]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draftPreds.splice(Number(btn.dataset.removePred), 1);
      renderPredRows();
    });
  });
}

function addPredRow() {
  const currentId = Number(document.getElementById('task-id').value) || null;
  const options = state.tasks.filter((t) => t.id !== currentId);
  if (!options.length) {
    toast('Belum ada kegiatan lain untuk dijadikan pendahulu.', 'error');
    return;
  }
  const used = new Set(draftPreds.map((p) => p.predecessorId));
  const free = options.find((t) => !used.has(t.id));
  if (!free) {
    toast('Semua kegiatan lain sudah menjadi pendahulu.', 'info');
    return;
  }
  draftPreds.push({ predecessorId: free.id, type: 'FS', delay: 0 });
  renderPredRows();
}

function renderResourceChoices() {
  const container = document.getElementById('res-choices');
  if (!state.resources.length) {
    container.innerHTML = '<p class="hint" style="margin:0;">Belum ada resource di proyek ini. Tambahkan lewat tab <strong>Resource</strong>.</p>';
    return;
  }
  container.innerHTML = state.resources.map((r) => `
    <label class="choice-item">
      <input type="checkbox" value="${r.id}" ${draftResourceIds.includes(r.id) ? 'checked' : ''}>
      ${esc(r.name)}
      <span class="muted">${esc(r.position)} · ${formatRp(r.dailyRate)}/hari</span>
    </label>`).join('');

  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const rid = Number(cb.value);
      if (cb.checked) {
        if (!draftResourceIds.includes(rid)) draftResourceIds.push(rid);
      } else {
        draftResourceIds = draftResourceIds.filter((x) => x !== rid);
      }
    });
  });
}

async function saveTask() {
  const id = Number(document.getElementById('task-id').value) || null;
  const payload = {
    code: document.getElementById('task-code').value,
    name: document.getElementById('task-name').value,
    duration: Number(document.getElementById('task-duration').value),
    priority: document.getElementById('task-priority').value,
    color: document.getElementById('task-color').value,
    predecessors: draftPreds.map((p) => ({
      predecessorId: p.predecessorId,
      type: p.type,
      delay: Number(p.delay) || 0,
    })),
    resourceIds: draftResourceIds,
  };

  if (id) {
    await API.put(`/api/tasks/${id}`, payload);
    toast('Kegiatan diperbarui. Jadwal turunan dihitung ulang.');
  } else {
    await API.post(`/api/projects/${state.currentProjectId}/tasks`, payload);
    toast('Kegiatan ditambahkan.');
  }

  await refreshTasks();
  renderTasks();
  renderGantt();
  renderPert();
  closeModal('task-modal');
}

async function deleteTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  if (!window.confirm(`Hapus kegiatan "${t.code} — ${t.name}"?`)) return;
  await API.del(`/api/tasks/${id}`);
  await refreshTasks();
  renderTasks();
  renderGantt();
  renderPert();
  closeModal('task-modal');
  toast('Kegiatan dihapus. Jadwal dihitung ulang.');
}

/* ---------- Event ---------- */

function bindTaskEvents() {
  document.getElementById('btn-new-task').addEventListener('click', () => openTaskModal());
  document.getElementById('btn-add-pred').addEventListener('click', addPredRow);

  document.getElementById('task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handle(saveTask)();
  });

  document.getElementById('btn-delete-task').addEventListener('click', () => {
    const id = Number(document.getElementById('task-id').value);
    if (id) handle(deleteTask)(id);
  });

  document.getElementById('tasks-content').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === 'edit') handle(openTaskModal)(id);
    if (btn.dataset.action === 'delete') handle(deleteTask)(id);
  });
}
