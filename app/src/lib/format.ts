import type { Schedule } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Rough display rate for the "about Rp" line. The server owns real figures.
export const IDR_PER_USD = 16_700;

export function usdc(v: string | number, opts: { sign?: '+' | '-' } = {}) {
  const num = typeof v === 'string' ? Number.parseFloat(v) : v;
  const s = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${opts.sign === '-' ? '−' : opts.sign === '+' ? '+' : ''}${s}`;
}

export function rupiah(usd: string | number) {
  const num = (typeof usd === 'string' ? Number.parseFloat(usd) : usd) * IDR_PER_USD;
  const rounded = Math.round(num / 1000) * 1000;
  return `Rp${rounded.toLocaleString('en-US')}`;
}

const pad = (x: number) => String(x).padStart(2, '0');

export function clock(d: Date, seconds = false) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}${seconds ? `:${pad(d.getSeconds())}` : ''}`;
}

export function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((start.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return DAYS[d.getDay()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fullStamp(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${clock(d, true)}`;
}

export function listStamp(iso: string, now = new Date()) {
  const label = dayLabel(iso, now);
  const d = new Date(iso);
  return label === 'Today' || label === 'Yesterday' ? `${label}, ${clock(d)}` : label;
}

export function groupLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const days = (now.getTime() - d.getTime()) / 86400000;
  if (dayLabel(iso, now) === 'Today') return 'Today';
  if (days < 7) return 'This week';
  if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) return 'Earlier this month';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "In 17 minutes", "In 6 days". Never counts seconds. */
export function untilLabel(iso: string, now = new Date()) {
  const ms = Date.parse(iso) - now.getTime();
  if (ms <= 0) return 'Starting soon';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'Starting soon';
  if (min < 60) return `In ${min} minute${min === 1 ? '' : 's'}`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `In ${hrs} hour${hrs === 1 ? '' : 's'}`;
  const days = Math.round(hrs / 24);
  return `In ${days} day${days === 1 ? '' : 's'}`;
}

export function whenLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const days = (d.getTime() - now.getTime()) / 86400000;
  if (days > 7) return `${shortDate(iso)}, ${clock(d)}`;
  const label = dayLabel(iso, now);
  if (label === 'Today') return `Today, ${clock(d)}`;
  if (d.getTime() - now.getTime() < 2 * 86400000 && d.getDate() !== now.getDate()) return `Tomorrow, ${clock(d)}`;
  return `${DAYS[d.getDay()]} ${shortDate(iso)}, ${clock(d)}`;
}

export function scheduleLabel(s: Schedule) {
  if (s.type === 'interval') return `Every ${s.minutes} minutes (demo)`;
  const day = s.dayOfMonth ?? 1;
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `Every month on the ${day}${suffix}`;
}

export function shortHash(h: string) {
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

export function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}
