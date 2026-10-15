/* State global, helper tampilan, navigasi tab, dan inisialisasi aplikasi. */
'use strict';

const state = {
  projects: [],        // daftar ringkas
  currentProjectId: null,
  currentProject: null, // lengkap (termasuk kalender)
  tasks: [],
  resources: [],
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
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : type === 'info' ? 'info' : ''}`;
  el.textContent = message;
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

/* ---------- Navigasi tab ---------- */

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
    }
  });

  bindProjectEvents();
  bindTaskEvents();
  bindResourceEvents();

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
