// 入口: 固定60Hzの物理・入力・画面の部品
import { Sim, plan, DT } from './sim.js?v=6'
import { buildCourse } from './course.js?v=6'
import { View } from './view.js?v=6'

const $ = id => document.getElementById(id)
const course = buildCourse()
const sim = new Sim(course)
const view = new View($('view'), sim, { low: matchMedia('(pointer: coarse)').matches })
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
document.body.classList.toggle('touch', touch)
const lang = (navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en'
const T = {
  ja: { high: '届かない', low: '低すぎる', nofloor: '足を置く床がない', far: 'もっと近づく', blocked: '何かに当たる', short: '長さが足りない', bad: 'ここには掛けられない', steep: '傾きすぎ', none: '',
    t1: touch ? '掛けたい所をタップ' : '真ん中の印を掛けたい所に合わせてクリック', t2: touch ? 'スティックを上に倒している間 登る' : 'W を押している間 登る', t3: touch ? '「引き上げ」で手元へ' : 'E で手元へ引き上げる',
    flag: 'セーブした', fall: 'm 落ちた', goal: '頂上に着いた', back: 'はしごが後ろへ倒れる', slip: '足元が滑る', side: '横に倒れる', crumble: '壁が崩れた', abyss: '旗に戻った' },
  en: { high: 'Too high', low: 'Too low', nofloor: 'No floor for the feet', far: 'Get closer', blocked: 'Something is in the way', short: 'Too short', bad: "Can't place here", steep: 'Too steep', none: '',
    t1: touch ? 'Tap where the top should rest' : 'Put the center mark where the top should rest and click', t2: touch ? 'Hold the stick up to climb' : 'Hold W to climb', t3: touch ? 'Tap Pull to bring it back' : 'Press E to pull it up',
    flag: 'Saved', fall: 'm fall', goal: 'You reached the top', back: 'Tipping back', slip: 'Feet slipping', side: 'Falling sideways', crumble: 'The wall gave way', abyss: 'Back to the flag' },
}[lang]

// ===== 入力 =====
const keys = new Set()
let edge = { jump: false, take: false, place: null, respawn: false }
addEventListener('keydown', e => {
  if (e.repeat) return
  keys.add(e.code)
  if (e.code === 'Space') { edge.jump = true; e.preventDefault() }
  if (e.code === 'KeyE') edge.take = true
  if (e.code === 'KeyR') edge.respawn = true
})
addEventListener('keyup', e => keys.delete(e.code))
addEventListener('blur', () => keys.clear())

let mouse = { x: -1, y: -1, in: false }
let ghost = null
let drag = null   // 右ドラッグ（ロックしていない時）
let locked = false
const cv = view.renderer.domElement
cv.addEventListener('contextmenu', e => e.preventDefault())
const LOOK = 0.0032
function look(dx, dy, k = 1) {
  view.camYaw -= dx * LOOK * k
  view.camPitch = clamp(view.camPitch + dy * LOOK * 0.8 * k, -0.75, 1.4)
  view.userCamT = performance.now() / 1000
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === cv
  document.body.classList.toggle('locked', locked)
})
function lockMouse() { if (!touch && !locked && cv.requestPointerLock) { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}) } catch {} } }

// 掛ける場所: 光線を world に当てる（見た目と同じ箱）
function aimAt(px, py) {
  const r = view.ray(px, py)
  const hit = sim.world.raycast(r.o, r.d, 60)
  if (!hit) return null
  if (hit.box.mat === 'ground' && hit.n[1] > 0.5) return null
  return plan(sim.world, sim.pl, hit, sim.lad.L)
}
const canAim = () => sim.lad.state === 'carry' && sim.pl.mode === 'ground'
function tryPlace(px, py) {
  if (!canAim()) return
  const q = aimAt(px, py)
  if (q && q.ok) edge.place = { hit: q.hit }
  else if (q) toast(T[q.why] || T.bad)
}

