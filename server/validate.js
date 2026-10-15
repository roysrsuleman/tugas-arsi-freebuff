/**
 * Helper validasi input REST API.
 * Semua error memakai pesan berbahasa Indonesia dan status 400.
 */
'use strict';

const { isValidISO } = require('./logic/calendar');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/** Teks wajib (atau opsional) dengan batas panjang. */
function str(value, field, { required = true, max = 255, fallback = '' } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${field} wajib diisi`);
    return fallback;
  }
  if (typeof value !== 'string') throw new ValidationError(`${field} harus berupa teks`);
  const s = value.trim();
  if (!s) {
    if (required) throw new ValidationError(`${field} wajib diisi`);
    return fallback;
  }
  if (s.length > max) throw new ValidationError(`${field} maksimal ${max} karakter`);
  return s;
}

/** Bilangan bulat dengan rentang. */
function int(value, field, { required = true, min = 0, max = 100000, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${field} wajib diisi`);
    return fallback;
  }
  const n = Number(value);
  if (!Number.isInteger(n)) throw new ValidationError(`${field} harus berupa bilangan bulat`);
  if (n < min) throw new ValidationError(`${field} minimal ${min}`);
  if (n > max) throw new ValidationError(`${field} maksimal ${max}`);
  return n;
}

/** Bilangan desimal (tarif, dll). */
function num(value, field, { required = true, min = 0, max = 1e12, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${field} wajib diisi`);
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ValidationError(`${field} harus berupa angka`);
  if (n < min) throw new ValidationError(`${field} minimal ${min}`);
  if (n > max) throw new ValidationError(`${field} terlalu besar`);
  return n;
}

/** Tanggal YYYY-MM-DD. */
function isoDate(value, field, { required = true, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${field} wajib diisi`);
    return fallback;
  }
  if (typeof value !== 'string' || !isValidISO(value)) {
    throw new ValidationError(`${field} tidak valid (format harus YYYY-MM-DD)`);
  }
  return value;
}

/** Salah satu dari daftar pilihan. */
function oneOf(value, field, allowed, { required = true, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${field} wajib diisi`);
    return fallback;
  }
  if (!allowed.includes(value)) {
    throw new ValidationError(`${field} tidak valid (pilihan: ${allowed.join(', ')})`);
  }
  return value;
}

/** Warna heksagram #rrggbb. */
function hexColor(value, field, { fallback = '#4e79a7' } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new ValidationError(`${field} tidak valid (contoh: #4e79a7)`);
  }
  return value.toLowerCase();
}

/** Email sederhana (opsional). */
function email(value, field, { fallback = '' } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^\S+@\S+\.\S+$/.test(value.trim())) {
    throw new ValidationError(`${field} tidak valid`);
  }
  return value.trim();
}

/** Array; error jika bukan array. */
function array(value, field, { fallback = [] } = {}) {
  if (value === undefined || value === null) return fallback;
  if (!Array.isArray(value)) throw new ValidationError(`${field} harus berupa daftar`);
  return value;
}

/** ID parameter path harus bilangan bulat positif. */
function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError('ID tidak valid');
  }
  return n;
}

module.exports = {
  ValidationError,
  str,
  int,
  num,
  isoDate,
  oneOf,
  hexColor,
  email,
  array,
  idParam,
};
