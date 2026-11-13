import '../mute-auto.mjs'
// 通しの確認: 起動 → 本物のマウスで壁の縁をクリック → W で登る → E で引き上げ。スクショとエラーを集める
// node tools/shot.mjs [webkit] [w h]
import pw from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const eng = process.argv[2] === 'webkit' ? pw.webkit : pw.chromium
const W = Number(process.argv[3] || 1280), H = Number(process.argv[4] || 720)
const PORT = 5347 + Math.floor(Math.random() * 400)
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
await new Promise(r => setTimeout(r, 600))
mkdirSync('shots', { recursive: true })
const errs = []
const b = await eng.launch(eng === pw.chromium ? { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } : {})
const ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP', hasTouch: W < H, isMobile: W < H })
const p = await ctx.newPage()
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
p.on('pageerror', e => errs.push('pageerror: ' + e.message))
p.on('requestfailed', r => errs.push('failed: ' + r.url()))
await p.goto((process.env.BASE || `http://localhost:${PORT}/`) + `?t=${Date.now()}`)
await p.waitForFunction('window.__slReady', null, { timeout: 180000 })
await p.waitForTimeout(600)
const tag = `${eng === pw.webkit ? 'wk' : 'cr'}-${W}x${H}`
await p.screenshot({ path: `shots/${tag}-0title.png` })
await p.click('#start')
await p.evaluate(() => sl.pause(true))
// 1区間目の壁の縁の少し下を、画面の座標にして本物のクリック
const res = await p.evaluate(() => {
  const s = sl.sim
  // 壁の前まで歩かせる
  s.pl.p = [8.2, 0, 17]; s.pl.yaw = Math.PI / 2
  sl.view.camYaw = -Math.PI / 2 + 0.5; sl.view.camPitch = 0.3; sl.view.camT.set(8.2, 1.4, 17)
  sl.step(30)
  const box = s.world.boxes.find(b => b.sec === 1)
  const pt = [box.min[0], box.max[1] - 0.2, 17]
  const [x, y, vis] = sl.screenOf(pt)
  return { x, y, vis }
})
await p.mouse.move(res.x, res.y)
await p.evaluate(() => sl.step(2))
await p.screenshot({ path: `shots/${tag}-1ghost.png` })
const angTxt = await p.textContent('#ang')
if (W < H) { await p.evaluate(() => sl.pause(false)); await p.touchscreen.tap(res.x, res.y); await p.waitForTimeout(150); await p.evaluate(() => sl.pause(true)) } else { await p.mouse.down(); await p.mouse.up() }
await p.evaluate(() => sl.step(20))
const placed = await p.evaluate(() => ({ st: sl.sim.lad.state, type: sl.sim.lad.type, th: sl.sim.lad.th * 57.3, mode: sl.sim.pl.mode }))
await p.keyboard.down('KeyW')
await p.evaluate(() => sl.step(40))
await p.screenshot({ path: `shots/${tag}-2climb.png` })
await p.evaluate(() => sl.step(80))
await p.keyboard.up('KeyW')
const after = await p.evaluate(() => ({ y: sl.sim.pl.p[1], mode: sl.sim.pl.mode }))
await p.keyboard.press('KeyE')
await p.evaluate(() => sl.step(20))
const took = await p.evaluate(() => sl.sim.lad.state)
await p.screenshot({ path: `shots/${tag}-3top.png` })
// 絵が出ているか: 輝度のばらつき
const sd = await p.evaluate(() => {
  const c = document.querySelector('#view canvas')
  const g = document.createElement('canvas'); g.width = 64; g.height = 36
  const x = g.getContext('2d'); x.drawImage(c, 0, 0, 64, 36)
  const d = x.getImageData(0, 0, 64, 36).data; let s = 0, s2 = 0, n = 0
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; s2 += l * l; n++ }
  return Math.sqrt(s2 / n - (s / n) ** 2)
})
const mute = await p.evaluate(() => window.__muteOk ? window.__muteOk() : 'n/a')
console.log(JSON.stringify({ tag, angTxt, placed, after, took, lumaSD: sd.toFixed(1), mute, errs }, null, 1))
await b.close()
srv.kill()
