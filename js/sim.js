// SKY LADDER の物理（固定60Hz・描画とは独立）。人とはしごだけ。
// はしごは立てかけた面の中で倒れ（後ろへ）・滑り（足元が外へ）・横揺れする。
import { World } from './world.js?v=6'

export const DT = 1 / 60
export const G = 20
const R = 0.3, HT = 1.7, STEP = 0.42
const WALK = 4.4, WALK_CARRY = 3.9, JUMP_V = 6.1
const M_L = 12, M_C = 70           // はしご・人の重さ
const CLIMB_UP = 2.9, CLIMB_DN = 3.4
const UP = [0, 1, 0]
export const ROPE = 8      // はしごは腰の綱でつながっている

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = a => Math.hypot(a[0], a[1], a[2])
const hlen = a => Math.hypot(a[0], a[2])
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const clamp = (x, a, b) => x < a ? a : x > b ? b : x
export const V = { add, sub, mul, dot, len, hlen, norm }

// はしごの両端（足 F・上 T）と向き u を出す
export function ladderPose(lad) {
  if (lad.type === 'hook') {
    const n = mul(lad.d, -1)
    const F = add(lad.H, mul(add(mul(n, Math.sin(lad.al)), mul(UP, -Math.cos(lad.al))), lad.L))
    return { F, T: lad.H.slice(), u: norm(sub(lad.H, F)) }
  }
  if (lad.type === 'bridge' || lad.type === 'lying') {
    return { F: lad.F.slice(), T: lad.T.slice(), u: norm(sub(lad.T, lad.F)) }
  }
  const th = lad.th + (lad.dth || 0)
  const u = add(mul(lad.d, Math.cos(th)), mul(UP, Math.sin(th)))
  return { F: lad.F.slice(), T: add(lad.F, mul(u, lad.L)), u }
}

