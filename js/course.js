// 塔のコース。箱の一覧（当たりと見た目は同じデータ）
// 塔の芯は x,z = -C..C。外周の4面に、面ごとの座標 (u=面に沿う, w=外へ, y=上) で置く。
// 区間の設計は半幅 7 の面で書き、段ごとの半幅 K へずらす（u は 0 を境に外へ、w は面から）
const C = 7
let K = 7
export function setK(k) { K = k }
export const TIERS = [
  // [半幅, 下, 上]（石垣の段々。いちばん上が天守）
  [15, -14, 18], [11, 18, 53.5], [9, 53.5, 70], [7, 70, 96],
]
// 区間ごとの段の半幅
export const SEC_K = { 1: 15, 2: 15, 3: 15, 4: 15, 5: 15, 6: 15, 7: 15, 8: 11, 9: 11, 10: 11, 11: 11, 12: 11, 13: 11, 14: 11, 15: 9, 16: 9, 17: 9, 18: 9, 19: 9, 20: 7, 21: 7, 22: 7, 23: 7 }
const mu = u => u + (u >= 0 ? 1 : -1) * (K - C)
// 面 f の (u,w) を世界の (x,z) へ
function fx(f, u, w) {
  u = mu(u)
  if (f === 0) return [u, K + w]
  if (f === 1) return [K + w, -u]
  if (f === 2) return [-u, -(K + w)]
  return [-(K + w), u]
}
// 面の外向き
export const FACE_N = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0]]

function makeBuilder() {
  const boxes = [], flags = [], winds = [], marks = []
  const F = (f, u0, u1, w0, w1, y0, y1, o = {}) => {
    const [ax, az] = fx(f, u0, w0), [bx, bz] = fx(f, u1, w1)
    const b = {
      min: [Math.min(ax, bx), y0, Math.min(az, bz)],
      max: [Math.max(ax, bx), y1, Math.max(az, bz)],
      mat: 'stone', face: f, ...o,
    }
    // 動く向きを面の座標から世界へ
    if (o.move && o.move.uw) {
      const [du, dw] = o.move.uw
      const [x0, z0] = fx(f, 0, 0), [x1, z1] = fx(f, du, dw)
      b.move = { ...o.move, axis: [x1 - x0, 0, z1 - z0] }
    }
    boxes.push(b)
    return b
  }
  const flag = (f, u, w, y, sec, yawU = 1) => {
    // 旗は前の区間の最後の足場の上（前の区間の段の半幅で置く）
    const k0 = K; K = SEC_K[Math.max(1, Math.min(23, sec - 1))] ?? K
    const [x, z] = fx(f, u, w)
    const [x1, z1] = fx(f, u + yawU, w)
    K = k0
    flags.push({ p: [x, y, z], yaw: Math.atan2(x1 - x, z1 - z), sec, face: f })
  }
  const wind = (f, u0, u1, w0, w1, y0, y1, o) => {
    const [ax, az] = fx(f, u0, w0), [bx, bz] = fx(f, u1, w1)
    const n = FACE_N[f]
    winds.push({ min: [Math.min(ax, bx), y0, Math.min(az, bz)], max: [Math.max(ax, bx), y1, Math.max(az, bz)], dir: o.out ? n : [-n[0], 0, -n[2]], ...o })
  }
  return { F, flag, wind, boxes, flags, winds, marks }
}

