// 城の見た目の作り込み（当たりは変えない）
// - 石垣: 箱の面に、石を1つずつ積む（前の面は当たりの面より外へ出さない）。角は算木積み
// - 天守: 白壁・黒い腰板・格子窓・段ごとの反った瓦屋根・軒先の丸瓦・破風・鯱
// - 紅葉: 郭の外の木・前景の枝・積もった落ち葉・苔と草の塊
import * as THREE from 'three'

const rndf = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }

// 角の丸い石（4種類の形）
function stoneGeo(seed) {
  const g = new THREE.BoxGeometry(1, 1, 1, 4, 4, 2)
  const p = g.attributes.position, r = 0.2, rnd = rndf(seed)
  const v = new THREE.Vector3(), c = new THREE.Vector3()
  const jit = Array.from({ length: 6 }, () => (rnd() - 0.5) * 0.08)
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    c.set(Math.max(-0.5 + r, Math.min(0.5 - r, v.x)), Math.max(-0.5 + r, Math.min(0.5 - r, v.y)), Math.max(-0.5 + r, Math.min(0.5 - r, v.z)))
    const d = v.clone().sub(c)
    if (d.lengthSq() > 1e-6) v.copy(c).addScaledVector(d.normalize(), r)
    // 前の面（+z）を少しふくらませ、全体を少しゆがめる
    if (v.z > 0.3) v.z = 0.5 - (v.x * v.x + v.y * v.y) * 0.12
    v.x += jit[(i * 7) % 6] * v.y; v.y += jit[(i * 3) % 6] * v.x
    p.setXYZ(i, v.x, v.y, Math.min(0.5, v.z))
  }
  g.computeVertexNormals()
  return g
}

