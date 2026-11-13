import '../mute-auto.mjs'
// 見た目と当たりの検査（速い版: 見た目の部品の箱で数える）
//  1. 当たりの箱ごとに見た目の箱があるか（透明な床・見えない壁が無いか）。見た目の箱の大きさ・位置が当たりと同じか（1cm 以内）
//  2. 飾り（石・建物・塀の笠・落ち葉など、葉と草は除く）が、人の通る空間に入っていないか
//     歩ける床を 25cm 間隔で取り、人の柱（半径 0.3・高さ 1.7）と飾りの箱が重なる点を数える
//  3. 石が、元の当たりの箱の外へ何 cm 出ているか（最大）
// node tools/collide.mjs
import pw from 'playwright'
import { spawn } from 'node:child_process'
const PORT = 7200 + Math.floor(Math.random() * 300)
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
await new Promise(r => setTimeout(r, 600))
const b = await pw.chromium.launch()
const p = await b.newPage()
const errs = []; p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://localhost:${PORT}/`, { timeout: 180000 })
await p.waitForFunction('window.__slReady && sl.view.ready', null, { timeout: 180000 })
const r = await p.evaluate(async () => {
  const { view, sim } = sl, W = sim.world, THREE = view.THREE || await import('three')
  const out = {}
  // 1. 当たりと見た目の箱
  let miss = 0, off = 0
  for (const b of W.boxes) {
    const m = view.boxMeshes.find(m => m.userData.box === b)
    if (!m || !m.visible) { miss++; continue }
    m.updateMatrixWorld(true)
    const bb = new THREE.Box3().setFromObject(m)
    // 子（飾り）を除いた本体だけ
    m.geometry.computeBoundingBox()
    const g = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)
    const d = Math.max(...[0, 1, 2].map(k => Math.max(Math.abs(g.min.getComponent(k) - b.min[k]), Math.abs(g.max.getComponent(k) - b.max[k]))))
    if (d > 0.01) { off++; if (!out.offEx) out.offEx = []; if (out.offEx.length < 5) out.offEx.push([b.mat, b.sec, +d.toFixed(3), g.min.toArray().map(v => +v.toFixed(2)), b.min]) }
    void bb
  }
  out.boxMissing = miss; out.boxOffOver1cm = off
  // 2. 飾りの箱
  const deco = []
  const isSoft = o => { for (let x = o; x; x = x.parent) if (x.userData.soft || x === view.player || x === view.ladder || x === view.ghost || x === view.sky) return true; return false }
  const boxSet = new Set(view.boxMeshes)
  const tmpM = new THREE.Matrix4(), bx = new THREE.Box3()
  view.scene.updateMatrixWorld(true)
  view.scene.traverse(o => {
    if (!(o.isMesh) || boxSet.has(o) || isSoft(o) || !o.visible || o.userData.mortarOf) return
    if (o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop >= 60) return  // 霞の層
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, tmpM); tmpM.premultiply(o.matrixWorld); bx.copy(o.geometry.boundingBox).applyMatrix4(tmpM); deco.push([bx.min.toArray(), bx.max.toArray(), o.name || (o.userData.kind || 'inst'), o.userData.parent ? o.userData.parent[i] : null]) }
    } else { bx.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); deco.push([bx.min.toArray(), bx.max.toArray(), o.userData.kind || (o.geometry.type + JSON.stringify(o.geometry.parameters || {}) + (o.parent && o.parent.userData.kind || '')), [bx.min.toArray().map(v => +v.toFixed(2)), bx.max.toArray().map(v => +v.toFixed(2))]]) }
  })
  out.deco = deco.length
  // 空間の索引（1m の升）
  const cell = new Map(), key = (i, j) => i + ',' + j
  deco.forEach((d, n) => { for (let i = Math.floor(d[0][0]); i <= Math.floor(d[1][0]); i++) for (let j = Math.floor(d[0][2]); j <= Math.floor(d[1][2]); j++) { const k = key(i, j); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(n) } })
  let pts = 0, intr = 0, worst = 0; const ex = [], kinds = {}
  for (const b of W.boxes) {
    if (!b.alive || b.move || b.mat === 'fence' || b.core || b.yagura || b.tree2 || b.tree) continue
    const y = b.max[1]
    for (let x = b.min[0] + 0.125; x < b.max[0]; x += 0.25) for (let z = b.min[2] + 0.125; z < b.max[2]; z += 0.25) {
      const g = W.groundAt(x, z, y + 1.8, 0)
      if (!g || g.box !== b || W.pointIn([x, y + 0.9, z], 0.02)) continue
      // 人が立てる所か（体の柱が当たりに入らない）
      let free = true
      for (const c of W.boxes) { if (c === b || !c.alive) continue; if (c.max[1] > y + 0.05 && c.min[1] < y + 1.7 && x + 0.3 > c.min[0] && x - 0.3 < c.max[0] && z + 0.3 > c.min[2] && z - 0.3 < c.max[2]) { free = false; break } }
      if (!free) continue
      pts++
      const list = cell.get(key(Math.floor(x), Math.floor(z))) || []
      for (const n of list) {
        const d = deco[n]
        if (x + 0.29 > d[0][0] && x - 0.29 < d[1][0] && z + 0.29 > d[0][2] && z - 0.29 < d[1][2] && d[1][1] > y + 0.01 && d[0][1] < y + 1.7) {
          const dep = d[1][1] - y
          intr++; kinds[d[2]] = (kinds[d[2]] || 0) + 1
          if ((kinds[d[2]] || 0) <= 3) ex.push([+x.toFixed(2), +y.toFixed(2), +z.toFixed(2), d[2], +dep.toFixed(3), d[3]])
          break
        }
      }
    }
  }
  out.walkPts = pts; out.decoInBody = intr; out.kinds = kinds; out.ex = ex
  // 3. 石が当たりの箱の外へ出た最大
  out.stoneOut = view.castleStats ? view.castleStats.maxOut : null
  return out
})
console.log(JSON.stringify(r))
console.log('errs', errs)
await b.close(); srv.kill()
