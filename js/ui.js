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

  /* ---------- 武器（含裝備與轉生，Step 4：升級 +1 / 連升 +10） ---------- */
  function tabWeapons() {
    const s = State.data;
    const rows = CFG.WEAPONS.map((w) => {
      const lv = State.weaponLevel(w.id);
      const eq = s.equipped.indexOf(w.id) >= 0;
      const cost = State.weaponCost(w.id);
      const cost10 = Math.round(cost * 10.9);
      return `<div class="row">
        <div class="grow">
          <div class="name" style="color:${w.color}">${w.name} <span class="lv">Lv ${lv}</span></div>
          <div class="sub">${w.desc}</div>
        </div>
        <button class="btn ${eq ? 'primary' : ''}" data-equip="${w.id}">${eq ? '出戰' : '待命'}</button>
        <button class="btn gem" data-upw="${w.id}" ${s.gold < cost ? 'disabled' : ''}>+1<br><span class="sub">${BIG.fmtInt(cost)}</span></button>
        <button class="btn" data-upw10="${w.id}" ${s.gold < cost10 ? 'disabled' : ''}>+10<br><span class="sub">${BIG.fmtInt(cost10)}</span></button>
      </div>`;
    }).join('');

    const gear = CFG.GEAR.map((g) => {
      const lv = s.gear[g.id];
      const cost = State.gearCost(g.id);
      return `<div class="row">
        <div class="grow">
          <div class="name">${g.name} <span class="lv">Lv ${lv}</span></div>
          <div class="sub">${g.desc}（每級 +${(g.per * 100).toFixed(0)}%）</div>
        </div>
        <button class="btn gem" data-upg="${g.id}" ${s.gold < cost ? 'disabled' : ''}>${BIG.fmtInt(cost)}</button>
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
      <button class="btn wide primary" id="btnUpAllW">${T('一鍵升級')}</button>
      <h3 style="font-size:13px;margin:14px 0 6px">${T('裝備')}</h3>
      ${gear}
      <div class="row">
        <div class="grow">
          <div class="name">🌀 ${T('轉生')} <span class="lv">×${s.prestigeMult.toFixed(2)}</span></div>
          <div class="sub">${T('永久加成')} · 本次可得 ${State.prestigeGain()} 星塵</div>
        </div>
        <button class="btn primary" id="btnPrestige">${T('轉生')}</button>
      </div>`);
    bind('weapons');
  }

  /* ---------- 衛星（Step 4：升 +5 級） ---------- */
  function tabSats() {
    const rows = CFG.SATELLITES.map((st) => {
      const lv = State.satLevel(st.id);
      const cost = State.satCost(st.id);
      const maxed = lv >= 5;
      return `<div class="row">
        <div class="grow">
          <div class="name" style="color:${st.color}">🛰 ${st.name} <span class="lv">${'★'.repeat(lv)}${'☆'.repeat(Math.max(0, 5 - lv))}</span></div>
          <div class="sub">${st.desc}</div>
        </div>
        <button class="btn ${maxed ? '' : 'gem'}" data-ups="${st.id}" ${maxed || State.data.gems < cost ? 'disabled' : ''}>
          ${maxed ? T('已滿級') : BIG.fmtInt(cost) + ' 💎'}</button>
        <button class="btn" data-ups5="${st.id}" ${maxed ? 'disabled' : ''}>+5</button>
      </div>`;
    }).join('');
    openModal(T('衛星'), `
      <div class="hint">最多 6 顆同時環繞；每顆可升到 5 星（滿星＝最高階）。</div>
      ${rows}
      <button class="btn wide primary" id="btnUnlockSats">${T('衛星全解鎖')}（${T('免費')}）</button>`);
    bind('sats');
  }

  /* ---------- 技能 ---------- */
  function tabSkills() {
    const list = State.skillList();
    const cells = list.length
      ? list.map((sk) => `<div class="skill" style="border-color:${sk.color}">
          <b style="color:${sk.color}">[${sk.rarityName}] ${sk.name} ×${sk.count}</b>
          <span class="sub">${sk.desc}</span></div>`).join('')
      : `<div class="hint">背包尚無技能，點上方按鈕抽取。</div>`;
    openModal(T('技能'), `
      <div class="stat-row">
        <span class="stat">DICE <b>${State.data.stats.dice || 0}</b></span>
        <span class="stat">${T('寶石')} <b>${BIG.fmtInt(State.data.gems)}</b></span>
      </div>
      <div class="hint">3 個同名同稀有度 → 自動合成高一階（最高神話）。</div>
      <div class="skill-grid" style="margin:8px 0">${cells}</div>
      <button class="btn wide" id="btnRoll10">🎲 ${T('十連')} · ${CFG.DICE.tenCost} 💎</button>
      <button class="btn wide" id="btnRoll100">🔥 ${T('百連')} · ${CFG.DICE.hundredCost} 💎</button>
      <button class="btn wide primary" id="btnFuse">✨ ${T('一鍵融合')}</button>`);
    bind('skills');
  }

  /* ---------- 通行證 50 階（每階都可單獨領） ---------- */
  function tabPass() {
    const claimed = State.data.passClaimed;
    const doneN = Object.keys(claimed).length;
    const rows = CFG.PASS_TIERS.map((t) => {
      const done = !!claimed[t.tier];
      const label = global.LANG !== 'zh'
        ? `Tier ${String(t.tier).padStart(2, '0')}: ${BIG.fmtInt(t.gems)} gems + ${BIG.fmtInt(t.prestige)} stardust`
        : `第 ${String(t.tier).padStart(2, '0')} 階：${BIG.fmtInt(t.gems)} 寶石 + ${BIG.fmtInt(t.prestige)} 星塵`;
      return `<div class="row">
        <div class="grow"><div class="sub" style="color:${done ? '#93a2c4' : '#e8eefc'}">${label}</div></div>
        <span class="lv" style="color:${done ? '#8ef0a8' : '#ffd166'}">${done ? '✔ ' + T('已領取') : T('待領取')}</span>
        ${done ? '' : `<button class="btn" data-pass="${t.tier}">${T('領取')}</button>`}
      </div>`;
    }).join('');
    openModal(T('星際通行證'), `
      <div class="hint">豪華版 <b style="color:var(--ok)">已永久解鎖</b>：50 階全部可領（已領 ${doneN}/50）。</div>
      <button class="btn wide primary" id="btnPassAll">${T('一鍵領取全部 50 階獎勵')}</button>
      <div style="margin-top:8px">${rows}</div>`);
    bind('pass');
  }

  /* ---------- 特惠禮包（3 個，全部 FREE） ---------- */
  function tabBundles() {
    const rows = CFG.BUNDLES.map((b) => {
      const got = !!State.data.bundles[b.id];
      const bits = [];
      if (b.gems) bits.push(BIG.fmtInt(b.gems) + ' 💎');
      if (b.prestige) bits.push(BIG.fmtInt(b.prestige) + ' ✨');
      if (b.gold) bits.push(BIG.fmtInt(b.gold) + ' 🪙');
      if (b.weaponLevels) bits.push(`全武器 +${b.weaponLevels} 級`);
      if (b.satLevels) bits.push('衛星全滿星');
      return `<div class="row">
        <div class="grow">
          <div class="name">${b.name}</div>
          <div class="sub">${bits.join(' · ')}</div>
        </div>
        <button class="btn ${got ? '' : 'primary'}" data-bundle="${b.id}" ${got ? 'disabled' : ''}>
          ${got ? '✔ ' + T('已領取') : 'FREE ' + T('領取')}</button>
      </div>`;
    }).join('');
    openModal(T('特惠禮包'), `
      <div class="hint">沙盒設計：所有禮包都是 <b style="color:var(--ok)">FREE</b>，點即發放，不串接任何商店。</div>
      ${rows}`);
    bind('bundles');
  }

  /* ---------- 補給站（Step 4 五項） ---------- */
  function tabSupply() {
    openModal(T('無限補給'), `
      <div class="hint">指揮官無限補給站：無需付費或外部修改，點擊即可無限領取。</div>
      <button class="btn wide primary" data-sup="gems">💎 ${T('領取 100 萬寶石')}</button>
      <button class="btn wide primary" data-sup="prestige">🌌 ${T('領取 100 萬星塵')}（${T('立即提升倍率')}）</button>
      <button class="btn wide" data-sup="weapons_unlock_all">🔫 ${T('全 10 種武器立即解鎖')}</button>
      <button class="btn wide" data-sup="satellites_max">🛰 ${T('全 6 顆衛星解鎖並升至滿星')}</button>
      <button class="btn wide gem" data-sup="all_in_one">👑 ${T('一鍵拉滿所有資源與等級')}</button>`);
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
    body.querySelectorAll('[data-ups5]').forEach((b) => b.addEventListener('click', () => {
      const n = State.upgradeSatelliteBulk(b.dataset.ups5, 5);
      if (!n) return toast('寶石不足或已滿級');
      State.save(); tabSats();
    }));
    body.querySelectorAll('[data-upw10]').forEach((b) => b.addEventListener('click', () => {
      let n = 0;
      for (let i = 0; i < 10; i++) {
        if (!State.upgradeWeapon(b.dataset.upw10).ok) break;
        n++;
      }
      if (!n) return toast('金幣不足');
      State.save(); tabWeapons();
    }));
    body.querySelectorAll('[data-upg]').forEach((b) => b.addEventListener('click', () => {
      const r = State.upgradeGear(b.dataset.upg);
      if (!r.ok) return toast(r.msg);
      State.save(); tabWeapons();
    }));
    body.querySelectorAll('[data-bundle]').forEach((b) => b.addEventListener('click', () => {
      const r = State.bundleClaim(b.dataset.bundle);
      if (!r.ok) return;
      State.save(); toast('Bundle granted'); tabBundles();
    }));
    body.querySelectorAll('[data-sup]').forEach((b) => b.addEventListener('click', () => {
      State.supply(b.dataset.sup);
      State.save(); renderHud();
      toast('+ granted');
      if (b.dataset.sup === 'all_in_one' || b.dataset.sup === 'satellites_max') global.Game.newPlanet();
    }));
    body.querySelectorAll('[data-pass]').forEach((b) => b.addEventListener('click', () => {
      State.passClaim(Number(b.dataset.pass));
      State.save(); tabPass();
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
      lastType = e.pointerType || 'mouse';
      const p = pos(e);
      global.Game.joyDown(p.x, p.y);
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const p = pos(e);
      global.Game.joyMove(p.x, p.y);
    });
    let lastType = 'mouse';
    const end = () => { if (dragging) { dragging = false; global.Game.joyUp(); } };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    /* 觸控拖曳在部分裝置/瀏覽器會先噴 pointerleave，若照樣收線會讓搖桿中途消失
       （飛船突然彈回軌道）→ 只讓滑鼠用 pointerleave 收線。 */
    canvas.addEventListener('pointerleave', (e) => { if ((e.pointerType || lastType) === 'mouse') end(); });
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
      else if (t === 'pass') tabPass();
      else if (t === 'bundles') tabBundles();
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
    openTab: (n) => ({ weapons: tabWeapons, sats: tabSats, skills: tabSkills, pass: tabPass, bundles: tabBundles, supply: tabSupply }[n] || (() => {})()),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