// 絵の葉・草（canvas）
function cardTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const x = c.getContext('2d'), rnd = rndf(kind.length * 31)
  if (kind === 'grass') {
    for (let i = 0; i < 70; i++) {
      const bx = 10 + rnd() * 108, h = 40 + rnd() * 80, lean = (rnd() - 0.5) * 30
      x.strokeStyle = ['#7a7038', '#8a7a3a', '#a08848', '#6a6a30', '#b0904a'][i % 5]; x.lineWidth = 2 + rnd() * 2
      x.beginPath(); x.moveTo(bx, 128); x.quadraticCurveTo(bx + lean * 0.3, 128 - h * 0.6, bx + lean, 128 - h); x.stroke()
    }
  } else if (kind === 'moss') {
    for (let i = 0; i < 260; i++) { x.fillStyle = ['#5a6030', '#6a7038', '#4a5028', '#7a7a40'][i % 4]; const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 56; x.beginPath(); x.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r * 0.6, 3 + rnd() * 5, 0, 6.28); x.fill() }
  } else {
    const cols = ['#c8321e', '#d84a22', '#e86a2a', '#b82418', '#f0902e', '#9a2014', '#7a3a1e']
    for (let i = 0; i < 46; i++) {
      const px = 8 + rnd() * 112, py = 8 + rnd() * 112, r = 5 + rnd() * 6, a = rnd() * 6.28
      x.fillStyle = cols[i % cols.length]; x.save(); x.translate(px, py); x.rotate(a); x.beginPath()
      for (let k = 0; k < 5; k++) { const t = k / 5 * Math.PI * 2; x.lineTo(Math.cos(t) * r, Math.sin(t) * r); x.lineTo(Math.cos(t + 0.63) * r * 0.42, Math.sin(t + 0.63) * r * 0.42) }
      x.closePath(); x.fill(); x.restore()
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}
// 格子窓
function latticeTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96
  const x = c.getContext('2d')
  x.fillStyle = '#1a0e08'; x.fillRect(0, 0, 128, 96)
  x.fillStyle = '#3a2214'; x.fillRect(6, 6, 116, 84)
  x.fillStyle = '#120804'; x.fillRect(10, 10, 108, 76)
  x.fillStyle = '#5a3a24'
  for (let i = 0; i < 9; i++) x.fillRect(14 + i * 12, 10, 4, 76)
  x.fillStyle = '#2a160c'; x.fillRect(0, 0, 128, 6); x.fillRect(0, 90, 128, 6)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function buildCastle(view) {
  const sc = view.scene, W = view.sim.world, mats = view.mats
  const rnd = rndf(42)
  const stats = { stones: 0, tufts: 0, leaves: 0, maxOut: 0 }

  // ===== 石垣 =====
  const stoneMat = new THREE.MeshStandardMaterial({
    map: view.tex('rock_boulder_dry_diff', true), normalMap: view.tex('rock_boulder_dry_nor_gl'), roughnessMap: view.tex('rock_boulder_dry_rough'),
    color: 0xffffff, roughness: 1, normalScale: new THREE.Vector2(1.3, 1.3),
  })
  view.rim(stoneMat)
  const geos = [stoneGeo(1), stoneGeo(2), stoneGeo(3), stoneGeo(4)]
  const lists = [[], [], [], []]
  const palette = [0xa89888, 0x948476, 0xb4a290, 0x847468, 0xc0ae98, 0x9a8a7c, 0x7c6e64, 0xa08c78]
  const mossy = 0x8a8a5a
  const inside = (p) => !!W.pointIn(p, 0.001)
  const tufts = [], litter = [], mossCards = []
  for (const b of W.boxes) {
    if (!(b.mat === 'ishi' || b.mat === 'crack' || b.mat === 'ground' || b.mat === 'tier')) continue
    const big = b.mat === 'tier' ? 1.25 : 1
    const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2]
    if (sy < 0.5) continue
    const isGround = b.mat === 'ground'
    // 段（行）の高さ: 上から決める（上の段が見える所）
    const rows = []
    let y = b.max[1]
    const yMin = isGround ? b.max[1] - 1.6 : b.min[1]
    while (y > yMin + 0.2) { const h = Math.min(y - yMin, (0.5 + rnd() * 0.7) * big); rows.push([y - h, y]); y -= h }
    // 4つの面: [軸, 符号]
    const faces = [[0, -1], [0, 1], [2, -1], [2, 1]]
    for (const [ax, sg] of faces) {
      const plane = sg > 0 ? b.max[ax] : b.min[ax]
      const tax = ax === 0 ? 2 : 0
      const t0 = b.min[tax], t1 = b.max[tax]
      for (let ri = 0; ri < rows.length; ri++) {
        const [ya, yb] = rows[ri]
        // 面の外がほかの箱の中なら見えない
        const probe = [0, (ya + yb) / 2, 0]; probe[ax] = plane + sg * 0.12
        let t = t0
        // 角は交互に長い石（算木積み）
        const longFirst = (ri + (ax === 0 ? 0 : 1)) % 2 === 0
        while (t < t1 - 0.05) {
          const atStart = t === t0
          let w = rnd() < 0.12 ? 0.35 + rnd() * 0.2 : (0.6 + rnd() * 0.9) * big
          if (atStart) w = longFirst ? 1.15 + rnd() * 0.25 : 0.5 + rnd() * 0.15
          if (t1 - (t + w) < 0.4) w = t1 - t
          const tc = t + w / 2
          probe[tax] = tc
          if (!inside(probe)) {
            const h0 = yb - ya
            const gap = 0.03 + rnd() * 0.035
            const h = h0 - rnd() * Math.min(0.12, h0 * 0.25)
            const dep = Math.min(0.6 * big, (b.max[ax] - b.min[ax]) - 0.06)
            const inset = rnd() * 0.008
            const k = Math.floor(rnd() * 4)
            const m = new THREE.Matrix4()
            const pos = new THREE.Vector3(); pos.setComponent(ax, plane - sg * (dep / 2 + inset)); pos.y = (ya + yb) / 2 + (h0 - h) * (rnd() - 0.5); pos.setComponent(tax, tc)
            const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ax === 0 ? (sg > 0 ? Math.PI / 2 : -Math.PI / 2) : (sg > 0 ? 0 : Math.PI))
            // 傾きは小さく、傾けた分だけ縮めて、箱の外へ角が出ないように（上の段は傾けない）
            const top0 = yb > b.max[1] - 0.01
            const ang = top0 ? 0 : (rnd() - 0.5) * 0.06
            const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang)
            q.multiply(tilt)
            const sw = w - gap, shh = h - gap, c = Math.abs(Math.cos(ang)), sn = Math.abs(Math.sin(ang))
            const k2 = Math.min(1, sw / (sw * c + shh * sn), shh / (sw * sn + shh * c))
            m.compose(pos, q, new THREE.Vector3(sw * k2, shh * k2, dep))
            const top = yb > b.max[1] - 0.01
            const col = new THREE.Color(top && rnd() < 0.35 ? mossy : palette[Math.floor(rnd() * palette.length)])
            if (b.mat === 'crack') col.multiplyScalar(1.12)
            lists[k].push([m, col])
            { const v = new THREE.Vector3(); for (let c = 0; c < 8; c++) { v.set(c & 1 ? 0.5 : -0.5, c & 2 ? 0.5 : -0.5, c & 4 ? 0.5 : -0.5).applyMatrix4(m); for (let kk = 0; kk < 3; kk++) { const o2 = Math.max(b.min[kk] - v.getComponent(kk), v.getComponent(kk) - b.max[kk]); if (o2 > stats.maxOut) stats.maxOut = o2 } } }
            // 上の段の縁に苔と草
            if (top && rnd() < 0.45 && !isGround) tufts.push([pos.clone().setY(b.max[1]), ax, sg])
            // 石の継ぎ目の苔（面に貼る板）
            if (rnd() < 0.22 && t1 - t0 > 1.2 && b.max[1] - b.min[1] > 1.0) { const mp = pos.clone(); mp.setComponent(ax, plane + sg * 0.004); mp.y = Math.min(b.max[1] - 0.6, Math.max(b.min[1] + 0.32, ya + (rnd() < 0.5 ? 0 : h0))); mp.setComponent(tax, Math.min(t1 - 0.5, Math.max(t0 + 0.5, t + (rnd() < 0.5 ? 0 : w)))); mossCards.push([mp, ax, sg]) }
          }
          t += w
        }
      }
    }
    // 上の面に落ち葉（見た目だけ）
    if (!isGround && sx * sz > 1.5) {
      const n = Math.min(40, Math.floor(sx * sz * 0.8))
      for (let i = 0; i < n; i++) {
        const sc2 = 0.5 + rnd(), half = 0.45 * sc2 * 1.42
        if (sx < half * 2 + 0.05 || sz < half * 2 + 0.05) continue
        litter.push([b.min[0] + half + rnd() * (sx - half * 2), b.max[1] + 0.004, b.min[2] + half + rnd() * (sz - half * 2), sc2])
      }
    }
  }
  for (let k = 0; k < 4; k++) {
    const L = lists[k]
    if (!L.length) continue
    const im = new THREE.InstancedMesh(geos[k], stoneMat, L.length)
    im.userData.kind = 'stone'
    L.forEach(([m, c], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c) })
    im.castShadow = true; im.receiveShadow = true
    sc.add(im)
    stats.stones += L.length
  }
  // 苔と草の塊（縁に）
  const grassMat = new THREE.MeshStandardMaterial({ map: cardTex('grass'), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 })
  const tq = new THREE.PlaneGeometry(0.9, 0.55); tq.translate(0, 0.27, 0)
  const tim = new THREE.InstancedMesh(tq, grassMat, tufts.length * 2)
  const o = new THREE.Object3D()
  tufts.forEach(([p, ax, sg], i) => {
    for (let k = 0; k < 2; k++) {
      o.position.copy(p); o.position.setComponent(ax, p.getComponent(ax)); // 縁の上
      o.rotation.set(0, rnd() * 3.14, 0); o.scale.setScalar(0.6 + rnd() * 0.7); o.updateMatrix()
      tim.setMatrixAt(i * 2 + k, o.matrix)
    }
  })
  tim.userData.soft = true; sc.add(tim); stats.tufts = tufts.length
  // 継ぎ目の苔
  const mossMat = new THREE.MeshStandardMaterial({ map: cardTex('moss'), alphaTest: 0.35, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })
  const mq = new THREE.PlaneGeometry(0.9, 0.55)
  const mim = new THREE.InstancedMesh(mq, mossMat, mossCards.length)
  mim.userData.kind = 'mossCard'
  mossCards.forEach(([p, ax, sg], i) => { o.position.copy(p); o.rotation.set(0, ax === 0 ? (sg > 0 ? Math.PI / 2 : -Math.PI / 2) : (sg > 0 ? 0 : Math.PI), (rnd() - 0.5) * 0.8); o.scale.setScalar(0.6 + rnd() * 0.4); o.updateMatrix(); mim.setMatrixAt(i, o.matrix) })
  mim.receiveShadow = true; sc.add(mim); stats.moss = mossCards.length
  // 塀の瓦の笠と、櫓の建物
  for (const b of W.boxes) {
    if (b.mat === 'fence') {
      const sx = b.max[0] - b.min[0], sz = b.max[2] - b.min[2]
      const cap = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.12, sz), mats.roof.top)
      cap.position.set((b.min[0] + b.max[0]) / 2, b.max[1] + 0.06, (b.min[2] + b.max[2]) / 2); cap.castShadow = true
      sc.add(cap)
    }
    if (b.yagura) yagura(view, b)
  }
  // 落ち葉
  const leafMat = new THREE.MeshStandardMaterial({ map: cardTex('leaves'), alphaTest: 0.35, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })
  const lq = new THREE.PlaneGeometry(0.9, 0.9); lq.rotateX(-Math.PI / 2)
  const lim = new THREE.InstancedMesh(lq, leafMat, litter.length)
  lim.userData.kind = 'litter'
  litter.forEach((p, i) => { o.position.set(p[0], p[1], p[2]); o.rotation.set(0, rnd() * 6.28, 0); o.scale.setScalar(p[3]); o.updateMatrix(); lim.setMatrixAt(i, o.matrix) })
  lim.receiveShadow = true
  sc.add(lim); stats.leaves = litter.length

  // ===== 天守 =====
  buildKeep(view, rnd)
  view.castleStats = stats
  return stats
}

