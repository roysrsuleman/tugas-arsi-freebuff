'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  Calendar,
  parseISO,
  toISO,
  addDays,
  isValidISO,
} = require('../server/logic/calendar');

const iso = (s) => parseISO(s);

test('parseISO dan toISO bolak-balik', () => {
  assert.equal(toISO(iso('2026-01-05')), '2026-01-05');
  assert.equal(toISO(iso('2026-12-31')), '2026-12-31');
});

test('parseISO menolak tanggal tidak valid', () => {
  assert.throws(() => parseISO('2026-02-30'), /tidak valid/);
  assert.throws(() => parseISO('05-01-2026'), /tidak valid/);
  assert.throws(() => parseISO('bukan-tanggal'), /tidak valid/);
  assert.equal(isValidISO('2028-02-29'), true); // kabisat
  assert.equal(isValidISO('2027-02-29'), false);
});

test('default: Sabtu & Minggu bukan hari kerja', () => {
  const cal = new Calendar();
  assert.equal(cal.isWorkingDay(iso('2026-10-12')), true); // Senin
  assert.equal(cal.isWorkingDay(iso('2026-10-16')), true); // Jumat
  assert.equal(cal.isWorkingDay(iso('2026-10-17')), false); // Sabtu
  assert.equal(cal.isWorkingDay(iso('2026-10-18')), false); // Minggu
});

test('weekend days bisa dikonfigurasi (hanya Minggu)', () => {
  const cal = new Calendar({ weekendDays: [0] });
  assert.equal(cal.isWorkingDay(iso('2026-10-17')), true); // Sabtu jadi kerja
  assert.equal(cal.isWorkingDay(iso('2026-10-18')), false); // Minggu libur
});

test('mode weekend "work" membuat weekend tetap bekerja', () => {
  const cal = new Calendar({ weekendDays: [0, 6], weekendMode: 'work' });
  assert.equal(cal.isWorkingDay(iso('2026-10-17')), true); // Sabtu
  assert.equal(cal.isWorkingDay(iso('2026-10-18')), true); // Minggu
});

test('hari libur one-off membuat tanggal itu non-kerja saja', () => {
  const cal = new Calendar({
    holidays: [{ date: '2026-10-15', label: 'Hari Libur Nasional', type: 'one_off' }],
  });
  assert.equal(cal.isWorkingDay(iso('2026-10-14')), true);
  assert.equal(cal.isWorkingDay(iso('2026-10-15')), false);
  assert.equal(cal.isWorkingDay(iso('2026-10-16')), true);
  // Tahun lain, bulan+tanggal sama -> TETAP kerja (one-off)
  assert.equal(cal.isWorkingDay(iso('2027-10-15')), true);
});

test('hari libur recurring cocok di tahun berapa pun', () => {
  const cal = new Calendar({
    holidays: [{ date: '2026-08-17', label: 'Kemerdekaan', type: 'recurring' }],
  });
  assert.equal(cal.isWorkingDay(iso('2026-08-17')), false);
  assert.equal(cal.isWorkingDay(iso('2027-08-17')), false);
  assert.equal(cal.isWorkingDay(iso('2030-08-17')), false);
  assert.equal(cal.isWorkingDay(iso('2026-08-18')), true);
});

test('nextWorkingDayOnOrAfter dan nextWorkingDayAfter', () => {
  const cal = new Calendar();
  assert.equal(toISO(cal.nextWorkingDayOnOrAfter(iso('2026-10-12'))), '2026-10-12'); // sudah kerja
  assert.equal(toISO(cal.nextWorkingDayOnOrAfter(iso('2026-10-17'))), '2026-10-19'); // Sabtu -> Senin
  assert.equal(toISO(cal.nextWorkingDayAfter(iso('2026-10-16'))), '2026-10-19'); // Jumat -> Senin
});

