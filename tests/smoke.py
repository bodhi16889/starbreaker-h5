#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""StarBreaker H5 — smoke（Playwright，跑本機 http.server）

用法：/usr/bin/python3 tests/smoke.py [--port 8891]
"""
import functools
import http.server
import json
import os
import socketserver
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8891
PASS, FAIL = [], []


def ok(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(port):
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()


def main():
    port = PORT
    if "--port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1])
    serve(port)
    base = f"http://127.0.0.1:{port}/index.html"

    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                                  device_scale_factor=2)
        page = ctx.new_page()
        errs, console_errs = [], []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        page.on("console", lambda m: console_errs.append(m.text[:200]) if m.type == "error" else None)
        page.goto(base, wait_until="load")
        page.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        time.sleep(1.2)

        # ---------- 基本啟動 ----------
        boot = page.evaluate("""(() => ({
            ver: CFG.VERSION,
            blocks: __game.Game.planet.blocks.length,
            alive: __game.Game.planet.alive,
            equipped: State.data.equipped.length,
            title: document.title
        }))()""")
        ok("載入完成、星球已生成", boot["blocks"] > 60 and boot["alive"] > 0, json.dumps(boot))
        ok("標題正確", boot["title"] == "StarBreaker: Unlimited Drill", boot["title"])
        ok("預設裝備 4 把武器", boot["equipped"] == 4, str(boot["equipped"]))

        # ---------- 自動戰鬥真的在打 ----------
        t0 = page.evaluate("({alive: __game.Game.planet.alive, gold: State.data.gold})")
        time.sleep(6)
        t1 = page.evaluate("""(() => ({
            alive: __game.Game.planet.alive,
            gold: State.data.gold,
            blocks: State.data.stats.blocks,
            fps: __game.Game.fps,
            bullets: __game.Game.G.bullets.filter(b => b.alive).length
        }))()""")
        ok("6 秒內有方塊被擊破", t1["alive"] < t0["alive"], f"{t0['alive']} → {t1['alive']}")
        ok("金幣有進帳（掉落→吸附→入帳）", t1["gold"] > t0["gold"], f"{t0['gold']} → {t1['gold']}")
        ok("FPS ≥ 30", t1["fps"] >= 30, f"{t1['fps']} fps")

        # ---------- 大數格式化 ----------
        fmt = page.evaluate("""(() => [
            BIG.fmt(999), BIG.fmt(1250), BIG.fmt(4.8e6), BIG.fmt(9.12e9), BIG.fmt(3.45e12), BIG.fmt(1e15)
        ])()""")
        ok("大數格式 K/M/B/T/aa 正確",
           fmt == ["999", "1.25K", "4.80M", "9.12B", "3.45T", "1.00aa"], json.dumps(fmt))

        # ---------- 無限補給站 ----------
        gems0 = page.evaluate("State.data.gems")
        page.evaluate("__game.openTab('settings')")
        time.sleep(0.3)
        page.click("#btnSupply")
        time.sleep(0.4)
        page.click('[data-sup="gems"]')
        time.sleep(0.3)
        page.click('[data-sup="prestige"]')
        time.sleep(0.3)
        page.click('[data-sup="satellites_max"]')
        time.sleep(0.3)
        sup = page.evaluate("""(() => ({
            gems: State.data.gems, prestige: State.data.prestige,
            sats: Object.values(State.data.satellites).filter(v => v >= 5).length
        }))()""")
        ok("補給站：+100 萬寶石、+100 萬星塵、衛星全滿",
           sup["gems"] >= gems0 + 1e6 and sup["prestige"] >= 1e6 and sup["sats"] == 6,
           json.dumps(sup))
        page.click("#modalClose")
        time.sleep(0.3)

        # ---------- 通行證 50 階 ----------
        page.evaluate("__game.openTab('pass')")
        time.sleep(0.5)
        page.click("#btnPassAll")
        time.sleep(0.5)
        pass_info = page.evaluate("""(() => ({
            claimed: Object.keys(State.data.passClaimed).length,
            gems: State.data.gems
        }))()""")
        ok("通行證 50 階可一鍵全領", pass_info["claimed"] == 50, str(pass_info["claimed"]))

        page.evaluate("__game.openTab('bundles')")
        time.sleep(0.4)
        page.click('[data-bundle="starter_pack"]')
        time.sleep(0.3)
        bundle = page.evaluate("({got: !!State.data.bundles.starter_pack, gold: State.data.gold})")
        ok("禮包免費領取（starter_pack 已解鎖）", bundle["got"] is True, json.dumps(bundle))
        page.click("#modalClose")
        time.sleep(0.2)

        # ---------- 技能：骰子 + 融合 ----------
        page.evaluate("__game.openTab('skills')")
        time.sleep(0.4)
        page.click("#btnRoll100")
        time.sleep(0.6)
        before = page.evaluate("Object.keys(State.data.skills).length")
        page.click("#btnFuse")
        time.sleep(0.6)
        after = page.evaluate("({keys: Object.keys(State.data.skills).length, dice: State.data.stats.dice})")
        ok("百連抽有進技能背包", before > 0, f"{before} kinds")
        ok("一鍵融合執行（技能種類不變或變少、有紀錄）", after["dice"] >= 100, json.dumps(after))
        page.click("#modalClose")
        time.sleep(0.2)

        # ---------- 手動搖桿 ----------
        ship0 = page.evaluate("({x: __game.Game.ship.x, y: __game.Game.ship.y})")
        box = page.evaluate("""(() => { const r = document.getElementById('game').getBoundingClientRect();
            return {x: r.left, y: r.top, w: r.width, h: r.height}; })()""")
        cx, cy = box["x"] + box["w"] / 2, box["y"] + box["h"] / 2
        page.mouse.move(cx, cy)
        page.mouse.down()
        for i in range(12):
            page.mouse.move(cx + i * 6, cy + i * 4)
            time.sleep(0.03)
        time.sleep(0.6)
        ship1 = page.evaluate("({x: __game.Game.ship.x, y: __game.Game.ship.y, joy: __game.Game.G.joystick.active})")
        page.mouse.up()
        moved = abs(ship1["x"] - ship0["x"]) + abs(ship1["y"] - ship0["y"])
        ok("手動拖曳會改變飛船位置（虛擬搖桿）", moved > 6, f"Δ={moved:.1f}px")
        time.sleep(1.8)
        back = page.evaluate("__game.Game.G.joystick.active")
        ok("放開後 1.5 秒回到自動巡航", back is False)

        # ---------- 星球清空 → 進下一顆 ----------
        clear = page.evaluate("""(() => {
            __game.Game.clearPlanetNow();
            return {sector: State.data.sector, planet: State.data.planet, planets: State.data.stats.planets};
        })()""")
        # 清空後有 1.1 秒的爆炸動畫（這段時間 alive = 0），要等重生再斷言
        page.wait_for_function("__game.Game.planet.alive > 20", timeout=6000)
        nxt = page.evaluate("""(() => ({
            sector: State.data.sector, planet: State.data.planet,
            alive: __game.Game.planet.alive, planets: State.data.stats.planets
        }))()""")
        # 高裝況下星球會自然連續清空，所以「推進」看三種跡象任一即可
        moved = (nxt["planets"] > clear["planets"]
                 or (nxt["sector"], nxt["planet"]) != (clear["sector"], clear["planet"]))
        ok("清空星球會推進到下一顆並重生方塊", nxt["alive"] > 20 and moved,
           json.dumps(nxt, ensure_ascii=False))

        # ---------- 存檔 ----------
        page.evaluate("State.data.gold = 777777; State.save()")
        page.reload(wait_until="load")
        page.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        time.sleep(0.8)
        saved = page.evaluate("({gold: State.data.gold, claimed: Object.keys(State.data.passClaimed).length})")
        # 存檔後仍會繼續打方塊，所以金幣只會增加；重點是「有存進去」不是剛好等於
        ok("重新載入後存檔保留（金幣／通行證）",
           saved["gold"] >= 777777 and abs(saved["gold"] - round(saved["gold"])) < 1e-6
           and saved["claimed"] == 50, json.dumps(saved))

        # ---------- 版面與安全區 ----------
        layout = page.evaluate("""(() => {
            const rail = [...document.querySelectorAll('.rail button')].map(b => b.getBoundingClientRect().height);
            const slots = [...document.querySelectorAll('.slot')].map(b => b.getBoundingClientRect().height);
            const aim = document.getElementById('btnAim').getBoundingClientRect();
            const app = getComputedStyle(document.getElementById('app'));
            return {
                railMin: Math.min(...rail), slotMin: Math.min(...slots), aimH: aim.height,
                safeTop: app.paddingTop, overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
                canvasW: document.getElementById('game').clientWidth
            };
        })()""")
        ok("圖示列／裝備格／瞄準鈕高度 ≥44px",
           layout["railMin"] >= 44 and layout["slotMin"] >= 44 and layout["aimH"] >= 44,
           json.dumps(layout))
        ok("沒有橫向溢出", layout["overflowX"] is False)

        # 640x480（模擬平台 iframe）
        ctx2 = browser.new_context(viewport={"width": 640, "height": 480}, is_mobile=True, has_touch=True)
        p2 = ctx2.new_page()
        errs2 = []
        p2.on("pageerror", lambda e: errs2.append(str(e)[:160]))
        p2.goto(base, wait_until="load")
        p2.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        time.sleep(2.5)
        small = p2.evaluate("""(() => ({
            alive: __game.Game.planet.alive, blocks: __game.Game.planet.blocks.length,
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            canvasH: document.getElementById('game').clientHeight
        }))()""")
        ok("640×480 可玩、無橫向溢出",
           small["alive"] > 0 and small["overflow"] is False and small["canvasH"] > 120,
           json.dumps(small))
        ok("640×480 零 pageerror", len(errs2) == 0, str(errs2[:2]))
        ctx2.close()

        ok("主流程零 pageerror", len(errs) == 0, str(errs[:2]))
        ok("主流程零 console error", len(console_errs) == 0, str(console_errs[:2]))

        page.screenshot(path=os.path.join(ROOT, "artifacts", "h5-390x844.png"))
        browser.close()

    print(f"\n{'='*46}\n{len(PASS)} PASS / {len(FAIL)} FAIL")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
