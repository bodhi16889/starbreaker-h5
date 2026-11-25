/* planet.js — 星球生成、方塊傷害、連鎖爆炸（純資料，不碰 DOM） */
(function (global) {
  'use strict';

  function makePlanet(sector, planet, cx, cy, viewW, viewH) {
    const P = CFG.PLANET;
    const grid = Math.min(P.gridMax, P.gridMin + (sector - 1) * 2);
    const cell = Math.max(8, Math.floor(Math.min(viewW, viewH) * 0.86 / grid));   // 下限：避免量到 0 高度時產生 0 尺寸
    const half = (grid - 1) / 2;
    const baseHp = P.hpBase * Math.pow(P.hpPerSector, sector - 1) * Math.pow(P.hpPerPlanet, planet - 1);

    const blocks = [];
    const mid = Math.floor(grid / 2);
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const dx = gx - half, dy = gy - half;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > grid / 2) continue;
        const isCore = Math.abs(gx - mid) <= P.coreRadius && Math.abs(gy - mid) <= P.coreRadius;
        let type = 'normal';
        if (isCore) type = 'core';
        else {
          const r = Math.random();
          const bombRate = State.bombChance();
          if (r < bombRate) type = 'bomb';
          else if (r < bombRate + 0.07) type = 'gold';
          else if (r < bombRate + 0.13) type = 'energy';
        }
        const def = CFG.BLOCK[type];
        let hp = baseHp;
        if (type === 'gold') hp *= P.goldMul;
        else if (type === 'energy') hp *= P.energyMul;
        else if (type === 'bomb') hp *= P.bombMul;
        else if (type === 'core') hp *= P.coreMul;
        blocks.push({
          gx, gy, type, hp, maxHp: hp, alive: true,
          x: cx + (gx - half) * cell, y: cy + (gy - half) * cell,
          size: cell, freeze: 0, burning: 0,
        });
      }
    }

    return {
      sector, planet, grid, cell, cx, cy,
      blocks,
      alive: blocks.length,
      total: blocks.length,
      radius: (grid / 2) * cell,
      chainQueue: [],
    };
  }

  function neighbors(planet, block, radius) {
    const r = Math.max(1, radius | 0);
    const out = [];
    for (const b of planet.blocks) {
      if (!b.alive || b === block) continue;
      if (Math.abs(b.gx - block.gx) <= r && Math.abs(b.gy - block.gy) <= r) out.push(b);
    }
    return out;
  }

  /* 回傳 { broken, gold, gems, chain } —— 由 game.js 決定實際發放 */
  function damage(planet, block, amount, opts) {
    if (!block || !block.alive) return null;
    opts = opts || {};
    let dmg = amount;
    if (block.freeze > 0) dmg *= CFG.BALANCE.novaAmp;
    block.hp -= dmg;
    if (block.hp > 0) return { hit: true, block, dmg };

    block.alive = false;
    block.hp = 0;
    planet.alive--;
    State.onBlockBroken(block.type);

    const def = CFG.BLOCK[block.type];
    const res = { hit: true, block, killed: true, dmg,
                  gold: def.drop, gems: 0, chain: 0, core: block.type === 'core' };

    if (def.gemChance) {
      const bonus = 1 + State.skillTotals().gemChance;
      if (Math.random() < Math.min(0.9, def.gemChance * bonus)) res.gems = CFG.ECON.gemBase * planet.sector;
    }

    if (block.type === 'bomb' && !opts.noChain) {
      /* 易爆方塊：0.05 秒後對 3x3（受技能加寬）造成百分比傷害，可連鎖 */
      planet.chainQueue.push({
        at: performance.now() + CFG.BALANCE.chainDelay * 1000,
        from: block, depth: (opts.depth || 0) + 1,
      });
    }
    if (block.type === 'energy') res.energy = true;
    return res;
  }

  /* 每幀處理連鎖佇列，回傳這幀總共連鎖炸掉幾顆 */
  function tickChains(planet, now, onBoom) {
    let count = 0;
    for (let i = planet.chainQueue.length - 1; i >= 0; i--) {
      const q = planet.chainQueue[i];
      if (now < q.at) continue;
      planet.chainQueue.splice(i, 1);
      if (q.depth > 8) continue;                    // 防止無限遞迴
      const radius = State.chainRadius();
      const near = neighbors(planet, q.from, radius);
      if (onBoom) onBoom(q.from, radius);
      near.forEach((b) => {
        const pct = CFG.BALANCE.bombPercent * q.from.maxHp;
        const r = damage(planet, b, Math.max(pct, b.maxHp * 0.28),
                         { noChain: false, depth: q.depth });
        if (r && r.killed) count++;
      });
    }
    return count;
  }

  function nearestBlocks(planet, x, y, count, maxDist) {
    const out = [];
    const lim = (maxDist || 1e9) * (maxDist || 1e9);
    for (const b of planet.blocks) {
      if (!b.alive) continue;
      const dx = b.x - x, dy = b.y - y;
      const d = dx * dx + dy * dy;
      if (d > lim) continue;
      out.push({ b, d });
    }
    out.sort((p, q) => p.d - q.d);
    return out.slice(0, count || 1).map((o) => o.b);
  }

  function randomAlive(planet) {
    const alive = planet.blocks.filter((b) => b.alive);
    return alive.length ? alive[Math.floor(Math.random() * alive.length)] : null;
  }

  global.Planet = { makePlanet, damage, tickChains, neighbors, nearestBlocks, randomAlive };
})(window);