// 掛ける場所 hit（光線の当たり）から、はしごの置き方を決める。見た目の影と同じ関数
export function plan(world, pl, hit, L) {
  if (!hit) return { ok: false, why: 'none' }
  const b = hit.box, n = hit.n
  const feet = pl.p
  const res = { ok: false, hit }
  const skipEnds = []
  if (b.noLadder) return { ...res, why: 'bad' }
  // 引っ掛けるだけの梁: どこを押しても、人に近い側の縁へ
  // 壁の縁のすぐ下を押したら「縁に乗せる」
  let n2 = n, p2 = hit.p
  if (b.hookOnly && n[1] < 0.5) {
    p2 = hit.p.slice(); p2[1] = b.max[1]
    if (Math.abs(n[1]) < 0.5) { const ax = Math.abs(n[0]) > 0.5 ? 0 : 2; p2[ax] -= n[ax] * 0.02 }
    n2 = [0, 1, 0]
  } else if (Math.abs(n[1]) < 0.5 && (b.max[1] - hit.p[1] < 0.3 || b.max[1] - feet[1] < 1.0) && !b.core) {
    // 壁の縁のすぐ下を押した・向こうの足場が足と同じくらいの高さ（橋）
    const ax = Math.abs(n[0]) > 0.5 ? 0 : 2
    p2 = hit.p.slice(); p2[1] = b.max[1]; p2[ax] -= n[ax] * 0.3
    n2 = [0, 1, 0]
    // 縁ぎりぎり=いちばん立てる、少し下=寝かせる
    return plan(world, pl, { p: p2, n: n2, box: b, orig: hit, f: clamp((b.max[1] - hit.p[1]) / 0.3, 0, 1) }, L)
  }
  if (n2 !== n) return plan(world, pl, { p: p2, n: n2, box: b, orig: hit }, L)
  if (b.hookOnly && !b.hook) return { ...res, why: 'bad' }
  if (Math.abs(n[1]) < 0.5) {
    // 壁に立てかける。はしごは壁に直角
    const nn = [n[0], 0, n[2]], d = mul(nn, -1)
    const T = hit.p.slice()
    const sol = footSearch(world, T, nn, feet, L, gy => {
      const h = T[1] - gy
      if (h > L - 0.05) return { bad: 'high' }
      if (h < 1.0) return { bad: 'low' }
      return { d: Math.sqrt(L * L - h * h) }
    })
    if (!sol.ok) return { ...res, why: sol.why }
    const { dist, g } = sol
    const F = [T[0] + nn[0] * dist, g.y, T[2] + nn[2] * dist]
    const th = Math.atan2(T[1] - F[1], dist)
    const top = b.max[1] - T[1]
    Object.assign(res, { type: 'wall', F, d, th, wall: T.slice(), wallBox: b, footBox: g.box, mantle: top < 1.15 })
    skipEnds.push(b, g.box)
  } else if (n[1] > 0.5) {
    // 上の面。いちばん手前の縁に掛ける（引っ掛け／縁に乗せる／橋）
    let best = null
    for (const [ax, sgn] of [[0, -1], [0, 1], [2, -1], [2, 1]]) {
      const edge = sgn < 0 ? b.min[ax] : b.max[ax]
      const nrm = [0, 0, 0]; nrm[ax] = sgn
      const toPl = (feet[ax] - edge) * sgn       // 人が縁の外側にいるほど大きい
      const o = (hit.p[ax] - edge) * -sgn         // 縁から内側へどれだけ
      if (o < -0.01 || o > (b.hookOnly ? 9 : 1.6)) continue
      const score = toPl - o * 0.5
      if (!best || score > best.score) best = { ax, sgn, edge, nrm, o, score }
    }
    if (!best) return { ...res, why: 'bad' }
    const { ax, nrm, edge } = best
    const d = mul(nrm, -1)
    const C = hit.p.slice(); C[ax] = edge; C[1] = b.max[1]
    const rise = C[1] - feet[1]
    // 前に地面が続く（隙間が無い）なら橋ではない
    const front = world.groundAt(C[0] + nrm[0] * 0.35, C[2] + nrm[2] * 0.35, C[1] - 0.05, 0)
    const gap = !front || front.y < C[1] - 0.9
    if (b.hookOnly && rise <= 0.8) return { ...res, why: 'low' }
    if (b.hook && rise > 0.8) {
      // 縁に引っ掛ける。上は縁を少し越える
      const H = add(C, add(mul(d, 0.1), [0, 0.06, 0]))
      const g = world.groundAt(H[0] + nrm[0] * 0.8, H[2] + nrm[2] * 0.8, feet[1] + 0.6, 0)
      let al = 0, dangle = true
      if (g && H[1] - g.y < L) {
        const hh = H[1] - g.y
        const dd = Math.sqrt(L * L - hh * hh)
        // 足が届く地面の上か確かめる
        const fx = H[0] + nrm[0] * dd, fz = H[2] + nrm[2] * dd
        const g2 = world.groundAt(fx, fz, feet[1] + 0.6, 0.1)
        if (g2 && Math.abs(g2.y - g.y) < 0.05) { al = Math.acos(clamp(hh / L, -1, 1)); dangle = false }
        else if (g2) { const h2 = H[1] - g2.y; if (h2 < L) { al = Math.acos(h2 / L); dangle = false } }
      }
      const F = add(H, mul(add(mul(nrm, Math.sin(al)), [0, -Math.cos(al), 0]), L))
      Object.assign(res, { type: 'hook', H, d, al, F, topBox: b, dangle, footBox: dangle ? null : (world.groundAt(F[0], F[2], F[1] + 0.05, 0.1) || {}).box })
      skipEnds.push(b)
      if (res.footBox) skipEnds.push(res.footBox)
    } else if (gap && rise < 1.0 && rise > -2.6) {
      // 隙間に渡す橋
      let E = null
      for (let s = 0.3; s <= L; s += 0.05) {
        const q = [C[0] + nrm[0] * s, 0, C[2] + nrm[2] * s]
        const g = world.groundAt(q[0], q[2], feet[1] + 0.3, 0)
        if (g && Math.abs(g.y - feet[1]) < 0.35) { E = [q[0], g.y, q[2]]; E.box = g.box; break }
      }
      if (!E) return { ...res, why: 'far' }
      // 向こうの足場に乗せる深さ a（足場の奥行きより手前）、手前の端から外へ出る分 back
      const depth = d[ax] > 0 ? b.max[ax] - C[ax] : C[ax] - b.min[ax]
      const dy = C[1] - E[1]
      const gapH = hlen(sub(E, C))
      const room = Math.sqrt(Math.max(0, L * L - dy * dy)) - gapH   // 横に余る長さ
      if (room < 0.5) return { ...res, why: 'short' }
      const a = clamp(Math.min(room / 2, 0.9), 0.25, Math.max(0.25, depth - 0.12))
      const back = room - a
      if (back < 0.25) return { ...res, why: 'short' }
      const T = [C[0] + d[0] * a, C[1], C[2] + d[2] * a]
      const F = [E[0] + nrm[0] * back, E[1], E[2] + nrm[2] * back]
      const dir = norm(sub(T, F))
      const gT = world.groundAt(T[0], T[2], T[1] + 0.05, 0)
      const gF = world.groundAt(F[0], F[2], F[1] + 0.05, 0)
      if (!gT || !gF || Math.abs(gT.y - T[1]) > 0.06 || Math.abs(gF.y - F[1]) > 0.06) return { ...res, why: 'short' }
      const ang = Math.asin(clamp(dir[1], -1, 1))
      if (Math.abs(ang) > 0.5) return { ...res, why: 'steep' }
      Object.assign(res, { type: 'bridge', F, T, d: [dir[0], 0, dir[2]], topBox: gT.box, footBox: gF.box, th: ang })
      skipEnds.push(gT.box, gF.box)
    } else {
      // 縁に乗せる（上が縁を越える）
      if (rise < 1.0) return { ...res, why: 'low' }
      const sol = footSearch(world, C, nrm, feet, L, gy => {
        const h = C[1] - gy
        if (h > L - 0.2) return { bad: 'high' }
        if (h < 1.0) return { bad: 'low' }
        const omax = L - h - 0.006
        const o = hit.f != null ? omax - (omax - 0.2) * hit.f : clamp(best.o, 0.2, omax)
        const c = L - o
        return { d: Math.sqrt(Math.max(0, c * c - h * h)) }
      })
      if (!sol.ok) return { ...res, why: sol.why }
      const { dist, g } = sol
      const F = [C[0] + nrm[0] * dist, g.y, C[2] + nrm[2] * dist]
      const th = Math.atan2(C[1] - F[1], dist)
      const c2 = Math.hypot(C[1] - F[1], dist)
      Object.assign(res, { type: 'rest', F, d, th, C, c: c2, cornerBox: b, footBox: g.box, o: L - c2 })
      skipEnds.push(b, g.box)
    }
  } else return { ...res, why: 'bad' }
  // 置ける所か: 足元が人の近く・はしごが他の物を貫かない
  const F = res.F
  if (res.type !== 'hook' || !res.dangle) {
    if (Math.abs(F[1] - feet[1]) > 0.62) return { ...res, ok: false, why: 'nofloor' }
  }
  const hd = Math.hypot(F[0] - feet[0], F[2] - feet[2])
  if (hd > (res.type === 'hook' && res.dangle ? 3.4 : 3.3)) {
    // 少し遠くても、足元まで同じ高さの床が続いていれば、歩いて行って掛ける（7m まで）
    let walk = hd <= 7 && !(res.type === 'hook' && res.dangle)
    for (let k = 1; walk && k <= Math.ceil(hd / 0.25); k++) {
      const f = k / Math.ceil(hd / 0.25), x = feet[0] + (F[0] - feet[0]) * f, z = feet[2] + (F[2] - feet[2]) * f
      const g = world.groundAt(x, z, feet[1] + 0.45, 0.1)
      if (!g || Math.abs(g.y - feet[1]) > 0.45 || world.pointIn([x, feet[1] + 0.9, z], 0.05)) walk = false
    }
    if (!walk) return { ...res, ok: false, why: 'far' }
    res.walk = hd
  }
  const tmp = { ...res, L, dth: 0 }
  const pose = ladderPose(tmp)
  const trim = res.type === 'bridge' ? [0.25, 0.25] : res.type === 'rest' ? [0.25, Math.max(0.05, L - res.c - 0.15)] : [0.25, 0.3]
  const blk = world.segmentBlocked(pose.F, pose.T, 0.1, trim, bx => (skipEnds.includes(bx) && !bx.ceiling) || bx.max[1] - bx.min[1] < 0.1)
  if (blk) return { ...res, ok: false, why: 'blocked', blk: blk.box }
  res.pose = pose
  res.ok = true
  return res
}