// PC: マウスを動かすと見回す（ポインターロック）。照準は画面の真ん中。左クリックで掛ける
// スマホ: 左下の固定スティック=歩く・登る。それ以外をなぞる=カメラ、2本指=寄る・引く、
//         軽くタップ=そこに掛ける、押したまま止める=影が出て、動かすと角度が変わり、離すと掛ける
const JOY_R = 52
const joy = { id: null, x: 0, y: 0 }
const joyC = () => { const r = $('joy').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width / 2] }
const pts = new Map()
let pinch = null
cv.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') {
    mouse = { x: e.clientX, y: e.clientY, in: true }
    if (locked) look(e.movementX, e.movementY)
  }
})
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') mouse.in = false })
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') {
    if (e.button === 2 || e.button === 1) { cv.setPointerCapture(e.pointerId); drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; return }
    if (e.button === 0) {
      if (locked) tryPlace(innerWidth / 2, innerHeight / 2)
      else if (canAim() && ghost) tryPlace(e.clientX, e.clientY)
      else lockMouse()
    }
    return
  }
  cv.setPointerCapture(e.pointerId)
  pts.set(e.pointerId, { mode: 'pend', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() })
  if (pts.size === 2) {
    const [a, b] = [...pts.values()]
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: view.camDist }
    for (const p of pts.values()) p.mode = 'pinch'
    ghost = null
  }
})
cv.addEventListener('pointermove', e => {
  if (drag && drag.id === e.pointerId) { look(e.clientX - drag.x, e.clientY - drag.y, 1.6); drag.x = e.clientX; drag.y = e.clientY; return }
  const p = pts.get(e.pointerId)
  if (!p) return
  if (p.mode === 'pinch') {
    p.x = e.clientX; p.y = e.clientY
    const [a, b] = [...pts.values()]
    if (pinch && b) view.camDist = clamp(pinch.dist * pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), 3.5, 15)
    return
  }
  if (p.mode === 'pend' && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 10) p.mode = 'cam'
  if (p.mode === 'cam') look(e.clientX - p.x, e.clientY - p.y, 1.7)
  if (p.mode === 'aim') ghost = canAim() ? aimAt(e.clientX, e.clientY) : null
  p.x = e.clientX; p.y = e.clientY
})
const up = e => {
  if (drag && drag.id === e.pointerId) drag = null
  const p = pts.get(e.pointerId)
  if (p) {
    if (p.mode === 'aim' || (p.mode === 'pend' && performance.now() - p.t < 400)) tryPlace(p.x, p.y)
    if (p.mode === 'aim') ghost = null
  }
  pts.delete(e.pointerId)
  if (pts.size < 2) pinch = null
}
cv.addEventListener('pointerup', up)
cv.addEventListener('pointercancel', up)
cv.addEventListener('wheel', e => { const d = e.deltaY * (e.deltaMode === 1 ? 0.3 : 0.01); view.camDist = clamp(view.camDist + clamp(d, -0.5, 0.5), 3.5, 15); e.preventDefault() }, { passive: false })
// 長押しで影を出す
setInterval(() => {
  for (const p of pts.values()) if (p.mode === 'pend' && performance.now() - p.t > 220 && canAim()) { const q = aimAt(p.x, p.y); if (q) { p.mode = 'aim'; ghost = q } }
}, 50)
// 固定スティック
const joyEl = $('joy')
joyEl.addEventListener('pointerdown', e => { e.preventDefault(); joyEl.setPointerCapture(e.pointerId); joy.id = e.pointerId; joyMove(e) })
joyEl.addEventListener('pointermove', e => { if (joy.id === e.pointerId) joyMove(e) })
const joyUp = e => { if (joy.id === e.pointerId) { joy.id = null; joy.x = 0; joy.y = 0; moveJoy() } }
joyEl.addEventListener('pointerup', joyUp); joyEl.addEventListener('pointercancel', joyUp)
function joyMove(e) {
  const [cx, cy] = joyC()
  const dx = e.clientX - cx, dy = e.clientY - cy, l = Math.hypot(dx, dy)
  const k = l > JOY_R ? JOY_R / l : 1
  joy.x = dx * k / JOY_R; joy.y = dy * k / JOY_R
  moveJoy()
}
function moveJoy() { $('joyK').style.transform = `translate(${joy.x * JOY_R}px,${joy.y * JOY_R}px)` }
$('bJump').addEventListener('pointerdown', e => { edge.jump = true; e.preventDefault() })
$('bTake').addEventListener('pointerdown', e => { edge.take = true; e.preventDefault() })
$('bFlag').addEventListener('pointerdown', e => { edge.respawn = true; e.preventDefault() })
$('bLong').addEventListener('pointerdown', e => { lenHold = 1; e.preventDefault() })
$('bShort').addEventListener('pointerdown', e => { lenHold = -1; e.preventDefault() })
for (const id of ['bLong', 'bShort']) { $(id).addEventListener('pointerup', () => { lenHold = 0 }); $(id).addEventListener('pointerleave', () => { lenHold = 0 }) }
let lenHold = 0

