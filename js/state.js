/* state.js — 存檔、資源、升級、技能、通行證、禮包、補給站
   所有資源都是 JS number（double）；存檔 JSON 在 localStorage 單一 key，壞檔要 fallback。 */
(function (global) {
  'use strict';
  const KEY = 'starbreaker.save.v1';
  const BAK = KEY + '.bak';
  const SAVE_VERSION = 1;

  function defaults() {
    return {
      v: SAVE_VERSION,
      gold: 0, gems: 500, prestige: 0, scrap: 0,
      sector: 1, planet: 1,
      weapons: {},                 // id -> 等級
      equipped: ['gatling', 'mortar', 'chain', 'missile'],
      satellites: {},              // id -> 星級
      gear: { hull: 1, reactor: 1, engine: 1 },
      skills: {},                  // id_rarity -> 數量
      passClaimed: {},             // tier -> true
      bundles: {},                 // id -> true
      prestigeMult: 1,
      stats: { blocks: 0, planets: 0, dice: 0 },
      settings: { speed: 1 },
      lastSave: Date.now(),
    };
  }

  let S = defaults();
  let listeners = [];

  function on(fn) { listeners.push(fn); return () => { listeners = listeners.filter((x) => x !== fn); }; }
  function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { /* UI 不能弄死遊戲 */ } }); }

  /* ---------- 存檔 ---------- */
  function normalize(d) {
    const out = defaults();
    if (!d || typeof d !== 'object') return out;
    Object.keys(out).forEach((k) => {
      if (d[k] !== undefined && d[k] !== null) out[k] = d[k];
    });
    /* 數值欄位一律轉 number，避免舊檔字串造成 NaN 連鎖 */
    ['gold', 'gems', 'prestige', 'scrap', 'sector', 'planet', 'prestigeMult'].forEach((k) => {
      const n = Number(out[k]);
      out[k] = isFinite(n) ? Math.max(0, n) : 0;
    });
    out.sector = Math.max(1, Math.floor(out.sector));
    out.planet = Math.max(1, Math.floor(out.planet));
    if (!out.gear || typeof out.gear !== 'object') out.gear = { hull: 1, reactor: 1, engine: 1 };
    CFG.GEAR.forEach((g) => { out.gear[g.id] = Math.max(1, Math.floor(Number(out.gear[g.id]) || 1)); });
    if (!Array.isArray(out.equipped)) out.equipped = ['gatling'];
    out.equipped = out.equipped.filter((id) => CFG.WEAPONS.some((w) => w.id === id)).slice(0, CFG.BALANCE.weaponSlots);
    if (!out.equipped.length) out.equipped = ['gatling'];
    if (!out.settings || typeof out.settings !== 'object') out.settings = { speed: 1 };
    if ([1, 2, 3].indexOf(out.settings.speed | 0) < 0) out.settings.speed = 1;
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem(BAK);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || !d.v) throw new Error('bad save');
      S = normalize(d);
      return true;
    } catch (e) {
      try {
        const bak = localStorage.getItem(BAK);
        if (bak) { S = normalize(JSON.parse(bak)); return true; }
      } catch (e2) { /* 兩個都壞就開新檔 */ }
      S = defaults();
      return false;
    }
  }

  function save() {
    S.lastSave = Date.now();
    try {
      const txt = JSON.stringify(S);
      const prev = localStorage.getItem(KEY);
      if (prev) localStorage.setItem(BAK, prev);
      localStorage.setItem(KEY, txt);
      return true;
    } catch (e) {
      return false;                       // 配額爆掉：不要留半截
    }
  }

  /* ---------- 衍生數值 ---------- */
  function gearBonus(id) { return 1 + CFG.GEAR.find((g) => g.id === id).per * (S.gear[id] - 1); }

  function skillTotals() {
    const out = { damage: 0, coin: 0, bombRate: 0, chain: 0, atkSpeed: 0, crit: 0, critDmg: 0, pierce: 0, collect: 0, gemChance: 0 };
    Object.keys(S.skills).forEach((key) => {
      const n = S.skills[key] | 0;
      if (!n) return;
      const [id, rk] = key.split('_');
      const sk = CFG.SKILLS.find((x) => x.id === id);
      const rar = CFG.RARITY.find((r) => r.key === rk);
      if (!sk || !rar) return;
      out[sk.kind] = (out[sk.kind] || 0) + sk.per * rar.mul * n;
    });
    return out;
  }

  function bundleMul(kind) {
    let m = 1;
    CFG.BUNDLES.forEach((b) => { if (S.bundles[b.id] && b.mul && b.mul[kind]) m *= b.mul[kind]; });
    return m;
  }

  function atk() {
    const reactor = gearBonus('reactor');
    const sk = skillTotals();
    const sat = (S.satellites.crit ? 1 : 1);
    return CFG.BALANCE.atkBase * reactor * (1 + sk.damage) * bundleMul('damage') * S.prestigeMult * sat;
  }

  function attackSpeed() {
    const engine = gearBonus('engine');
    const sk = skillTotals();
    return engine * (1 + sk.atkSpeed) * (1 + (S.satellites.chrono ? 1.0 : 0));
  }

  function critChance() {
    const sk = skillTotals();
    return Math.min(0.95, CFG.BALANCE.critBase + sk.crit + (S.satellites.crit ? 0.5 : 0));
  }

  function critMult() {
    const sk = skillTotals();
    return CFG.BALANCE.critDmgBase * (1 + sk.critDmg) + (S.satellites.crit ? 3.0 : 0);
  }

  function coinMul() {
    const sk = skillTotals();
    return (1 + sk.coin) * bundleMul('coin') * (1 + (S.satellites.collector ? 3.0 : 0));
  }

  function collectRadius() {
    const sk = skillTotals();
    return CFG.ECON.autoCollectRadius * gearBonus('hull') * (1 + sk.collect);
  }

  function bombChance() {
    const sk = skillTotals();
    return Math.min(0.45, 0.06 + sk.bombRate);
  }

  function chainRadius() {
    const sk = skillTotals();
    return 1 + Math.round(sk.chain);
  }

  function speed() { return (S.settings && S.settings.speed) | 0 || 1; }

  function power() {
    return Math.round(atk() * 10 + (S.prestige || 0) * 2 + Object.keys(S.skills).length * 25);
  }

  /* ---------- 動作：升級 ---------- */
  function weaponLevel(id) { return S.weapons[id] | 0; }
  function weaponCost(id) {
    const lv = weaponLevel(id);
    return Math.round(120 * Math.pow(1.16, lv));
  }
  function upgradeWeapon(id) {
    const cost = weaponCost(id);
    if (S.gold < cost) return { ok: false, msg: '金幣不足' };
    S.gold -= cost; S.weapons[id] = weaponLevel(id) + 1; emit(); return { ok: true };
  }
  function upgradeAllWeapons() {
    let n = 0;
    for (;;) {
      const cheapest = CFG.WEAPONS.map((w) => ({ id: w.id, cost: weaponCost(w.id) }))
        .sort((a, b) => a.cost - b.cost)[0];
      if (S.gold < cheapest.cost) break;
      S.gold -= cheapest.cost; S.weapons[cheapest.id] = weaponLevel(cheapest.id) + 1; n++;
      if (n > 500) break;
    }
    emit(); return n;
  }

  function satLevel(id) { return S.satellites[id] | 0; }
  function satCost(id) {
    const lv = satLevel(id);
    return Math.round(800 * Math.pow(1.35, lv));
  }
  function upgradeSatellite(id) {
    if (satLevel(id) >= 5) return { ok: false, msg: '已滿級' };
    const cost = satCost(id);
    if (S.gems < cost) return { ok: false, msg: '寶石不足' };
    S.gems -= cost; S.satellites[id] = satLevel(id) + 1; emit(); return { ok: true };
  }
  function upgradeSatelliteBulk(id, times) {
    let n = 0;
    for (let i = 0; i < (times || 5); i++) {
      if (satLevel(id) >= 5) break;
      const r = upgradeSatellite(id);
      if (!r.ok) break;
      n++;
    }
    return n;
  }
  function unlockAllSatellites() {
    CFG.SATELLITES.forEach((s) => { S.satellites[s.id] = Math.max(5, satLevel(s.id)); });
    emit();
  }

  function gearCost(id) { return Math.round(200 * Math.pow(1.22, S.gear[id] - 1)); }
  function upgradeGear(id) {
    const cost = gearCost(id);
    if (S.gold < cost) return { ok: false, msg: '金幣不足' };
    S.gold -= cost; S.gear[id] += 1; emit(); return { ok: true };
  }

  /* ---------- 動作：技能 ---------- */
  function rollDice(times) {
    const cost = times === 100 ? CFG.DICE.hundredCost : times === 10 ? CFG.DICE.tenCost : CFG.DICE.cost;
    if (S.gems < cost) return { ok: false, msg: '寶石不足' };
    S.gems -= cost;
    const got = [];
    for (let i = 0; i < times; i++) {
      const sk = CFG.SKILLS[Math.floor(Math.random() * CFG.SKILLS.length)];
      const r = Math.random();
      const rk = r < 0.6 ? 'common' : r < 0.85 ? 'rare' : r < 0.96 ? 'epic' : r < 0.995 ? 'legend' : 'myth';
      const key = sk.id + '_' + rk;
      S.skills[key] = (S.skills[key] | 0) + 1;
      got.push({ id: sk.id, rarity: rk, key });
    }
    S.stats.dice += times;
    emit();
    return { ok: true, got, cost };
  }

  /* 3 個同名同稀有度 → 高一階 1 個；回傳融合次數 */
  function fuseAll() {
    let fused = 0;
    for (let guard = 0; guard < 5000; guard++) {
      let did = false;
      const keys = Object.keys(S.skills);
      for (const key of keys) {
        const n = S.skills[key] | 0;
        if (n < 3) continue;
        const [id, rk] = key.split('_');
        const idx = CFG.RARITY.findIndex((r) => r.key === rk);
        const next = CFG.RARITY[idx + 1];
        if (!next) continue;
        const use = Math.floor(n / 3);
        S.skills[key] = n - use * 3;
        if (!S.skills[key]) delete S.skills[key];
        const nk = id + '_' + next.key;
        S.skills[nk] = (S.skills[nk] | 0) + use;
        fused += use;
        did = true;
      }
      if (!did) break;
    }
    emit();
    return fused;
  }

  function skillList() {
    return Object.keys(S.skills).filter((k) => (S.skills[k] | 0) > 0).map((key) => {
      const [id, rk] = key.split('_');
      const sk = CFG.SKILLS.find((x) => x.id === id);
      const rar = CFG.RARITY.find((r) => r.key === rk);
      return { key, id, name: sk ? sk.name : id, rarity: rk, rarityName: rar ? rar.name : rk,
               color: rar ? rar.color : '#fff', count: S.skills[key] | 0, desc: sk ? sk.desc : '' };
    }).sort((a, b) => b.count - a.count);
  }

  /* ---------- 動作：裝備武器 ---------- */
  function toggleEquip(id) {
    const i = S.equipped.indexOf(id);
    if (i >= 0) {
      if (S.equipped.length <= 1) return { ok: false, msg: '至少要裝備一把' };
      S.equipped.splice(i, 1);
    } else {
      if (S.equipped.length >= CFG.BALANCE.weaponSlots) return { ok: false, msg: '最多 4 把' };
      S.equipped.push(id);
    }
    emit();
    return { ok: true };
  }

  /* ---------- 動作：補給站 / 通行證 / 禮包 ---------- */
  /* 補給站：gems / prestige / weapons_unlock_all / satellites_max / all_in_one */
  function supply(kind) {
    if (kind === 'gems') S.gems += CFG.SUPPLY.gems;
    else if (kind === 'prestige') {
      S.prestige += CFG.SUPPLY.prestige;
      S.prestigeMult = 1 + Math.log10(1 + S.prestige) * 0.8;   // 立即提升倍率
    } else if (kind === 'weapons_unlock_all') {
      CFG.WEAPONS.forEach((w) => { S.weapons[w.id] = Math.max(CFG.SUPPLY.weaponLevels, S.weapons[w.id] | 0); });
    } else if (kind === 'satellites_max') {
      unlockAllSatellites();
    } else if (kind === 'all_in_one') {
      S.gems += CFG.SUPPLY.gems;
      S.prestige += CFG.SUPPLY.prestige;
      S.scrap += CFG.SUPPLY.scrap;
      S.gold += 1e8;
      S.prestigeMult = 1 + Math.log10(1 + S.prestige) * 0.8;
      CFG.WEAPONS.forEach((w) => { S.weapons[w.id] = Math.max(25, S.weapons[w.id] | 0); });
      unlockAllSatellites();
      CFG.GEAR.forEach((g) => { S.gear[g.id] = Math.max(25, S.gear[g.id]); });
    }
    emit();
    return { ok: true };
  }
  function unlockDice() { S.gems += 20000; emit(); }

  function passClaim(tier) {
    const t = CFG.PASS_TIERS.find((x) => x.tier === tier);
    if (!t || S.passClaimed[tier]) return { ok: false };
    S.passClaimed[tier] = true;
    S.gems += t.gems; S.prestige += t.prestige; S.scrap += t.scrap;
    S.gems += t.ticket * 25;
    emit();
    return { ok: true, tier };
  }
  function passClaimAll() {
    let n = 0;
    CFG.PASS_TIERS.forEach((t) => { if (!S.passClaimed[t.tier]) { passClaim(t.tier); n++; } });
    return n;
  }
  function bundleClaim(id) {
    const b = CFG.BUNDLES.find((x) => x.id === id);
    if (!b || S.bundles[id]) return { ok: false };
    S.bundles[id] = true;
    S.gems += b.gems; S.prestige += b.prestige; S.scrap += b.scrap;
    S.gems += (b.ticket || 0) * 25;
    if (b.gold) S.gold += b.gold;
    if (b.weaponLevels) CFG.WEAPONS.forEach((w) => { S.weapons[w.id] = (S.weapons[w.id] | 0) + b.weaponLevels; });
    if (b.satLevels) CFG.SATELLITES.forEach((x) => { S.satellites[x.id] = Math.max(b.satLevels, S.satellites[x.id] | 0); });
    emit();
    return { ok: true };
  }

  /* ---------- 動作：轉生 ---------- */
  function prestigeGain() {
    return Math.max(1, Math.floor(Math.sqrt((S.stats.blocks | 0) / 60) + S.sector * 2));
  }
  function doPrestige() {
    const gain = prestigeGain();
    if (gain < 5) return { ok: false, msg: '推進不足（需 5 星塵以上）' };
    S.prestige += gain;
    S.prestigeMult = 1 + Math.log10(1 + S.prestige) * 0.8;   // 永久傷害倍率
    S.gold = 0; S.sector = 1; S.planet = 1;
    emit();
    return { ok: true, gain, mult: S.prestigeMult };
  }

  /* ---------- 星球推進 ---------- */
  function onPlanetCleared() {
    const bonus = CFG.BALANCE.planetClearBonus;
    S.gold += Math.round(500 * S.sector * bonus * coinMul());
    S.prestige += CFG.ECON.prestigePerPlanet;
    S.stats.planets = (S.stats.planets | 0) + 1;
    S.planet += 1;
    if (S.planet > 5) { S.planet = 1; S.sector += 1; }
    emit();
  }
  function onBlockBroken(kind) {
    S.stats.blocks = (S.stats.blocks | 0) + 1;
  }

  global.State = {
    get data() { return S; },
    KEY, SAVE_VERSION,
    load, save, on, emit, normalize, defaults,
    atk, attackSpeed, critChance, critMult, coinMul, collectRadius, bombChance, chainRadius,
    skillTotals, skillList, gearBonus, power, speed, prestigeMult: () => S.prestigeMult,
    weaponLevel, weaponCost, upgradeWeapon, upgradeAllWeapons,
    satLevel, satCost, upgradeSatellite, upgradeSatelliteBulk, unlockAllSatellites,
    gearCost, upgradeGear, toggleEquip,
    rollDice, fuseAll,
    supply, passClaim, passClaimAll, bundleClaim,
    prestigeGain, doPrestige,
    onPlanetCleared, onBlockBroken,
  };
})(window);
