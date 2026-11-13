// 上手い人の通し: 入力だけで（瞬間移動なし）スタートから頂上まで登る。各区間の時間を出す
// node tools/route.mjs [think秒]   think = 掛ける前に考える時間（人らしさ）
import { Sim, plan, ladderPose } from '../js/sim.js'
import { buildCourse, fxK, SEC_K } from '../js/course.js'

const THINK = Number(process.argv[2] ?? 0)
// 人の速さ: HUMAN=1 で反応の遅れ（0.2〜0.5秒）・狙いのぶれ・体重の遅れ。SEC=5,16,17 で区間だけを N 回
const HUMAN = !!process.env.HUMAN
let seed = 1
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
const course = buildCourse()
let sim = new Sim(course)
let curK = 15
const W = (f, u, w, k = curK) => fxK(f, u, w, k)
const mu = u => u + (u >= 0 ? 1 : -1) * (curK - 7)
const NRM = { u: [[-1, 0, 0], [0, 0, 1], [1, 0, 0], [0, 0, -1]] }  // 面 f で -u 向きの法線（u が増える方へ進む人に向く）
let log = [], secT = 0, fails = []
const st = () => sim.pl

// 人のめり込み（毎刻み）: 地面・空中で、体の円柱が箱にどれだけ食い込んだか
let pen = { max: 0, at: null, n: 0 }
function checkPen() {
  const pl = sim.pl
  if (pl.mode !== 'ground' && pl.mode !== 'air') return
  pen.n++
  for (const b of sim.world.boxes) {
    if (!b.alive || b.noHit) continue
    if (b.max[1] <= pl.p[1] + 0.02 || b.min[1] >= pl.p[1] + 1.7) continue
    const cx = Math.max(b.min[0], Math.min(pl.p[0], b.max[0])), cz = Math.max(b.min[2], Math.min(pl.p[2], b.max[2]))
    const d = Math.hypot(pl.p[0] - cx, pl.p[2] - cz)
    const depth = (d < 1e-6 ? 0.6 : 0.3 - d)
    // 段差で上がる途中（足元の 0.42m 以内）は数えない
    if (b.max[1] - pl.p[1] <= 0.43 && pl.mode === 'ground') continue
    if (depth > pen.max) { pen.max = depth; pen.at = [pl.p.map(v => +v.toFixed(2)), b.mat, b.sec, pl.mode] }
  }
  // 足が床より下
  const g = sim.world.groundAt(pl.p[0], pl.p[2], pl.p[1] + 0.3, 0.18)
  if (pl.mode === 'ground' && g && g.y - pl.p[1] > pen.max) { pen.max = g.y - pl.p[1]; pen.at = [pl.p.map(v => +v.toFixed(2)), 'floor', g.box.sec, pl.mode] }
}
const _step = Sim.prototype.step
Sim.prototype.step = function (inp) { _step.call(this, inp); if (this === sim) checkPen() }
function stepN(n, inp = {}) { for (let i = 0; i < n; i++) sim.step({ mv: [0, 0], ...inp }) }
function until(fn, max, inp = {}) {
  for (let i = 0; i < max * 60; i++) { if (fn()) return true; sim.step({ mv: [0, 0], ...(typeof inp === 'function' ? inp() : inp) }) }
  return false
}
function walkTo([x, z], tol = 0.2, max = 12, jump = false) {
  return until(() => Math.hypot(st().p[0] - x, st().p[2] - z) < tol, max, () => {
    const dx = x - st().p[0], dz = z - st().p[2], l = Math.hypot(dx, dz) || 1
    const k = Math.min(1, l / 0.6)
    return { mv: [dx / l * k, dz / l * k], jump: jump && st().mode === 'ground' }
  })
}
function jumpTo(edge, [x, z]) {
  walkTo(edge, 0.15)
  const dx = x - st().p[0], dz = z - st().p[2], l = Math.hypot(dx, dz)
  sim.step({ mv: [dx / l, dz / l], jump: true })
  until(() => st().mode === 'ground', 3, () => { const ex = x - st().p[0], ez = z - st().p[2], el = Math.hypot(ex, ez) || 1; return { mv: el < 0.3 ? [0, 0] : [ex / el, ez / el] } })
}
function think() { stepN(Math.round(THINK * 60)) }
function hitOn(p, n) {
  const o = [p[0] + n[0] * 0.4, p[1] + n[1] * 0.4, p[2] + n[2] * 0.4]
  return sim.world.raycast(o, [-n[0], -n[1], -n[2]], 2)
}
function react() { if (HUMAN) stepN(Math.round(12 + rnd() * 18)) }
function place(p, n, label) {
  if (HUMAN) { p = p.slice(); p[1] += (rnd() - 0.5) * 0.12; const lat = (rnd() - 0.5) * 0.3; if (Math.abs(n[0]) > 0.5) p[2] += lat; else if (Math.abs(n[2]) > 0.5) p[0] += lat }
  const hit = hitOn(p, n)
  const q = plan(sim.world, st(), hit, sim.lad.L)
  if (!q.ok) { fails.push(`${label}: 置けない ${q.why} ${q.blk ? JSON.stringify([q.blk.min, q.blk.max, q.blk.mat]) : ""} type=${q.type} F=${q.F}`); return null }
  sim.step({ mv: [0, 0], place: { hit } })
  stepN(16)
  return q
}
function climb(label, max = 8) {
  const ok = until(() => st().mode === 'ground' && sim.lad.state === 'placed', max, { climb: 1 })
  if (!ok || sim.lad.state !== 'placed') { fails.push(`${label}: 登れない ${sim.lad.state} ${sim.lad.fwhy || ''} mode=${st().mode}`); return false }
  stepN(2)
  return true
}
function take() { sim.step({ mv: [0, 0], take: true }); stepN(14) }
function setLen(L) { until(() => Math.abs(sim.lad.L - L) < 0.03, 6, () => ({ lenD: Math.sign(L - sim.lad.L) * 0.04 })) }
const SECS = []
function section(n, fn) { SECS.push([n, fn]) }
function runSec(n, fn) {
  curK = SEC_K[n]
  const t0 = sim.timeT, f0 = sim.stats.falls
  think()
  fn()
  log.push({ n, t: (sim.timeT - t0).toFixed(1), y: st().p[1].toFixed(1), falls: sim.stats.falls - f0 })
}
// 揺れ・風・門の時刻を待つ
const phase = (period, ph = 0) => ((sim.tick / 60 + ph) % period) / period