// 足を置く距離を探す。壁から外へ少しずつ見て、その地面の高さで要る距離と合う所
function footSearch(world, P0, nn, feet, L, need) {
  let why = 'nofloor', prev = null
  for (let dist = 0.02; dist <= L + 0.01; dist += 0.02) {
    const g = world.groundAt(P0[0] + nn[0] * dist, P0[2] + nn[2] * dist, feet[1] + 0.6, 0.1)
    if (!g || Math.abs(g.y - feet[1]) > 0.62) { prev = null; continue }
    const r = need(g.y)
    if (r.bad) { why = r.bad; prev = null; continue }
    const err = r.d - dist
    if (Math.abs(err) < 0.011) return { ok: true, dist: r.d, g }
    if (prev && prev.g.box === g.box && Math.sign(prev.err) !== Math.sign(err)) return { ok: true, dist: r.d, g }
    prev = { err, g }
    why = 'nofloor'
  }
  return { ok: false, why }
}

export class Sim {
  constructor(course, opt = {}) {
    this.course = course
    this.world = new World(course)
    this.opt = opt
    this.reset()
  }
  reset() {
    const c = this.course
    this.tick = 0
    this.world.tick = 0
    this.world.reset()
    const s = c.flags[0].p
    this.pl = { p: s.slice(), v: [0, 0, 0], mode: 'ground', yaw: c.flags[0].yaw ?? 0, ground: null, coyote: 0, jb: 0, s: 0, stepAcc: 0, b: 0.3, fallTop: s[1], tw: null, airT: 0 }
    this.lad = { state: 'carry', L: c.L0 || 4.2, Lmin: 3.0, Lmax: 4.2, tele: false }
    this.flag = 0
    this.got = {}
    this.stats = { falls: 0, dropped: 0, placed: 0, bigFall: 0, maxY: s[1], tipped: 0, slipped: 0 }
    this.ev = []
    this.done = false
    this.timeT = 0
  }
  e(t, x) { this.ev.push({ t, ...x }) }

  // 入力: mv[x,z]（世界の向き）, climb(-1..1), lean(-1..1), jump, take, place(plan), lenD
  step(inp) {
    this.ev.length = 0
    this.tick++
    const W = this.world
    W.update(this.tick)
    const pl = this.pl, lad = this.lad
    if (!this.done) this.timeT += DT
    // 伸縮
    if (lad.tele && lad.state === 'carry' && inp.lenD) lad.L = clamp(lad.L + inp.lenD, lad.Lmin, lad.Lmax)
    // 置く
    if (inp.place && lad.state === 'carry' && (pl.mode === 'ground')) this.doPlace(inp.place)
    // 引き上げる（手元へ）
    if (inp.take && lad.state !== 'carry' && pl.mode !== 'ladder' && pl.mode !== 'beam' && pl.mode !== 'mantle') this.doTake()
    this.ladderStep(inp)
    this.playerStep(inp)
    // 崩れた壁は時間がたつと元に戻る（やり直せるように）
    for (const b of W.boxes) {
      if (b.alive || !(b.crumble || b.crumbleStand)) continue
      b.dead = (b.dead || 0) + DT
      const p = pl.p
      const inside = p[0] > b.min[0] - R && p[0] < b.max[0] + R && p[2] > b.min[2] - R && p[2] < b.max[2] + R && p[1] < b.max[1] + 0.5 && p[1] + HT > b.min[1]
      if (b.dead > 8 && !inside) { b.alive = true; b.dead = 0; b.load = 0; b.shake = 0; this.e('restore', { box: b.id }) }
    }
    this.checks()
  }

  canTake() {
    const pl = this.pl, lad = this.lad
    if (lad.state === 'carry' || lad.state === 'falling') return false
    if (lad.state === 'lost') return pl.mode === 'ground'
    if (pl.mode === 'ladder' || pl.mode === 'beam' || pl.mode === 'mantle' || pl.mode === 'auto') return false
    const P = ladderPose(lad)
    const c = add(pl.p, [0, 0.9, 0])
    const ab = sub(P.T, P.F)
    const t = clamp(dot(sub(c, P.F), ab) / dot(ab, ab), 0, 1)
    const q = add(P.F, mul(ab, t))
    return len(sub(c, q)) < ROPE
  }
  doTake() {
    if (!this.canTake()) return false
    this.lad.from = this.lad.state === 'lost' ? null : ladderPose(this.lad)
    this.lad.state = 'carry'
    this.lad.fromTick = this.tick
    this.e('take')
    return true
  }
  doPlace(p) {
    const W = this.world, pl = this.pl, lad = this.lad
    // その場で計算し直す（見た目の影とずれないよう、同じ関数）
    const q = plan(W, pl, p.hit, lad.L)
    if (!q.ok) { this.e('cant', { why: q.why }); return false }
    Object.assign(lad, {
      state: 'placed', type: q.type, F: q.F.slice(), d: q.d.slice(), th: q.th || 0, dth: 0, w: 0, vs: 0,
      phi: 0, phw: 0, wallP: q.wall, wallBox: q.wallBox, footBox: q.footBox, C: q.C, cornerBox: q.cornerBox,
      H: q.H, al: q.al || 0, alw: 0, topBox: q.topBox, T: q.T, dangle: q.dangle, lift: 0, thud: 0,
      placedTick: this.tick,
    })
    // 細い支えに渡した橋は、置いた瞬間から少し傾き始める（向きは置いた場所で決まる）
    if (q.type === 'bridge' && q.topBox && q.topBox.narrow) lad.phw = (Math.floor((q.T[0] + q.T[2]) * 10) % 2 ? 1 : -1) * 0.22
    this.stats.placed++
    this.e('place', { type: q.type })
    if (q.type === 'hook' && q.dangle) return true
    // 足元へ寄って、つかまる
    const tgt = q.F.slice()
    if (q.type !== 'bridge') { tgt[0] -= q.d[0] * 0.05; tgt[2] -= q.d[2] * 0.05 }
    const wd = hlen(sub(tgt, pl.p))
    pl.tw = { from: pl.p.slice(), to: tgt, t: 0, dur: wd > 3.3 ? wd / 6 : Math.min(0.24, 0.08 + wd * 0.06), then: q.type === 'bridge' ? 'beam' : 'ladder' }
    pl.mode = 'auto'
    pl.v = [0, 0, 0]
    return true
  }

