import '../mute-auto.mjs'
// カメラの距離の変わり方: 通しの bot の動き（shots/camtrace.json）を再生し、毎刻みのカメラの距離を記録する
// 1刻みで 0.25m 以上変わった回数・最大の変化を、古い作り（camOld）と今の作りで比べる
// 先に TRACE=shots/camtrace.json node tools/route.mjs
import pw from 'playwright'
import { spawn } from 'node:child_process'
const PORT = 7900 + Math.floor(Math.random() * 300)
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
await new Promise(r => setTimeout(r, 600))
const b = await pw.chromium.launch()
const p = await b.newPage()
await p.goto(`http://localhost:${PORT}/`, { timeout: 180000 })
await p.waitForFunction('window.__slReady', null, { timeout: 180000 })
const r = await p.evaluate(async () => {
  const tr = await (await fetch('shots/camtrace.json')).json()
  const { view, sim } = sl
  sl.pause(true)
  const run = old => {
    view.camOld = old; view.camCur = null; view.camDist = 8.5; view.camPitch = 0.55; view.userCamT = -100
    view.camT.set(tr[0][0], tr[0][1] + 1.45, tr[0][2])
    let prev = null, big = 0, maxd = 0, minD = 99, inside = 0; const whoIn = {}, whoJump = {}
    for (const [x, y, z, mode, d] of tr) {
      sim.pl.p = [x, y, z]; sim.pl.mode = mode; sim.lad.d = d ? [d[0], 0, d[1]] : sim.lad.d
      const cd = view.updateCam(1 / 60, 1000)
      if (prev != null) { const dd = Math.abs(cd - prev); if (dd > 0.25) { big++; whoJump[mode + ':' + y.toFixed(0)] = +dd.toFixed(1) }; maxd = Math.max(maxd, dd) }
      minD = Math.min(minD, cd)
      const c = view.cam.position; const ib = sim.world.pointIn([c.x, c.y, c.z], 0.05, bb => bb.mat === 'fence' || bb.tree2 || bb.tree || bb.mat === 'branch' || bb.mat === 'bark'); if (ib) { inside++; whoIn[ib.mat + (ib.sec || '')] = (whoIn[ib.mat + (ib.sec || '')] || 0) + 1 }
      prev = cd
    }
    return { ticks: tr.length, jumpsOver25cm: big, maxStep: +maxd.toFixed(2), minDist: +minD.toFixed(2), camInsideWallTicks: inside, whoIn, whoJump }
  }
  return { before: run(true), after: run(false) }
})
console.log(JSON.stringify(r))
await b.close(); srv.kill()
