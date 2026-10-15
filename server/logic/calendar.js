/**
 * Kalender kerja proyek: weekend, hari libur (one-off & recurring),
 * dan utilitas perhitungan tanggal berbasis hari kerja.
 *
 * Semua fungsi murni (tanpa database) agar mudah diuji.
 * Tanggal ditangani sebagai Date "lokal" (tanpa timezone UTC) untuk
 * menghindari pergeseran hari.
 */
'use strict';

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validasi format YYYY-MM-DD (dan tanggal valid kalender). */
function isValidISO(value) {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** 'YYYY-MM-DD' -> Date (lokal). Melempar error jika tidak valid. */
function parseISO(value) {
  if (!isValidISO(value)) {
    throw new Error(`Tanggal tidak valid: "${value}" (format harus YYYY-MM-DD)`);
  }
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date -> 'YYYY-MM-DD'. */
function toISO(date) {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Tanggal + n hari (kalender, bukan hari kerja). */
function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/**
 * Kalender kerja.
 * @param {object} [options]
 * @param {number[]} [options.weekendDays] hari yang ditandai weekend (0=Minggu..6=Sabtu)
 * @param {'off'|'work'} [options.weekendMode] 'off' = weekend libur, 'work' = tetap bekerja
 * @param {Array<{date:string,label?:string,type?:'one_off'|'recurring'}>} [options.holidays]
 */
class Calendar {
  constructor({ weekendDays = [0, 6], weekendMode = 'off', holidays = [] } = {}) {
    this.weekendDays = Calendar.normalizeWeekendDays(weekendDays);
    this.weekendMode = Calendar.normalizeWeekendMode(weekendMode);
    this.holidays = Calendar.normalizeHolidays(holidays);
  }

  static normalizeWeekendDays(weekendDays) {
    if (!Array.isArray(weekendDays)) throw new Error('weekendDays harus berupa array');
    const days = [...new Set(weekendDays.map(Number))];
    for (const d of days) {
      if (!Number.isInteger(d) || d < 0 || d > 6) {
        throw new Error(`Hari weekend tidak valid: ${d} (harus 0-6)`);
      }
    }
    return days.sort();
  }

  static normalizeWeekendMode(mode) {
    if (mode !== 'off' && mode !== 'work') {
      throw new Error(`Mode weekend tidak valid: "${mode}" (harus 'off' atau 'work')`);
    }
    return mode;
  }

  static normalizeHolidays(holidays) {
    if (!Array.isArray(holidays)) throw new Error('holidays harus berupa array');
    return holidays.map((h) => {
      if (!isValidISO(h.date)) throw new Error(`Tanggal libur tidak valid: "${h.date}"`);
      const type = h.type || 'one_off';
      if (type !== 'one_off' && type !== 'recurring') {
        throw new Error(`Tipe libur tidak valid: "${type}"`);
      }
      return { date: h.date, label: String(h.label || ''), type };
    });
  }

  /** Apakah tanggal ini termasuk weekend (dan weekend diatur sebagai libur)? */
  isWeekend(date) {
    if (this.weekendMode === 'work') return false;
    return this.weekendDays.includes(date.getDay());
  }

  /** Apakah tanggal ini hari libur (one-off cocok tanggal penuh, recurring cocok bulan+tanggal)? */
  isHoliday(date) {
    const iso = toISO(date);
    const md = iso.slice(5); // 'MM-DD'
    return this.holidays.some((h) => (
      h.type === 'recurring' ? h.date.slice(5) === md : h.date === iso
    ));
  }

  /** Hari kerja = bukan weekend-libur dan bukan hari libur. */
  isWorkingDay(date) {
    return !this.isWeekend(date) && !this.isHoliday(date);
  }

  /** Hari kerja pertama >= tanggal. */
  nextWorkingDayOnOrAfter(date) {
    let cursor = date;
    while (!this.isWorkingDay(cursor)) cursor = addDays(cursor, 1);
    return cursor;
  }

  /** Hari kerja pertama > tanggal. */
  nextWorkingDayAfter(date) {
    return this.nextWorkingDayOnOrAfter(addDays(date, 1));
  }

  /** Hari kerja pertama < tanggal. */
  previousWorkingDayBefore(date) {
    let cursor = addDays(date, -1);
    while (!this.isWorkingDay(cursor)) cursor = addDays(cursor, -1);
    return cursor;
  }

  /**
   * Mundur n langkah hari kerja dari tanggal (kebalikan dari
   * advanceWorkingDays; dipakai backward pass critical path).
   * n = 0 mengembalikan tanggal apa adanya.
   */
  retreatWorkingDays(date, n) {
    if (!Number.isInteger(n) || n < 0) throw new Error(`Langkah tidak valid: ${n}`);
    let cursor = date;
    for (let i = 0; i < n; i += 1) cursor = this.previousWorkingDayBefore(cursor);
    return cursor;
  }

  /**
   * Maju n langkah hari kerja dari tanggal.
   * n = 0 mengembalikan tanggal apa adanya; setiap langkah = hari kerja
   * berikutnya setelah hari kerja saat ini.
   */
  advanceWorkingDays(date, n) {
    if (!Number.isInteger(n) || n < 0) throw new Error(`Langkah tidak valid: ${n}`);
    let cursor = date;
    for (let i = 0; i < n; i += 1) cursor = this.nextWorkingDayAfter(cursor);
    return cursor;
  }

  /**
   * Tanggal selesai untuk sebuah kegiatan: durasi hari kerja dihitung
   * dari tanggal mulai (tanggal mulai = hari kerja ke-1).
   */
  endDateFor(startDate, duration) {
    if (!Number.isInteger(duration) || duration < 1) {
      throw new Error(`Durasi tidak valid: ${duration} (harus >= 1 hari kerja)`);
    }
    const start = this.isWorkingDay(startDate)
      ? startDate
      : this.nextWorkingDayOnOrAfter(startDate);
    return this.advanceWorkingDays(start, duration - 1);
  }

  /** Jumlah hari kerja inklusif dari..sampai (untuk tampilan/laporan). */
  countWorkingDaysInclusive(from, to) {
    if (to < from) return 0;
    let count = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (this.isWorkingDay(d)) count += 1;
    }
    return count;
  }

  /** Daftar hari kerja inklusif dari..sampai. */
  listWorkingDays(from, to) {
    const days = [];
    if (to < from) return days;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (this.isWorkingDay(d)) days.push(d);
    }
    return days;
  }
}

/** Bentuk kalender dari baris database proyek + daftar hari liburnya. */
function createCalendar(projectRow, holidayRows = []) {
  return new Calendar({
    weekendDays: JSON.parse(projectRow.weekend_days || '[0,6]'),
    weekendMode: projectRow.weekend_mode || 'off',
    holidays: holidayRows.map((h) => ({ date: h.date, label: h.label, type: h.type })),
  });
}

module.exports = {
  Calendar,
  createCalendar,
  parseISO,
  toISO,
  addDays,
  isSameDay,
  isValidISO,
  DAY_NAMES,
};