  // ===== はしご =====
  ladderStep(inp) {
    const W = this.world, lad = this.lad, pl = this.pl
    if (lad.state === 'falling') {
      lad.ft += DT
      if (lad.ft >= lad.fdur) this.toLying()
      return
    }
    if (lad.state !== 'placed') return
    const on = pl.mode === 'ladder' || pl.mode === 'beam'
    const Mon = on ? M_C : (pl.mode === 'mantle' && pl.tw && pl.tw.t < 0.5 ? M_C * 0.5 : 0)
    const s = pl.s
    // 支えが動く・消える
    const carry = (P, box) => { if (box && box.move) { P[0] += box.dv[0]; P[1] += box.dv[1]; P[2] += box.dv[2] } }
    if (lad.type === 'wall') { carry(lad.F, lad.footBox); carry(lad.wallP, lad.wallBox) }
    if (lad.type === 'rest') { carry(lad.F, lad.footBox); carry(lad.C, lad.cornerBox) }
    if (lad.type === 'hook') { carry(lad.H, lad.topBox) }
    if (lad.type === 'bridge') { carry(lad.F, lad.footBox); carry(lad.T, lad.topBox) }
    // 崩れる
    const sup = lad.type === 'wall' ? lad.wallBox : lad.type === 'rest' ? lad.cornerBox : lad.topBox
    if (sup && sup.crumble && on) {
      sup.load += DT
      sup.shake = sup.load / sup.crumble
      if (sup.load >= sup.crumble && sup.alive) { sup.alive = false; this.e('crumble', { box: sup.id }) }
    }
    if (sup && !sup.alive) return this.fall('support')
    // 足元の地面
    if (lad.type !== 'hook' || !lad.dangle) {
      const P0 = ladderPose(lad).F
      const g = W.groundAt(P0[0], P0[2], P0[1] + 0.12, 0.05)
      if (!g || g.y < P0[1] - 0.15) return this.fall('foot')
      if (lad.type !== 'hook') { lad.F[1] = g.y; lad.footBox = g.box }
    }
    // 風
    const wind = W.windAt(on ? pl.p : ladderPose(lad).F, this.tick)
    const perp = [-lad.d[2], 0, lad.d[0]]
    const wd = wind[0] * lad.d[0] + wind[1] * lad.d[2]
    const wp = wind[0] * perp[0] + wind[1] * perp[2]
    lad.windP = wp
    // 横揺れ
    let k = 26
    if (lad.type === 'hook') k = 7
    if (lad.type === 'bridge') k = 18
    if (sup && sup.narrow) k = lad.type === 'bridge' ? -12 : -2.5
    if (lad.footBox && lad.footBox.narrow) k = Math.min(k, 5)
    const lean = on ? (inp.lean || 0) : 0
    let acc = -k * lad.phi - 2.6 * lad.phw + lean * (lad.type === 'bridge' ? 5 : 3.2) + wp * (Mon ? 0.32 : 0.05)
    if (lad.footBox && lad.footBox.move && lad.footBox.move.roll) acc += lad.footBox.dv[lad.footBox.move.rollAxis || 0] * 40
    lad.phw += acc * DT
    lad.phi += lad.phw * DT
    if (Math.abs(lad.phi) > 0.42) return this.fall('side')

    if (lad.type === 'hook') {
      // 縁から吊る。地面に足があれば動かない。宙なら振り子
      const n = mul(lad.d, -1)
      const footY = a => lad.H[1] - lad.L * Math.cos(a)
      const fx = a => [lad.H[0] + n[0] * lad.L * Math.sin(a), lad.H[2] + n[2] * lad.L * Math.sin(a)]
      const Lp = Mon ? Math.max(0.8, lad.L - s - 0.6) : lad.L * 0.55
      let aa = -(G / Lp) * Math.sin(lad.al) * 0.5 - 0.5 * lad.alw + wd * -0.08 * (Mon ? 1 : 0.2)
      lad.alw += aa * DT
      let na = lad.al + lad.alw * DT
      na = clamp(na, -0.9, 1.25)
      // 地面に当たるなら止める
      const [x1, z1] = fx(na)
      const g = W.groundAt(x1, z1, Math.max(footY(lad.al), footY(na)) + 0.3, 0.05)
      if (g && footY(na) < g.y) {
        // 地面の高さに合う角度へ
        const hh = lad.H[1] - g.y
        if (hh < lad.L) { const ag = Math.acos(clamp(hh / lad.L, -1, 1)); na = na >= 0 ? Math.max(ag, 0) : -ag }
        if (Math.abs(lad.alw) > 0.6) this.e('thud', { k: Math.abs(lad.alw) })
        lad.alw = 0
        lad.dangle = false
      } else if (!g || footY(na) > g.y + 0.05) lad.dangle = true
      lad.al = na
      return
    }
    if (lad.type === 'bridge') {
      // 両端が乗っているか
      for (const [P, box] of [[lad.F, lad.footBox], [lad.T, lad.topBox]]) {
        const g = W.groundAt(P[0], P[2], P[1] + 0.2, 0.0)
        if (!g || g.y < P[1] - 0.25) return this.fall('bridge')
      }
      const span = len(sub(lad.T, lad.F))
      if (span > lad.L + 0.02) return this.fall('bridge')
      return
    }
    // ---- 壁・縁: 立てかけ ----
    let thc
    if (lad.type === 'wall') {
      const uw = dot(sub(lad.wallP, lad.F), lad.d)
      if (uw >= lad.L * 0.985) return this.fall('slip')
      thc = Math.acos(clamp(uw / lad.L, -1, 1))
    } else {
      const v = sub(lad.C, lad.F)
      const dh = dot(v, lad.d), dv = v[1]
      lad.c = Math.hypot(dh, dv)
      if (lad.c > lad.L - 0.05) return this.fall('slipoff')
      thc = Math.atan2(dv, dh)
    }
    lad.th = thc
    const th = thc + lad.dth
    const cs = Math.cos(th), sn = Math.sin(th)
    const b = pl.mode === 'ladder' ? pl.b : 0.3
    const xc = (s + 1.0) * cs - b * sn
    const hc = (s + 1.0) * sn + b * cs
    const Fw = Mon * wd * 0.9
    let tau = G * (M_L * lad.L / 2 * cs + Mon * xc) + Fw * hc
    if (lad.kick) { tau -= lad.kick; lad.kick *= 0.82; if (lad.kick < 5) lad.kick = 0 }
    const I = M_L * lad.L * lad.L / 3 + Mon * ((s + 1) * (s + 1) + b * b)
    if (lad.dth > 0 || tau < 0) {
      // 浮いて後ろへ倒れかけ
      if (lad.dth === 0 && lad.lift === 0) this.e('lift')
      lad.lift = 1
      lad.w += (-tau / I) * DT
      lad.dth += lad.w * DT
      if (lad.dth <= 0) {
        if (lad.w < -0.25) this.e('thud', { k: -lad.w })
        lad.dth = 0; lad.w = 0; lad.lift = 0
      }
      if (th > 1.72) { this.stats.tipped++; return this.fall('back') }
      lad.vs = 0
      return
    }
    lad.lift = 0
    // 足元が滑るか
    const Wt = (M_L + Mon) * G
    let fNeed, Nf
    if (lad.type === 'wall') {
      const N = tau / (lad.L * sn)
      fNeed = N - Fw
      Nf = Math.max(Wt * 0.25, Wt - 0.25 * N)
    } else {
      const N = tau / lad.c
      const muc = 0.35
      fNeed = N * sn - muc * N * cs - Fw
      Nf = Math.max(Wt * 0.2, Wt - N * cs - muc * N * sn)
    }
    const mu = (lad.footBox ? lad.footBox.mu : 0.6)
    lad.need = fNeed / Nf
    if (lad.vs > 0 || fNeed > mu * Nf) {
      if (lad.vs === 0) { this.e('slip'); this.stats.slipped++ }
      const a = (fNeed - mu * 0.78 * Nf) / (M_L + Mon) * 1.6
      lad.vs = Math.max(0, lad.vs + a * DT)
      if (lad.vs === 0 && a < 0) this.e('grip')
      lad.F[0] -= lad.d[0] * lad.vs * DT
      lad.F[2] -= lad.d[2] * lad.vs * DT
      if (thc < 0.34) return this.fall('slip')
    }
  }

