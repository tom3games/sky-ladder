// 箱どうしの重なり（中身が食い込んでいる所）と、区間のつなぎ目を出す。node tools/overlap.mjs
import { buildCourse } from '../js/course.js'
const c = buildCourse()
const B = c.boxes.map((b, i) => ({ ...b, i }))
const ov = (a, b) => [0, 1, 2].every(k => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]) > 0.02)
let n = 0
for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
  const a = B[i], b = B[j]
  if (!ov(a, b)) continue
  if (a.max[1] - a.min[1] < 0.1 || b.max[1] - b.min[1] < 0.1) continue
  const tag = x => `#${x.i} ${x.mat} s${x.sec ?? '-'} [${x.min.map(v => v.toFixed(1))}]-[${x.max.map(v => v.toFixed(1))}]${x.move ? ' 動く' : ''}`
  console.log('重なり', tag(a), ' x ', tag(b)); n++
}
console.log('重なり', n, '件')
// 区間の旗と、その区間の最初の箱
for (const f of c.flags) console.log('旗', f.sec, f.p.map(v => v.toFixed(1)).join(','))