function readInput() {
  let ix = 0, iy = 0
  if (keys.has('KeyW') || keys.has('ArrowUp')) iy += 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) iy -= 1
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1
  if (joy.id != null) { ix += joy.x; iy += -joy.y }
  let lenD = lenHold * 0.04
  if (keys.has('KeyF')) lenD += 0.04
  if (keys.has('KeyQ')) lenD -= 0.04
  const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l }
  const [fx, fz] = view.camFwd()
  const rx = -fz, rz = fx   // 画面の右
  const mv = [fx * iy + rx * ix, fz * iy + rz * ix]
  const inp = { mv, climb: iy, lean: ix, jump: edge.jump, take: edge.take, place: edge.place, lenD }
  edge.jump = false; edge.take = false; edge.place = null
  return inp
}

// ===== 画面の部品 =====
let toastT = 0
function toast(s, ms = 1400) { const el = $('toast'); el.textContent = s; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms) }
const tut = { step: 0 }
try { tut.step = Number(localStorage.getItem('sl_tut') || 0) } catch {}
function tutor(ev) {
  const set = s => { tut.step = s; try { localStorage.setItem('sl_tut', String(s)) } catch {} }
  if (tut.step === 0 && ev === 'place') set(1)
  else if (tut.step === 1 && ev === 'mantle') set(2)
  else if (tut.step === 2 && ev === 'take') set(3)
  const txt = [T.t1, T.t2, T.t3][tut.step] || ''
  if ($('tut').textContent !== txt || ev === '') { tut.shownAt = performance.now() }
  $('tut').textContent = txt
  $('tut').hidden = !txt
}
// 案内は出てから 7 秒で消す（ずっと出さない）
setInterval(() => { if (!$('tut').hidden && performance.now() - (tut.shownAt || 0) > 7000) $('tut').hidden = true }, 500)

function hud() {
  const pl = sim.pl
  const tm = sim.timeT
  $('tm').textContent = `${Math.floor(tm / 60)}:${String(Math.floor(tm % 60)).padStart(2, '0')}`
  const y = Math.max(0, pl.p[1])
  $('alt').textContent = y.toFixed(0)
  const top = course.goal.p[1]
  $('gaugeMe').style.bottom = `${Math.min(100, y / top * 100)}%`
  $('gaugeBest').style.bottom = `${Math.min(100, sim.stats.maxY / top * 100)}%`
  const fs = course.flags[sim.flag], sc = fs && course.sections.find(x => x.id === fs.sec)
  $('sec').textContent = sc ? (lang === 'ja' ? sc.name : sc.en) : ''
  $('bTake').hidden = !sim.canTake()
  const tl = !(sim.lad.tele && sim.lad.state === 'carry')
  $('bLong').hidden = tl; $('bShort').hidden = tl
  $('bJump').hidden = !(pl.mode === 'ground' || pl.mode === 'ladder' || pl.mode === 'beam')
  // 角度の数字（影の横）
  const g = ghost
  if (g && g.pose) {
    const P = g.pose
    const mid = [P.F[0] + P.u[0] * 2, P.F[1] + P.u[1] * 2, P.F[2] + P.u[2] * 2]
    const [x, y, vis] = view.toScreen(mid)
    const ang = g.type === 'hook' ? 90 - g.al * 57.3 : (g.th || 0) * 57.3
    $('ang').hidden = !vis
    $('ang').style.transform = `translate(${x + 18}px,${y - 10}px)`
    const kind = g.type === 'bridge' ? (lang === 'ja' ? ' 橋' : ' bridge') : g.type === 'hook' ? (lang === 'ja' ? ' 引っ掛け' : ' hook') : ''
    $('ang').textContent = g.ok ? `${Math.round(ang)}°${kind}` + (sim.lad.tele ? ` ${sim.lad.L.toFixed(1)}m` : '') : (T[g.why] || '')
    $('ang').classList.toggle('bad', !g.ok)
  } else $('ang').hidden = true
}