  // はしごが倒れる（見た目の動きは view が ft/fdur で補う）
  fall(why) {
    const lad = this.lad, pl = this.pl
    const P = ladderPose(lad)
    lad.from = P
    lad.state = 'falling'
    lad.fwhy = why
    lad.ft = 0
    // 倒れた後の置き場所: 地面に寝かせる
    const mid = mul(add(P.F, P.T), 0.5)
    let dirH = norm([P.u[0], 0, P.u[2]])
    if (!isFinite(dirH[0]) || hlen(dirH) < 0.1) dirH = lad.d ? lad.d.slice() : [1, 0, 0]
    let cx = mid[0], cz = mid[2]
    if (why === 'back') { cx = P.F[0] - (lad.d[0]) * lad.L * 0.5; cz = P.F[2] - lad.d[2] * lad.L * 0.5 }
    if (why === 'slip' || why === 'slipoff') { cx = P.F[0] - lad.d[0] * 0.6 + lad.d[0] * lad.L * 0.45; cz = P.F[2] - lad.d[2] * 0.6 + lad.d[2] * lad.L * 0.45 }
    if (why === 'side') { const pp = [-lad.d[2], 0, lad.d[0]]; const sg = lad.phi > 0 ? 1 : -1; cx = P.F[0] + pp[0] * sg * lad.L * 0.5; cz = P.F[2] + pp[2] * sg * lad.L * 0.5; dirH = mul(pp, sg) }
    const g = this.world.groundAt(cx, cz, Math.max(P.F[1], P.T[1]) + 0.3, 0.2)
    const y = g ? g.y + 0.06 : -200
    const half = mul(dirH, lad.L / 2)
    lad.toF = [cx - half[0], y, cz - half[2]]
    lad.toT = [cx + half[0], y, cz + half[2]]
    const drop = Math.max(0, Math.max(P.F[1], P.T[1]) - y)
    lad.fdur = clamp(0.55 + Math.sqrt(2 * Math.min(drop, 60) / G) * 0.6, 0.6, 2.2)
    this.e('ladfall', { why })
    // 乗っていた人も落ちる
    if (pl.mode === 'ladder' || pl.mode === 'beam') {
      pl.mode = 'air'
      const out = mul(lad.d || [0, 0, 1], -1)
      pl.v = why === 'back' ? add(mul(out, 3.2), [0, 0.5, 0]) : why === 'side' ? add(mul(dirH, 2.2), [0, 0, 0]) : add(mul(out, 1.5), [0, -1, 0])
      pl.airT = 0
      this.e('drop', { why })
      this.stats.dropped++
    }
  }
  toLying() {
    const lad = this.lad
    lad.state = 'lying'
    lad.type = 'lying'
    lad.F = lad.toF; lad.T = lad.toT
    if (lad.F[1] < -150) { lad.state = 'lost' }
    this.e('ladland')
  }

