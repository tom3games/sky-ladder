// 手がかりの場所が本当に掛けられる所か: 立つ所から、その点に掛ける計画が成り立つか。node tools/hints.mjs
import { Sim, plan } from '../js/sim.js'
import { buildCourse } from '../js/course.js'
const c = buildCourse(), s = new Sim(c)
let ng = 0
for (const h of c.hints) {
  if (h.sec === 5 || h.sec === 12 || h.sec === 16) { console.log(h.sec, '動く足場（時刻しだい）'); continue }
  const g = s.world.groundAt(h.stand[0], h.stand[1], h.n[1] > 0.5 ? h.p[1] + 0.3 : h.p[1] - 0.5, 0.2)
  s.pl.p = [h.stand[0], g ? g.y : 0, h.stand[1]]
  if (h.sec >= 13) { s.lad.tele = true; s.lad.L = h.sec === 13 || h.sec === 23 || h.sec === 15 ? 6.4 : h.sec === 16 ? 5.2 : h.sec === 19 ? 5.0 : h.sec === 14 || h.sec === 22 ? 4.4 : 4.2 } else s.lad.L = 4.2
  const o = [h.p[0] + h.n[0] * 0.4, h.p[1] + h.n[1] * 0.4, h.p[2] + h.n[2] * 0.4]
  const hit = s.world.raycast(o, [-h.n[0], -h.n[1], -h.n[2]], 2)
  const q = plan(s.world, s.pl, hit, s.lad.L)
  if (!q.ok) ng++
  console.log(h.sec, q.ok ? 'OK ' + q.type : 'NG ' + q.why, g ? '' : '(立つ所に床が無い)')
}
console.log('NG', ng)
