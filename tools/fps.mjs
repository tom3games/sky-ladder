import '../mute-auto.mjs'
// 実時間で回して fps を測る（PC 設定と、スマホ設定 low）。node tools/fps.mjs
import pw from 'playwright'
import { spawn } from 'node:child_process'
const PORT = 6100 + Math.floor(Math.random() * 300)
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
await new Promise(r => setTimeout(r, 600))
const b = await pw.chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
for (const [w, h, touch] of [[1280, 720, false], [390, 844, true]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch })).newPage()
  await p.goto(`http://localhost:${PORT}/`, { timeout: 180000 })
  await p.waitForFunction('window.__slReady && sl.view.ready', null, { timeout: 30000 })
  await p.click('#start')
  await p.waitForTimeout(1500)
  const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(n / 3) }; requestAnimationFrame(f) }))
  console.log(w + 'x' + h, 'fps', fps.toFixed(1))
}
const p = await (await b.newContext()).newPage(); await p.goto('about:blank')
console.log('空のページ fps', (await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2) }; requestAnimationFrame(f) }))).toFixed(1))
await b.close(); srv.kill()