  // ===== 人 =====
  playerStep(inp) {
    const W = this.world, pl = this.pl, lad = this.lad
    if (pl.mode === 'auto' || pl.mode === 'mantle') {
      const tw = pl.tw
      if (tw.box && tw.box.move) for (let i = 0; i < 3; i++) { tw.to[i] += tw.box.dv[i]; tw.from[i] += tw.box.dv[i] }
      tw.t += DT / tw.dur
      const k = Math.min(1, tw.t)
      const e = k * k * (3 - 2 * k)
      for (let i = 0; i < 3; i++) pl.p[i] = tw.from[i] + (tw.to[i] - tw.from[i]) * e
      if (pl.mode === 'mantle') pl.p[1] = tw.from[1] + (tw.to[1] - tw.from[1]) * Math.min(1, k * 1.6)
      if (k >= 1) {
        if (tw.then === 'ladder' && lad.state === 'placed') { pl.mode = 'ladder'; pl.s = 0; pl.stepAcc = 0 }
        else if (tw.then === 'beam' && lad.state === 'placed') { pl.mode = 'beam'; pl.s = 0.2 }
        else { pl.mode = 'ground'; pl.v = [0, 0, 0]; this.pushOut(STEP); this.e('land', { h: 0 }) }
        pl.tw = null
      }
      return
    }
    if (pl.mode === 'ladder') return this.onLadder(inp)
    if (pl.mode === 'beam') return this.onBeam(inp)
    this.walk(inp)
  }

  onLadder(inp) {
    const pl = this.pl, lad = this.lad
    if (lad.state !== 'placed') { pl.mode = 'air'; return }
    const P = ladderPose(lad)
    const c = clamp(inp.climb || 0, -1, 1)
    let sMax
    if (lad.type === 'wall') sMax = lad.L - 0.55
    else if (lad.type === 'rest') sMax = Math.min(lad.L - 0.45, lad.c - 0.3)
    else sMax = lad.L - 0.5
    const prev = pl.s
    pl.s = clamp(pl.s + (c > 0 ? c * CLIMB_UP : c * CLIMB_DN) * DT, 0, sMax)
    const ds = pl.s - prev
    // 手足を出すたびに体が後ろへ・横へ揺れる
    pl.stepAcc += Math.abs(ds)
    pl.b = 0.3 - (c > 0 ? 0.04 : 0) + (c < 0 ? 0.03 : 0) + 0.05 * Math.sin(pl.stepAcc / 0.32 * Math.PI)
    if (pl.stepAcc > 0.32) {
      pl.stepAcc -= 0.32
      pl.stepSide = -(pl.stepSide || 1)
      lad.phw += pl.stepSide * 0.2 * Math.abs(c)
      this.e('rung')
    }
    // 体の位置: はしごの段の上、少し外
    const out = norm(sub(mul(UP, 1), mul(P.u, P.u[1])))  // はしごに直角で上向き寄り
    const perpOut = mul(cross(P.u, cross(UP, P.u)), -1)
    const side = norm(cross(UP, P.u))
    const bodyOff = norm(sub(mul(lad.d || [0, 0, 1], -1), mul(P.u, dot(mul(lad.d || [0, 0, 1], -1), P.u))))
    pl.p = add(add(P.F, mul(P.u, pl.s)), mul(bodyOff, 0.22))
    pl.p = add(pl.p, mul(side, lad.phi * pl.s * 0.9))
    pl.v = [0, 0, 0]
    pl.yaw = Math.atan2(lad.d[0], lad.d[2])
    void out; void perpOut
    // 上に着いた: 乗り越える
    if (pl.s >= sMax - 0.01 && c > 0.3) {
      let to = null
      if (lad.type === 'wall' && lad.wallBox && lad.wallBox.alive) {
        const top = lad.wallBox.max[1]
        if (top - P.T[1] < 1.15) to = [P.T[0] + lad.d[0] * 0.55, top, P.T[2] + lad.d[2] * 0.55]
      } else if (lad.type === 'rest') to = [lad.C[0] + lad.d[0] * 0.55, lad.C[1], lad.C[2] + lad.d[2] * 0.55]
      else if (lad.type === 'hook') to = [lad.H[0] + lad.d[0] * 0.5, lad.topBox.max[1], lad.H[2] + lad.d[2] * 0.5]
      if (to) {
        const g = this.world.groundAt(to[0], to[2], to[1] + 0.3, 0.1)
        const head = this.world.pointIn([to[0], to[1] + 1.2, to[2]], 0.02)
        if (g && Math.abs(g.y - to[1]) < 0.3 && !head) {
          to[1] = g.y
          pl.mode = 'mantle'
          pl.tw = { from: pl.p.slice(), to, t: 0, dur: 0.32, then: 'ground', box: g.box }
          if (lad.type === 'wall' || lad.type === 'rest') lad.kick = 260
          this.e('mantle')
          return
        }
      }
    }
    // 跳ぶ（はしごから次の足場へ）
    if (inp.jump) {
      const mv = inp.mv || [0, 0]
      let dir = [mv[0], 0, mv[1]]
      if (hlen(dir) < 0.2) dir = mul(lad.d, -1)
      dir = norm(dir)
      pl.mode = 'air'
      pl.v = add(mul(dir, 3.6), [0, 5.4, 0])
      pl.airT = 0
      pl.fallTop = pl.p[1]
      if (lad.type === 'wall' || lad.type === 'rest') lad.kick = 180 * Math.max(0, -dot(dir, lad.d))
      this.e('jump')
      return
    }
    // 一番下で下を押したら降りる
    if (pl.s <= 0.001 && c < -0.3 && (lad.type !== 'hook' || !lad.dangle)) {
      pl.mode = 'ground'
      pl.p = add(P.F, mul(lad.d, -0.45))
      const g = this.world.groundAt(pl.p[0], pl.p[2], pl.p[1] + 0.5, R * 0.6)
      if (g) pl.p[1] = g.y
      this.e('off')
    }
  }

