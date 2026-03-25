/**
 * time.util.js — Unified Time Utility (Phase 0)
 * ===============================================
 * All time operations in LifeFlow go through this utility.
 *
 * Rules:
 *  - ALL times stored in DB as UTC
 *  - ALL times displayed converted to user's timezone
 *  - Default timezone: Africa/Cairo
 */

'use strict';

const moment = require('moment-timezone');

const DEFAULT_TZ = 'Africa/Cairo';

/**
 * getNow(userTimezone?)
 * Returns current moment in user's timezone.
 */
function getNow(userTimezone = DEFAULT_TZ) {
  return moment().tz(userTimezone);
}

/**
 * toUserTime(date, timezone?)
 * Converts any date/string to a moment in user's timezone.
 */
function toUserTime(date, timezone = DEFAULT_TZ) {
  if (!date) return null;
  return moment(date).tz(timezone);
}

/**
 * toUTC(date, userTimezone?)
 * If the date has no timezone info, treat it as being in userTimezone, then convert to UTC.
 * If date already has UTC offset, just converts to UTC moment.
 */
function toUTC(date, userTimezone = DEFAULT_TZ) {
  if (!date) return null;
  // If it's a plain time string like "10:00", can't convert — return as-is
  if (typeof date === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(date)) return date;
  return moment.tz(date, userTimezone).utc();
}

/**
 * formatTime(date, timezone?, format?)
 * Returns time string in user timezone.
 * Default format: HH:mm
 */
function formatTime(date, timezone = DEFAULT_TZ, format = 'HH:mm') {
  if (!date) return null;
  return moment(date).tz(timezone).format(format);
}

/**
 * formatDate(date, timezone?, format?)
 * Returns date string in user timezone.
 * Default format: YYYY-MM-DD
 */
function formatDate(date, timezone = DEFAULT_TZ, format = 'YYYY-MM-DD') {
  if (!date) return null;
  return moment(date).tz(timezone).format(format);
}

/**
 * formatDateTime(date, timezone?, format?)
 * Returns datetime string in user timezone.
 */
function formatDateTime(date, timezone = DEFAULT_TZ, format = 'YYYY-MM-DD HH:mm') {
  if (!date) return null;
  return moment(date).tz(timezone).format(format);
}

/**
 * isSameDay(date1, date2, timezone?)
 * Returns true if both dates fall on the same calendar day in user's timezone.
 */
function isSameDay(date1, date2, timezone = DEFAULT_TZ) {
  if (!date1 || !date2) return false;
  return moment(date1).tz(timezone).isSame(moment(date2).tz(timezone), 'day');
}

/**
 * isToday(date, timezone?)
 */
function isToday(date, timezone = DEFAULT_TZ) {
  if (!date) return false;
  return moment(date).tz(timezone).isSame(moment().tz(timezone), 'day');
}

/**
 * isOverdue(date, timezone?)
 * Returns true if date is before today (not including today).
 */
function isOverdue(date, timezone = DEFAULT_TZ) {
  if (!date) return false;
  const d = moment(date).tz(timezone).startOf('day');
  const today = moment().tz(timezone).startOf('day');
  return d.isBefore(today);
}

/**
 * todayString(timezone?)
 * Returns today as YYYY-MM-DD in user timezone.
 */
function todayString(timezone = DEFAULT_TZ) {
  return moment().tz(timezone).format('YYYY-MM-DD');
}

/**
 * nowUTC()
 * Returns current UTC moment.
 */
function nowUTC() {
  return moment.utc();
}

/**
 * parseUserDate(dateStr, timezone?)
 * Parse a date string treating it as being in user's timezone.
 */
function parseUserDate(dateStr, timezone = DEFAULT_TZ) {
  if (!dateStr) return null;
  return moment.tz(dateStr, timezone);
}

/**
 * addMinutes(date, minutes, timezone?)
 * Returns new moment with minutes added, in user timezone.
 */
function addMinutes(date, minutes, timezone = DEFAULT_TZ) {
  return moment(date).tz(timezone).add(minutes, 'minutes');
}

/**
 * subtractMinutes(date, minutes, timezone?)
 */
function subtractMinutes(date, minutes, timezone = DEFAULT_TZ) {
  return moment(date).tz(timezone).subtract(minutes, 'minutes');
}

/**
 * getHour(timezone?)
 * Returns current hour (0–23) in user timezone.
 */
function getHour(timezone = DEFAULT_TZ) {
  return moment().tz(timezone).hour();
}

/**
 * toDatetimeLocal(date, timezone?)
 * Returns an ISO string suitable for <input type="datetime-local"> — no 'Z'.
 * e.g. "2026-03-23T10:00"
 */
function toDatetimeLocal(date, timezone = DEFAULT_TZ) {
  if (!date) return null;
  return moment(date).tz(timezone).format('YYYY-MM-DDTHH:mm');
}

/**
 * getUserTimezone(user)
 * Safely extract timezone from user object.
 */
function getUserTimezone(user) {
  return (user && user.timezone) ? user.timezone : DEFAULT_TZ;
}

module.exports = {
  DEFAULT_TZ,
  getNow,
  toUserTime,
  toUTC,
  formatTime,
  formatDate,
  formatDateTime,
  isSameDay,
  isToday,
  isOverdue,
  todayString,
  nowUTC,
  parseUserDate,
  addMinutes,
  subtractMinutes,
  getHour,
  toDatetimeLocal,
  getUserTimezone,
};