test('nextWorkingDayOnOrAfter melewati hari libur', () => {
  const cal = new Calendar({ holidays: [{ date: '2026-10-19', label: 'Cut Bersama', type: 'one_off' }] });
  assert.equal(toISO(cal.nextWorkingDayOnOrAfter(iso('2026-10-17'))), '2026-10-20'); // Sabtu -> Selasa
});

test('advanceWorkingDays melewati weekend dan libur', () => {
  const cal = new Calendar({ holidays: [{ date: '2026-10-15', label: 'Libur', type: 'one_off' }] });
  // Jumat 2026-10-16, +1 hari kerja -> Senin 2026-10-19 (lewati Sabtu & Minggu)
  assert.equal(toISO(cal.advanceWorkingDays(iso('2026-10-16'), 1)), '2026-10-19');
  // +0 = tanggal sama
  assert.equal(toISO(cal.advanceWorkingDays(iso('2026-10-16'), 0)), '2026-10-16');
  // Senin 2026-10-12, +3 hari kerja -> Jumat 2026-10-16 (Kamis 15 libur, dilewati)
  assert.equal(toISO(cal.advanceWorkingDays(iso('2026-10-12'), 3)), '2026-10-16');
  // +4 hari kerja -> Senin 2026-10-19
  assert.equal(toISO(cal.advanceWorkingDays(iso('2026-10-12'), 4)), '2026-10-19');
});

test('endDateFor menghitung durasi dalam hari kerja', () => {
  const cal = new Calendar();
  // Senin, durasi 5 -> Jumat yang sama
  assert.equal(toISO(cal.endDateFor(iso('2026-10-12'), 5)), '2026-10-16');
  // Senin, durasi 7 -> Selasa minggu berikutnya
  assert.equal(toISO(cal.endDateFor(iso('2026-10-12'), 7)), '2026-10-20');
  // Mulai Sabtu -> digeser ke Senin dulu
  assert.equal(toISO(cal.endDateFor(iso('2026-10-17'), 1)), '2026-10-19');
});

test('endDateFor durasi 1 hari = hari itu juga (jika hari kerja)', () => {
  const cal = new Calendar();
  assert.equal(toISO(cal.endDateFor(iso('2026-10-14'), 1)), '2026-10-14');
});

test('endDateFor menolak durasi < 1', () => {
  const cal = new Calendar();
  assert.throws(() => cal.endDateFor(iso('2026-10-12'), 0), /Durasi tidak valid/);
  assert.throws(() => cal.endDateFor(iso('2026-10-12'), 2.5), /Durasi tidak valid/);
});

test('weekendMode "work": durasi dihitung termasuk Sabtu/Minggu', () => {
  const cal = new Calendar({ weekendMode: 'work' });
  // Jumat, durasi 3 -> Minggu
  assert.equal(toISO(cal.endDateFor(iso('2026-10-16'), 3)), '2026-10-18');
});

test('countWorkingDaysInclusive dan listWorkingDays', () => {
  const cal = new Calendar();
  // Senin..Minggu berikut = 5 hari kerja
  assert.equal(cal.countWorkingDaysInclusive(iso('2026-10-12'), iso('2026-10-18')), 5);
  assert.equal(cal.listWorkingDays(iso('2026-10-16'), iso('2026-10-19')).length, 2);
});

test('Calendar menolak konfigurasi tidak valid', () => {
  assert.throws(() => new Calendar({ weekendDays: [9] }), /tidak valid/);
  assert.throws(() => new Calendar({ weekendMode: 'maybe' }), /tidak valid/);
  assert.throws(() => new Calendar({ holidays: [{ date: '31/12/2026' }] }), /tidak valid/);
  assert.throws(() => new Calendar({ holidays: [{ date: '2026-12-31', type: 'tahunan' }] }), /tidak valid/);
});

test('addDays bekerja lintas bulan dan tahun', () => {
  assert.equal(toISO(addDays(iso('2026-12-31'), 1)), '2027-01-01');
  assert.equal(toISO(addDays(iso('2026-03-01'), -1)), '2026-02-28');
});