  onBeam(inp) {
    const pl = this.pl, lad = this.lad
    if (lad.state !== 'placed') { pl.mode = 'air'; return }
    const P = ladderPose(lad)
    const mv = inp.mv || [0, 0]
    const along = mv[0] * P.u[0] + mv[1] * P.u[2]
    const hl = hlen(P.u) || 1
    const ds = along / hl * 3.0 * DT
    pl.s = pl.s + ds
    pl.stepAcc += Math.abs(ds)
    if (pl.stepAcc > 0.5) { pl.stepAcc -= 0.5; pl.stepSide = -(pl.stepSide || 1); lad.phw += pl.stepSide * 0.2; this.e('rung') }
    const side = norm(cross(UP, P.u))
    pl.p = add(add(P.F, mul(P.u, clamp(pl.s, 0, lad.L))), mul(side, lad.phi * 0.5))
    pl.p[1] += 0.06
    if (Math.abs(along) > 0.2) pl.yaw = Math.atan2(P.u[0] * Math.sign(along), P.u[2] * Math.sign(along))
    if (pl.s < 0.05 || pl.s > lad.L - 0.05) {
      pl.mode = 'ground'
      const end = pl.s < 0.05 ? sub(P.F, mul(P.u, 0.05)) : add(P.T, mul(P.u, 0.05))
      const g = this.world.groundAt(end[0], end[2], end[1] + 0.5, R * 0.6)
      pl.p = [end[0], g ? g.y : end[1], end[2]]
      if (!g) pl.mode = 'air'
      this.e('off')
      return
    }
    if (inp.jump) {
      pl.mode = 'air'
      let dir = [mv[0], 0, mv[1]]
      pl.v = add(mul(hlen(dir) > 0.2 ? norm(dir) : [0, 0, 0], 3.6), [0, JUMP_V, 0])
      pl.fallTop = pl.p[1]
      this.e('jump')
    }
  }