// 反った瓦屋根の板（幅 w・出 d、軒先が上へ反る）
function curvedRoof(w, d, mat, rise = 0.35) {
  const g = new THREE.PlaneGeometry(w, d, 24, 6)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i)          // y: -d/2（軒先）..d/2（壁）
    const e = (0.5 - y / d)                      // 軒先ほど 1
    const corner = Math.pow(Math.abs(x) / (w / 2), 6)   // 端ほど反る
    p.setZ(i, e * e * rise + corner * 0.5 * e)
  }
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, mat)
  m.castShadow = true; m.receiveShadow = true
  return m
}

// 櫓（2層。屋根は箱の上だけ＝当たりの外に出ない所は届かない高さ）
function yagura(view, b) {
  const mats = view.mats, sc = view.scene
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, s = b.max[0] - b.min[0], top = b.max[1]
  const ink = new THREE.MeshStandardMaterial({ color: 0x2a180e, roughness: 0.8 })
  const g = new THREE.Group()
  const koshi = new THREE.Mesh(new THREE.BoxGeometry(s + 0.006, 1.6, s + 0.006), mats.wood.side); koshi.position.set(cx, b.min[1] + 0.8, cz); g.add(koshi)
  for (let f = 0; f < 4; f++) {
    const face = new THREE.Group(); face.rotation.y = f * Math.PI / 2; face.position.set(cx, 0, cz); g.add(face)
    const roof = curvedRoof(s + 2.2, 1.6, mats.roof.top, 0.3); roof.rotation.x = -Math.PI / 2 + 0.5; roof.position.set(0, top + 0.25, s / 2 + 0.55); face.add(roof)
  }
  const up = new THREE.Mesh(new THREE.BoxGeometry(s * 0.7, 2.4, s * 0.7), mats.core.side); up.position.set(cx, top + 1.3, cz); g.add(up)
  const r2 = new THREE.Mesh(new THREE.ConeGeometry(s * 0.72, 1.8, 4, 1, true), mats.roof.top); r2.rotation.y = Math.PI / 4; r2.position.set(cx, top + 3.3, cz); g.add(r2)
  const band = new THREE.Mesh(new THREE.BoxGeometry(s * 0.72, 0.2, s * 0.72), ink); band.position.set(cx, top + 0.3, cz); g.add(band)
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
  sc.add(g)
}