export function buildCourse() {
  const B = makeBuilder()
  const { F, flag, wind } = B
  // 石垣の段々（郭）と、いちばん上の天守。高い石垣の上には塀があるので、はしごは掛からない
  TIERS.forEach(([k, y0, y1], i) => {
    const last = i === TIERS.length - 1
    B.boxes.push({ min: [-k, y0, -k], max: [k, y1, k], mat: last ? 'core' : 'tier', core: last, tier: !last, noLadder: true, face: null })
  })
  K = 15
  // 外の郭（落ちた人の受け）
  for (let f = 0; f < 4; f++) F(f, -C - 9, C, 0, 9, -3, 0, { mat: 'ground' })

  const y1 = 3.2, y2 = 6.6, y4 = 10.4, y5 = 14.0, y6 = 17.8, y7 = 21.6
  // 郭の紅葉の幹（当たりあり・はしごは掛からない）。葉は頭より上
  for (const [f, u, w] of [[0, -9, 8.6], [3, -2, 8.6], [0, 6.5, 8.6], [2, -4, 8.6]]) F(f, u - 0.35, u + 0.35, w - 0.35, w + 0.35, 0, 6.5, { mat: 'bark', noLadder: true, tree2: true })

  setK(SEC_K[1])
  // ---- 1. 堀の石垣（面0） ----
  flag(0, -8, 3, 0, 1)
  F(0, 2, C + 4, 0, 4, 0, y1, { mat: 'ishi', sec: 1 })
  setK(SEC_K[2])
  // ---- 2. 苔むした石（面1） ----
  F(1, -C, -1, 0, 4, 0, y1, { mat: 'ishi', sec: 2 })
  flag(1, -6, 2, y1, 2)
  F(1, -4.4, -1, 0.3, 3.7, y1, y1 + 0.04, { mat: 'moss', sec: 2 })
  F(1, -1, 4, 0, 4, 0, y2, { mat: 'ishi', sec: 2 })
  setK(SEC_K[3])
  // ---- 3. 空堀を渡す ----
  flag(1, 1.5, 2, y2, 3)
  F(1, 7, 11, 0, 4, y2 - 1, y2, { mat: 'ishi', sec: 3 })
  setK(SEC_K[4])
  // ---- 4. 櫓の張り出し（面2）。梁は引っ掛けるだけ ----
  F(2, -C, -2, 0, 4, y2 - 1, y2, { mat: 'ishi', sec: 4 })
  flag(2, -8.6, 2, y2, 4)
  F(2, -11, 6.6, 0, 5.6, y4 - 0.6, y4, { mat: 'beam', hook: true, hookOnly: true, sec: 4 })
  setK(SEC_K[5])
  // ---- 5. 吊り足場（面2の角から面3） ----
  flag(2, 4.5, 3, y4, 5)
  F(2, 7.8, 10.6, 0.9, 3.7, y4 - 0.5, y4, { mat: 'sway', sec: 5, move: { uw: [0, 1], amp: 0.6, period: 3.6 } })
  F(3, -C, 4, 0, 4, y4 - 1.4, y5, { mat: 'ishi', sec: 5 })
  setK(SEC_K[6])
  // ---- 6. 崩れる石垣（面3） ----
  flag(3, -4, 2, y5, 6)
  F(3, 4, 5.4, 0, 4, y5, y6, { mat: 'crack', crumble: 2.2, crumbleStand: 2.4, sec: 6 })
  F(3, 6.6, C + 4, 0, 4, y6 - 1, y6, { mat: 'ishi', sec: 6 })
  setK(SEC_K[7])
  // ---- 7. 風の細い石垣（面0の上） ----
  flag(3, 8.5, 2, y6, 7)
  F(0, -C, -2, 0, 2.2, y6 - 0.8, y6, { mat: 'ishi', sec: 7, narrow: true })
  F(0, -2, 6, 0, 2.6, y6 - 0.8, y7, { mat: 'ishi', sec: 7 })
  wind(0, -11, 6, 0, 6, y6 - 1.4, y7 + 1.4, { out: true, strength: 14, period: 4.6, on: 0.45, phase: 0.3 })

  // ===== 2周目 =====
  const y9 = 25.5, y10a = 28.9, y10b = 32.5, y11a = 36.4, y11b = 40.3, y12 = 45.3, y13 = 50.9, y14 = 54.7, y15 = 60.3
  setK(SEC_K[8])
  // ---- 8. 低い渡り廊下: 天井の下で、はしごを寝かせて渡す ----
  flag(0, 2, 1.3, y7, 8)
  F(0, 6, 11, 0, 2.6, y7 - 0.8, y7, { mat: 'wood', sec: 8 })
  F(1, -9.6, -3, 0, 2.6, y7 - 0.8, y7, { mat: 'wood', sec: 8 })
  F(1, -0.2, 5, 0, 2.6, y7 - 0.8, y7, { mat: 'wood', sec: 8 })
  F(1, -6, 3, 0, 2.6, y7 + 2.2, y7 + 5.6, { mat: 'roofu', sec: 8, ceiling: true, noLadder: true })
  setK(SEC_K[9])
  // 段の境目の渡り板（下の段の石垣の上から、上の段の道へ）
  B.boxes.push({ min: [10, 20.8, 13.6], max: [14, 21.6, 15], mat: 'wood', face: 0, sec: 8 })
  // ---- 9. はしごの上から跳ぶ ----
  flag(1, 1.5, 1.3, y7, 9)
  F(1, 5, 7, 0, 3.8, y7 - 0.8, 30.2, { mat: 'ishi', sec: 9 })
  F(1, 3, 8, 3.8, 6.5, y9 - 0.8, y9, { mat: 'roof', sec: 9, noLadder: true })
  setK(SEC_K[10])
  // ---- 10. 二つ先を読む（面2） ----
  flag(2, -10, 5, y9, 10)
  F(2, -13.5, -6, 1, 6.5, y9 - 0.8, y9, { mat: 'ishi', sec: 10 })
  F(2, -6, -5.5, 1, 6.5, y9 - 0.8, y10a, { mat: 'ishi', sec: 10 })
  F(2, -5.5, -3.6, 3.7, 6.5, y9 - 0.8, y10a, { mat: 'ishi', sec: 10 })
  F(2, -6, -5.5, 3.3, 3.7, y10a, y10b, { mat: 'ishi', sec: 10 })
  F(2, -5.5, 2, 1, 3.7, y9 - 0.8, y10b, { mat: 'ishi', sec: 10 })
  F(2, -3.6, 2, 3.7, 6.5, y9 - 0.8, y10b, { mat: 'ishi', sec: 10 })
  setK(SEC_K[11])
  // ---- 11. 紅葉の大木（面2の外）。枝は引っ掛けるだけ ----
  flag(2, 0, 5, y10b, 11)
  F(2, 11, 13.5, 9, 11.5, 0, 46, { mat: 'bark', sec: 11, noLadder: true, tree: true })
  F(2, -1, 9, 5.6, 6.4, y11a - 0.6, y11a, { mat: 'branch', hook: true, hookOnly: true, sec: 11 })
  F(2, 6.5, 13, 5.6, 9, y11a - 0.6, y11a, { mat: 'wood', sec: 11, crotch: true })
  F(3, -15, -6, 2.4, 3.2, y11b - 0.6, y11b, { mat: 'branch', hook: true, hookOnly: true, sec: 11 })
  setK(SEC_K[12])
  // ---- 12. 跳ね上げ門（面3）: 門の梁に引っ掛けて、上がるのに乗る ----
  flag(3, -3, 2, y11b, 12)
  F(3, -6, 2, 0, 4, y11b - 0.8, y11b, { mat: 'wood', sec: 12 })
  F(3, 2, 2.8, 0, 4, 40.5, 43.7, { mat: 'gate', hook: true, hookOnly: true, sec: 12, move: { axis: [0, 1, 0], amp: 1.8, period: 6.4 } })
  F(3, 2.8, C + 4, 0, 4, y12 - 0.8, y12, { mat: 'wood', sec: 12 })
  setK(SEC_K[13])
  const [px, pz] = fx(3, 7.5, 2)
  // ---- 13. 伸びるはしご ----
  flag(3, 4.5, 2, y12, 13)
  F(0, -C, -4, 0, 4, y12 - 0.8, y12, { mat: 'ishi', sec: 13 })
  F(0, -4, 4, 0, 4, y12 - 0.8, y13, { mat: 'ishi', sec: 13 })
  setK(SEC_K[14])
  // ---- 14. 落ち葉の床 ----
  flag(0, -3.2, 2, y13, 14)
  // 落ち葉は世界の座標で（石垣の前から 1.1〜1.7m だけ葉が無い）
  { const [xf, zf] = fx(0, 1, 0); B.boxes.push({ min: [fx(0, -4, 0)[0], y13, zf + 0.2], max: [xf - 1.7, y13 + 0.04, zf + 3.8], mat: 'leaves', face: 0, sec: 14 }, { min: [xf - 1.1, y13, zf + 0.2], max: [xf, y13 + 0.04, zf + 3.8], mat: 'leaves', face: 0, sec: 14 }) }
  F(0, 1, C + 4, 0, 4, y12 - 0.8, y14, { mat: 'ishi', sec: 14 })
  B.boxes.push({ min: [9, 53.9, 9], max: [15, 54.7, 11], mat: 'ishi', face: 1, sec: 15 })
  setK(SEC_K[15])
  // ---- 15. 天守の最上段（面1）: 細い足場・風・高い石垣 ----
  flag(0, 8, 2, y14, 15)
  F(1, -C, -3, 0, 1.8, y14 - 0.8, y14, { mat: 'ishi', sec: 15, narrow: true })
  F(1, -3, 2, 0, 4, y14 - 0.8, y15, { mat: 'ishi', sec: 15 })
  wind(1, -C, -3, 0, 6, y14 - 1, y15 + 1, { out: true, strength: 11, period: 5.2, on: 0.4, phase: 0.1 })

  // ===== 3周目 =====
  const y16 = 64.1, y18 = 67.7, y19 = 71.7, y20 = 75.5, y21 = 79.2, y22a = y21 + 3.4, y22b = y22a + 3.8, y23 = y22b + 5.8
  setK(SEC_K[16])
  // ---- 16. 揺れる足場と風 ----
  flag(1, 0, 2, y15, 16)
  F(1, 2.6, 5.2, 0.5, 3.5, y15 - 0.5, y15, { mat: 'sway', sec: 16, move: { uw: [1, 0], amp: 0.6, period: 4.0 } })
  F(1, 7, 11, 0, 4, y15 - 0.8, y16, { mat: 'ishi', sec: 16 })
  wind(1, 1, 11, 0, 8, y15 - 1, y16 + 2, { out: true, strength: 10, period: 5.6, on: 0.35, phase: 0.6 })
  setK(SEC_K[17])
  // ---- 17. 細い梁に橋を渡す（揺れる。A/D で体重をかけて戻す） ----
  flag(2, -9, 2, y16, 17)
  F(2, -3.4, -2.9, 0, 4, y16 - 0.8, y16, { mat: 'beam', narrow: true, sec: 17 })
  F(2, -1.9, 2, 0, 4, y16 - 0.8, y16, { mat: 'ishi', sec: 17 })
  setK(SEC_K[18])
  // ---- 18. 崩れる床から急いで掛ける ----
  F(2, 2, 5.5, 0, 4, y16 - 0.8, y16, { mat: 'crack', crumbleStand: 1.8, sec: 18 })
  F(2, 5.5, 11, 0, 4, y16 - 0.8, y18, { mat: 'ishi', sec: 18 })
  setK(SEC_K[19])
  // ---- 19. 天井の穴を抜ける（長さと角度） ----
  flag(3, -9, 2, y18, 19)
  F(3, -7, 4, 0, 3.6, y18 - 0.8, y18, { mat: 'wood', sec: 19 })
  F(3, -11, 1, 0, 3.6, y19 - 0.6, y19, { mat: 'wood', sec: 19 })
  F(3, 3, 4, 0, 3.6, y19 - 0.6, y19, { mat: 'wood', sec: 19 })
  setK(SEC_K[20])
  // ---- 20. 苔の床では、梁に引っ掛ける ----
  flag(3, 3.5, 2, y19, 20)
  F(3, 6, 11, 0, 4, y19 - 0.8, y19, { mat: 'wood', sec: 20 })
  F(0, -11, -7, 0.2, 3.8, y19, y19 + 0.04, { mat: 'moss', sec: 20 })
  F(0, -7, -6.5, 0, 4, y19 - 0.8, y20 - 0.6, { mat: 'ishi', sec: 20 })
  F(0, -7, -6.5, 0, 4, y20 - 0.6, y20, { mat: 'beam', hook: true, hookOnly: true, sec: 20 })
  F(0, -6.5, 1, 0, 4, y19 - 0.8, y20, { mat: 'ishi', sec: 20 })
  setK(SEC_K[21])
  // ---- 21. はしごから跳ぶ（瓦の小屋根へ） ----
  flag(0, -4, 2, y20, 21)
  F(0, 1, 3, 0, 3.2, y20 - 0.8, 84.2, { mat: 'ishi', sec: 21 })
  F(0, -1.5, 7, 4.3, 6.6, y21 - 0.6, y21, { mat: 'roof', noLadder: true, sec: 21 })
  setK(SEC_K[22])
  // ---- 22. 二つ先を読む（苔） ----
  flag(1, -12, 2.5, y21, 22)
  F(1, -13.6, -9, 0, 4, y21 - 0.8, y21, { mat: 'roof', noLadder: true, sec: 22 })
  F(1, -9, -8.5, 0, 4, y21 - 0.8, y22a, { mat: 'ishi', sec: 22 })
  F(1, -8.5, -6.6, 0, 1.3, y21 - 0.8, y22a, { mat: 'ishi', sec: 22 })
  F(1, -8.5, -6.6, 0, 1.3, y22a, y22a + 0.04, { mat: 'moss', sec: 22 })
  F(1, -9, -8.5, 1.3, 1.7, y22a, y22b, { mat: 'ishi', sec: 22 })
  F(1, -6.6, -1, 0, 1.3, y21 - 0.8, y22b, { mat: 'ishi', sec: 22 })
  F(1, -8.5, -1, 1.7, 4, y21 - 0.8, y22b, { mat: 'ishi', sec: 22 })
  setK(SEC_K[23])
  // ---- 23. 天守の屋根へ（細い足場・強い風・長い石垣） ----
  flag(1, -3, 2, y22b, 23)
  F(1, -1, 3, 0, 1.6, y22b - 0.8, y22b, { mat: 'ishi', narrow: true, sec: 23 })
  F(1, 3, 9, 0, 4, y22b - 0.8, y23, { mat: 'ishi', sec: 23 })
  wind(1, -1, 9, 0, 8, y22b - 1, y23 + 1, { out: true, strength: 12, period: 5.0, on: 0.42, phase: 0.2 })
  flag(1, 6, 2, y23, 24)
  const [gx, gz] = fx(1, 6, 2)
  // 段の上の縁に塀（落ちた人が郭から落ちない。高い石垣にはしごが掛からない理由）。道の箱と重なる所には置かない
  const hits = (mn, mx) => B.boxes.some(b => !b.tier && !b.core && [0, 1, 2].every(k => Math.min(mx[k] + (k === 1 ? 0.3 : 0.5), b.max[k]) - Math.max(mn[k] - (k === 1 ? 0 : 0.5), b.min[k]) > 0.01))
  TIERS.slice(0, -1).forEach(([k, , top]) => {
    const t = 0.35, h = 1.1, seg = 2.0
    for (let a = -k; a < k - 0.01; a += seg) {
      const b2 = Math.min(k, a + seg)
      for (const [mn, mx] of [
        [[a, top, k - t], [b2, top + h, k]], [[a, top, -k], [b2, top + h, -k + t]],
        [[k - t, top, a], [k, top + h, b2]], [[-k, top, a], [-k + t, top + h, b2]],
      ]) if (!hits(mn, mx)) B.boxes.push({ min: mn, max: mx, mat: 'fence', noLadder: true, face: null })
    }
  })
  // 外の郭の四隅に櫓（はしごは掛からない）
  // 外の郭の外側の帯（道の箱は 19 まで）に櫓。屋根の出が道の上に来ないよう 20.6 から外
  for (const [x0, z0] of [[-4, 20.9], [20.9, 2], [0, -24.3], [-24.3, -6]]) {
    B.boxes.push({ min: [x0, 0, z0], max: [x0 + 3.4, 5, z0 + 3.4], mat: 'yagura', noLadder: true, yagura: true, face: null })
  }
  // 区間ごとの手がかり: 掛けられる場所（光らせる所）と、立つ所。tip は新しい使い方が初めて出る区間の一言
  const H = (sec, f, u, w, y, n, su, sw, tip) => { const k0 = K; K = SEC_K[sec]; const [x, z] = fx(f, u, w), [sx, sz] = fx(f, su, sw); K = k0; return { sec, p: [x, y, z], n, stand: [sx, sz], tip } }
  const hints = [
    H(1, 0, 2, 2, 3.08, [-1, 0, 0], 0.6, 2, ['縁ぎりぎりに掛けると、立つ', 'Aim near the top edge to stand it up']),
    H(2, 1, -1, 2, 6.57, [0, 0, 1], -2.2, 2, ['苔は滑る。立て気味に', 'Moss is slippery. Stand it steeper']),
    H(3, 1, 7.6, 2, 6.6, [0, 1, 0], 3.5, 2, ['はしごを寝かせると、橋になる', 'Lay the ladder down to make a bridge']),
    H(4, 2, -9, 5.6, 10.1, [0, 0, -1], -9, 3.2, ['張り出しの縁には、引っ掛けられる', 'You can hook it on the overhang edge']),
    H(5, 3, -7, 2, 13.97, [0, 0, -1], -7, 3.2, ['足場が近づいた時に、立てて登る', 'Place it when the deck swings close']),
    H(6, 3, 4, 2, 17.68, [0, 0, -1], 2.4, 2, ['崩れる前に、登りきる', 'Climb before it crumbles']),
    H(7, 0, -2, 1, 21.48, [-1, 0, 0], -3.6, 1, ['風が止んだら、登る', 'Climb between gusts']),
    H(8, 1, -0.05, 1.3, 21.6, [0, 1, 0], -3.3, 1.3, ['天井が低い。寝かせて渡す', 'Low ceiling. Lay it across']),
    H(9, 1, 5, 2.45, 25.5, [0, 0, 1], 3.4, 2.45, ['はしごの上からも、跳べる', 'You can jump from the top of the ladder']),
    H(10, 2, -6, 5, 28.78, [1, 0, 0], -7.3, 5, ['上った先で、次に立てる場所が要る', 'Leave room to place it again up there']),
    H(11, 2, -1, 6, 36.2, [1, 0, 0], -2.5, 6, ['枝は丸い。引っ掛けるだけ', 'Branches are round. Hook them']),
    H(12, 3, 2, 2, 42.6, [0, 0, -1], 0.9, 2, ['動く梁に掛けると、持ち上げてもらえる', 'Hook the moving beam and ride it up']),
    H(13, 0, -4, 2, 50.78, [-1, 0, 0], -6, 2, ['祠のはしごは、長さを変えられる', 'The shrine ladder can change length']),
    H(14, 0, 1, 2, 54.51, [-1, 0, 0], 0, 2, ['葉の無い所に、足を置く', 'Put the feet where there are no leaves']),
    H(15, 1, -3, 0.9, 60.2, [0, 0, 1], -4.6, 0.9, null),
    H(16, 1, 7, 2, 64.04, [0, 0, 1], 4, 2, null),
    H(17, 2, -3.15, 2, 64.1, [0, 1, 0], -7.4, 2, ['細い梁の橋は、渡る間に横へ体重をかける', 'On a thin beam, lean to keep it upright']),
    H(18, 2, 5.5, 2, 67.64, [1, 0, 0], 4.3, 2, null),
    H(19, 3, 3, 1.8, 71.55, [0, 0, -1], 1.4, 1.8, ['穴を抜けるには、長さと角度', 'Length and angle to get through the hole']),
    H(20, 0, -7, 2, 75.2, [-1, 0, 0], -8.8, 2, ['苔の上なら、梁に引っ掛ける', 'On moss, hook the beam instead']),
    H(21, 0, 1, 3.1, 79.4, [-1, 0, 0], -0.6, 3.1, null),
    H(22, 1, -9, 0.7, 82.5, [0, 0, 1], -10.3, 0.7, null),
    H(23, 1, 3, 0.8, 92.05, [0, 0, 1], 0.6, 0.8, null),
  ]
  return {
    hints,
    boxes: B.boxes, flags: B.flags, winds: B.winds, L0: 4.2,
    pickups: [{ p: [px, y12, pz], kind: 'tele' }],
    goal: { p: [gx, y23, gz], r: 1.6 },
    abyss: -25,
    sections: [
      { id: 1, name: '堀の石垣', en: 'Moat wall' },
      { id: 2, name: '苔むした石', en: 'Mossy stones' },
      { id: 3, name: '空堀を渡す', en: 'Bridge the moat' },
      { id: 4, name: '櫓の張り出し', en: 'Turret balcony' },
      { id: 5, name: '吊り足場', en: 'Hanging scaffold' },
      { id: 6, name: '崩れる石垣', en: 'Loose stones' },
      { id: 7, name: '風の石垣', en: 'Windy wall' },
      { id: 8, name: '低い渡り廊下', en: 'Low corridor' },
      { id: 9, name: 'はしごから跳ぶ', en: 'Leap from the top' },
      { id: 10, name: '二つ先を読む', en: 'Think two ahead' },
      { id: 11, name: '紅葉の大木', en: 'The great maple' },
      { id: 12, name: '跳ね上げ門', en: 'Rising gate' },
      { id: 13, name: '伸びるはしご', en: 'Extending ladder' },
      { id: 14, name: '落ち葉の床', en: 'Fallen leaves' },
      { id: 15, name: '天守の上段', en: 'Upper keep' },
      { id: 16, name: '揺れる足場と風', en: 'Swing and wind' },
      { id: 17, name: '細い梁に渡す', en: 'Onto a thin beam' },
      { id: 18, name: '崩れる床', en: 'Crumbling floor' },
      { id: 19, name: '天井の穴', en: 'Hole in the ceiling' },
      { id: 20, name: '苔と梁', en: 'Moss and beam' },
      { id: 21, name: '瓦の小屋根へ跳ぶ', en: 'Leap to the tiles' },
      { id: 22, name: '二つ先を読む 二', en: 'Two ahead, again' },
      { id: 23, name: '天守の屋根', en: 'The keep roof' },
    ],
  }
}
export { fx, C }
export function fxK(f, u, w, k) { const k0 = K; K = k; const r = fx(f, u, w); K = k0; return r }
