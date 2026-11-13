import '../mute-auto.mjs'
// 全区間を旗ごとに撮る（目で見る用）。node tools/tour.mjs → shots/tour-NN.png と shots/tour.jpg
import pw from 'playwright'
import { spawn, execFileSync } from 'node:child_process'
const PORT = 7600 + Math.floor(Math.random() * 300)
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
await new Promise(r => setTimeout(r, 600))
const b = await pw.chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext({ viewport: { width: 640, height: 360 }, locale: 'ja-JP' })).newPage()
await p.goto(`http://localhost:${PORT}/`, { timeout: 180000 })
await p.waitForFunction('window.__slReady && sl.view.ready && sl.view.skyReady', null, { timeout: 180000 })
await p.click('#start').catch(() => {})
await p.evaluate(() => { sl.pause(true); document.getElementById('tut').hidden = true })
const n = await p.evaluate(() => sl.sim.course.flags.length)
const files = []
for (let i = 0; i < n; i++) {
  await p.evaluate(i => {
    const s = sl.sim, f = s.course.flags[i]
    s.flag = i; s.respawn()
    sl.view.camYaw = f.yaw + Math.PI + 0.5; sl.view.camPitch = 0.55; sl.view.camDist = 8.5
    sl.view.camT.set(f.p[0], f.p[1] + 1.45, f.p[2]); sl.view.userCamT = performance.now() / 1000 + 100
    for (let k = 0; k < 3; k++) sl.view.render(0, 1 / 60, null)
  }, i)
  await p.waitForTimeout(150)
  const f = `shots/tour-${String(i).padStart(2, '0')}.png`
  await p.screenshot({ path: f }); files.push(f)
}
await b.close(); srv.kill()
console.log(files.length)
