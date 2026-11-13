import '../mute-auto.mjs'
// 区間2→3 を人として: 苔の石垣の上から、空堀の向こうを見て、手がかり（一言・光る縁・見本のはしご）が出るか、向こうの足場をクリックして橋になり、歩いて渡れるか
import pw from 'playwright'
import { spawn } from 'node:child_process'
const PORT = 8100 + Math.floor(Math.random() * 300)
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
await new Promise(r => setTimeout(r, 600))
const b = await pw.chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ja-JP' })
await ctx.addInitScript(() => { try { localStorage.clear() } catch {} })
const p = await ctx.newPage()
const errs = []; p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://localhost:${PORT}/`, { timeout: 180000 })
await p.waitForFunction('window.__slReady && sl.view.ready', null, { timeout: 180000 })
await p.click('#start')
// 区間2の旗から始め、区間3の旗（苔の石垣の上）まで登った所を再現: 旗3へ
await p.evaluate(() => { const s = sl.sim; s.flag = s.course.flags.findIndex(f => f.sec === 2); s.respawn() })
const f3 = await p.evaluate(() => sl.sim.course.flags.find(f => f.sec === 3).p)
await p.evaluate(p3 => { const s = sl.sim; s.pl.p = [p3[0], p3[1], p3[2] + 1.5]; s.pl.mode = 'ground' }, f3)
await p.waitForTimeout(800)   // 旗に触れて区間3に入る
const tip = await p.textContent('#toast')
await p.evaluate(() => { sl.view.camYaw = 0.0; sl.view.camPitch = 0.55 })   // 南を向く（空堀の方）
await p.waitForTimeout(1200)
await p.screenshot({ path: 'shots/s3-hint.png' })
const glow = await p.evaluate(() => ({ glow: sl.view.hintGlow.visible, demo: sl.view.demo.visible }))
// 向こうの足場の側面を画面で探してクリック
const pt = await p.evaluate(() => { const b = sl.sim.world.boxes.find(b => b.sec === 3); return sl.screenOf([(b.min[0] + b.max[0]) / 2, b.max[1] - 0.3, b.max[2]]) })
await p.mouse.move(pt[0], pt[1]); await p.waitForTimeout(200)
console.log('aim', JSON.stringify(await p.evaluate(pt => { const q = sl.aimAt(pt[0], pt[1]); return q && { ok: q.ok, why: q.why, type: q.type, box: q.hit && q.hit.box.mat + q.hit.box.sec } }, pt)), pt)
await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(500)
const placed = await p.evaluate(() => ({ st: sl.sim.lad.state, type: sl.sim.lad.type, mode: sl.sim.pl.mode }))
await p.keyboard.down('KeyW'); await p.waitForTimeout(2500); await p.keyboard.up('KeyW')
const after = await p.evaluate(() => ({ p: sl.sim.pl.p.map(v => +v.toFixed(2)), mode: sl.sim.pl.mode }))
await p.screenshot({ path: 'shots/s3-after.png' })
console.log(JSON.stringify({ tip, glow, placed, after, errs }))
await b.close(); srv.kill()
