/* game.js — 主循環、飛船、武器、衛星、物件池、渲染（不碰 DOM，除了 canvas） */
(function (global) {
  'use strict';

  const B = CFG.BALANCE;

  const G = {
    canvas: null, ctx: null, W: 0, H: 0, dpr: 1,
    planet: null, ship: null, running: false,
    time: 0, lastT: 0, acc: 0,
    bullets: [], floaters: [], drops: [], fx: [],
    bulletCursor: 0, floaterCursor: 0, dropCursor: 0, fxCursor: 0,
    joystick: { active: false, bx: 0, by: 0, x: 0, y: 0, releaseAt: 0 },
    laserTarget: null, laserRamp: 0,
    overdriveUntil: 0, chronoUntil: 0, chronoNext: 0,
    pendingClear: 0, planetIndex: 0,
    stats: { dpsSample: 0, dmgWindow: 0, dmgWindowAt: 0, fps: 60, fpsAcc: 0, fpsN: 0 },
  };

  const POOL = { bullets: 320, floaters: 140, drops: 220, fx: 90 };

  /* ---------------- 物件池 ---------------- */
  function initPools() {
    G.bullets = new Array(POOL.bullets).fill(null).map(() => ({ alive: false }));
    G.floaters = new Array(POOL.floaters).fill(null).map(() => ({ alive: false }));
    G.drops = new Array(POOL.drops).fill(null).map(() => ({ alive: false }));
    G.fx = new Array(POOL.fx).fill(null).map(() => ({ alive: false }));
  }
  function take(arr, cursorKey) {
    for (let i = 0; i < arr.length; i++) {
      const idx = (G[cursorKey] + i) % arr.length;
      if (!arr[idx].alive) { G[cursorKey] = (idx + 1) % arr.length; arr[idx].alive = true; return arr[idx]; }
    }
    return null;                       // 池滿就丟棄（保護效能）
  }

  function spawnBullet(x, y, tx, ty, dmg, color, kind, homing) {
    if (!dmg || dmg <= 0) return;
    const p = take(G.bullets, 'bulletCursor');
    if (!p) return;
    const dx = tx - x, dy = ty - y;
    const len = Math.hypot(dx, dy) || 1;
    const sp = kind === 'missile' ? 420 : 900;
    p.x = x; p.y = y; p.vx = dx / len * sp; p.vy = dy / len * sp;
    p.dmg = dmg; p.color = color; p.kind = kind || 'bullet';
    p.life = kind === 'missile' ? 2.4 : 1.1;
    p.tx = tx; p.ty = ty; p.homing = !!homing; p.splash = kind === 'mortar' ? 56 : 0;
    p.r = kind === 'missile' ? 3 : 2.4;
  }

  function spawnFloater(x, y, text, color) {
    const f = take(G.floaters, 'floaterCursor');
    if (!f) return;
    f.x = x; f.y = y; f.text = text; f.color = color || '#ffe08a';
    f.life = 0.85; f.vy = -46; f.vx = (Math.random() - 0.5) * 26;
  }

  function spawnDrop(x, y, kind, value) {
    const d = take(G.drops, 'dropCursor');
    if (!d) return;
    d.x = x; d.y = y; d.kind = kind; d.value = value;
    d.vx = (Math.random() - 0.5) * 90; d.vy = (Math.random() - 0.5) * 90;
    d.life = 12; d.r = kind === 'gem' ? 4 : 3;
  }

  function spawnFx(x, y, r, color, life) {
    const fx = take(G.fx, 'fxCursor');
    if (!fx) return;
    fx.x = x; fx.y = y; fx.r = r; fx.color = color; fx.life = life || 0.35; fx.max = fx.life;
  }

  /* ---------------- 初始化 / 換星球 ---------------- */
  function makeShip() {
    return { x: G.W / 2, y: G.H / 2 - 40, angle: 0, orbitAngle: 0, target: null,
             cd: {}, hitFlash: 0, overdrive: 0 };
  }

  function newPlanet() {
    const s = State.data;
    const cx = G.W / 2;
    const cy = G.H / 2 - 30;
    G.planet = Planet.makePlanet(s.sector, s.planet, cx, cy, G.W, G.H);
    G.planetIndex++;
    G.pendingClear = 0;
    G.laserTarget = null; G.laserRamp = 0;
    if (!G.ship) G.ship = makeShip();
    G.ship.x = cx; G.ship.y = cy - G.planet.radius - 40;
    G.ship.orbitAngle = -Math.PI / 2;
    G.ship.cd = {};
    G.overdriveUntil = 0;
  }

  /* ---------------- 傷害與掉落 ---------------- */
  function hit(block, dmg, opts) {
    if (!block || !block.alive) return null;
    const crit = Math.random() < State.critChance();
    const amount = dmg * (crit ? State.critMult() : 1);
    const res = Planet.damage(G.planet, block, amount, opts || {});
    if (!res) return null;
    G.stats.dmgWindow += amount;
    if (res.killed) {
      const goldMul = State.coinMul();
      const bits = [];
      if (res.gold) {
        const val = Math.max(1, Math.round(res.gold * CFG.ECON.coinBase * Math.pow(CFG.ECON.coinPerSector, G.planet.sector - 1) * goldMul));
        spawnDrop(block.x, block.y, 'gold', val);
        bits.push('+' + BIG.fmt(val));
      }
      if (res.gems) { spawnDrop(block.x, block.y, 'gem', res.gems); bits.push('+' + res.gems + ' G'); }
      spawnFloater(block.x, block.y, bits.join(' ') || '+' + BIG.fmt(amount), res.gems ? '#7ad7ff' : '#ffe08a');
      spawnFx(block.x, block.y, block.size * 0.6, CFG.BLOCK[block.type].edge, 0.28);
      if (res.energy) { G.overdriveUntil = G.time + 5; spawnFloater(block.x, block.y - 14, 'OVERDRIVE', '#8ef0a8'); }
      if (res.core) clearPlanet();
    } else {
      spawnFloater(block.x, block.y, BIG.fmt(amount), crit ? '#ff9f43' : '#e8eefc');
      spawnFx(block.x, block.y, block.size * 0.32, CFG.BLOCK[block.type].edge, 0.16);
    }
    return res;
  }

  function splash(x, y, radius, dmg) {
    const targets = Planet.nearestBlocks(G.planet, x, y, 40, radius);
    targets.forEach((b) => hit(b, dmg, { noChain: false }));
    spawnFx(x, y, radius, '#ffb36b', 0.3);
  }

  function clearPlanet() {
    if (G.pendingClear) return;
    G.pendingClear = G.time + 1.1;
    spawnFloater(G.planet.cx, G.planet.cy, 'PLANET CLEARED', '#ffd166');
    for (let i = 0; i < 18; i++) {
      spawnDrop(G.planet.cx + (Math.random() - 0.5) * 120, G.planet.cy + (Math.random() - 0.5) * 120, 'gold', 25);
    }
  }

  /* ---------------- 武器 ---------------- */
  function weaponReady(id, interval) {
    const ship = G.ship;
    const now = G.time;
    if ((ship.cd[id] || 0) > now) return false;
    ship.cd[id] = now + interval;
    return true;
  }

  function fireAll(dt) {
    const ship = G.ship;
    const atk = State.atk();
    const aspd = State.attackSpeed() * (G.overdriveUntil > G.time ? 2 : 1) * (G.chronoUntil > G.time ? 3 : 1) * State.speed();
    const target = ship.target;
    if (!target) return;

    State.data.equipped.forEach((id) => {
      const w = CFG.WEAPONS.find((x) => x.id === id);
      if (!w) return;
      const lv = State.weaponLevel(id);
      const dmg = atk * w.dmg * (1 + 0.22 * lv);
      const interval = w.interval / Math.max(0.2, aspd);

      switch (w.kind) {
        case 'melee':
          if (weaponReady(id, interval)) {
            const near = Planet.nearestBlocks(G.planet, ship.x, ship.y, 3, w.range + 40);
            near.forEach((b) => hit(b, dmg));
            spawnFx(ship.x, ship.y, 26, w.color, 0.12);
          }
          break;
        case 'bullet':
          if (weaponReady(id, interval)) {
            spawnBullet(ship.x, ship.y, target.x, target.y, dmg, w.color, 'bullet');
            if (State.data.satellites.mirror) {
              spawnBullet(ship.x, ship.y, target.x + 12, target.y, dmg * 0.5, '#a9d4ff', 'bullet');
            }
          }
          break;
        case 'splash':
          if (weaponReady(id, interval)) {
            spawnBullet(ship.x, ship.y, target.x, target.y, dmg, w.color, 'mortar');
          }
          break;
        case 'chain': {
          if (weaponReady(id, interval)) {
            let cur = target;
            const jumped = [];
            let d = dmg;
            for (let i = 0; i < B.chainJump; i++) {
              if (!cur || !cur.alive) break;
              jumped.push({ x: cur.x, y: cur.y });
              hit(cur, d);
              d *= 0.82;
              const nx = Planet.nearestBlocks(G.planet, cur.x, cur.y, 1, 150).filter((b) => jumped.indexOf(b) < 0)[0];
              cur = nx;
            }
            if (jumped.length > 1) for (let i = 0; i < jumped.length - 1; i++) {
              spawnFx((jumped[i].x + jumped[i + 1].x) / 2, (jumped[i].y + jumped[i + 1].y) / 2, 16, w.color, 0.18);
            }
          }
          break;
        }
        case 'orbit':
          if (weaponReady(id, 0.1)) {
            const t = G.time * 3;
            const ox = ship.x + Math.cos(t) * 62, oy = ship.y + Math.sin(t) * 62;
            const nb = Planet.nearestBlocks(G.planet, ox, oy, 4, 46);
            nb.forEach((b) => hit(b, dmg * 0.35));
            spawnFx(ox, oy, 16, w.color, 0.1);
          }
          break;
        case 'beam': {
          const sameTarget = G.laserTarget === target;
          G.laserRamp = sameTarget ? Math.min(6, G.laserRamp + dt * 1.6) : 0;
          G.laserTarget = target;
          if (weaponReady(id, interval)) hit(target, dmg * (1 + G.laserRamp));
          break;
        }
        case 'missile':
          if (weaponReady(id, interval)) {
            const n = B.missileCount + State.weaponLevel(id);
            for (let i = 0; i < n; i++) {
              const t2 = Planet.nearestBlocks(G.planet, target.x, target.y, n, 260)[i] || target;
              if (t2) spawnBullet(ship.x, ship.y, t2.x + (Math.random() - 0.5) * 30, t2.y + (Math.random() - 0.5) * 30,
                                  dmg * 0.5, w.color, 'missile', true);
            }
          }
          break;
        case 'blackhole':
          if (weaponReady(id, interval)) {
            G.blackholes = G.blackholes || [];
            G.blackholes.push({ x: target.x, y: target.y, until: G.time + B.blackholeDuration, next: 0, dmg: dmg * 0.25 });
            spawnFloater(target.x, target.y, 'SINGULARITY', w.color);
          }
          break;
        case 'nova':
          if (weaponReady(id, interval)) {
            const near = Planet.nearestBlocks(G.planet, ship.x, ship.y, 40, w.range);
            near.forEach((b) => { b.freeze = B.novaDuration; hit(b, dmg * 0.5); });
            spawnFx(ship.x, ship.y, w.range, w.color, 0.4);
          }
          break;
        case 'buster':
          if (weaponReady(id, interval)) {
            const col = G.planet.blocks.filter((b) => b.alive && Math.abs(b.x - ship.x) < G.planet.cell * 1.2);
            col.forEach((b) => hit(b, dmg));
            G.fxBusterUntil = G.time + 0.35;
            spawnFloater(ship.x, ship.y - 30, 'PLANET BUSTER', w.color);
          }
          break;
      }
    });
  }

  /* ---------------- 衛星 ---------------- */
  function satPositions() {
    const out = [];
    const list = CFG.SATELLITES.filter((s) => (State.data.satellites[s.id] | 0) > 0);
    list.forEach((s, i) => {
      const a = G.time * 0.9 + (Math.PI * 2 / Math.max(1, list.length)) * i;
      out.push({ s, x: G.ship.x + Math.cos(a) * 74, y: G.ship.y + Math.sin(a) * 74, a });
    });
    return out;
  }

  function tickSatellites(dt) {
    const sats = satPositions();
    G.satPos = sats;
    sats.forEach(({ s, x, y }) => {
      const lv = State.satLevel(s.id) || 1;
      if (s.id === 'bomber') {
        if (!G.bomberAt) G.bomberAt = 0;
        if (G.time > G.bomberAt) {
          G.bomberAt = G.time + Math.max(1.1, 3.0 - lv * 0.3);
          const t = Planet.randomAlive(G.planet);
          if (t) splash(t.x, t.y, 70 + lv * 6, State.atk() * 2.4 * lv);
        }
      } else if (s.id === 'beam') {
        const line = G.planet.blocks.filter((b) => b.alive && pointSegDist(b.x, b.y, G.ship.x, G.ship.y, x, y) < 22);
        line.forEach((b) => { if ((b._beamAt || 0) < G.time) { b._beamAt = G.time + 0.2; hit(b, State.atk() * 0.5 * lv); } });
      } else if (s.id === 'chrono') {
        if (G.time > (G.chronoNext || 0)) {
          G.chronoNext = G.time + 9;
          G.chronoUntil = G.time + 4;
          spawnFloater(G.ship.x, G.ship.y - 40, 'CHRONO ×3', s.color);
        }
      }
    });
  }

  function pointSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  /* ---------------- 更新 ---------------- */
  function updateShip(dt) {
    const ship = G.ship;
    const P = G.planet;
    const j = G.joystick;
    const manual = j.active || (j.releaseAt > 0 && G.time * 1000 < j.releaseAt);

    if (manual) {
      let dx = 0, dy = 0;
      if (j.active) {
        dx = j.x - j.bx; dy = j.y - j.by;
        const len = Math.hypot(dx, dy) || 1;
        const mag = Math.min(1, len / 60);
        dx = dx / len * mag; dy = dy / len * mag;
      }
      const sp = 260 * State.speed();
      ship.x += dx * sp * dt;
      ship.y += dy * sp * dt;
      ship.x = BIG.clamp(ship.x, 30, G.W - 30);
      ship.y = BIG.clamp(ship.y, 90, G.H - 40);
    } else {
      ship.orbitAngle += dt * 0.55 * State.speed() * (1 + 0.06 * (State.data.gear.engine - 1));
      ship.x = P.cx + Math.cos(ship.orbitAngle) * (P.radius + 46);
      ship.y = P.cy + Math.sin(ship.orbitAngle) * (P.radius + 46);
    }
    ship.target = Planet.nearestBlocks(P, ship.x, ship.y, 1, 900)[0] || null;
  }

  function updateBullets(dt) {
    G.bullets.forEach((p) => {
      if (!p.alive) return;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; return; }
      if (p.homing) {
        const t = Planet.nearestBlocks(G.planet, p.x, p.y, 1, 400)[0];
        if (t) {
          const dx = t.x - p.x, dy = t.y - p.y;
          const len = Math.hypot(dx, dy) || 1;
          p.vx = (p.vx * 0.85) + (dx / len) * 420 * 0.15;
          p.vy = (p.vy * 0.85) + (dy / len) * 420 * 0.15;
        }
      }
      /* 高速子彈（900px/s）會在一個 frame 內跳過 15px 的方塊 → 用子步進掃描 */
      const dist = Math.hypot(p.vx, p.vy) * dt;
      const steps = Math.max(1, Math.min(8, Math.ceil(dist / 6)));
      let hitBlock = null;
      for (let si = 0; si < steps && !hitBlock; si++) {
        p.x += p.vx * dt / steps; p.y += p.vy * dt / steps;
        if (p.x < -40 || p.x > G.W + 40 || p.y < -40 || p.y > G.H + 40) { p.alive = false; return; }
        hitBlock = G.planet.blocks.find((b) => b.alive
          && Math.abs(b.x - p.x) < b.size * 0.5 && Math.abs(b.y - p.y) < b.size * 0.5);
      }
      if (hitBlock) {
        if (p.splash) splash(p.x, p.y, p.splash, p.dmg);
        else hit(hitBlock, p.dmg);
        spawnFx(p.x, p.y, p.splash ? p.splash : 10, p.color, 0.16);
        p.alive = false;
      }
    });
  }

  function updateBlackholes(dt) {
    if (!G.blackholes) return;
    G.blackholes = G.blackholes.filter((bh) => bh.until > G.time);
    G.blackholes.forEach((bh) => {
      if (G.time < bh.next) return;
      bh.next = G.time + 0.25;
      const near = Planet.nearestBlocks(G.planet, bh.x, bh.y, 12, 110);
      near.forEach((b) => hit(b, bh.dmg));
      spawnFx(bh.x, bh.y, 100, '#b48cff', 0.3);
    });
  }

  function updateDrops(dt) {
    const r = State.collectRadius();
    G.drops.forEach((d) => {
      if (!d.alive) return;
      d.life -= dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.vx *= 0.94; d.vy *= 0.94;
      const dx = G.ship.x - d.x, dy = G.ship.y - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < r && dist > 1) {
        const pull = 620 * dt / Math.max(12, dist);
        d.x += dx * pull; d.y += dy * pull;
      }
      if (dist < 22) {
        if (d.kind === 'gold') State.data.gold += d.value;
        else State.data.gems += d.value;
        d.alive = false;
      }
      if (d.life <= 0) {
        if (d.kind === 'gold') State.data.gold += d.value; else State.data.gems += d.value;
        d.alive = false;
      }
    });
  }

  function updateTimers(dt) {
    if (G.pendingClear && G.time >= G.pendingClear) {
      G.pendingClear = 0;
      State.onPlanetCleared();
      State.save();
      newPlanet();
    }
    G.planet.blocks.forEach((b) => { if (b.freeze > 0) b.freeze -= dt; });
    G.planet.chainQueue && Planet.tickChains(G.planet, performance.now(), (from, radius) => {
      spawnFx(from.x, from.y, 40 + radius * 22, '#ff8a6b', 0.3);
    });
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    const c = G.ctx;
    c.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    c.fillStyle = '#05060f';
    c.fillRect(0, 0, G.W, G.H);

    /* 星空 */
    if (!G.stars) {
      G.stars = [];
      for (let i = 0; i < 90; i++) G.stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.4 });
    }
    c.fillStyle = 'rgba(200,215,255,.55)';
    G.stars.forEach((s) => { c.fillRect(s.x * G.W, s.y * G.H, s.r, s.r); });

    const P = G.planet;
    /* 星球光暈 */
    const grd = c.createRadialGradient(P.cx, P.cy, P.radius * 0.2, P.cx, P.cy, P.radius * 1.25);
    grd.addColorStop(0, 'rgba(90,120,255,.18)');
    grd.addColorStop(1, 'rgba(20,20,60,0)');
    c.fillStyle = grd;
    c.beginPath(); c.arc(P.cx, P.cy, P.radius * 1.25, 0, Math.PI * 2); c.fill();

    /* 方塊 */
    P.blocks.forEach((b) => {
      if (!b.alive) return;
      const def = CFG.BLOCK[b.type];
      const s = b.size - 1.5;
      const half = s / 2;
      c.fillStyle = def.color;
      c.fillRect(b.x - half, b.y - half, s, s);
      c.strokeStyle = def.edge;
      c.globalAlpha = 0.55;
      c.lineWidth = 1;
      c.strokeRect(b.x - half, b.y - half, s, s);
      c.globalAlpha = 1;
      /* 血條 */
      const ratio = Math.max(0, b.hp / b.maxHp);
      if (ratio < 1) {
        c.fillStyle = 'rgba(0,0,0,.55)';
        c.fillRect(b.x - half, b.y - half - 3, s, 2.4);
        c.fillStyle = b.freeze > 0 ? '#9be7ff' : ratio > 0.5 ? '#8ef0a8' : ratio > 0.25 ? '#ffd166' : '#ff6b6b';
        c.fillRect(b.x - half, b.y - half - 3, s * ratio, 2.4);
      }
      if (b.freeze > 0) {
        c.strokeStyle = 'rgba(155,231,255,.85)';
        c.strokeRect(b.x - half - 1, b.y - half - 1, s + 2, s + 2);
      }
    });

    /* 黑洞 */
    (G.blackholes || []).forEach((bh) => {
      c.beginPath();
      c.arc(bh.x, bh.y, 26 + Math.sin(G.time * 6) * 4, 0, Math.PI * 2);
      c.fillStyle = 'rgba(180,140,255,.35)';
      c.fill();
      c.strokeStyle = 'rgba(210,180,255,.8)';
      c.stroke();
    });

    /* 採集範圍 */
    c.beginPath();
    c.arc(G.ship.x, G.ship.y, State.collectRadius(), 0, Math.PI * 2);
    c.strokeStyle = 'rgba(142,240,168,.10)';
    c.stroke();

    /* 衛星與連線 */
    (G.satPos || []).forEach(({ s, x, y }) => {
      if (s.id === 'beam') {
        c.strokeStyle = 'rgba(255,122,217,.55)';
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(G.ship.x, G.ship.y); c.lineTo(x, y); c.stroke();
        c.lineWidth = 1;
      }
      c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2);
      c.fillStyle = s.color; c.fill();
      c.strokeStyle = 'rgba(255,255,255,.5)'; c.stroke();
    });

    /* 子彈 */
    G.bullets.forEach((p) => {
      if (!p.alive) return;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fillStyle = p.color; c.fill();
    });

    /* 殲星主砲光束 */
    if (G.fxBusterUntil > G.time) {
      c.fillStyle = 'rgba(255,107,107,.35)';
      c.fillRect(G.ship.x - 16, 0, 32, G.H);
    }

    /* 飛船 */
    const ship = G.ship;
    c.save();
    c.translate(ship.x, ship.y);
    c.rotate(Math.atan2((ship.target ? ship.target.y : ship.y + 1) - ship.y,
                        (ship.target ? ship.target.x : ship.x + 1) - ship.x));
    c.beginPath();
    c.moveTo(12, 0); c.lineTo(-8, 7); c.lineTo(-8, -7); c.closePath();
    c.fillStyle = '#ffffff'; c.fill();
    c.strokeStyle = '#7ad7ff'; c.stroke();
    c.restore();

    /* 掉落 */
    G.drops.forEach((d) => {
      if (!d.alive) return;
      c.beginPath();
      c.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      c.fillStyle = d.kind === 'gem' ? '#7ad7ff' : '#ffd166';
      c.fill();
    });

    /* 特效環 */
    G.fx.forEach((f) => {
      if (!f.alive) return;
      const t = 1 - f.life / f.max;
      c.beginPath();
      c.arc(f.x, f.y, f.r * (0.4 + t * 0.9), 0, Math.PI * 2);
      c.strokeStyle = f.color;
      c.globalAlpha = Math.max(0, 1 - t);
      c.lineWidth = 2;
      c.stroke();
      c.globalAlpha = 1;
      c.lineWidth = 1;
    });

    /* 浮動數字 */
    c.textAlign = 'center';
    c.font = 'bold 12px -apple-system, "Helvetica Neue", Arial, sans-serif';
    G.floaters.forEach((f) => {
      if (!f.alive) return;
      c.globalAlpha = Math.max(0, Math.min(1, f.life / 0.45));
      c.fillStyle = f.color;
      c.fillText(f.text, f.x, f.y);
      c.globalAlpha = 1;
    });

    /* 操作提示 */
    if (G.joystick.active) {
      c.beginPath();
      c.arc(G.joystick.bx, G.joystick.by, 44, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(255,255,255,.25)'; c.stroke();
      c.beginPath();
      c.arc(G.joystick.bx + (G.joystick.x - G.joystick.bx) * 0.6,
            G.joystick.by + (G.joystick.y - G.joystick.by) * 0.6, 18, 0, Math.PI * 2);
      c.fillStyle = 'rgba(122,215,255,.5)'; c.fill();
    }
  }

  /* ---------------- 主循環 ---------------- */
  function step(now) {
    if (!G.running) return;
    const rawDt = Math.min(0.05, (now - G.lastT) / 1000 || 0.016);
    G.lastT = now;
    const dt = rawDt * State.speed();

    G.time += dt;
    G.stats.fpsAcc += rawDt; G.stats.fpsN++;
    if (G.stats.fpsAcc > 0.5) {
      G.stats.fps = Math.round(G.stats.fpsN / G.stats.fpsAcc);
      G.stats.fpsAcc = 0; G.stats.fpsN = 0;
    }

    updateShip(rawDt * State.speed());
    fireAll(dt);
    tickSatellites(dt);
    updateBullets(dt);
    updateBlackholes(dt);
    updateDrops(dt);
    updateTimers(dt);

    G.floaters.forEach((f) => {
      if (!f.alive) return;
      f.life -= rawDt; f.y += f.vy * rawDt; f.x += f.vx * rawDt;
      if (f.life <= 0) f.alive = false;
    });
    G.fx.forEach((f) => { if (!f.alive) return; f.life -= rawDt; if (f.life <= 0) f.alive = false; });

    render();
    if (G.onTick) G.onTick(rawDt);
    requestAnimationFrame(step);
  }

  function resize(w, h, dpr) {
    G.W = w; G.H = h; G.dpr = dpr || 1;
    G.canvas.width = Math.round(w * G.dpr);
    G.canvas.height = Math.round(h * G.dpr);
    G.canvas.style.width = w + 'px';
    G.canvas.style.height = h + 'px';
    if (G.planet) newPlanet();
  }

  function init(canvas) {
    G.canvas = canvas;
    G.ctx = canvas.getContext('2d');
    initPools();
    G.running = true;
    G.lastT = performance.now();
    newPlanet();
    requestAnimationFrame(step);
  }

  /* 手動操控 */
  function joyDown(x, y) { Object.assign(G.joystick, { active: true, bx: x, by: y, x, y, releaseAt: 0 }); }
  function joyMove(x, y) { G.joystick.x = x; G.joystick.y = y; }
  function joyUp() { G.joystick.active = false; G.joystick.releaseAt = (G.time + 1.5) * 1000; }

  global.Game = {
    G, init, resize, newPlanet, hit, splash,
    joyDown, joyMove, joyUp,
    clearPlanetNow() { clearPlanet(); if (G.pendingClear) G.pendingClear = G.time + 0.01; },
    get planet() { return G.planet; },
    get ship() { return G.ship; },
    get fps() { return G.stats.fps; },
  };
})(window);
