/* State global, helper tampilan, navigasi tab, dan inisialisasi aplikasi. */
'use strict';

const state = {
  projects: [],        // daftar ringkas
  currentProjectId: null,
  currentProject: null, // lengkap (termasuk kalender)
  tasks: [],
  resources: [],
  criticalPath: null,  // cache hasil /critical-path (di-reset saat data berubah)
  activeTab: 'projects',
};

const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/* ---------- Helper ---------- */

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** '2026-10-12' -> '12 Oktober 2026' */
function formatDateID(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_ID[m - 1]} ${y}`;
}

/** Format rupiah tanpa desimal jika bulat. */
function formatRp(n) {
  const value = Number(n) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function toast(message, type = 'ok') {
  const container = document.getElementById('toast-container');
  const kind = type === 'error' ? 'error' : type === 'info' ? 'info' : 'ok';
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const icon = kind === 'error' ? '#ic-alert-circle' : kind === 'info' ? '#ic-info' : '#ic-check-circle';
  el.innerHTML = `<svg class="ic" aria-hidden="true"><use href="${icon}"></use></svg><span class="toast-msg"></span>`;
  el.querySelector('.toast-msg').textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 320);
  }, 4200);
}

function openModal(id) {
  document.getElementById(id).hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).hidden = true;
  document.body.style.overflow = '';
}

/** Bungkus handler async agar error tampil sebagai toast. */
function handle(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      toast(err.message || 'Terjadi kesalahan', 'error');
    }
  };
}

/* ---------- Navigasi tab (sidebar) ---------- */

const PAGE_TITLES = {
  projects: 'Proyek',
  tasks: 'Kegiatan',
  resources: 'Resource',
  gantt: 'Gantt Chart',
  pert: 'Diagram PERT',
};

/** Buka/tutup sidebar versi layar kecil. */
function setNavOpen(open) {
  document.body.classList.toggle('nav-open', open);
  const toggle = document.getElementById('menu-toggle');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (toggle) toggle.setAttribute('aria-expanded', String(open));
  if (backdrop) backdrop.hidden = !open;
}

function showTab(name) {
  state.activeTab = name;
  localStorage.setItem('mini-gantt-active-tab', name);
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${name}`);
  });

  // Top bar: judul halaman + tombol aksi utama sesuai tab
  const title = document.getElementById('page-title');
  if (title) title.textContent = PAGE_TITLES[name] || 'Proyek';
  document.querySelectorAll('.topbar-actions [data-for]').forEach((el) => {
    el.hidden = el.dataset.for !== name;
  });

  setNavOpen(false); // tutup menu mobile setelah pindah tab
}

/* ---------- Data ---------- */

async function refreshProjects() {
  state.projects = await API.get('/api/projects');
  renderProjectSelect();
  renderProjectCards();
}

function renderProjectSelect() {
  const select = document.getElementById('project-select');
  const options = ['<option value="">— Pilih proyek —</option>'];
  for (const p of state.projects) {
    options.push(
      `<option value="${p.id}" ${p.id === state.currentProjectId ? 'selected' : ''}>${esc(p.name)}</option>`
    );
  }
  select.innerHTML = options.join('');
}

async function refreshTasks() {
  state.tasks = state.currentProjectId
    ? await API.get(`/api/projects/${state.currentProjectId}/tasks`)
    : [];
  state.criticalPath = null; // jadwal berubah -> analisis critical path ikut basi
}

async function refreshResources() {
  state.resources = state.currentProjectId
    ? await API.get(`/api/projects/${state.currentProjectId}/resources`)
    : [];
}

/** Pilih proyek aktif -> muat detail, kegiatan, resource, lalu render semua tab. */
async function selectProject(id) {
  state.currentProjectId = id || null;
  if (id) {
    localStorage.setItem('mini-gantt-project-id', String(id));
  } else {
    localStorage.removeItem('mini-gantt-project-id');
  }
  state.currentProject = id ? await API.get(`/api/projects/${id}`) : null;
  await Promise.all([refreshTasks(), refreshResources()]);
  renderProjectSelect();
  renderProjectCards();
  renderCalendarPanel();
  renderTasks();
  renderResources();
  renderGantt();
  renderPert();
}

/* ---------- Render tab proyek (didefinisikan di projects.js) ---------- */
/* renderProjectCards, renderCalendarPanel, renderProjectSelect (di sini) */

/* ---------- Inisialisasi ---------- */

function init() {
  // Navigasi tab
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  // Pilih proyek aktif
  document.getElementById('project-select').addEventListener('change', (e) => {
    handle(selectProject)(e.target.value ? Number(e.target.value) : null);
  });

  // Tutup modal (tombol data-close)
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  // Klik area luar modal
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
  // Tombol Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not([hidden])').forEach((m) => closeModal(m.id));
      setNavOpen(false);
    }
  });

  // Sidebar layar kecil: buka/tutup
  const menuToggle = document.getElementById('menu-toggle');
  const sidebarClose = document.getElementById('sidebar-close');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      setNavOpen(!document.body.classList.contains('nav-open'));
    });
  }
  if (sidebarClose) sidebarClose.addEventListener('click', () => setNavOpen(false));
  if (backdrop) backdrop.addEventListener('click', () => setNavOpen(false));

  // Pesan error field di bawah input: tampil setelah submit ditolak validasi browser
  document.querySelectorAll('form').forEach((form) => {
    form.addEventListener('invalid', () => form.classList.add('form-errors'), true);
    form.addEventListener('submit', () => form.classList.remove('form-errors'));
    form.addEventListener('reset', () => form.classList.remove('form-errors'));
  });

  bindProjectEvents();
  bindTaskEvents();
  bindResourceEvents();
  bindGanttEvents();

  const savedTab = localStorage.getItem('mini-gantt-active-tab');
  showTab(savedTab && document.getElementById(`tab-${savedTab}`) ? savedTab : 'projects');

  handle(async () => {
    await refreshProjects();
    const savedId = Number(localStorage.getItem('mini-gantt-project-id'));
    const exists = state.projects.some((p) => p.id === savedId);
    await selectProject(exists ? savedId : (state.projects[0] ? state.projects[0].id : null));
  })();
}

window.addEventListener('DOMContentLoaded', init);
