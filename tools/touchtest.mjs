import '../mute-auto.mjs'
// スマホの操作: 左下の固定スティックで歩く／右をなぞるとカメラが回る（上下も）／2本指で寄る。本物のタッチ（CDP）で
import pw from 'playwright'
import { spawn } from 'node:child_process'
const PORT = 6500 + Math.floor(Math.random() * 300)
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
await new Promise(r => setTimeout(r, 600))
const b = await pw.chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'ja-JP' })
const p = await ctx.newPage()
const errs = []; p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://localhost:${PORT}/`, { timeout: 180000 })
await p.waitForFunction('window.__slReady', null, { timeout: 180000 })
await p.tap('#start', { timeout: 120000 })
const cdp = await ctx.newCDPSession(p)
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) })
const drag = async (pts0, pts1, n = 10) => { await touch('touchStart', pts0); for (let i = 1; i <= n; i++) await touch('touchMove', pts0.map((a, k) => [a[0] + (pts1[k][0] - a[0]) * i / n, a[1] + (pts1[k][1] - a[1]) * i / n])); await touch('touchEnd', []) }
const st = () => p.evaluate(() => ({ yaw: sl.view.camYaw, pitch: sl.view.camPitch, dist: sl.view.camDist, p: sl.sim.pl.p.slice(), lad: sl.sim.lad.state }))
const r = await p.evaluate(() => { const e = document.getElementById('joy').getBoundingClientRect(); return [e.left + e.width / 2, e.top + e.height / 2] })
const a0 = await st()
await drag([[300, 300]], [[200, 380]])
const a1 = await st()
// スティック: 上に倒して 1 秒
await touch('touchStart', [r]); for (let i = 1; i <= 5; i++) await touch('touchMove', [[r[0], r[1] - i * 10]])
await p.waitForTimeout(1000)
const a2 = await st()
await touch('touchEnd', [])
// ピンチ（2本指で広げる）
await drag([[180, 300], [220, 300]], [[100, 300], [300, 300]])
const a3 = await st()
const out = {
  カメラ横: (a1.yaw - a0.yaw).toFixed(2), カメラ縦: (a1.pitch - a0.pitch).toFixed(2), なぞりで動かない: Math.hypot(a1.p[0] - a0.p[0], a1.p[2] - a0.p[2]) < 0.05,
  スティックで歩いた: Math.hypot(a2.p[0] - a1.p[0], a2.p[2] - a1.p[2]).toFixed(2), ピンチ: (a3.dist - a2.dist).toFixed(2), はしご: a3.lad, errs,
}
console.log(JSON.stringify(out))
await b.close(); srv.kill()
