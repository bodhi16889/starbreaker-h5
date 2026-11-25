/* big.js — 大數值格式化（H5 版：全部用 JS number＝double，安全上限約 1.79e308）
   支援 K / M / B / T / aa, ab, ac … 直到 ez；超出就退回科學記號。 */
(function (global) {
  'use strict';

  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'aa', 'ab', 'ac', 'ad', 'ae', 'af', 'ag', 'ah', 'ai', 'aj',
    'ak', 'al', 'am', 'an', 'ao', 'ap', 'aq', 'ar', 'as', 'at', 'au', 'av', 'aw', 'ax', 'ay', 'az',
    'ba', 'bb', 'bc', 'bd', 'be', 'bf', 'bg', 'bh', 'bi', 'bj', 'bk', 'bl', 'bm', 'bn', 'bo', 'bp',
    'bq', 'br', 'bs', 'bt', 'bu', 'bv', 'bw', 'bx', 'by', 'bz', 'ca', 'cb', 'cc', 'cd', 'ce', 'cf',
    'cg', 'ch', 'ci', 'cj', 'ck', 'cl', 'cm', 'cn', 'co', 'cp', 'cq', 'cr', 'cs', 'ct', 'cu', 'cv',
    'cw', 'cx', 'cy', 'cz', 'da', 'db', 'dc', 'dd', 'de', 'df', 'dg', 'dh', 'di', 'dj', 'dk', 'dl',
    'dm', 'dn', 'do', 'dp', 'dq', 'dr', 'ds', 'dt', 'du', 'dv', 'dw', 'dx', 'dy', 'dz'];

  /** 1.25K / 4.80M / 9.12B / 3.45T / 1.00aa */
  function fmt(n) {
    if (n === Infinity) return '∞';
    if (n === -Infinity) return '-∞';
    if (!isFinite(n) || isNaN(n)) return '0';
    const neg = n < 0;
    n = Math.abs(n);
    if (n < 1000) {
      const v = n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();
      return (neg ? '-' : '') + v;
    }
    let tier = Math.floor(Math.log10(n) / 3);
    if (tier >= SUFFIX.length) return (neg ? '-' : '') + n.toExponential(2).replace('e+', 'e');
    const scaled = n / Math.pow(1000, tier);
    const txt = scaled < 10 ? scaled.toFixed(2) : scaled < 100 ? scaled.toFixed(1) : Math.floor(scaled).toString();
    return (neg ? '-' : '') + txt + SUFFIX[tier];
  }

  /** 資源顯示：整數時不帶小數（金幣/寶石這種） */
  function fmtInt(n) {
    if (n < 1000) return String(Math.floor(n));
    return fmt(n);
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function safeAdd(a, b) { return clamp(a + b, 0, Number.MAX_VALUE); }
  function safeMul(a, b) { return clamp(a * b, 0, Number.MAX_VALUE); }

  global.BIG = { fmt, fmtInt, clamp, safeAdd, safeMul, SUFFIX };
})(window);
