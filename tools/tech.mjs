// 区間ごとに、掛け方（壁のどこ・縁のどこ）を端から端まで試して、登れる窓を数える。ブラウザなし
// node tools/tech.mjs [区間番号]
import { Sim, plan, ladderPose } from '../js/sim.js'
import { buildCourse, fx, FACE_N } from '../js/course.js'

const course = buildCourse()
const only = process.argv[2] ? Number(process.argv[2]) : 0

// 区間ごとの的: 登る箱と、その面（面の座標で）
const TESTS = [
  { sec: 1, face: 0, box: b => b.sec === 1 && b.max[1] === 3.2, top: 3.2 },
  { sec: 2, face: 1, box: b => b.sec === 2 && b.max[1] === 6.6, top: 6.6 },
  { sec: 3, face: 1, bridge: true, box: b => b.sec === 3, top: 6.6 },
  { sec: 4, face: 2, hook: true, box: b => b.sec === 4 && b.hook, top: 10.4 },
  { sec: 5, face: 3, box: b => b.sec === 5 && b.max[1] === 14.0, top: 14.0, phases: 8 },
  { sec: 6, face: 3, box: b => b.sec === 6 && b.crumble, top: 17.8 },
  { sec: 7, face: 0, box: b => b.sec === 7 && b.max[1] === 21.6, top: 21.6, phases: 8 },
]

function run(sim, maxT, climb = 1) {
  for (let i = 0; i < maxT * 60; i++) {
    sim.step({ mv: [0, 0], climb })
    if (sim.pl.mode === 'ground' && sim.pl.p[1] > sim._goalY - 0.05) return { ok: true, t: i / 60 }
    if (sim.lad.state === 'falling' || sim.lad.state === 'lying') return { ok: false, why: sim.lad.fwhy || sim.lad.state, t: i / 60 }
  }
  return { ok: false, why: 'stuck:' + sim.pl.mode + ':' + sim.lad.state }
}

function standFor(sim, q) {
  // 人を足元のすぐ後ろへ
  const F = q.F
  sim.pl.p = [F[0] - q.d[0] * 0.4, F[1], F[2] - q.d[2] * 0.4]
  sim.pl.mode = 'ground'
}

for (const T of TESTS) {
  if (only && T.sec !== only) continue
  const sim = new Sim(course)
  const box = sim.world.boxes.find(T.box)
  sim._goalY = T.top
  const f = course.flags.find(x => x.sec === T.sec)
  const rows = []
  const phases = T.phases || 1
  const tryHit = (hit, label) => {
    let okN = 0, res = [], ang = null, type = null, why = null
    for (let ph = 0; ph < phases; ph++) {
      sim.reset()
      // 時刻を進める（揺れ・風の位相）
      const t0 = Math.round(ph * 60 * (box.move ? box.move.period : 4.2) / phases)
      for (let i = 0; i < t0; i++) { sim.tick++; sim.world.update(sim.tick) }
      sim.pl.p = f.p.slice()
      // 当たりの点も動く箱なら動かす（今は的は動かない）
      let q = plan(sim.world, sim.pl, hit, sim.lad.L)
      if (!q.ok && (q.why === 'far' || q.why === 'nofloor') && q.F) { standFor(sim, q); q = plan(sim.world, sim.pl, hit, sim.lad.L) }
      if (!q.ok) { why = q.why; continue }
      standFor(sim, q)
      type = q.type
      ang = q.type === 'hook' ? (90 - q.al * 57.3) : q.th * 57.3
      sim.step({ mv: [0, 0], place: { hit } })
      if (sim.lad.state !== 'placed') { why = 'notplaced'; continue }
      // 宙吊りは飛びつく
      if (q.type === 'hook' && q.dangle) {
        const P = ladderPose(sim.lad)
        sim.pl.mode = 'ladder'; sim.pl.s = 1.2
      }
      if (q.type === 'bridge') {
        // 橋は歩いて渡る
        let r = null
        for (let i = 0; i < 300; i++) {
          sim.step({ mv: [q.d[0], q.d[2]] })
          if (sim.pl.mode === 'ground' && Math.hypot(sim.pl.p[0] - q.T[0], sim.pl.p[2] - q.T[2]) < 1.5 && i > 20) { r = { ok: true, t: i / 60 }; break }
          if (sim.lad.state !== 'placed') { r = { ok: false, why: sim.lad.fwhy }; break }
        }
        r = r || { ok: false, why: 'stuck' }
        res.push(r); if (r.ok) okN++
        continue
      }
      const r = run(sim, 8)
      res.push(r)
      if (r.ok) okN++
    }
    rows.push({ label, type, ang: ang == null ? '-' : ang.toFixed(0), ok: `${okN}/${phases}`, t: res.filter(r => r.ok).map(r => r.t.toFixed(1)).join(' '), why: why || res.filter(r => !r.ok).map(r => r.why).join(',') })
  }
  if (T.bridge) {
    // 橋: 向こうの足場の上面を、手前の縁からの深さを変えて
    const n = FACE_N[T.face]
    for (let o = 0.1; o <= 1.5; o += 0.2) {
      const p = [box.min[0] + (box.max[0] - box.min[0]) * 0.5, box.max[1], box.max[2] - o]
      tryHit({ p, n: [0, 1, 0], box }, `top o=${o.toFixed(1)}`)
    }
  } else if (T.hook) {
    for (const w of [0.2, 1.0, 2.0, 3.0]) {
      // 下から梁の外の面、上の面
      const p = [box.min[0] + 15, box.max[1] - 0.3, box.min[2]]
      tryHit({ p, n: [0, 0, -1], box }, `outer face`)
      break
    }
    const p2 = [9, box.max[1] - 0.2, box.max[2]]
    tryHit({ p: p2, n: [0, 0, 1], box }, 'gap side face')
  } else {
    // 壁の面を、下から上へ。縁より上は「縁に乗せる」
    const faceN = T.face === 0 && T.sec === 1 ? [-1, 0, 0] : null
    const n = faceN || (T.face === 1 ? [0, 0, 1] : T.face === 3 ? [0, 0, -1] : T.face === 0 ? [-1, 0, 0] : [1, 0, 0])
    const ax = Math.abs(n[0]) > 0.5 ? 0 : 2
    const plane = n[ax] > 0 ? box.max[ax] : box.min[ax]
    const latAx = ax === 0 ? 2 : 0
    const lat = (box.min[latAx] + box.max[latAx]) / 2
    for (let dy = 0.02; dy <= 1.6; dy += 0.06) {
      const p = [0, box.max[1] - dy, 0]; p[ax] = plane; p[latAx] = lat
      tryHit({ p, n, box }, `face -${dy.toFixed(2)}`)
    }
  }
  console.log(`\n== 区間${T.sec} ${course.sections[T.sec - 1].name}`)
  for (const r of rows) console.log(`${r.label.padEnd(14)} ${String(r.type).padEnd(7)} ${String(r.ang).padStart(3)}°  ${r.ok.padEnd(5)} ${r.t.padEnd(18)} ${r.why}`)
}
