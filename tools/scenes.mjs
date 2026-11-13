import '../mute-auto.mjs'
// 見た目の確認: 決めた場所に人を置き、カメラを決めて撮る。node tools/scenes.mjs [w h] [名前...]
import pw from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const W = Number(process.argv[2] || 1280), H = Number(process.argv[3] || 720)
const only = process.argv.slice(4)
const PORT = 5800 + Math.floor(Math.random() * 300)
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
await new Promise(r => setTimeout(r, 600))
mkdirSync('shots', { recursive: true })
const b = await pw.chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext({ viewport: { width: W, height: H }, locale: 'ja-JP' })).newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
p.on('requestfailed', r => errs.push('failed ' + r.url()))
await p.goto(`http://localhost:${PORT}/?t=${Date.now()}`)
await p.waitForFunction('window.__slReady && sl.view.ready && sl.view.skyReady', null, { timeout: 30000 })
await p.click('#start').catch(() => {})
await p.evaluate(() => sl.pause(true))
await p.waitForTimeout(800)
// [名前, 人の位置, カメラの yaw, pitch, 距離, 準備]
const S = [
  ['start', [-6, 0, 10], 2.6, 0.25, 8, ''],
  ['s1ladder', [0.4, 0, 9], 2.2, 0.2, 7, 'place1'],
  ['s2', [9, 3.2, 3.5], 1.0, 0.35, 8, ''],
  ['s4', [9, 6.6, -9.5], -0.4, 0.15, 7, ''],
  ['s7', [-4, 17.8, 8], 2.4, 0.3, 8, ''],
  ['s11', [-2.5, 32.5, -13], -2.6, 0.25, 9, ''],
  ['top', [9, 60.3, -1], 1.8, 0.35, 10, ''],
  ['climbside', [0.4, 0, 9], -0.9, 0.15, 5, 'place1'],
  ['compare', [-6, 45.3, 9], -1.39, 0.12, 7.5, 'place13'],
  ['s1c', [-1.2, 0, 9], -1.39, 0.18, 7.5, 'place1'],
  ['keep', [0, 40, 0], 0.7, 0.15, 95, ''],
  ['c1', [8.4, 0, 17], -1.0, 0.6, 8.5, 'place1b'],
  ['c2', [17, 3.2, 10.4], 0.55, 0.62, 8.5, 'place2'],
]
for (const [name, pos, yaw, pitch, dist, prep] of S) {
  if (only.length && !only.includes(name)) continue
  await p.evaluate(([pos, yaw, pitch, dist, prep]) => {
    const s = sl.sim
    s.pl.p = pos.slice(); s.pl.mode = 'ground'; s.lad.state = 'carry'; s.pl.yaw = yaw + Math.PI
    if (prep === 'place13') {
      s.lad.tele = true; s.lad.Lmax = 6.4; s.lad.L = 6.4
      const hit = s.world.raycast([-4.4, 50.78, 9], [1, 0, 0], 2)
      s.step({ mv: [0, 0], place: { hit } })
      for (let i = 0; i < 52; i++) s.step({ mv: [0, 0], climb: 1 })
    }
    if (prep === 'place1b') {
      const hit = s.world.raycast([9.6, 3.08, 17], [1, 0, 0], 2)
      s.step({ mv: [0, 0], place: { hit } })
      for (let i = 0; i < 26; i++) s.step({ mv: [0, 0], climb: 1 })
    }
    if (prep === 'place2') {
      const hit = s.world.raycast([17, 6.57, 9.4], [0, 0, -1], 2)
      s.step({ mv: [0, 0], place: { hit } })
      for (let i = 0; i < 30; i++) s.step({ mv: [0, 0], climb: 1 })
    }
    if (prep === 'place1') {
      const box = s.world.boxes.find(b => b.sec === 1)
      const hit = s.world.raycast([box.min[0] - 0.4, 3.08, 9], [1, 0, 0], 2)
      s.step({ mv: [0, 0], place: { hit } })
      for (let i = 0; i < 40; i++) s.step({ mv: [0, 0], climb: 1 })
    }
    sl.view.camYaw = yaw; sl.view.camPitch = pitch; sl.view.camDist = dist; sl.view.userCamT = performance.now() / 1000 + 100
    sl.view.camT.set(s.pl.p[0], s.pl.p[1] + 1.45, s.pl.p[2])
    document.getElementById('tut').hidden = true
    for (let i = 0; i < 3; i++) sl.view.render(0, 1 / 60, null)
  }, [pos, yaw, pitch, dist, prep])
  await p.waitForTimeout(300)
  await p.evaluate(() => sl.view.render(0, 1 / 60, null))
  if (process.env.OG) {
    await p.evaluate(() => {
      document.getElementById('hud').hidden = true
      const d = document.createElement('div')
      d.innerHTML = '<div style="position:fixed;left:56px;bottom:64px;color:#fff6ea;font-family:Hiragino Mincho ProN,serif;text-shadow:0 2px 10px #0009"><div style="font-size:84px;font-weight:800;letter-spacing:.1em">SKY LADDER</div><div style="font-size:30px;margin-top:6px">はしご一本で、城の天守を登る</div></div>'
      document.body.appendChild(d)
    })
    await p.screenshot({ path: 'og.png' })
  } else await p.screenshot({ path: `shots/sc-${name}.png` })
}
console.log('errs', errs)
await b.close(); srv.kill()
