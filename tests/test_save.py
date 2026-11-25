#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""零建置版（v0.4.0）存檔備份／跨裝置測試

用法：/usr/bin/python3 tests/test_save.py
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
PORT = 8931
BASE = f"http://127.0.0.1:{PORT}/index.html"
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


def boot(page, url=BASE):
    page.goto(url, wait_until="load")
    page.wait_for_function("window.__game && window.__game.ready", timeout=20000)
    time.sleep(0.4)
    page.evaluate("__game.Game.setPaused(true)")


def main():
    serve()
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        errs = []

        # ---------- 裝置 A ----------
        cA = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pA = cA.new_page()
        pA.on("pageerror", lambda e: errs.append(str(e)[:200]))
        boot(pA)

        tabs = pA.eval_on_selector_all("#tabs button", "els=>els.map(e=>e.dataset.tab)")
        ok("第六個分頁是存檔", tabs[-1] == "save", str(tabs))

        pA.evaluate("""(() => { const s = State.data;
            s.gold = 2468000; s.gems = 13579; s.prestige = 4200; s.sector = 5; s.planet = 4;
            s.weapons = Object.assign({}, s.weapons, { gatling: 21, mortar: 9 });
            s.satellites = { collector: 3, bomber: 2, beam: 5 };
            s.skills = { dmg_epic: 3, coin_rare: 2 };
            s.passClaimed = { 1: true, 2: true, 3: true };
            s.bundles = { starter_pack: true };
            s.stats = { blocks: 54321, planets: 11, dice: 7 };
            State.save(); State.emit(); })()""")

        pA.evaluate("__game.openTab('save')")
        time.sleep(0.5)
        code = pA.eval_on_selector("#saveCode", "e=>e.value")
        ok("匯出存檔碼 SB2.<base64>.<8碼>", code.startswith("SB2.") and len(code.split(".")) == 3,
           f"len={len(code)}")
        ok("存檔碼可通過自身校驗", pA.evaluate("(c)=>State.previewCode(c).ok", code) is True)
        ok("存檔分頁有複製／下載／匯入控制項",
           all(pA.eval_on_selector(sel, "e=>!!e") for sel in
               ["#btnCopyCode", "#btnCopyLink", "#btnDownloadSave", "#btnImportCode", "#importCode"]))

        with pA.expect_download(timeout=8000) as dl:
            pA.click("#btnDownloadSave")
        fname = dl.value.suggested_filename
        tmp = os.path.join(ROOT, "artifacts", fname)
        dl.value.save_as(tmp)
        payload = json.load(open(tmp, encoding="utf-8"))
        ok("下載存檔檔內容正確", fname.endswith(".json") and payload["d"]["sector"] == 5
           and payload["d"]["weapons"]["gatling"] == 21, fname)

        # ---------- 裝置 B：全新 context 匯入存檔碼 ----------
        cB = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pB = cB.new_page()
        pB.on("pageerror", lambda e: errs.append("B:" + str(e)[:200]))
        boot(pB)
        pB.evaluate("__game.openTab('save')")
        time.sleep(0.4)
        pB.fill("#importCode", code)
        pB.click("#btnImportCode")
        time.sleep(0.7)
        st = pB.evaluate("""(() => { const s = State.data; return {
            gold: s.gold, gems: s.gems, sector: s.sector, planet: s.planet,
            gatling: s.weapons.gatling, beam: s.satellites.beam,
            dmg: s.skills.dmg_epic, pass: Object.keys(s.passClaimed).length,
            bundles: Object.keys(s.bundles).length, blocks: s.stats.blocks }; })()""")
        ok("另一台匯入成功：金幣／星區還原",
           st["gold"] == 2468000 and st["sector"] == 5 and st["planet"] == 4, json.dumps(st))
        ok("武器／衛星等級還原", st["gatling"] == 21 and st["beam"] == 5, json.dumps(st))
        ok("技能／通行證／禮包／戰績還原",
           st["dmg"] == 3 and st["pass"] == 3 and st["bundles"] == 1 and st["blocks"] == 54321, json.dumps(st))

        pB.reload(wait_until="load")
        pB.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        time.sleep(0.5)
        ok("重整後存檔仍在", pB.evaluate("State.data.sector") == 5
           and pB.evaluate("State.data.weapons.gatling") == 21)

        # ---------- 檔案匯入 ----------
        cC = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pC = cC.new_page()
        boot(pC)
        r = pC.evaluate("(t)=>State.importFileText(t)", open(tmp, encoding="utf-8").read())
        ok("用下載的 .json 匯入成功", r["ok"] is True and pC.evaluate("State.data.sector") == 5, r["msg"])

        # ---------- 壞碼與跨版本碼 ----------
        gold_before = pA.evaluate("State.data.gold")
        bad = pA.evaluate("State.importCode('SB2.abc.12345678')")
        ok("無效存檔碼被拒", bad["ok"] is False, bad["msg"])
        trunc = pA.evaluate("(c)=>State.importCode(c.slice(0, Math.floor(c.length/2)))", code)
        ok("截斷存檔碼被拒", trunc["ok"] is False, trunc["msg"])
        cross = pA.evaluate("State.importCode('SB1.eyJkIjp7fX0.abcdef12')")
        ok("貼到 TS 版的 SB1 會提示去對的版本", cross["ok"] is False and "TS" in cross["msg"], cross["msg"])
        ok("壞碼不動本機進度", pA.evaluate("State.data.gold") == gold_before)

        # ---------- 分享連結 ----------
        link = pA.evaluate("State.shareUrl()")
        ok("分享連結帶 #save=SB2", "#save=SB2." in link, link[:70] + "…")
        cD = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pD = cD.new_page()
        pD.on("pageerror", lambda e: errs.append("D:" + str(e)[:200]))
        pD.goto(link, wait_until="load")
        pD.wait_for_function("window.__game && window.__game.ready", timeout=20000)
        time.sleep(1.0)
        shown = pD.evaluate("!document.querySelector('#modal').classList.contains('hidden')")
        body = pD.eval_on_selector("#modalBody", "e=>e.innerText") if shown else ""
        ok("開分享連結會先問要不要載入", shown and "載入這個存檔" in body, body.replace("\n", " | ")[:70])
        pD.click("#btnImportNow")
        time.sleep(0.7)
        ok("確認後載入分享的存檔", pD.evaluate("State.data.sector") == 5
           and pD.evaluate("State.data.weapons.gatling") == 21)

        ok("零 pageerror", len(errs) == 0, str(errs[:2]))
        pA.screenshot(path=os.path.join(ROOT, "artifacts", "save-tab-v040.png"))
        b.close()

    print(f"\n{'='*46}\n{len(PASS)} PASS / {len(FAIL)} FAIL")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
