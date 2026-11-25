/* ui.js — HUD、分頁、彈窗（唯一碰 DOM 的檔案） */
(function (global) {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const T = (s) => CFG.T(s);

  let hudAt = 0;

  /* ---------- HUD ---------- */
  function renderHud() {
    const s = State.data;
    $('#resGold').textContent = BIG.fmtInt(s.gold);
    $('#resGems').textContent = BIG.fmtInt(s.gems);
    $('#resPrestige').textContent = BIG.fmtInt(s.prestige);
    $('#sectorLabel').textContent = `${T('星區')} ${s.sector}-${s.planet}`;
    const left = global.Game.planet ? global.Game.planet.alive : 0;
    $('#blocksLeft').textContent = `${T('本星球剩餘')} ${left}`;
    $('#fpsLabel').textContent = `${global.Game.fps} fps`;
    const sp = State.speed();
    const spBtn = $('#btnSpeed');
    spBtn.textContent = '×' + sp;
    spBtn.classList.toggle('on', sp > 1);
  }

  /* ---------- toast ---------- */
  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 1600);
  }

  /* ---------- 彈窗 ---------- */
  function openModal(title, html) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    $('#modal').classList.remove('hidden');
  }
  function closeModal() { $('#modal').classList.add('hidden'); }

  /* ---------- 武器 ---------- */
  function tabWeapons() {
    const s = State.data;
    const rows = CFG.WEAPONS.map((w) => {
      const lv = State.weaponLevel(w.id);
      const eq = s.equipped.indexOf(w.id) >= 0;
      const cost = State.weaponCost(w.id);
      return `<div class="row">
        <div class="grow">
          <div class="name" style="color:${w.color}">${w.name} <span class="lv">Lv ${lv}</span></div>
          <div class="sub">${w.desc}</div>
        </div>
        <button class="btn ${eq ? 'primary' : ''}" data-equip="${w.id}">${eq ? '出戰' : '待命'}</button>
        <button class="btn gem" data-upw="${w.id}" ${s.gold < cost ? 'disabled' : ''}>${BIG.fmtInt(cost)}</button>
      </div>`;
    }).join('');
    openModal(T('武器'), `
      <div class="stat-row">
        <span class="stat">${T('戰力')} <b>${BIG.fmt(State.power())}</b></span>
        <span class="stat">ATK <b>${BIG.fmt(State.atk())}</b></span>
        <span class="stat">${T('暴擊')} <b>${(State.critChance() * 100).toFixed(0)}%</b></span>
        <span class="stat">${T('攻速')} <b>×${State.attackSpeed().toFixed(2)}</b></span>
      </div>
      <div class="hint">可同時裝備 ${CFG.BALANCE.weaponSlots} 把，其餘提供被動。</div>
      ${rows}
      <button class="btn wide primary" id="btnUpAllW">${T('一鍵升級')}</button>`);
    bind('weapons');
  }

  /* ---------- 衛星 ---------- */
  function tabSats() {
    const rows = CFG.SATELLITES.map((st) => {
      const lv = State.satLevel(st.id);
      const cost = State.satCost(st.id);
      const maxed = lv >= 5;
      return `<div class="row">
        <div class="grow">
          <div class="name" style="color:${st.color}">${st.name} <span class="lv">${'★'.repeat(lv)}${'☆'.repeat(Math.max(0, 5 - lv))}</span></div>
          <div class="sub">${st.desc}</div>
        </div>
        <button class="btn ${maxed ? '' : 'gem'}" data-ups="${st.id}" ${maxed || State.data.gems < cost ? 'disabled' : ''}>
          ${maxed ? T('已滿級') : BIG.fmtInt(cost) + ' 💎'}</button>
      </div>`;
    }).join('');
    openModal(T('衛星'), `
      <div class="hint">最多 6 顆同時環繞；每顆可升到 5 星。</div>
      ${rows}
      <button class="btn wide primary" id="btnUnlockSats">${T('衛星全解鎖')}（${T('免費')}）</button>`);
    bind('sats');
  }

  /* ---------- 技能 ---------- */
  function tabSkills() {
    const list = State.skillList();
    const cells = list.length
      ? list.map((sk) => `<div class="skill" style="border-color:${sk.color}">
          <b style="color:${sk.color}">${sk.name} ×${sk.count}</b>
          <span class="sub">${sk.rarityName} · ${sk.desc}</span></div>`).join('')
      : `<div class="hint">還沒有技能，先擲骰子。</div>`;
    openModal(T('技能'), `
      <div class="stat-row">
        <span class="stat">DICE <b>${State.data.stats.dice || 0}</b></span>
        <span class="stat">${T('寶石')} <b>${BIG.fmtInt(State.data.gems)}</b></span>
      </div>
      <div class="hint">3 個同名同稀有度 → 自動合成高一階。</div>
      <div class="skill-grid" style="margin:8px 0">${cells}</div>
      <button class="btn wide" id="btnRoll1">${T('擲骰')} · ${CFG.DICE.cost} 💎</button>
      <button class="btn wide" id="btnRoll10">${T('十連')} · ${CFG.DICE.tenCost} 💎</button>
      <button class="btn wide" id="btnRoll100">${T('百連')} · ${CFG.DICE.hundredCost} 💎</button>
      <button class="btn wide primary" id="btnFuse">${T('一鍵融合')}</button>`);
    bind('skills');
  }

  /* ---------- 裝備 ---------- */
  function tabGear() {
    const rows = CFG.GEAR.map((g) => {
      const lv = State.data.gear[g.id];
      const cost = State.gearCost(g.id);
      return `<div class="row">
        <div class="grow">
          <div class="name">${g.name} <span class="lv">Lv ${lv}</span></div>
          <div class="sub">${g.desc}（每級 +${(g.per * 100).toFixed(0)}%）</div>
        </div>
        <button class="btn gem" data-upg="${g.id}" ${State.data.gold < cost ? 'disabled' : ''}>${BIG.fmtInt(cost)}</button>
      </div>`;
    }).join('');
    const gain = State.prestigeGain();
    openModal(T('裝備'), `
      ${rows}
      <div class="row" style="margin-top:10px">
        <div class="grow">
          <div class="name">🌀 ${T('轉生')}</div>
          <div class="sub">${T('永久加成')} ×${State.data.prestigeMult.toFixed(2)} · 本次可得 ${gain} 星塵</div>
        </div>
        <button class="btn primary" id="btnPrestige">${T('轉生')}</button>
      </div>`);
    bind('gear');
  }

  /* ---------- 通行證 + 禮包 ---------- */
  function tabPass() {
    const claimed = State.data.passClaimed;
    const cells = CFG.PASS_TIERS.map((t) => {
      const done = !!claimed[t.tier];
      return `<div class="pass-cell ${done ? 'done' : ''}">
        <b>${t.tier}</b>${done ? '✓' : '💎' + BIG.fmtInt(t.gems)}</div>`;
    }).join('');
    const bundles = CFG.BUNDLES.map((b) => `<div class="row">
        <div class="grow">
          <div class="name">${b.name}</div>
          <div class="sub">${BIG.fmtInt(b.gems)} 💎 · ${BIG.fmtInt(b.prestige)} ✨ · ${b.ticket} 券</div>
        </div>
        <button class="btn primary" data-bundle="${b.id}" ${State.data.bundles[b.id] ? 'disabled' : ''}>
          ${State.data.bundles[b.id] ? '✓' : 'FREE'}</button>
      </div>`).join('');
    openModal(T('星際通行證'), `
      <div class="hint">50 階全部預設 <b style="color:var(--ok)">UNLOCKED</b>，可一鍵領取。</div>
      <div class="pass-grid" style="margin:8px 0">${cells}</div>
      <button class="btn wide primary" id="btnPassAll">${T('全部領取')}</button>
      <h3 style="font-size:13px;margin:14px 0 6px">${T('特惠禮包')}</h3>
      ${bundles}`);
    bind('pass');
  }

  /* ---------- 補給站 ---------- */
  function tabSupply() {
    openModal(T('無限補給'), `
      <div class="hint">沙盒模式：所有資源都可以無限領取，沒有冷卻、沒有付費牆。</div>
      <button class="btn wide primary" data-sup="gems">${T('領取 100 萬寶石')}</button>
      <button class="btn wide primary" data-sup="prestige">${T('領取 100 萬星塵')}</button>
      <button class="btn wide" data-sup="sats">${T('衛星全解鎖')}</button>
      <button class="btn wide" data-sup="ticket">${T('免費百連券')}</button>
      <button class="btn wide gem" data-sup="all">ALL IN ONE</button>`);
    bind('supply');
  }

  /* ---------- 綁定 ---------- */
  function bind(kind) {
    const body = $('#modalBody');
    body.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => {
      const r = State.toggleEquip(b.dataset.equip);
      if (!r.ok) return toast(r.msg);
      State.save(); tabWeapons();
    }));
    body.querySelectorAll('[data-upw]').forEach((b) => b.addEventListener('click', () => {
      const r = State.upgradeWeapon(b.dataset.upw);
      if (!r.ok) return toast(r.msg);
      State.save(); tabWeapons();
    }));
    body.querySelectorAll('[data-ups]').forEach((b) => b.addEventListener('click', () => {
      const r = State.upgradeSatellite(b.dataset.ups);
      if (!r.ok) return toast(r.msg);
      State.save(); tabSats();
    }));
    body.querySelectorAll('[data-upg]').forEach((b) => b.addEventListener('click', () => {
      const r = State.upgradeGear(b.dataset.upg);
      if (!r.ok) return toast(r.msg);
      State.save(); tabGear();
    }));
    body.querySelectorAll('[data-bundle]').forEach((b) => b.addEventListener('click', () => {
      const r = State.bundleClaim(b.dataset.bundle);
      if (!r.ok) return;
      State.save(); toast('Bundle granted'); tabPass();
    }));
    body.querySelectorAll('[data-sup]').forEach((b) => b.addEventListener('click', () => {
      State.supply(b.dataset.sup);
      State.save(); renderHud();
      toast('+ granted');
    }));

    const upAllW = $('#btnUpAllW');
    if (upAllW) upAllW.addEventListener('click', () => {
      const n = State.upgradeAllWeapons();
      State.save(); toast(`${n} upgrades`); tabWeapons();
    });
    const unlockSats = $('#btnUnlockSats');
    if (unlockSats) unlockSats.addEventListener('click', () => {
      State.unlockAllSatellites(); State.save(); tabSats();
    });
    const roll = (n) => {
      const r = State.rollDice(n);
      if (!r.ok) return toast(r.msg);
      State.save(); tabSkills();
    };
    if ($('#btnRoll1')) $('#btnRoll1').addEventListener('click', () => roll(1));
    if ($('#btnRoll10')) $('#btnRoll10').addEventListener('click', () => roll(10));
    if ($('#btnRoll100')) $('#btnRoll100').addEventListener('click', () => roll(100));
    if ($('#btnFuse')) $('#btnFuse').addEventListener('click', () => {
      const n = State.fuseAll();
      State.save(); toast(`${n} fusions`); tabSkills();
    });
    if ($('#btnPassAll')) $('#btnPassAll').addEventListener('click', () => {
      const n = State.passClaimAll();
      State.save(); toast(`${n} tiers claimed`); tabPass();
    });
    if ($('#btnPrestige')) $('#btnPrestige').addEventListener('click', () => {
      const r = State.doPrestige();
      if (!r.ok) return toast(r.msg);
      State.save();
      global.Game.newPlanet();
      toast(`Prestige +${r.gain} → ×${r.mult.toFixed(2)}`);
      closeModal();
    });
  }

  /* ---------- 觸控：手動搖桿 ---------- */
  function bindControls(canvas) {
    let dragging = false;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      const p = pos(e);
      global.Game.joyDown(p.x, p.y);
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const p = pos(e);
      global.Game.joyMove(p.x, p.y);
    });
    const end = () => { if (dragging) { dragging = false; global.Game.joyUp(); } };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);
  }

  /* ---------- 啟動 ---------- */
  function boot() {
    const params = new URLSearchParams(location.search);
    global.LANG = params.get('lang') === 'en' ? 'en' : 'zh';   // 預設中文，?lang=en 切英文
    document.documentElement.lang = global.LANG === 'zh' ? 'zh-Hant' : 'en';

    State.load();
    const canvas = $('#game');
    const fit = () => {
      const stage = $('#stage');
      const rect = stage.getBoundingClientRect();
      global.Game.resize(rect.width, rect.height, Math.min(2, window.devicePixelRatio || 1));
    };
    global.Game.init(canvas);
    fit();
    window.addEventListener('resize', fit);

    /* HUD 節流（每 200ms） */
    global.Game.G.onTick = () => {
      if (performance.now() - hudAt < 200) return;
      hudAt = performance.now();
      renderHud();
    };

    /* 分頁 */
    /* 靜態字串（分頁、補給站按鈕）跟著語系走 */
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = T(el.dataset.i18n); });

    document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
      const t = b.dataset.tab;
      if (t === 'weapons') tabWeapons();
      else if (t === 'sats') tabSats();
      else if (t === 'skills') tabSkills();
      else if (t === 'gear') tabGear();
      else if (t === 'pass') tabPass();
    }));
    $('#btnSupply').addEventListener('click', tabSupply);
    $('#modalClose').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
    $('#btnSpeed').addEventListener('click', () => {
      const next = State.speed() === 1 ? 2 : State.speed() === 2 ? 3 : 1;
      State.data.settings.speed = next;
      State.save(); renderHud();
    });

    bindControls(canvas);

    /* 自動存檔 */
    setInterval(() => { State.save(); }, 10000);
    window.addEventListener('beforeunload', () => State.save());

    renderHud();
    State.on(renderHud);
  }

  global.UI = { boot, renderHud, toast, openModal, closeModal, tabSupply };
  global.__game = {
    State, Game: global.Game, CFG, BIG,
    get ready() { return true; },
    openTab: (n) => ({ weapons: tabWeapons, sats: tabSats, skills: tabSkills, gear: tabGear, pass: tabPass, supply: tabSupply }[n] || (() => {})()),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
