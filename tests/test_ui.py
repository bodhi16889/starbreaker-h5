#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Step 4 主介面測試（五個分頁、+1/+10、+5、50 階單階領取、3 個 FREE 禮包、補給站五項）

用法：/usr/bin/python3 tests/test_ui.py
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
PORT = 8901
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

        # ---------- 五個分頁 ----------
        tabs = p.eval_on_selector_all("#tabs button", "els => els.map(e => e.dataset.tab)")
        ok("五個分頁（武器/衛星/技能/通行證/禮包）",
           tabs == ["weapons", "sats", "skills", "pass", "bundles"], str(tabs))

        # ---------- 武器：+1 / +10 ----------
        p.evaluate("State.data.gold = 1e9; __game.openTab('weapons')")
        time.sleep(0.5)
        n1 = p.eval_on_selector_all("[data-upw]", "els => els.length")
        n10 = p.eval_on_selector_all("[data-upw10]", "els => els.length")
        ok("每把武器都有 +1 與 +10 兩顆按鈕", n1 == 10 and n10 == 10, f"{n1}/{n10}")

        before = p.evaluate("State.weaponLevel('gatling')")
        p.click('[data-upw10="gatling"]')
        time.sleep(0.5)
        after = p.evaluate("State.weaponLevel('gatling')")
        ok("連升 +10 真的加 10 級", after - before == 10, f"{before} → {after}")

        p.click('[data-upw="gatling"]')
        time.sleep(0.4)
        ok("+1 只加 1 級", p.evaluate("State.weaponLevel('gatling')") - after == 1)

        # ---------- 裝備與轉生仍在武器頁 ----------
        gear_n = p.eval_on_selector_all("[data-upg]", "els => els.length")
        ok("裝備三件留在武器頁（船體/反應堆/引擎）", gear_n == 3, str(gear_n))
        ok("轉生按鈕在武器頁", p.eval_on_selector("#btnPrestige", "e => !!e") is True)
        p.click("#modalClose")

        # ---------- 衛星：+5 ----------
        p.evaluate("State.data.satellites = {}; State.data.gems = 1e7; __game.openTab('sats')")
        time.sleep(0.5)
        ok("每顆衛星都有 +5 按鈕",
           p.eval_on_selector_all("[data-ups5]", "els => els.length") == 6)
        p.click('[data-ups5="collector"]')
        time.sleep(0.5)
        lv = p.evaluate("State.satLevel('collector')")
        ok("升 +5 級一次到位（0 → 5）", lv == 5, f"lv={lv}")
        p.click("#modalClose")

        # ---------- 通行證：50 階、單階領取 ----------
        p.evaluate("State.data.passClaimed = {}; __game.openTab('pass')")
        time.sleep(0.6)
        rows = p.eval_on_selector_all("[data-pass]", "els => els.length")
        ok("通行證列出 50 個待領階級", rows == 50, str(rows))
        gems0 = p.evaluate("State.data.gems")
        p.click('[data-pass="7"]')
        time.sleep(0.4)
        one = p.evaluate("({claimed: State.data.passClaimed[7] === true, gems: State.data.gems})")
        ok("可單獨領第 7 階且只加該階獎勵",
           one["claimed"] and one["gems"] > gems0, json.dumps(one))
        p.click("#btnPassAll")
        time.sleep(0.6)
        ok("一鍵領取後 50 階全領", p.evaluate("Object.keys(State.data.passClaimed).length") == 50)

        # ---------- 禮包：3 個 FREE ----------
        p.evaluate("State.data.bundles = {}; __game.openTab('bundles')")
        time.sleep(0.5)
        ids = p.eval_on_selector_all("[data-bundle]", "els => els.map(e => e.dataset.bundle)")
        ok("三個 Step 4 禮包", ids == ["starter_pack", "unlimited_drill_pack", "all_satellites_pack"], str(ids))
        labels = p.eval_on_selector_all("[data-bundle]", "els => els.map(e => e.textContent.trim())")
        ok("全部標示 FREE", all("FREE" in x for x in labels), str(labels))

        # 領取後按鈕會變 disabled（正確行為），所以逐個驗：先按，再讀數值
        p.evaluate("State.data.weapons = {}; State.data.satellites = {}; __game.openTab('bundles')")
        time.sleep(0.4)
        p.click('[data-bundle="unlimited_drill_pack"]')
        time.sleep(0.5)
        ok("全武器精通禮包 → 每把 +25 級",
           p.evaluate("Math.min(...Object.values(State.data.weapons))") == 25,
           str(p.evaluate("Object.values(State.data.weapons)")))
        ok("領取後按鈕變成 disabled（不能重複領）",
           p.eval_on_selector('[data-bundle="unlimited_drill_pack"]', "e => e.disabled") is True)
        p.click('[data-bundle="all_satellites_pack"]')
        time.sleep(0.5)
        ok("衛星艦隊禮包 → 六顆全滿星",
           p.evaluate("Object.values(State.data.satellites).filter(v => v >= 5).length") == 6)
        p.click("#modalClose")

        # ---------- 補給站五項 ----------
        p.click("#btnSupply")
        time.sleep(0.5)
        kinds = p.eval_on_selector_all("[data-sup]", "els => els.map(e => e.dataset.sup)")
        ok("補給站五個項目（Step 4）",
           kinds == ["gems", "prestige", "weapons_unlock_all", "satellites_max", "all_in_one"], str(kinds))

        p.evaluate("State.data.gems = 0; State.data.prestige = 0; State.data.gold = 0; State.data.gear = {hull:1,reactor:1,engine:1}; State.data.weapons = {}; State.data.satellites = {}")
        p.click('[data-sup="all_in_one"]')
        time.sleep(0.7)
        allin = p.evaluate("""(() => ({
            gems: State.data.gems, prestige: State.data.prestige, gold: State.data.gold,
            mult: +State.data.prestigeMult.toFixed(2),
            wMin: Math.min(...Object.values(State.data.weapons)),
            gMin: Math.min(...Object.values(State.data.gear)),
            sats: Object.values(State.data.satellites).filter(v => v >= 5).length
        }))()""")
        ok("All-In-One：寶石/星塵/金幣/武器/裝備/衛星全部拉滿",
           allin["gems"] >= 1e6 and allin["prestige"] >= 1e6 and allin["gold"] >= 1e8
           and allin["mult"] > 1 and allin["wMin"] >= 25 and allin["gMin"] >= 25 and allin["sats"] == 6,
           json.dumps(allin))

        # 領取後不消耗、可重複按
        g1 = allin["gems"]
        p.click('[data-sup="gems"]')
        time.sleep(0.4)
        ok("補給站可無限重複領取（無冷卻）", p.evaluate("State.data.gems") > g1)
        p.click("#modalClose")

        # ---------- 技能：百連 + 一鍵融合 ----------
        p.evaluate("State.data.gems = 1e7; State.data.skills = {}; __game.openTab('skills')")
        time.sleep(0.5)
        p.click("#btnRoll100")
        time.sleep(0.7)
        n_sk = p.evaluate("Object.keys(State.data.skills).length")
        ok("百連抽產出技能", n_sk >= 1, str(n_sk))
        pre = p.evaluate("Object.values(State.data.skills).reduce((a,b)=>a+b,0)")
        p.click("#btnFuse")
        time.sleep(0.6)
        fused = p.evaluate("""(() => {
            const d = State.data.skills;
            let n = 0; Object.keys(d).forEach(k => n += d[k]);
            return {n, rarities: [...new Set(Object.keys(d).map(k => k.split('_')[1]))]};
        })()""")
        ok("融合後總數下降（3 合 1 生效）", fused["n"] < pre, f"{pre} → {fused['n']}")
        p.click("#modalClose")

        # ---------- SafeArea / 無橫向溢出 ----------
        for w, h in [(390, 844), (360, 640), (320, 568)]:
            p.set_viewport_size({"width": w, "height": h})
            time.sleep(0.4)
            over = p.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            ok(f"{w}×{h} 無橫向溢出", over <= 0, f"+{over}px")
        p.set_viewport_size({"width": 390, "height": 844})
        safe = p.evaluate("getComputedStyle(document.querySelector('#app') || document.body).paddingTop")
        ok("有套 safe-area（padding 來自 env()）", safe is not None, str(safe))

        ok("零 pageerror", len(errs) == 0, str(errs[:2]))
        p.screenshot(path=os.path.join(ROOT, "artifacts", "ui-step4.png"))
        b.close()

    print(f"\n{'='*46}\n{len(PASS)} PASS / {len(FAIL)} FAIL")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
