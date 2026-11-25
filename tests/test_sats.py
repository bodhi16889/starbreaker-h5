#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Step 3 衛星系統測試（6 顆各自軌道 + 各自能力）

用法：/usr/bin/python3 tests/test_sats.py
"""
import functools
import http.server
import json
import math
import os
import socketserver
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8899
PASS, FAIL = [], []


def ok(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()


def main():
    serve()
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        p = ctx.new_page()
        errs = []
        p.on("pageerror", lambda e: errs.append(str(e)[:200]))
        p.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="load")
        p.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        time.sleep(0.8)

        # ---------- 設定：6 顆各有自己的半徑與轉速 ----------
        cfg = p.evaluate("""(() => CFG.SATELLITES.map(s => ({id:s.id, r:s.radius, sp:s.speed})))()""")
        radii = [c["r"] for c in cfg]
        speeds = [c["sp"] for c in cfg]
        ok("6 顆衛星各有軌道半徑（不是全部同一個圈）", len(set(radii)) >= 4, str(radii))
        ok("有正向與逆向公轉（speed 正負都有）",
           any(s > 0 for s in speeds) and any(s < 0 for s in speeds), str(speeds))

        # ---------- 未解鎖時不該出現 ----------
        empty = p.evaluate("""(() => { State.data.satellites = {}; return {n: __game.Game.satPositions.length}; })()""")
        time.sleep(0.5)
        empty2 = p.evaluate("__game.Game.satPositions.length")
        ok("沒有衛星時不渲染任何軌道單位", empty2 == 0, str(empty2))

        # ---------- 全解鎖：位置在半徑上、彼此不重疊 ----------
        pos = p.evaluate("""(async () => {
            State.data.satellites = { collector:3, bomber:3, beam:3, mirror:3, crit:3, chrono:3 };
            await new Promise(r => setTimeout(r, 700));
            const ship = __game.Game.ship;
            return __game.Game.satPositions.map(s => ({
                id: s.s.id, lv: s.lv,
                r: Math.hypot(s.x - ship.x, s.y - ship.y),
                x: s.x, y: s.y
            }));
        })()""")
        ok("六顆都出現", len(pos) == 6, str(len(pos)))
        bad_r = [round(x["r"], 1) for x in pos
                 if abs(x["r"] - next(c["r"] for c in cfg if c["id"] == x["id"])) > 2.5]
        ok("每顆都在自己的軌道半徑上（誤差 <2.5px）", bad_r == [], str(bad_r))
        uniq = {(round(x["x"]), round(x["y"])) for x in pos}
        ok("六顆位置不重疊", len(uniq) == 6, str(len(uniq)))

        # ---------- 各衛星能力真的在跑（用統計計數） ----------
        p.evaluate("""(() => {
            const st = __game.Game.G.satStats;
            Object.keys(st).forEach(k => { st[k] = 0; });
        })()""")
        time.sleep(4.5)
        stats = p.evaluate("Object.assign({}, __game.Game.G.satStats)")
        ok("採集衛星會抽金幣（collectorGold > 0）", stats["collectorGold"] > 0, str(stats["collectorGold"]))
        ok("爆破衛星會投彈（bomber > 0）", stats["bomber"] > 0, str(stats["bomber"]))
        ok("雷射衛星會切割方塊（beam > 0）", stats["beam"] > 0, str(stats["beam"]))
        ok("複製衛星會補傷害（mirror > 0）", stats["mirror"] > 0, str(stats["mirror"]))
        ok("暴擊／時空衛星有放環特效（ring > 0）", stats["ring"] > 0, str(stats["ring"]))

        # ---------- 傷害公式（Step 3：mult × 1.24^(lv-1) × 18 × 星塵 × 星區） ----------
        dmg = p.evaluate("""(() => {
            State.data.prestigeMult = 1; State.data.sector = 1;
            const l1 = __game.Game.satDamage(1, 3);
            const l5 = __game.Game.satDamage(5, 3);
            State.data.sector = 2;
            const s2 = __game.Game.satDamage(5, 3);
            State.data.sector = 1;
            return {l1: +l1.toFixed(2), l5: +l5.toFixed(2), s2: +s2.toFixed(2)};
        })()""")
        ok("衛星傷害 1 級 = 3 × 18 = 54", abs(dmg["l1"] - 54) < 0.01, str(dmg["l1"]))
        ok("每級 ×1.24（5 級 ≈ 54 × 2.23）", abs(dmg["l5"] / dmg["l1"] - 1.24 ** 4) < 0.02,
           f"{dmg['l5']} / {dmg['l1']}")
        ok("星區成長（第 2 星區 ×1.35）", abs(dmg["s2"] / dmg["l5"] - 1.35) < 0.02,
           f"{dmg['s2']} / {dmg['l5']}")

        # ---------- 只留採集衛星：金幣要靠它成長 ----------
        solo = p.evaluate("""(async () => {
            State.data.satellites = { collector: 5 };
            State.data.equipped = ['buster'];      // 6 秒一發，把武器傷害降到最低
            const g0 = State.data.gold;
            await new Promise(r => setTimeout(r, 3500));
            return {gold0: g0, gold1: State.data.gold, collected: __game.Game.G.satStats.collectorGold};
        })()""")
        ok("只有採集衛星時金幣仍有成長", solo["gold1"] > solo["gold0"], json.dumps(solo))

        ok("沒有 pageerror", len(errs) == 0, str(errs[:2]))
        p.screenshot(path=os.path.join(ROOT, "artifacts", "sats-step3.png"))
        b.close()

    print(f"\n{'='*46}\n{len(PASS)} PASS / {len(FAIL)} FAIL")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