  walk(inp) {
    const W = this.world, pl = this.pl, lad = this.lad
    const mv = inp.mv || [0, 0]
    const ml = Math.min(1, Math.hypot(mv[0], mv[1]))
    const sp = lad.state === 'carry' ? WALK_CARRY : WALK
    const want = [mv[0] * sp, mv[1] * sp]
    const grounded = pl.mode === 'ground'
    // 動く床に乗っていれば一緒に
    if (grounded && pl.ground && pl.ground.move) { pl.p[0] += pl.ground.dv[0]; pl.p[1] += pl.ground.dv[1]; pl.p[2] += pl.ground.dv[2] }
    const accel = grounded ? (pl.ground && pl.ground.mu < 0.2 ? 6 : 42) : 9
    for (let i = 0; i < 2; i++) {
      const vi = i === 0 ? 0 : 2
      const dv = want[i] - pl.v[vi]
      const m = accel * DT
      pl.v[vi] += clamp(dv, -m, m)
    }
    if (ml > 0.1) pl.yaw = Math.atan2(mv[0], mv[1])
    // 風
    const wind = W.windAt([pl.p[0], pl.p[1] + 1, pl.p[2]], this.tick)
    pl.v[0] += wind[0] * 0.55 * DT * (grounded ? 1 : 0.6)
    pl.v[2] += wind[1] * 0.55 * DT * (grounded ? 1 : 0.6)
    // 跳ぶ
    if (inp.jump) pl.jb = 0.12
    pl.jb = Math.max(0, pl.jb - DT)
    pl.coyote = grounded ? 0.1 : Math.max(0, pl.coyote - DT)
    if (pl.jb > 0 && pl.coyote > 0) {
      pl.v[1] = JUMP_V; pl.mode = 'air'; pl.jb = 0; pl.coyote = 0; pl.fallTop = pl.p[1]; pl.airT = 0
      this.e('jump')
    }
    if (pl.mode === 'air') { pl.v[1] -= G * DT; pl.airT += DT; if (pl.v[1] < -38) pl.v[1] = -38 }
    else pl.v[1] = 0
    // 横
    const step = pl.mode === 'ground' ? STEP : 0.02
    pl.p[0] += pl.v[0] * DT
    pl.p[2] += pl.v[2] * DT
    this.pushOut(step)
    // 縦
    const oy = pl.p[1]
    pl.p[1] += pl.v[1] * DT
    if (pl.v[1] > 0) {
      for (const b of W.boxes) {
        if (!b.alive || b.noHit) continue
        if (b.min[1] < oy + HT - 0.01 || b.min[1] > pl.p[1] + HT) continue
        if (circRect(pl.p, R * 0.9, b)) { pl.p[1] = b.min[1] - HT; pl.v[1] = 0 }
      }
    }
    const g = W.groundAt(pl.p[0], pl.p[2], (pl.mode === 'ground' ? oy + STEP : oy + 0.12), R * 0.62)
    if (g && pl.p[1] <= g.y + (pl.mode === 'ground' ? 0.06 : 0)) {
      if (pl.mode === 'air') {
        const h = pl.fallTop - g.y
        this.e('land', { h, v: -pl.v[1] })
        if (h > 4.5) { this.stats.falls++; this.stats.bigFall = Math.max(this.stats.bigFall, h) }
        if (h > 3 && lad.state !== 'carry') this.ladderReturn(h)
      }
      pl.p[1] = g.y; pl.v[1] = 0; pl.mode = 'ground'; pl.ground = g.box
      pl.fallTop = g.y
      if (g.box.crumbleStand) { g.box.load += DT; g.box.shake = g.box.load / g.box.crumbleStand; if (g.box.load >= g.box.crumbleStand && g.box.alive) { g.box.alive = false; this.e('crumble', { box: g.box.id }) } }
    } else if (pl.mode === 'ground') {
      pl.mode = 'air'; pl.ground = null; pl.airT = 0
      pl.fallTop = pl.p[1]
    }
    if (pl.mode === 'air') pl.fallTop = Math.max(pl.fallTop, pl.p[1])
    // はしごにつかまる
    if (lad.state === 'placed' && (lad.type === 'wall' || lad.type === 'rest' || lad.type === 'hook') && (ml > 0.3 || (lad.type === 'hook' && lad.dangle && pl.mode === 'air'))) {
      const P = ladderPose(lad)
      const dm = ml > 0.01 ? (mv[0] * lad.d[0] + mv[1] * lad.d[2]) / ml : 0
      // 下から
      const dx = P.F[0] - pl.p[0], dz = P.F[2] - pl.p[2]
      if (dm > 0.5 && Math.hypot(dx, dz) < 0.75 && Math.abs(P.F[1] - pl.p[1]) < 0.6 && pl.mode === 'ground') {
        pl.mode = 'ladder'; pl.s = 0; pl.stepAcc = 0; this.e('grab')
      } else if (lad.type === 'hook' && lad.dangle) {
        // 宙に垂れたはしごへ飛びつく
        const c = add(pl.p, [0, 1.0, 0])
        const ab = sub(P.T, P.F)
        const t = clamp(dot(sub(c, P.F), ab) / dot(ab, ab), 0, 1)
        const q = add(P.F, mul(ab, t))
        if (len(sub(c, q)) < 0.75 && (pl.mode === 'air' || dm > 0.3)) { pl.mode = 'ladder'; pl.s = clamp(t * lad.L - 1.0, 0, lad.L - 0.6); this.e('grab') }
      } else if (dm < -0.5 && pl.mode === 'ground') {
        // 上から降りる
        const top = lad.type === 'rest' ? lad.C : lad.type === 'hook' ? lad.H : P.T
        if (Math.hypot(top[0] - pl.p[0], top[2] - pl.p[2]) < 0.85 && Math.abs(top[1] - pl.p[1]) < 1.2 && pl.p[1] > P.F[1] + 1) {
          pl.mode = 'ladder'
          pl.s = lad.type === 'rest' ? Math.min(lad.L - 0.45, lad.c - 0.3) : lad.L - 0.55
          this.e('grab')
        }
      }
    }
  }
  pushOut(step) {
    const pl = this.pl
    for (let it = 0; it < 3; it++) {
      for (const b of this.world.boxes) {
        if (!b.alive || b.noHit) continue
        if (b.max[1] <= pl.p[1] + step || b.min[1] >= pl.p[1] + HT) continue
        const cx = clamp(pl.p[0], b.min[0], b.max[0]), cz = clamp(pl.p[2], b.min[2], b.max[2])
        let dx = pl.p[0] - cx, dz = pl.p[2] - cz
        const d2 = dx * dx + dz * dz
        if (d2 >= R * R) continue
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), k = (R - d) / d
          pl.p[0] += dx * k; pl.p[2] += dz * k
          const nx = dx / d, nz = dz / d, vn = pl.v[0] * nx + pl.v[2] * nz
          if (vn < 0) { pl.v[0] -= vn * nx; pl.v[2] -= vn * nz }
        } else {
          const pen = [pl.p[0] - b.min[0], b.max[0] - pl.p[0], pl.p[2] - b.min[2], b.max[2] - pl.p[2]]
          let i = 0; for (let j = 1; j < 4; j++) if (pen[j] < pen[i]) i = j
          if (i === 0) pl.p[0] = b.min[0] - R; else if (i === 1) pl.p[0] = b.max[0] + R
          else if (i === 2) pl.p[2] = b.min[2] - R; else pl.p[2] = b.max[2] + R
        }
      }
    }
  }
  // 落ちて遠くなったはしごは、下まで転げ落ちてくる
  ladderReturn(h) {
    const lad = this.lad, pl = this.pl
    if (lad.state === 'carry' || lad.state === 'falling') return
    const P = ladderPose(lad)
    const mid = mul(add(P.F, P.T), 0.5)
    if (lad.state === 'lost' || len(sub(mid, pl.p)) > ROPE) {
      lad.from = lad.state === 'lost' ? null : P
      lad.state = 'carry'; lad.type = null
      lad.fromTick = this.tick
      this.e('ladback')
    }
  }
  checks() {
    const pl = this.pl, c = this.course
    this.stats.maxY = Math.max(this.stats.maxY, pl.p[1])
    if (pl.mode === 'ground') {
      for (let i = 0; i < c.flags.length; i++) {
        const f = c.flags[i].p
        if (Math.hypot(f[0] - pl.p[0], f[2] - pl.p[2]) < 1.7 && Math.abs(f[1] - pl.p[1]) < 1.2 && i !== this.flag) {
          if (i > this.flag || c.flags[i].p[1] > c.flags[this.flag].p[1]) { this.flag = i; this.e('flag', { i }) }
        }
      }
    }
    for (let i = 0; i < (c.pickups || []).length; i++) {
      const k = c.pickups[i]
      if (this.got[i] || Math.hypot(k.p[0] - pl.p[0], k.p[2] - pl.p[2]) > 1.3 || Math.abs(k.p[1] - pl.p[1]) > 1.5) continue
      this.got[i] = true
      if (k.kind === 'tele') { this.lad.tele = true; this.lad.Lmax = 6.4; this.lad.Lmin = 3.0 }
      this.e('pickup', { kind: k.kind })
    }
    if (pl.p[1] < (c.abyss ?? -30)) this.respawn()
    if (c.goal && !this.done && Math.hypot(c.goal.p[0] - pl.p[0], c.goal.p[2] - pl.p[2]) < c.goal.r && Math.abs(pl.p[1] - c.goal.p[1]) < 1.5) {
      this.done = true; this.e('goal')
    }
  }
  respawn() {
    const f = this.course.flags[this.flag]
    const pl = this.pl
    pl.p = f.p.slice(); pl.v = [0, 0, 0]; pl.mode = 'ground'; pl.fallTop = f.p[1]; pl.yaw = f.yaw ?? pl.yaw
    this.lad.state = 'carry'; this.lad.type = null; this.lad.from = null
    this.stats.falls++
    this.e('abyss')
  }
  // 見た目と検査のための今の状態
  snapshot() {
    return { tick: this.tick, p: this.pl.p.slice(), mode: this.pl.mode, lad: this.lad.state, flag: this.flag, done: this.done }
  }
}

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
function circRect(p, r, b) {
  const cx = clamp(p[0], b.min[0], b.max[0]), cz = clamp(p[2], b.min[2], b.max[2])
  return (p[0] - cx) ** 2 + (p[2] - cz) ** 2 < r * r
}