const S = window.Snd
if (S) S.def({
  step: ['snd/step1.mp3', 'snd/step2.mp3', 'snd/step3.mp3', 'snd/step4.mp3'], rung: ['snd/rung1.mp3', 'snd/rung2.mp3', 'snd/rung3.mp3'],
  thud: ['snd/thud1.mp3', 'snd/thud2.mp3'], ladfall: ['snd/ladfall1.mp3', 'snd/ladfall2.mp3'], slip: ['snd/slip1.mp3', 'snd/slip2.mp3'],
  crumble: ['snd/crumble1.mp3', 'snd/crumble2.mp3'], cloth: ['snd/cloth1.mp3', 'snd/cloth2.mp3'], take: 'snd/take1.mp3', creak: ['snd/creak1.mp3', 'snd/creak2.mp3'],
  crow: 'snd/crow.mp3', bell: 'snd/bell.mp3',
})
const snd = (n, o) => { if (S && S.ctx) S.play(n, o) }
let stepAcc = 0, crowT = 8
function sounds(dt) {
  const pl = sim.pl
  if (pl.mode === 'ground') { stepAcc += Math.hypot(pl.v[0], pl.v[2]) * dt; if (stepAcc > 0.75) { stepAcc = 0; snd('step', { vol: 0.35 }) } }
  crowT -= dt; if (crowT < 0) { crowT = 14 + Math.random() * 20; snd('crow', { vol: 0.18, rate: 0.9 + Math.random() * 0.2 }) }
  if (S && S.ctx) { const w = view.windNow || 0; S.loop('wind', 'snd/wind.mp3', 0.22 + Math.min(0.35, w * 0.03)) }
}
let fallTxtT = 0
function onEvents() {
  for (const e of sim.ev) {
    if (e.t === 'rung') snd('rung', { vol: 0.28 })
    if (e.t === 'place') snd('thud', { vol: 0.55 })
    if (e.t === 'thud') snd('thud', { vol: Math.min(0.9, 0.3 + e.k * 0.3) })
    if (e.t === 'lift') snd('creak', { vol: 0.6 })
    if (e.t === 'slip') snd('slip', { vol: 0.75 })
    if (e.t === 'ladfall') snd('creak', { vol: 0.7 })
    if (e.t === 'ladland') snd('ladfall', { vol: 0.8 })
    if (e.t === 'crumble') snd('crumble', { vol: 0.9 })
    if (e.t === 'take' || e.t === 'ladback') snd('take', { vol: 0.6 })
    if (e.t === 'flag') snd('cloth', { vol: 0.7 })
    if (e.t === 'mantle' || e.t === 'grab') snd('cloth', { vol: 0.35 })
    if (e.t === 'land') snd('step', { vol: Math.min(1, 0.4 + (e.h || 0) * 0.08), rate: 0.8 })
    if (e.t === 'goal') snd('bell', { vol: 0.9 })
    if (e.t === 'place' || e.t === 'mantle' || e.t === 'take') tutor(e.t)
    if (e.t === 'flag') { const f = course.flags[e.i], sc = course.sections.find(x => x.id === f.sec); if (!enterSection(f.sec)) toast(sc ? `${f.sec}. ${lang === 'ja' ? sc.name : sc.en}` : T.flag, 2200) }
    if (e.t === 'place') { hintUntil = 0; view.setHint(null); view.setDemo(null); lastActive = performance.now() }
    if (e.t === 'ladfall' && sim.pl.mode === 'air') toast(T[e.why === 'slipoff' ? 'slip' : e.why] || '')
    if (e.t === 'crumble') toast(T.crumble)
    if (e.t === 'land' && e.h > 3) toast(`${e.h.toFixed(1)}${T.fall}`)
    if (e.t === 'abyss') toast(T.abyss)
    if (e.t === 'pickup') toast(lang === 'ja' ? (touch ? '伸びるはしご　右のボタンで長さを変える' : '伸びるはしご　F で伸ばす・Q で縮める') : (touch ? 'Extending ladder: use the buttons' : 'Extending ladder: F longer, Q shorter'), 3200)
    if (e.t === 'goal') { $('goal').hidden = false; $('goalT').textContent = $('tm').textContent }
  }
}

