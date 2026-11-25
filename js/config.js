/* config.js — 全部平衡參數集中在這裡（其他檔案不得硬編碼數字） */
(function (global) {
  'use strict';

  const VERSION = '0.2.0';

  /* ---------- 星球與方塊 ---------- */
  const PLANET = {
    gridMin: 11,            // 星區 1 的網格邊長
    gridMax: 25,            // 上限（手機效能）
    hpBase: 90,             // 第一顆星球的方塊基礎血量
    hpPerSector: 1.85,      // 每個星區血量成長
    hpPerPlanet: 1.12,      // 同一星區內每顆星球成長
    coreMul: 6,             // 核心方塊血量倍率
    goldMul: 3.2,           // 黃金方塊血量倍率
    energyMul: 1.6,
    bombMul: 1.25,
    coreRadius: 1,          // 核心佔的格數半徑
  };

  const BLOCK = {
    normal:   { key: 'normal',   color: '#5b6b8c', edge: '#8fa3c8', drop: 1 },
    gold:     { key: 'gold',     color: '#c9a227', edge: '#ffe08a', drop: 10, gemChance: 0.06 },
    energy:   { key: 'energy',   color: '#2f7fa8', edge: '#7ad7ff', drop: 2 },
    bomb:     { key: 'bomb',     color: '#a83a2f', edge: '#ff8a6b', drop: 2 },
    core:     { key: 'core',     color: '#7a3fb8', edge: '#d2a8ff', drop: 40, gemChance: 0.5 },
  };

  /* ---------- 掉落與經濟 ---------- */
  const ECON = {
    coinBase: 4,            // 每格基礎金幣（乘上星區成長）
    coinPerSector: 2.4,
    gemChance: 0.02,        // 普通格掉寶石機率
    gemBase: 1,
    prestigePerPlanet: 3,   // 每清完一顆星球給的星塵（轉生點）
    autoCollectRadius: 260, // 採集半徑（像素，之後乘 hull 加成）
  };

  /* ---------- 技能（骰子抽） ---------- */
  const RARITY = [
    { key: 'common', name: '普通', color: '#9fb0c8', mul: 1.0 },
    { key: 'rare', name: '稀有', color: '#5aa9ff', mul: 2.0 },
    { key: 'epic', name: '史詩', color: '#b06bff', mul: 4.0 },
    { key: 'legend', name: '傳奇', color: '#ff9f43', mul: 8.0 },
    { key: 'myth', name: '神話', color: '#ff5470', mul: 16.0 },
  ];

  const SKILLS = [
    { id: 'dmg',    name: '額外傷害',   per: 0.15, kind: 'damage',  desc: '全武器傷害 +15%' },
    { id: 'coin',   name: '金幣掉落',   per: 0.25, kind: 'coin',    desc: '金幣掉落 +25%' },
    { id: 'bomb',   name: '易爆生成',   per: 0.12, kind: 'bombRate',desc: '易爆方塊生成率 +12%' },
    { id: 'chain',  name: '連鎖範圍',   per: 0.6,  kind: 'chain',   desc: '連鎖爆炸半徑 +0.6 格' },
    { id: 'atkSpd', name: '攻速',       per: 0.12, kind: 'atkSpeed',desc: '攻速 +12%' },
    { id: 'crit',   name: '暴擊率',     per: 0.05, kind: 'crit',    desc: '暴擊率 +5%' },
    { id: 'critDmg',name: '暴擊傷害',   per: 0.4,  kind: 'critDmg', desc: '暴擊傷害 +40%' },
    { id: 'pierce', name: '穿透',       per: 0.25, kind: 'pierce',  desc: '子彈穿透 +25%' },
    { id: 'collect',name: '採集範圍',   per: 0.2,  kind: 'collect', desc: '資源吸附範圍 +20%' },
    { id: 'gem',    name: '寶石掉落',   per: 0.2,  kind: 'gemChance',desc: '寶石掉落 +20%' },
  ];

  const DICE = { cost: 25, tenCost: 220, hundredCost: 2000 };   // 寶石

  /* ---------- 武器（10 種） ---------- */
  /* interval = 每次射擊間隔（秒）；dmg = 每發基礎傷害倍率（乘上 atk） */
  const WEAPONS = [
    { id: 'lance',   name: '鑽頭長矛',   color: '#7ad7ff', dmg: 0.70, interval: 0.16, range: 92,  kind: 'melee',  desc: '近距離高頻穿透刺擊' },
    { id: 'gatling', name: '電漿機槍',   color: '#8ef0a8', dmg: 0.50, interval: 0.10, range: 420, kind: 'bullet', desc: '高速單體，越射越快' },
    { id: 'mortar',  name: '重型迫擊炮', color: '#ffb36b', dmg: 1.80, interval: 1.30, range: 460, kind: 'splash', desc: '拋物線範圍爆炸' },
    { id: 'chain',   name: '連鎖電弧',   color: '#a9d4ff', dmg: 0.70, interval: 0.85, range: 300, kind: 'chain',  desc: '命中後在方塊間彈跳' },
    { id: 'saw',     name: '軌道圓鋸',   color: '#d9e6ff', dmg: 0.90, interval: 0.35, range: 60,  kind: 'orbit',  desc: '繞飛船旋轉持續切割' },
    { id: 'laser',   name: '聚能雷射',   color: '#ff7ad9', dmg: 0.45, interval: 0.12, range: 520, kind: 'beam',   desc: '持續照射同目標傷害翻倍' },
    { id: 'missile', name: '追蹤微飛彈', color: '#ffd166', dmg: 0.65, interval: 0.70, range: 560, kind: 'missile',desc: '發射多枚追蹤飛彈' },
    { id: 'gravity', name: '重力黑洞砲', color: '#b48cff', dmg: 1.10, interval: 1.60, range: 380, kind: 'blackhole',desc: '黑洞集中碾壓' },
    { id: 'cryo',    name: '冰霜新星',   color: '#9be7ff', dmg: 0.50, interval: 1.10, range: 260, kind: 'nova',   desc: '凍結範圍，受創 +200%' },
    { id: 'buster',  name: '殲星主砲',   color: '#ff6b6b', dmg: 12.0, interval: 6.00, range: 900, kind: 'buster', desc: '貫穿整顆星球的毀滅光束' },
  ];

  /* ---------- 衛星（6 種） ---------- */
  /* radius / speed 照 Step 3 的 SAT_CONFIGS：每顆有自己的軌道半徑與轉速（負值＝逆向） */
  const SATELLITES = [
    { id: 'collector', name: '採集衛星', color: '#33f28c', radius: 85,  speed: 2.4,  desc: '定期抽取金幣與寶石' },
    { id: 'bomber',    name: '爆破衛星', color: '#ff6626', radius: 105, speed: 1.8,  desc: '定期投擲高爆核彈（範圍 115）' },
    { id: 'beam',      name: '雷射衛星', color: '#26d9ff', radius: 115, speed: 2.1,  desc: '與飛船連線切割沿途方塊' },
    { id: 'mirror',    name: '複製衛星', color: '#d959ff', radius: 95,  speed: -2.2, desc: '複製主武器彈幕（隨等級提升）' },
    { id: 'crit',      name: '暴擊衛星', color: '#ffd933', radius: 130, speed: 1.5,  desc: '+50% 暴擊率 / +300% 暴傷' },
    { id: 'chrono',    name: '時空衛星', color: '#8cbfff', radius: 130, speed: -1.5, desc: '週期性 3 倍攻速' },
  ];

  /* 衛星能力（Step 3 數值）：傷害 = mult × 1.24^(lv-1) × 18 × 星塵倍率 × 星區成長 */
  const SAT = {
    dmgBase: 18,
    dmgGrow: 1.24,
    sectorGrow: 1.35,
    collector: { interval: 1.5, minInterval: 0.35, perLv: 0.02, gold: 25, gemChance: 0.25 },
    bomber:    { interval: 1.8, minInterval: 0.45, perLv: 0.025, radius: 115, dmgMult: 12 },
    mirror:    { interval: 0.28, ratioBase: 0.5, ratioPerLv: 0.01, dmgMult: 2.2 },
    beam:      { tick: 0.1, width: 26, dmgMult: 3.0 },
    ring:      { interval: 4.0, radius: 36 },
  };

  /* ---------- 裝備（3 件） ---------- */
  const GEAR = [
    { id: 'hull',    name: '船體',      per: 0.10, desc: '碰撞傷害與吸附範圍' },
    { id: 'reactor', name: '反應堆核心', per: 0.12, desc: '全武器攻擊力' },
    { id: 'engine',  name: '引擎',      per: 0.08, desc: '環繞速度與攻速' },
  ];

  /* ---------- 通行證（50 階，全部預設解鎖） ---------- */
  const PASS_TIERS = (() => {
    const out = [];
    for (let i = 1; i <= 50; i++) {
      const big = i % 10 === 0;
      out.push({
        tier: i,
        gems: Math.round(120 * Math.pow(1.14, i) * (big ? 6 : 1)),
        prestige: big ? 250 * (i / 10) : 0,
        ticket: big ? 20 : 2,
        scrap: Math.round(60 * Math.pow(1.1, i)),
      });
    }
    return out;
  })();

  /* ---------- 禮包（全部 FREE） ---------- */
  const BUNDLES = [
    { id: 'starter', name: '新手啟航包',   gems: 5e5,  prestige: 2e4,  scrap: 5e4,  ticket: 100, mul: { damage: 1.5 } },
    { id: 'drill',   name: '無限鑽探禮包', gems: 2e6,  prestige: 1e5,  scrap: 3e5,  ticket: 300, mul: { coin: 2.0 } },
    { id: 'arsenal', name: '全武器解鎖包', gems: 3e6,  prestige: 2e5,  scrap: 6e5,  ticket: 500, mul: { damage: 2.0 } },
    { id: 'vip',     name: '永久免廣告 + 3 倍速', gems: 1e7, prestige: 1e6, scrap: 1e6, ticket: 1000, mul: { speed: 3, noAds: 1 } },
  ];

  /* ---------- 補給站（可無限點） ---------- */
  const SUPPLY = { gems: 1e6, prestige: 1e6, ticket: 100, scrap: 1e6 };

  /* ---------- 平衡 ---------- */
  const BALANCE = {
    atkBase: 12,            // 基礎攻擊力
    atkPerReactor: 0.12,
    critBase: 0.05,
    critDmgBase: 1.6,
    chainJump: 5,           // 連鎖電弧基礎跳數
    missileCount: 6,
    blackholeDuration: 2.2,
    novaDuration: 3.0,
    novaAmp: 3.0,           // 凍結期間受創倍率
    bombPercent: 0.42,      // 易爆方塊對鄰格的百分比傷害
    chainDelay: 0.05,
    planetClearBonus: 12,   // 清完星球的金幣倍率
    weaponSlots: 4,
  };

  /* ---------- i18n（預設英文，?lang=zh 走中文原文） ---------- */
  const EN = {
    '金幣': 'Gold', '寶石': 'Gems', '星塵': 'Stardust', '零件': 'Scrap', '星區': 'Sector',
    '補給站': 'Supply', '武器': 'Weapons', '衛星': 'Satellites', '技能': 'Skills', '裝備': 'Gear',
    '通行證': 'Pass', '關閉': 'Close', '領取': 'Claim', '全部領取': 'Claim all', '升級': 'Upgrade',
    '一鍵升級': 'Upgrade all', '已滿級': 'MAX', '擲骰': 'Roll', '十連': 'Roll ×10', '百連': 'Roll ×100',
    '一鍵融合': 'Fuse all', '已解鎖': 'UNLOCKED', '免費': 'FREE', '倒數': 'Next core clears',
    '星際通行證': 'Galaxy Pass', '特惠禮包': 'Bundles', '無限補給': 'Unlimited Supply',
    '領取 100 萬寶石': '+1M Gems', '領取 100 萬星塵': '+1M Stardust', '衛星全解鎖': 'Unlock all satellites',
    '免費百連券': '+100 dice tickets', '轉生': 'Prestige', '永久加成': 'Permanent bonus',
    '戰力': 'Power', '暴擊': 'Crit', '攻速': 'Atk spd', '採集': 'Collect', '爆炸': 'Chain',
    '本星球剩餘': 'Blocks left', '星球': 'Planet', '速度': 'Speed',
  };

  function T(zh) { return (global.LANG === 'zh') ? zh : (EN[zh] || zh); }

  global.CFG = {
    VERSION, PLANET, BLOCK, ECON, RARITY, SKILLS, DICE, WEAPONS, SATELLITES, GEAR,
    PASS_TIERS, BUNDLES, SUPPLY, BALANCE, SAT, T, EN,
  };
})(window);
