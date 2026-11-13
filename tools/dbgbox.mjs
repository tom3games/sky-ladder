import '../mute-auto.mjs'
import pw from 'playwright'
import { spawn } from 'node:child_process'
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: '7777' }, stdio: 'ignore' })
await new Promise(r => setTimeout(r, 600))
const b = await pw.chromium.launch(); const p = await b.newPage()
await p.goto('http://localhost:7777/'); await p.waitForFunction('window.__slReady && sl.view.ready', null, { timeout: 60000 })
console.log(JSON.stringify(await p.evaluate(() => {
  const T = sl.view.THREE, m = sl.view.boxMeshes[0]
  const v = new T.Vector3().fromBufferAttribute(m.geometry.attributes.position, 0)
  const w = v.clone().applyMatrix4(m.matrixWorld)
  return { local: v.toArray(), world: w.toArray(), mw: m.matrixWorld.elements.slice(12, 15), m: m.matrix.elements.slice(12, 15), pos: m.position.toArray(), box: [m.userData.box.min, m.userData.box.max] }
})))
await b.close(); srv.kill()