// ===== 手がかり（新しい使い方が初めて出る区間の一言・掛けられる縁が光る・止まっていたら光る） =====
let shownTips = new Set()
try { shownTips = new Set(JSON.parse(localStorage.getItem('sl_tips') || '[]')) } catch {}
let hintUntil = 0, demoUntil = 0, lastActive = performance.now(), lastPos = null
const hintOf = sec => course.hints.find(h => h.sec === sec)
function enterSection(sec) {
  const h = hintOf(sec)
  if (!h || !h.tip || shownTips.has(sec)) return false
  shownTips.add(sec); try { localStorage.setItem('sl_tips', JSON.stringify([...shownTips])) } catch {}
  toast(h.tip[lang === 'ja' ? 0 : 1], 4200)
  // 最初の1回: 掛けられる縁を光らせ、見本のはしごを見せる
  view.setHint(h); hintUntil = performance.now() + 9000
  // 見本のはしごは、橋が初めて出る区間3だけ（ほかは一言と光る縁まで。答えは言いすぎない）
  const g = sec === 3 ? sim.world.groundAt(h.stand[0], h.stand[1], h.n[1] > 0.5 ? h.p[1] + 0.3 : h.p[1] - 0.5, 0.2) : null
  if (g) {
    const o = [h.p[0] + h.n[0] * 0.4, h.p[1] + h.n[1] * 0.4, h.p[2] + h.n[2] * 0.4]
    const hit = sim.world.raycast(o, [-h.n[0], -h.n[1], -h.n[2]], 2)
    const q = plan(sim.world, { p: [h.stand[0], g.y, h.stand[1]] }, hit, sim.lad.L)
    if (q.ok && q.pose) { view.setDemo(q.pose, sim.lad.L); demoUntil = performance.now() + 5000 }
  }
  return true
}
function hints() {
  const now = performance.now(), pl = sim.pl
  if (!lastPos || Math.hypot(pl.p[0] - lastPos[0], pl.p[2] - lastPos[2]) > 0.3 || Math.abs(pl.p[1] - lastPos[1]) > 0.3 || pl.mode === 'ladder') { lastActive = now; lastPos = pl.p.slice() }
  if (demoUntil && now > demoUntil) { view.setDemo(null); demoUntil = 0 }
  // 掛けられる時に 6 秒動かなかったら、次の掛け場所がうっすら光る
  if (canAim() && now - lastActive > 6000) {
    const cur = course.flags[sim.flag].sec
    const cand = course.hints.filter(h => h.sec >= cur && h.sec <= cur + 1 && h.p[1] >= pl.p[1] - 0.3).sort((a, b) => Math.hypot(a.p[0] - pl.p[0], a.p[2] - pl.p[2]) - Math.hypot(b.p[0] - pl.p[0], b.p[2] - pl.p[2]))[0]
    if (cand && view.hint !== cand) view.setHint(cand)
    hintUntil = now + 500
  }
  if (view.hint && now > hintUntil) view.setHint(null)
}

// ===== ループ（固定60Hz） =====
let acc = 0, last = performance.now(), paused = false
const dbg = { steps: 0 }
function frame() {
  const now = performance.now()
  let dt = Math.min(0.25, (now - last) / 1000)
  last = now
  if (!paused) {
    acc += dt
    while (acc >= DT) {
      acc -= DT
      tick()
    }
  }
  if (!touch && locked && canAim()) ghost = aimAt(innerWidth / 2, innerHeight / 2)
  else if (!touch && mouse.in && canAim() && !drag) ghost = aimAt(mouse.x, mouse.y)
  else if (!touch) ghost = null
  if (!canAim() && touch) ghost = null
  view.render(acc / DT, dt, ghost)
  hud()
  hints()
  sounds(dt)
  requestAnimationFrame(frame)
}
function tick() {
  const inp = readInput()
  if (edge.respawn) { edge.respawn = false; sim.respawn() }
  sim.step(inp)
  onEvents()
  dbg.steps++
}

$('start').addEventListener('click', () => { if (S) S.init(); lockMouse(); $('title').hidden = true; $('hud').hidden = false; tutor(''); last = performance.now(); lastActive = performance.now() })
$('muteBtn').addEventListener('click', () => { if (!S) return; S.setMute(!S.muted); $('muteBtn').textContent = S.muted ? '音 なし' : '音 あり' })
$('again').addEventListener('click', () => { sim.reset(); $('goal').hidden = true })
tutor('')
requestAnimationFrame(frame)

function clamp(x, a, b) { return x < a ? a : x > b ? b : x }

// 検証用
window.sl = {
  sim, view, plan, aimAt,
  pause(v = true) { paused = v; if (!v) last = performance.now() },
  step(n = 1, inp) { for (let i = 0; i < n; i++) { sim.step(inp ? { mv: [0, 0], ...inp } : readInput()); onEvents() } if (mouse.in && canAim()) ghost = aimAt(mouse.x, mouse.y); view.render(0, 1 / 60, ghost); hud() },
  screenOf(p) { return view.toScreen(p) },
}
window.__slReady = true