function buildKeep(view, rnd) {
  const W = view.sim.world, sc = view.scene, mats = view.mats
  const core = W.boxes.find(b => b.core)
  if (!core) return
  const cx = (core.min[0] + core.max[0]) / 2, cz = (core.min[2] + core.max[2]) / 2
  const hw = (core.max[0] - core.min[0]) / 2
  const ink = new THREE.MeshStandardMaterial({ color: 0x2a180e, roughness: 0.8 })
  const wood = mats.wood.side
  const tiles = mats.roof.top
  const plaster = mats.core.side
  const lat = new THREE.MeshStandardMaterial({ map: latticeTex(), roughness: 0.9, emissive: 0x3a1806, emissiveIntensity: 0.35 })
  const gold = new THREE.MeshStandardMaterial({ color: 0xc8963c, metalness: 0.8, roughness: 0.35 })
  view.rim(plaster); view.rim(tiles)
  const g = new THREE.Group()
  // 道の高さ（面ごと）。この帯の近くには窓・軒を出さない
  const busy = [[], [], [], []]
  for (const b of W.boxes) {
    if (b.core || b.mat === 'ground' || b.face == null) continue
    busy[b.face].push([b.min[1] - 0.5, b.max[1] + 3.2])
  }
  const free = (f, y0, y1) => !busy[f].some(([a, b2]) => y1 > a && y0 < b2)
  const top = core.max[1]
  const tileEnd = new THREE.CylinderGeometry(0.09, 0.09, 0.22, 8); tileEnd.rotateX(Math.PI / 2)
  const ends = []
  for (let f = 0; f < 4; f++) {
    const face = new THREE.Group(); face.rotation.y = f * Math.PI / 2; face.position.set(cx, 0, cz); g.add(face)
    // 段（5.5m ごと）: 腰板・窓・軒
    for (let y = core.min[1] + 0.5; y < top - 4; y += 5.5) {
      // 黒い腰板（下 1.4m）
      // 壁の面に貼る（当たりの面より 3mm だけ外。人の体に入らない）
      const koshi = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 1.4), wood)
      koshi.position.set(0, y + 0.7, hw + 0.003); koshi.receiveShadow = true; face.add(koshi)
      const band = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 0.16), ink)
      band.position.set(0, y + 1.45, hw + 0.004); face.add(band)
      // 格子窓（道の近くは出さない）
      for (let k = -2; k <= 2; k++) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.95), lat)
        w.position.set(k * 2.7, y + 2.6, hw + 0.004); face.add(w)
      }
      // 軒（道の帯から離れた所だけ）
      const ey = y + 4.6
      // 軒の場所（世界の箱）に、道の箱や人の通る所が 0.8m 以内に無い時だけ
      const n = [[0, 1], [1, 0], [0, -1], [-1, 0]][f]
      const ex0 = n[0] ? cx + n[0] * hw : cx - hw, ex1 = n[0] ? cx + n[0] * (hw + 2.4) : cx + hw
      const ez0 = n[1] ? cz + n[1] * hw : cz - hw, ez1 = n[1] ? cz + n[1] * (hw + 2.4) : cz + hw
      const R = [Math.min(ex0, ex1) - 0.8, ey - 2.4, Math.min(ez0, ez1) - 0.8, Math.max(ex0, ex1) + 0.8, ey + 2.8, Math.max(ez0, ez1) + 0.8]
      const clear = !W.boxes.some(bb => !bb.core && !bb.tier && bb.max[0] > R[0] && bb.min[0] < R[3] && bb.max[1] > R[1] - 1.8 && bb.min[1] < R[4] && bb.max[2] > R[2] && bb.min[2] < R[5])
      if (clear && free(f, ey - 2.2, ey + 2.6)) {
        const roof = curvedRoof(hw * 2, 2.2, tiles)
        roof.rotation.x = -Math.PI / 2 + 0.5; roof.position.set(0, ey, hw + 0.95)
        face.add(roof)
        const fas = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.16, 0.1), ink); fas.position.set(0, ey - 0.55, hw + 1.95); face.add(fas)
        for (let k = -6; k <= 6; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 1.9), ink); r.position.set(k * 1.0, ey - 0.42, hw + 1.0); r.rotation.x = 0.5; face.add(r) }
        for (let k = -hw + 0.2; k <= hw - 0.2; k += 0.42) ends.push([face, k, ey - 0.47, hw + 2.02])
        // 千鳥破風（三角の妻）: 面の真ん中の軒の上
        if ((f + Math.round(y)) % 2 === 0) {
          const sh = new THREE.Shape(); sh.moveTo(-2.2, 0); sh.lineTo(0, 1.7); sh.lineTo(2.2, 0); sh.lineTo(-2.2, 0)
          const tri = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false }), plaster)
          tri.position.set(0, ey + 0.15, hw + 0.25); face.add(tri)
          for (const s of [-1, 1]) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.16, 0.3), ink)
            bar.position.set(s * 1.05, ey + 1.0, hw + 0.33); bar.rotation.z = -s * 0.66; face.add(bar)
            const rf = curvedRoof(3.0, 1.0, tiles, 0.12)
            rf.rotation.set(-Math.PI / 2 + 0.25, 0, -s * 0.66); rf.position.set(s * 1.05, ey + 1.15, hw + 0.55); face.add(rf)
          }
        }
      }
    }
  }
  // 軒先の丸瓦
  const eim = new THREE.InstancedMesh(tileEnd, new THREE.MeshStandardMaterial({ color: 0x4a4646, roughness: 0.6, metalness: 0.2 }), ends.length)
  const o = new THREE.Object3D()
  g.updateMatrixWorld(true)
  ends.forEach(([face, x, y, z], i) => { o.position.set(x, y, z); o.updateMatrix(); const m = new THREE.Matrix4().multiplyMatrices(face.matrixWorld, o.matrix); eim.setMatrixAt(i, m) })
  sc.add(eim)
  // 最上部: 望楼と大屋根、鯱
  const eave = curvedRoof(hw * 2 + 6, 3.2, tiles, 0.6)
  for (let f = 0; f < 4; f++) {
    const face = new THREE.Group(); face.rotation.y = f * Math.PI / 2; face.position.set(cx, top + 0.2, cz); g.add(face)
    const r = eave.clone(); r.rotation.x = -Math.PI / 2 + 0.55; r.position.set(0, 0.5, hw + 1.2); face.add(r)
  }
  const hall = new THREE.Mesh(new THREE.BoxGeometry(hw * 1.3, 4.2, hw * 1.3), plaster); hall.position.set(cx, top + 2.6, cz); g.add(hall)
  const koshi2 = new THREE.Mesh(new THREE.BoxGeometry(hw * 1.32, 1.2, hw * 1.32), wood); koshi2.position.set(cx, top + 1.1, cz); g.add(koshi2)
  const roof2 = new THREE.Mesh(new THREE.ConeGeometry(hw * 1.25, 3.6, 4, 1, true), tiles); roof2.rotation.y = Math.PI / 4; roof2.position.set(cx, top + 6.4, cz); g.add(roof2)
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.9, 0.35, 0.4), ink); ridge.position.set(cx, top + 8.1, cz); g.add(ridge)
  // 鯱（金の輪郭）
  const fish = new THREE.Shape(); fish.moveTo(0, 0); fish.quadraticCurveTo(0.35, 0.5, 0.15, 1.1); fish.quadraticCurveTo(0.45, 1.25, 0.55, 1.0); fish.quadraticCurveTo(0.4, 0.5, 0.5, 0); fish.lineTo(0, 0)
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(fish, { depth: 0.12, bevelEnabled: false }), gold)
    m.position.set(cx + s * hw * 0.45, top + 8.25, cz - 0.06); m.scale.set(s, 1, 1); m.castShadow = true; g.add(m)
  }
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
  sc.add(g)
}

// 紅葉の木（葉の塊は丸く・明暗を付ける）
export function mapleCrown(view, cx, cy, cz, rx, ry, n, rnd, pts) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()), h = rnd() * 2 - 1
    pts.push([cx + Math.cos(a) * r * rx, cy + h * ry * (1 - r * 0.3), cz + Math.sin(a) * r * rx, rnd() * 6.28, rnd() * 6.28, 0.8 + rnd() * 1.0])
  }
}