section(1, () => {
  walkTo(W(0, 0.6, 2))
  { const [x, z] = W(0, 2, 2); place([x, 3.2 - 0.12, z], [-1, 0, 0], 's1') }
  climb('s1'); take()
})
section(2, () => {
  walkTo(W(0, 9, 2)); walkTo(W(1, -6, 2)); walkTo(W(1, -2.2, 2))
  const [x, z] = W(1, -1, 2)
  place([x, 6.6 - 0.03, z], [0, 0, 1], 's2')
  climb('s2'); take()
})
section(3, () => {
  walkTo(W(1, 3.5, 2))
  const [x, z] = W(1, 7.6, 2)
  const q = place([x, 6.6, z], [0, 1, 0], 's3')
  if (q) until(() => st().mode === 'ground' && st().p[2] < -mu(7.2), 6, { mv: [q.d[0], q.d[2]] })
  take()
})
section(4, () => {
  walkTo(W(2, -9, 3.2))
  const [x, z] = W(2, -9, 5.6)
  place([x, 10.1, z], [0, 0, -1], 's4')
  // 宙吊りに飛びつく
  walkTo(W(2, -9, 3.6), 0.15)
  until(() => st().mode === 'ladder', 2, () => ({ mv: [0, -1], jump: st().mode === 'ground' }))
  if (st().mode !== 'ladder') fails.push('s4: 飛びつけない')
  climb('s4'); take()
})
section(5, () => {
  walkTo(W(2, 6.0, 3))
  // 足場が近い時に跳んで乗る
  until(() => phase(3.6) > 0.15 && phase(3.6) < 0.2, 5)
  const D = process.env.D5
  if (D) console.log('pre', st().p.map(v => v.toFixed(2)), st().mode)
  jumpTo(W(2, 6.45, 2.6), W(2, 8.6, 2.6))
  stepN(10)
  if (D) { const sw = sim.world.boxes.find(b => b.sec === 5 && b.move); console.log('after', st().p.map(v => v.toFixed(2)), st().mode, sw.min, sw.max) }
  const sw = sim.world.boxes.find(b => b.sec === 5 && b.move)
  until(() => sw.max[2] > W(3, -7, 0)[1] - 0.42, 5); react()
  const cx = (sw.min[0] + sw.max[0]) / 2
  walkTo([cx, sw.max[2] - 0.75], 0.2, 2)
  const q5 = place([cx, 14.0 - 0.03, W(3, -7, 0)[1]], [0, 0, -1], 's5')
  if (process.env.D5) { console.log('plan', q5 && q5.type, q5 && (q5.th * 57.3).toFixed(0), q5 && q5.c); for (let i = 0; i < 12; i++) { stepN(8, { climb: 1 }); console.log(sim.lad.state, sim.lad.c && sim.lad.c.toFixed(2), (sim.lad.th * 57.3).toFixed(0), sim.lad.F && sim.lad.F[2].toFixed(2), sw.max[2].toFixed(2), st().s.toFixed(2), sim.lad.vs) } }
  climb('s5'); take()
})
section(6, () => {
  walkTo(W(3, 2.4, 2))
  const [x, z] = W(3, 4, 2)
  place([x, 17.8 - 0.12, z], [0, 0, -1], 's6')
  climb('s6'); take()
  jumpTo(W(3, 5.25, 2), W(3, 7.4, 2))
})
section(7, () => {
  walkTo(W(3, 9, 2)); walkTo(W(0, -5, 1.0)); walkTo(W(0, -3.6, 1.0))
  until(() => phase(4.6, 0.3) > 0.46 && phase(4.6, 0.3) < 0.5, 6)
  const [x, z] = W(0, -2, 1.0)
  place([x, 21.6 - 0.12, z], [-1, 0, 0], 's7')
  climb('s7'); take()
})
section(8, () => {
  walkTo([12, 15.4]); walkTo([12, 14.2]); walkTo(W(0, 8.3, 1.3)); walkTo(W(1, -6, 1.3)); walkTo(W(1, -3.3, 1.3))
  const [x, z] = W(1, -0.05, 1.3)
  const q = place([x, 21.6, z], [0, 1, 0], 's8')
  if (q) until(() => st().mode === 'ground' && st().p[2] < -mu(0), 6, { mv: [q.d[0], q.d[2]] })
  take()
})
section(9, () => {
  walkTo(W(1, 3.4, 2.45))
  const [x, z] = W(1, 5, 2.45)
  place([x, 25.5, z], [0, 0, 1], 's9')
  until(() => st().s >= sim.lad.L - 0.56, 4, { climb: 1 })
  sim.step({ mv: [1, 0], jump: true })
  until(() => st().mode === 'ground', 3, { mv: [1, 0] })
  if (st().p[1] < 25) fails.push('s9: 跳び移れない y=' + st().p[1].toFixed(1))
  take()
})
section(10, () => {
  walkTo(W(1, 7, 5)); walkTo(W(2, -9, 5)); walkTo(W(2, -7.3, 5))
  const [x, z] = W(2, -6, 5)
  place([x, 28.9 - 0.12, z], [1, 0, 0], 's10a')
  climb('s10a'); take()
  walkTo(W(2, -5.4, 5))
  const [x2, z2] = W(2, -3.6, 5)
  place([x2, 32.5 - 0.12, z2], [1, 0, 0], 's10b')
  climb('s10b'); take()
})
section(11, () => {
  walkTo(W(2, -2.5, 6.0))
  const [x, z] = W(2, -1, 6.0)
  place([x, 36.2, z], [1, 0, 0], 's11a')
  climb('s11a'); take()
  walkTo(W(2, 7.5, 6.0), 0.2, 8); walkTo(W(3, -13.2, 4.3))
  { const [x, z] = W(3, -13.2, 3.2); place([x, 40.0, z], [-1, 0, 0], 's11b') }
  climb('s11b'); take()
  walkTo(W(3, -4.5, 2.8), 0.2, 8)
})
section(12, () => {
  walkTo(W(3, 0.9, 2))
  const gate = sim.world.boxes.find(b => b.mat === 'gate')
  until(() => gate.max[1] < 42.2 && gate.dv[1] < 0.0001, 8)
  { const [x, z] = W(3, 2, 2); place([x, gate.max[1] - 0.15, z], [0, 0, -1], 's12') }
  if (process.env.D12) for (let i = 0; i < 30; i++) { stepN(10, { climb: 1 }); console.log(i, st().mode, st().p.map(v => v.toFixed(2)).join(','), sim.lad.state, sim.lad.type, sim.lad.dangle, gate.max[1].toFixed(2), (sim.lad.al||0).toFixed(2), sim.lad.fwhy || '') }
  until(() => st().mode === 'ground', 10, { climb: 1 })
  until(() => gate.max[1] > 45.1, 8)
  walkTo(W(3, 4, 2), 0.3, 3)
  if (st().p[1] < 45) fails.push('s12: 上の床に乗れない y=' + st().p[1].toFixed(1))
  take()
})
section(13, () => {
  walkTo(W(3, 7.5, 2))
  if (!sim.lad.tele) fails.push('s13: 伸びるはしごを拾えない')
  walkTo(W(3, 9.5, 2)); walkTo(W(0, -6, 2))
  setLen(6.4)
  { const [x, z] = W(0, -4, 2); place([x, 50.9 - 0.12, z], [-1, 0, 0], 's13') }
  climb('s13'); take()
})
section(14, () => {
  setLen(4.4)
  { const [xf, zf] = W(0, 1, 2); walkTo([xf - 1.4, zf]) }
  { const [x, z] = W(0, 1, 2); place([x, 54.7 - 0.186, z], [-1, 0, 0], 's14') }
  climb('s14'); take()
})
section(15, () => {
  walkTo(W(0, 8.5, 2, 11)); walkTo(W(1, -6, 0.9)); walkTo(W(1, -4.6, 0.9))
  setLen(6.4)
  until(() => phase(5.2, 0.1) > 0.42 && phase(5.2, 0.1) < 0.46, 6)
  const [x, z] = W(1, -3, 0.9)
  place([x, 60.3 - 0.1, z], [0, 0, 1], 's15')
  climb('s15'); take()
})
const box = f => sim.world.boxes.find(f)
section(16, () => {
  const D = box(b => b.sec === 16 && b.move)
  walkTo(W(1, 1.5, 2))
  setLen(5.2)
  // 足場が近い時に跳び乗る（u が小さいほど近い = z が大きい）
  until(() => D.max[2] > -mu(2.0) && D.dv[2] > 0, 8); react()
  jumpTo(W(1, 1.8, 2), [W(1, 0, 2)[0], (D.min[2] + D.max[2]) / 2 - 0.4])
  // 乗ったら足場の奥（壁の側）の端へ。足場が壁に近く、風が止んだ時に掛ける
  until(() => st().mode === 'ground', 2)
  const tgt = () => [W(1, 0, 2)[0], D.min[2] + 0.45]
  until(() => D.min[2] < -mu(4.9) && D.dv[2] > 0 && phase(5.6, 0.6) > 0.36 && phase(5.6, 0.6) < 0.62, 14, () => { const [x, z] = tgt(); const dx = x - st().p[0], dz = z - st().p[2], l = Math.hypot(dx, dz) || 1; return { mv: l < 0.15 ? [0, 0] : [dx / l, dz / l] } })
  react()
  { const [x, z] = W(1, 7, 2); place([x, 64.1 - 0.06, z], [0, 0, 1], 's16') }
  climb('s16'); take()
})
section(17, () => {
  walkTo(W(1, 9, 2)); walkTo(W(2, -7.4, 2))
  const [x, z] = W(2, -3.15, 2)
  const q = place([x, 64.1, z], [0, 1, 0], 's17')
  const hist = []
  if (q) until(() => st().mode === 'ground' && st().p[0] < -mu(-3.3), 8, () => {
    hist.push([sim.lad.phi || 0, sim.lad.phw || 0])
    const [ph, pw] = HUMAN ? (hist[hist.length - 13] || [0, 0]) : hist[hist.length - 1]
    const noise = HUMAN ? (rnd() - 0.5) * 0.6 : 0
    // 人はキーなので -1/0/1
    let lean = -ph * 7 - pw * 2 + noise
    if (HUMAN) lean = Math.abs(lean) < 0.3 ? 0 : Math.sign(lean)
    if (process.env.NOLEAN) lean = 0
    return { mv: [q.d[0], q.d[2]], lean: Math.max(-1, Math.min(1, lean)) }
  })
  if (sim.lad.state !== 'placed') fails.push('s17: 橋が倒れた ' + sim.lad.fwhy)
  take()
  jumpTo(W(2, -3.05, 2), W(2, -0.6, 2))
})
section(18, () => {
  walkTo(W(2, 1.8, 2))
  setLen(4.6)
  if (process.env.D18) console.log('pre18', st().p, st().mode)
  walkTo(W(2, 4.3, 2), 0.2)
  const cb = sim.world.boxes.find(b => b.sec === 18 && b.crumbleStand)
  if (process.env.D18) console.log('at18', st().p, st().mode, cb.load, cb.alive)
  const [x, z] = W(2, 5.5, 2)
  place([x, 67.7 - 0.06, z], [1, 0, 0], 's18')
  climb('s18'); take()
})
section(19, () => {
  walkTo(W(2, 9, 2)); walkTo(W(3, -9, 1.8)); walkTo(W(3, 1.4, 1.8))
  setLen(5.0)
  const [x, z] = W(3, 3, 1.8)
  place([x, 71.7 - 0.15, z], [0, 0, -1], 's19')
  climb('s19'); take()
})
section(20, () => {
  walkTo(W(3, 6, 2)); walkTo(W(3, 9, 2)); walkTo(W(0, -8.8, 2))
  const [x, z] = W(0, -7, 2)
  place([x, 75.2, z], [-1, 0, 0], 's20')
  climb('s20'); take()
  walkTo(W(0, -5, 2))
})
section(21, () => {
  setLen(4.2)
  walkTo(W(0, -0.6, 3.1))
  const [x, z] = W(0, 1, 3.1)
  place([x, 79.4, z], [-1, 0, 0], 's21')
  until(() => st().s >= sim.lad.L - 0.56, 4, { climb: 1 })
  if (process.env.D21) console.log('top21', st().p, st().mode, st().s, sim.lad.type, sim.lad.th * 57.3)
  sim.step({ mv: [0, 1], jump: true })
  if (process.env.D21) for (let i = 0; i < 8; i++) { stepN(4, { mv: [0, 1] }); console.log(st().p.map(v => v.toFixed(2)).join(','), st().mode) }
  until(() => st().mode === 'ground', 3, { mv: [0, 1] })
  if (st().p[1] < 79.1) fails.push('s21: 跳び移れない y=' + st().p[1].toFixed(1))
  take()
})
section(22, () => {
  walkTo(W(0, 6, 5.5)); walkTo(W(1, -12, 2.5)); walkTo(W(1, -10.3, 0.7))
  setLen(4.2)
  const [x, z] = W(1, -9, 0.7)
  place([x, 82.6 - 0.1, z], [0, 0, 1], 's22a')
  climb('s22a'); take()
  setLen(4.4)
  walkTo(W(1, -7.6, 0.7))
  const [x2, z2] = W(1, -6.6, 0.7)
  place([x2, 86.4 - 0.094, z2], [0, 0, 1], 's22b')
  climb('s22b'); take()
})
section(23, () => {
  walkTo(W(1, -2, 1)); walkTo(W(1, 0.6, 0.8))
  setLen(6.4)
  until(() => phase(5.0, 0.2) > 0.42 && phase(5.0, 0.2) < 0.46, 6)
  const [x, z] = W(1, 3, 0.8)
  place([x, 92.2 - 0.15, z], [0, 0, 1], 's23')
  climb('s23')
  walkTo(W(1, 6, 2))
})
const only = (process.env.SEC || '').split(',').filter(Boolean).map(Number)
if (!only.length) { for (const [n, fn] of SECS) runSec(n, fn) }
else {
  const N = Number(process.env.N || 12)
  for (const n of only) {
    const fn = SECS.find(x => x[0] === n)[1]
      curK = SEC_K[n]
    let ok = 0, ts = []
    for (let k = 0; k < N; k++) {
      seed = 1000 + k * 7919
      sim = new Sim(course)
      const f = course.flags.find(x => x.sec === n)
      // 区間の旗から。時刻は種でずらす（揺れ・風の位相）
      for (let i = 0; i < Math.floor(rnd() * 400); i++) { sim.tick++; sim.world.update(sim.tick) }
      sim.flag = course.flags.indexOf(f); sim.respawn(); sim.stats.falls = 0
      if (n >= 13) { sim.lad.tele = true; sim.lad.Lmax = 6.4 }
      fails = []
      const t0 = sim.timeT
      fn()
      const good = !fails.length && sim.stats.falls === 0 && sim.stats.dropped === 0 && st().p[1] >= f.p[1] - 0.3 && st().mode === 'ground'
      if (good) { ok++; ts.push(sim.timeT - t0) }
    }
    console.log(`区間${n} ${HUMAN ? '人の速さ' : '上手い'}: ${ok}/${N}  平均 ${ts.length ? (ts.reduce((a, b) => a + b) / ts.length).toFixed(1) : '-'}秒`)
  }
  process.exit(0)
}
console.log('区間  時間(秒)  高さ  落下')
for (const r of log) console.log(String(r.n).padStart(3), String(r.t).padStart(8), String(r.y).padStart(6), String(r.falls).padStart(4))
console.log('合計', sim.timeT.toFixed(1), '秒  頂上:', sim.done, ' 置いた回数', sim.stats.placed)
console.log('めり込み 最大', (pen.max * 100).toFixed(1), 'cm', JSON.stringify(pen.at), '刻み', pen.n)
if (fails.length) console.log('失敗:\n  ' + fails.join('\n  '))
