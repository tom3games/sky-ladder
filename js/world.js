// 当たりの形（箱だけ）。見た目のメッシュもこの一覧から作る。
// 箱は軸にそろえた直方体。動く箱は時刻から決まる（同じ刻みなら同じ位置）。

export const MU = { stone: 0.62, wood: 0.58, wet: 0.2, moss: 0.2, leaves: 0.15, ishi: 0.62, branch: 0.55, gate: 0.6, roof: 0.5, roofu: 0.6, bark: 0.6, fence: 0.6, yagura: 0.6, tier: 0.6, ice: 0.08, metal: 0.42, beam: 0.58, crack: 0.62, sway: 0.6 }

export class World {
  constructor(course) {
    this.course = course
    this.boxes = course.boxes.map((b, i) => ({
      id: i, ...b,
      bmin: b.min.slice(), bmax: b.max.slice(),
      min: b.min.slice(), max: b.max.slice(),
      dv: [0, 0, 0], alive: true, load: 0, shake: 0,
      mu: b.mu ?? MU[b.mat] ?? 0.6,
    }))
    this.moving = this.boxes.filter(b => b.move)
    this.winds = course.winds || []
    this.tick = 0
  }
  // 時刻 tick の位置へ動かす（固定60Hz）
  update(tick) {
    this.tick = tick
    const t = tick / 60
    for (const b of this.moving) {
      const m = b.move
      const k = m.amp * Math.sin((t / m.period + (m.phase || 0)) * Math.PI * 2)
      for (let i = 0; i < 3; i++) {
        const nmin = b.bmin[i] + m.axis[i] * k
        b.dv[i] = nmin - b.min[i]
        b.min[i] = nmin
        b.max[i] = b.bmax[i] + m.axis[i] * k
      }
    }
  }
  reset() {
    for (const b of this.boxes) { b.alive = true; b.load = 0; b.shake = 0 }
    this.update(this.tick)
  }
  // 光線と箱。いちばん近い当たりを返す
  raycast(o, d, maxT = 200, skip) {
    let best = null
    for (const b of this.boxes) {
      if (!b.alive || b.noHit || (skip && skip(b))) continue
      let t0 = -Infinity, t1 = Infinity, ax = -1, sg = 0
      let ok = true
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) {
          if (o[i] < b.min[i] || o[i] > b.max[i]) { ok = false; break }
          continue
        }
        let ta = (b.min[i] - o[i]) / d[i], tb = (b.max[i] - o[i]) / d[i]
        let s = -1
        if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1 }
        if (ta > t0) { t0 = ta; ax = i; sg = s }
        if (tb < t1) t1 = tb
        if (t0 > t1) { ok = false; break }
      }
      if (!ok || t1 < 0 || t0 < 0 || t0 > maxT) continue
      if (!best || t0 < best.t) {
        const n = [0, 0, 0]; n[ax] = sg
        best = { t: t0, p: [o[0] + d[0] * t0, o[1] + d[1] * t0, o[2] + d[2] * t0], n, box: b }
      }
    }
    return best
  }
  // (x,z) の真下、高さ yTop 以下でいちばん高い上面。r>0 なら円の足跡で
  groundAt(x, z, yTop, r = 0, skip) {
    let best = null
    for (const b of this.boxes) {
      if (!b.alive || b.noFloor || (skip && skip(b))) continue
      if (b.max[1] > yTop + 1e-4) continue
      if (r > 0) {
        const cx = Math.max(b.min[0], Math.min(x, b.max[0])), cz = Math.max(b.min[2], Math.min(z, b.max[2]))
        if ((cx - x) ** 2 + (cz - z) ** 2 > r * r) continue
      } else if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) continue
      if (!best || b.max[1] > best.y) best = { y: b.max[1], box: b }
    }
    return best
  }
  // 点が箱の中か（少し内側に縮めて）
  pointIn(p, shrink = 0, skip) {
    for (const b of this.boxes) {
      if (!b.alive || b.noHit || (skip && skip(b))) continue
      if (p[0] > b.min[0] + shrink && p[0] < b.max[0] - shrink &&
          p[1] > b.min[1] + shrink && p[1] < b.max[1] - shrink &&
          p[2] > b.min[2] + shrink && p[2] < b.max[2] - shrink) return b
    }
    return null
  }
  // 線分 a→b を太さ r の棒として、箱に入るか（両端 endTrim は見ない）
  segmentBlocked(a, b, r, endTrim, skip) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const n = Math.max(2, Math.ceil(L / 0.08))
    for (let i = 0; i <= n; i++) {
      const s = i / n * L
      if (s < endTrim[0] || s > L - endTrim[1]) continue
      const f = s / L
      const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
      for (const bx of this.boxes) {
        if (!bx.alive || bx.noHit || (skip && skip(bx))) continue
        if (p[0] > bx.min[0] - r && p[0] < bx.max[0] + r &&
            p[1] > bx.min[1] - r && p[1] < bx.max[1] + r &&
            p[2] > bx.min[2] - r && p[2] < bx.max[2] + r) return { box: bx, s }
      }
    }
    return null
  }
  windAt(p, tick) {
    let wx = 0, wz = 0
    for (const w of this.winds) {
      if (p[0] < w.min[0] || p[0] > w.max[0] || p[1] < w.min[1] || p[1] > w.max[1] || p[2] < w.min[2] || p[2] > w.max[2]) continue
      const ph = ((tick / 60 + (w.phase || 0)) % w.period) / w.period
      // 吹く間: 立ち上がり0.15・強い・弱まる。予兆は view が ph で出す
      let k = 0
      if (ph < w.on) {
        const q = ph / w.on
        k = q < 0.15 ? q / 0.15 : q > 0.8 ? (1 - q) / 0.2 : 1
      }
      wx += w.dir[0] * w.strength * k; wz += w.dir[2] * w.strength * k
    }
    return [wx, wz]
  }
}
