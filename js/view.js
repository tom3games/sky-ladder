// 見た目（three.js）。形は world.boxes からそのまま作る（当たりと同じデータ）
// 正解の絵: コンセプト画 C「夕暮れの城の石垣と紅葉」。色はその絵から抜いた6色に固定
import * as THREE from 'three'
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js'
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js'
import { ladderPose } from './sim.js?v=5'
import { buildCastle } from './castle.js?v=5'

// 絵 C から抜いた色（k-means と場所ごとの平均。2026-11-13）
export const PAL = {
  ink: 0x321d12,       // 墨の木・いちばん暗い影
  stoneDark: 0x4f3122, // 影の石垣
  stone: 0x8c5644,     // 日の当たる石垣
  haze: 0xb0715d,      // 夕焼けの霞
  vermilion: 0xba5c3d, // 朱（紅葉・空）
  gold: 0xed955d,      // 金の光
  deep: 0x922e18,      // 深い紅
  plaster: 0xf4ead9,   // 漆喰（絵では日陰で #704028 まで沈む）
}
const SUN_DIR = new THREE.Vector3(-0.62, 0.24, 0.72).normalize()   // 太陽のある向き（低い夕日）

const texL = new THREE.TextureLoader()
const texCache = {}
function tex(name, srgb) {
  const k = name + (srgb ? 's' : '')
  if (texCache[k]) return texCache[k]
  const t = texL.load(`assets/tex/${name}.webp`)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return (texCache[k] = t)
}
function pbr(base, o = {}) {
  return new THREE.MeshStandardMaterial({
    map: tex(base + '_diff', true), normalMap: tex(base + '_nor_gl'), roughnessMap: o.rough === false ? null : tex(base + '_rough'),
    color: o.color ?? 0xffffff, roughness: o.roughness ?? 1, metalness: 0, normalScale: new THREE.Vector2(o.ns ?? 1, o.ns ?? 1),
  })
}

// 材料: [側面, 上面, 下面]。1枚の絵の大きさ(m)も持つ
function makeMats() {
  const ishi = pbr('japanese_stone_wall', { color: 0xd8a688, ns: 1.4 })
  const gravel = pbr('leaf_scattered_gravel', { color: 0xb09a86 })
  const under = new THREE.MeshStandardMaterial({ color: PAL.stoneDark, roughness: 1 })
  const mortar = new THREE.MeshStandardMaterial({ color: 0x24160e, roughness: 1 })
  // 石を積む箱の側面は描かない（石がその面に並ぶ）。奥に暗い目地の箱を置く
  const hidden = new THREE.MeshBasicMaterial({ visible: false })
  hidden.userData.mortar = mortar
  void ishi
  const plank = pbr('japanese_cedar_planks', { color: 0x9a6a4a })
  const darkWood = pbr('japanese_cedar_planks', { color: 0x4a2c1c })
  const plaster = pbr('white_plaster_rough_01', { color: PAL.plaster, ns: 0.6 })
  const moss = pbr('mossy_rock', { color: 0xb8a070, roughness: 0.45 })
  const leaves = pbr('dry_decay_leaves', { color: 0xe08050 })
  const tiles = pbr('grey_roof_tiles', { color: 0x4a3c36 })
  const bark = pbr('japanese_zelkova_bark', { color: 0x8a6a58 })
  const crack = pbr('japanese_stone_wall', { color: 0xc89070, ns: 1.8 })
  return {
    ishi: { side: hidden, top: gravel, bot: under, s: 3.2, stones: true },
    ground: { side: hidden, top: gravel, bot: under, s: 3.2, stones: true },
    moss: { side: moss, top: moss, bot: under, s: 2.0 },
    leaves: { side: leaves, top: leaves, bot: under, s: 2.2 },
    wood: { side: darkWood, top: plank, bot: darkWood, s: 2.0 },
    sway: { side: darkWood, top: plank, bot: darkWood, s: 2.0 },
    beam: { side: darkWood, top: darkWood, bot: darkWood, s: 2.0 },
    branch: { side: bark, top: bark, bot: bark, s: 1.5 },
    bark: { side: bark, top: bark, bot: bark, s: 2.0 },
    gate: { side: darkWood, top: darkWood, bot: darkWood, s: 1.6 },
    roof: { side: darkWood, top: tiles, bot: darkWood, s: 2.0 },
    roofu: { side: darkWood, top: tiles, bot: darkWood, s: 2.0 },
    core: { side: plaster, top: tiles, bot: under, s: 4.0 },
    crack: { side: hidden, top: gravel, bot: under, s: 2.4, stones: true },
    tier: { side: hidden, top: gravel, bot: under, s: 3.2, stones: true },
    fence: { side: plaster, top: plaster, bot: plaster, s: 2.0 },
    yagura: { side: plaster, top: tiles, bot: under, s: 3.0 },
  }
}

// 箱の UV を大きさ(m)に合わせ、場所でずらす（同じ模様が並ばない）
function boxGeo(b, s) {
  const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2]
  const g = new THREE.BoxGeometry(sx, sy, sz)
  const uv = g.attributes.uv, ox = b.min[0], oy = b.min[1], oz = b.min[2]
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      let u = uv.getX(k), v = uv.getY(k)
      if (f < 2) { u = (u * sz + oz * (f ? 1 : -1)) / s; v = (v * sy + oy) / s }
      else if (f < 4) { u = (u * sx + ox) / s; v = (v * sz + oz) / s }
      else { u = (u * sx + ox * (f === 4 ? 1 : -1)) / s; v = (v * sy + oy) / s }
      uv.setXY(k, u, v)
    }
  }
  g.clearGroups()
  g.addGroup(0, 6, 0); g.addGroup(6, 6, 0); g.addGroup(12, 6, 1); g.addGroup(18, 6, 2); g.addGroup(24, 6, 0); g.addGroup(30, 6, 0)
  return g
}

// 紅葉の葉の板（絵で描く）
function leafTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const x = c.getContext('2d')
  const cols = ['#c8321e', '#d84a22', '#e86a2a', '#b82418', '#f0902e', '#9a2014']
  for (let i = 0; i < 160; i++) {
    const px = 20 + Math.random() * 216, py = 20 + Math.random() * 216, r = 6 + Math.random() * 10, a = Math.random() * 6.28
    x.fillStyle = cols[i % cols.length]
    x.save(); x.translate(px, py); x.rotate(a); x.beginPath()
    for (let k = 0; k < 5; k++) { const t = k / 5 * Math.PI * 2; x.lineTo(Math.cos(t) * r, Math.sin(t) * r); x.lineTo(Math.cos(t + 0.63) * r * 0.42, Math.sin(t + 0.63) * r * 0.42) }
    x.closePath(); x.fill(); x.restore()
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}
// 黄ばんだ旗の布（端がほつれている）
function flagTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96
  const x = c.getContext('2d')
  const g = x.createLinearGradient(0, 0, 128, 96); g.addColorStop(0, '#e2c46a'); g.addColorStop(1, '#b8943e')
  x.fillStyle = g
  x.beginPath(); x.moveTo(0, 0); x.lineTo(118, 4)
  for (let y = 4; y < 92; y += 8) x.lineTo(110 + Math.random() * 18, y + 4)
  x.lineTo(124, 92); x.lineTo(0, 96); x.closePath(); x.fill()
  x.globalAlpha = 0.25; x.fillStyle = '#5a3a18'
  for (let i = 0; i < 40; i++) x.fillRect(Math.random() * 120, Math.random() * 96, 2 + Math.random() * 6, 1 + Math.random() * 3)
  x.globalAlpha = 0.6; x.strokeStyle = '#7a4a1e'; x.lineWidth = 3; x.beginPath(); x.arc(52, 48, 18, 0, 6.28); x.stroke()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 1.0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      // 暗部を墨の茶と紫へ、明部を金へ
      c.rgb = mix(c.rgb, c.rgb * vec3(0.92,0.78,0.86) + vec3(0.025,0.010,0.012), 1.0 - smoothstep(0.0, 0.35, l));
      c.rgb = mix(c.rgb, c.rgb * vec3(1.06,0.98,0.86), smoothstep(0.45, 1.0, l));
      vec2 q = vUv - 0.5; float v = 1.0 - dot(q, q) * 1.15 * uVig;
      c.rgb *= v;
      c.rgb += (h(vUv * 700.0 + uTime) - 0.5) * 0.018;
      gl_FragColor = c;
    }`,
}

export class View {
  constructor(el, sim, opt = {}) {
    this.sim = sim
    this.THREE = THREE
    this.low = !!opt.low
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !this.low, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
    r.setPixelRatio(Math.min(this.low ? 1.5 : 2, window.devicePixelRatio || 1))
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.toneMappingExposure = 1.35
    el.appendChild(r.domElement)
    const sc = this.scene = new THREE.Scene()
    sc.background = new THREE.Color(PAL.haze)
    sc.fog = new THREE.FogExp2(0xc07a60, 0.0065)
    this.cam = new THREE.PerspectiveCamera(55, 1, 0.1, 900)
    // 光: 低い夕日（金）＋空の朱＋地面からの墨の照り返し
    this.hemi = new THREE.HemisphereLight(0xe8a888, 0x4a2c1c, 1.45)
    sc.add(this.hemi)
    const sun = this.sun = new THREE.DirectionalLight(0xffaa66, 6.0)
    sun.castShadow = true
    sun.shadow.mapSize.set(this.low ? 2048 : 4096, this.low ? 2048 : 4096)
    const sh = sun.shadow.camera; sh.left = -30; sh.right = 30; sh.top = 30; sh.bottom = -30; sh.near = 1; sh.far = 140
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04
    sc.add(sun, sun.target)
    const fill = new THREE.DirectionalLight(0xb08a80, 0.9)   // 反対側の空の紫
    fill.position.set(-SUN_DIR.x, 0.5, -SUN_DIR.z)
    sc.add(fill)
    this.makeSky()
    // 箱
    this.mats = makeMats()
    this.boxMeshes = []
    for (const b of sim.world.boxes) {
      const M = this.mats[b.mat] || this.mats.ishi
      const g = boxGeo(b, M.s)
      // BoxGeometry は中心が原点。位置は mesh.position で置く（v2〜v4 はここで二重にずらしていた）
      const m = new THREE.Mesh(g, [M.side, M.top, M.bot])
      m.castShadow = b.mat !== 'ground' && !b.core && !b.tier
      m.receiveShadow = true
      m.userData.box = b
      m.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2)
      sc.add(m)
      this.boxMeshes.push(m)
      if (!b.move) { m.matrixAutoUpdate = false; m.updateMatrix() }
      if (M.stones) {
        const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2]
        const ins = Math.min(0.18, sx / 4, sz / 4)
        const inner = new THREE.Mesh(new THREE.BoxGeometry(sx - ins * 2, sy - 0.02, sz - ins * 2), M.side.userData.mortar)
        inner.position.y = -0.01; inner.castShadow = !b.tier && b.mat !== 'ground'; inner.receiveShadow = true; inner.userData.mortarOf = b
        m.add(inner)
        if (!b.move) inner.updateMatrix()
      }
      if (b.mat !== 'ishi' && b.mat !== 'crack') this.trim(b, m)
    }
    this.tex = tex
    this.rimMats = []
    for (const k in this.mats) for (const m of [this.mats[k].side, this.mats[k].top]) this.rim(m)
    buildCastle(this)
    this.makeTrees()
    this.makeHaze()
    this.makeLeaves()
    // 旗
    this.flags = []
    const ftex = flagTexture()
    for (const f of sim.course.flags) {
      const g = new THREE.Group()
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.6, 6), this.mats.wood.side)
      pole.position.y = 1.3; pole.castShadow = true
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.75, 10, 4), new THREE.MeshStandardMaterial({ map: ftex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.95, emissive: 0x000000, emissiveMap: ftex }))
      cloth.position.set(0.52, 2.15, 0); cloth.castShadow = true
      g.add(pole, cloth)
      g.position.set(f.p[0], f.p[1], f.p[2])
      g.userData.soft = true   // 細い旗竿（当たりなし）
      g.rotation.y = f.yaw + Math.PI / 2
      sc.add(g)
      this.flags.push({ g, cloth, base: cloth.geometry.attributes.position.array.slice() })
    }
    // 伸びるはしごの祠
    this.pickups = (sim.course.pickups || []).map(k => {
      const g = new THREE.Group()
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 4), this.mats.roof.top); roof.rotation.y = Math.PI / 4; roof.position.y = 2.2; roof.castShadow = true
      const lad = this.makeLadder(0xb88a5a, 1); this.buildRungs(lad, 2.0); lad.position.set(0, 0, 0); lad.rotation.z = 0.12
      const glow = new THREE.PointLight(0xffb060, 3, 4, 2); glow.position.y = 1.4
      g.add(roof, lad, glow)
      g.position.set(k.p[0], k.p[1], k.p[2])
      g.userData.soft = true   // 拾う物（通り抜けて拾う）
      sc.add(g)
      return g
    })
    // 頂上の鐘
    if (sim.course.goal) {
      const gp = sim.course.goal.p
      const bell = new THREE.Group()
      const frame = this.mats.wood.side
      for (const sx of [-0.9, 0.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), frame); p.position.set(sx, 1.3, 0); p.castShadow = true; bell.add(p) }
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.18, 0.3), frame); top.position.y = 2.6; bell.add(top)
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.1, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x6a5030, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }))
      b.position.y = 1.95; b.castShadow = true; bell.add(b)
      bell.position.set(gp[0] + 1.6, gp[1], gp[2] + 0.6)
      bell.userData.soft = true
      sc.add(bell)
      this.bell = b
    }
    // はしご
    this.ladder = this.makeLadder(0xffffff, 1)
    sc.add(this.ladder)
    this.ghost = this.makeLadder(0x8ee09a, 0.42)
    this.ghost.visible = false
    sc.add(this.ghost)
    // 人（読み込むまでは仮の形）
    this.player = new THREE.Group()
    this.stand = this.makeStandIn()
    this.player.add(this.stand)
    sc.add(this.player)
    this.loadClimber()
    // 後処理
    this.composer = new EffectComposer(r)
    this.composer.addPass(new RenderPass(sc, this.cam))
    if (!this.low) { this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.86); this.composer.addPass(this.bloom) }
    this.grade = new ShaderPass(GradeShader)
    this.composer.addPass(this.grade)
    this.composer.addPass(new OutputPass())
    // カメラ
    this.camYaw = (sim.course.flags[0].yaw ?? 0) + Math.PI
    this.camPitch = 0.55
    this.camDist = 8.5
    this.camT = new THREE.Vector3(...sim.pl.p)
    this.userCamT = -10
    this.resize()
    addEventListener('resize', () => this.resize())
  }
  makeSky() {
    // 描いた360度の夕焼け（絵 C の色）。読むまでは霞の色
    const geo = new THREE.SphereGeometry(600, 48, 24)
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, fog: false, depthWrite: false })
    const sky = this.sky = new THREE.Mesh(geo, mat)
    sky.scale.x = -1
    // 絵の太陽は横 0.26 の所。光の向きに合わせて回す
    const phi = 0.26 * Math.PI * 2
    const a0 = Math.atan2(Math.sin(phi), -Math.cos(phi)) // 回す前の太陽の向き（x,z）
    sky.rotation.y = Math.atan2(SUN_DIR.z, SUN_DIR.x) - a0
    sky.renderOrder = -1
    this.scene.add(sky)
    texL.load('assets/pano.webp', t => {
      t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; this.skyReady = true
      // 霧の色 = 絵の地平線の少し下の色（3D と絵のつなぎ目を消す）
      try {
        const c = document.createElement('canvas'); c.width = 64; c.height = 32
        const x = c.getContext('2d'); x.drawImage(t.image, 0, 0, 64, 32)
        const d = x.getImageData(0, 17, 64, 2).data; let r = 0, gg = 0, bb = 0, n = 0
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++ }
        const col = new THREE.Color().setRGB(r / n / 255, gg / n / 255, bb / n / 255, THREE.SRGBColorSpace)
        this.scene.fog.color.copy(col); this.scene.background.copy(col); this.hazeCol = col
        for (const h of this.hazes || []) h.material.color.copy(col)
      } catch (e) {}
    })
  }
  // 逆光の縁の光（夕日の向こう側から見た時だけ、輪郭が金に光る）
  rim(mat) {
    if (!mat || mat.userData.rim) return
    mat.userData.rim = true
    const self = this
    mat.onBeforeCompile = sh => {
      sh.uniforms.uSunV = self.sunV || (self.sunV = { value: new THREE.Vector3(0, 0, 1) })
      sh.fragmentShader = 'uniform vec3 uSunV;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 Vv = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(dot(normal, Vv), 0.0, 1.0), 3.0);
          float back = clamp(-dot(Vv, uSunV), 0.0, 1.0);
          totalEmissiveRadiance += vec3(1.0, 0.55, 0.22) * fr * back * 0.55;
        }`)
    }
    mat.needsUpdate = true
  }
  // 霞の層（遠くに重ねる板。下ほど濃い）
  makeHaze() {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128
    const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 0, 128)
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0.9)')
    x.fillStyle = gr; x.fillRect(0, 0, 4, 128)
    const t = new THREE.CanvasTexture(c)
    this.hazes = []
    for (const [r, y, h] of [[70, -8, 26], [120, 4, 40], [190, 14, 60]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, true), new THREE.MeshBasicMaterial({ map: t, color: 0xc4806a, transparent: true, opacity: 0.55, side: THREE.BackSide, depthWrite: false, fog: false }))
      m.position.y = y - h / 2; m.renderOrder = -0.5
      this.scene.add(m); this.hazes.push(m)
    }
  }
  // 箱の飾り（当たりは変えない。表面から 3cm 以内）
  trim(b, m) {
    const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2]
    if ((b.mat === 'ishi' || b.mat === 'crack') && sy > 1.2) {
      // 石垣の天端に黒い笠木（上面と同じ高さまで、外へ 2cm）
      const cap = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.04, 0.16, sz + 0.04), this.mats.beam.side)
      cap.position.y = sy / 2 - 0.08
      cap.receiveShadow = true
      m.add(cap)
    }
    if (b.mat === 'sway') {
      // 吊り足場の綱（上へ）
      const rope = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 })
      for (const [ox, oz] of [[-sx / 2 + 0.15, -sz / 2 + 0.15], [sx / 2 - 0.15, -sz / 2 + 0.15], [-sx / 2 + 0.15, sz / 2 - 0.15], [sx / 2 - 0.15, sz / 2 - 0.15]]) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 12, 4), rope)
        c.position.set(ox, sy / 2 + 6, oz); m.add(c)
      }
    }
  }
  // 天守の白壁: 黒い腰板と横の帯、格子の窓、最上部の屋根（全部、壁から 4cm 以内か、届かない高さ）
  decorCore() {
    const core = this.sim.world.boxes.find(b => b.core)
    if (!core) return
    const ink = new THREE.MeshStandardMaterial({ color: PAL.ink, roughness: 0.85 })
    const tiles0 = this.mats.roof.top
    const win = new THREE.MeshStandardMaterial({ color: 0x1a0e08, roughness: 0.9, emissive: 0x3a1a08, emissiveIntensity: 0.6 })
    const g = new THREE.Group()
    const cx = (core.min[0] + core.max[0]) / 2, cz = (core.min[2] + core.max[2]) / 2
    const hw = (core.max[0] - core.min[0]) / 2
    for (let f = 0; f < 4; f++) {
      const ang = f * Math.PI / 2
      const face = new THREE.Group(); face.rotation.y = ang; face.position.set(cx, 0, cz); g.add(face)
      for (let y = 3; y < core.max[1] - 3; y += 5.5) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.08, 0.28, 0.04), ink)
        band.position.set(0, y, hw + 0.02); face.add(band)
        for (let k = -2; k <= 2; k++) {
          const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.03), win)
          w.position.set(k * 2.7 + ((y * 7) % 3 - 1) * 0.3, y + 2.3, hw + 0.015); face.add(w)
        }
      }
    }
    // 段ごとの軒（飾り。道の高さから 3.5m 以上離れた所だけ。当たりは無い＝はしごは届かない）
    const EAVES = [[0, 10], [0, 33], [0, 63], [0, 88], [1, 14], [1, 40], [1, 71], [2, 17], [2, 51], [2, 82], [3, 5], [3, 28], [3, 57], [3, 86]]
    for (const [f, y] of EAVES) {
      const face = new THREE.Group(); face.rotation.y = f * Math.PI / 2; face.position.set(cx, 0, cz); g.add(face)
      const slope = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 3.0, 0.22, 1.9), tiles0)
      slope.position.set(0, y, hw + 0.75); slope.rotation.x = 0.42; face.add(slope)
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 3.0, 0.18, 0.12), ink)
      fascia.position.set(0, y - 0.42, hw + 1.62); face.add(fascia)
      for (let k = -6; k <= 6; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.5), ink); r.position.set(k * 1.15, y - 0.25, hw + 0.7); r.rotation.x = 0.42; face.add(r) }
      // 軒の下は白壁の帯を明るく
      const wall = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.06, 2.2, 0.03), this.mats.core.side); wall.position.set(0, y - 1.6, hw + 0.016); face.add(wall)
    }
    // 最上部の屋根（入母屋風: 反った軒＋瓦）
    const top = core.max[1]
    const tiles = this.mats.roof.top
    const eave = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 5, 0.35, hw * 2 + 5), ink); eave.position.set(cx, top + 0.2, cz); g.add(eave)
    const roof = new THREE.Mesh(new THREE.ConeGeometry((hw + 2.6) * 1.414, 7, 4, 1, true), tiles); roof.rotation.y = Math.PI / 4; roof.position.set(cx, top + 3.8, cz); g.add(roof)
    const hall = new THREE.Mesh(new THREE.BoxGeometry(hw * 1.2, 4, hw * 1.2), this.mats.core.side); hall.position.set(cx, top + 6, cz); g.add(hall)
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(hw * 1.3, 4, 4, 1, true), tiles); roof2.rotation.y = Math.PI / 4; roof2.position.set(cx, top + 9.5, cz); g.add(roof2)
    for (const o of g.children) o.castShadow = true
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    this.scene.add(g)
  }
  // 紅葉の木（大木の葉と、郭の外の木）。葉は手の届かない高さか、道の外
  makeTrees() {
    const lt = leafTexture()
    const leafMat = new THREE.MeshStandardMaterial({ map: lt, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, transparent: false })
    const quad = new THREE.PlaneGeometry(1.6, 1.6)
    const pts = []
    const big = this.sim.world.boxes.find(b => b.tree)
    const rnd = mulberry(7)
    const cluster = (cx, cy, cz, rx, ry, n) => { for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()), h = (rnd() * 2 - 1); pts.push([cx + Math.cos(a) * r * rx, cy + h * ry, cz + Math.sin(a) * r * rx, rnd() * 6.28, rnd() * 6.28, 0.7 + rnd() * 0.9]) } }
    if (big) {
      const cx = (big.min[0] + big.max[0]) / 2, cz = (big.min[2] + big.max[2]) / 2
      cluster(cx - 2, 46, cz - 2, 8, 3.2, 900)
      cluster(cx - 5, 44.5, cz + 1, 4.5, 1.8, 260)
      cluster(cx + 2, 43.5, cz - 4, 4.5, 2, 260)
    }
    // 郭の紅葉（幹は当たりあり。葉は頭より高い所だけ）
    for (const t of this.sim.world.boxes.filter(b => b.tree2)) {
      const tx = (t.min[0] + t.max[0]) / 2, tz = (t.min[2] + t.max[2]) / 2, ty = t.max[1]
      cluster(tx, ty + 0.8, tz, 3.2, 1.6, 480)
      cluster(tx + 1.8, ty + 0.4, tz - 1.2, 2.2, 1.0, 140)
      cluster(tx - 1.6, ty + 0.9, tz + 1.4, 2.2, 1.0, 140)
      // 枝（見た目だけ。葉の中）
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * 6.28 + rnd(), len = 1.8 + rnd() * 1.4
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, len, 6), this.mats.bark.side)
        br.position.set(tx + Math.cos(a) * len * 0.45, ty - 0.4 + rnd() * 0.8, tz + Math.sin(a) * len * 0.45)
        br.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1); br.castShadow = true
        this.scene.add(br)
      }
    }
    // 郭の外の木（遠景）: 塔のまわり、手の届かない外側
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + rnd() * 0.2, rr = 22 + rnd() * 10
      cluster(Math.cos(a) * rr, -6 + rnd() * 4, Math.sin(a) * rr, 3.5, 2.2, 90)
    }
    const im = new THREE.InstancedMesh(quad, leafMat, pts.length)
    im.userData.soft = true
    const o = new THREE.Object3D()
    pts.forEach((p, i) => { o.position.set(p[0], p[1], p[2]); o.rotation.set(p[3], p[4], 0); o.scale.setScalar(p[5]); o.updateMatrix(); im.setMatrixAt(i, o.matrix) })
    im.castShadow = true; im.receiveShadow = true
    this.scene.add(im)
    // 遠景の木の幹
    const trunkMat = this.mats.bark.side
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2, rr = 22 + 5
      void a; void rr
    }
    // 下の郭の地面（落ちても行けない外の斜面）: 霞に沈む
    void trunkMat
    // 下は霞の海（遠くは絵の谷へ溶ける）

  }
  // 舞う紅葉
  makeLeaves() {
    const n = this.low ? 120 : 260
    const geo = new THREE.PlaneGeometry(0.08, 0.07)
    const mat = new THREE.MeshStandardMaterial({ color: PAL.vermilion, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x401006 })
    this.fall = new THREE.InstancedMesh(geo, mat, n)
    this.fall.frustumCulled = false
    this.fall.userData.soft = true
    const rnd = mulberry(3)
    this.fallSeed = Array.from({ length: n }, () => [rnd(), rnd(), rnd(), rnd()])
    this.scene.add(this.fall)
  }
  makeStandIn() {
    const g = new THREE.Group()
    const cloth = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.9 })
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.8, 4, 8), cloth); body.position.y = 0.95; body.castShadow = true
    g.add(body)
    return g
  }
  async loadClimber() {
    try {
      const gl = await new GLTFLoader().loadAsync('assets/models/climber.glb')
      const m = gl.scene
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.material) { o.material.roughness = Math.max(0.6, o.material.roughness ?? 0.7); o.material.metalness = 0 } } })
      const box = new THREE.Box3().setFromObject(m)
      const sk = 1.72 / (box.max.y - box.min.y)
      m.scale.setScalar(sk)
      m.position.y = -box.min.y * sk   // 足の裏を原点へ（床に埋まらない・浮かない）
      const bone = n => m.getObjectByName(n) || m.getObjectByName(n.replace(/[.]/g, ''))
      this.B = {}
      for (const n of ['Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head', 'UpperArm.L', 'LowerArm.L', 'Wrist.L', 'UpperArm.R', 'LowerArm.R', 'Wrist.R', 'UpperLeg.L', 'LowerLeg.L', 'Foot.L', 'UpperLeg.R', 'LowerLeg.R', 'Foot.R']) { const b = bone(n); if (b) this.B[n] = b }
      this.mixer = new THREE.AnimationMixer(m)
      this.acts = {}
      for (const c of gl.animations) this.acts[c.name] = this.mixer.clipAction(c)
      for (const k of ['Idle', 'Walk', 'Run']) if (this.acts[k]) { this.acts[k].play(); this.acts[k].weight = k === 'Idle' ? 1 : 0 }
      this.player.remove(this.stand)
      this.player.add(m)
      this.model = m
      this.ready = !!(this.B.Hips && this.B['UpperLeg.L'] && this.B['UpperArm.L'])
    } catch (e) { console.warn('climber', e) }
  }
  makeLadder(color, op) {
    const g = new THREE.Group()
    const wood = op < 1
      ? new THREE.MeshStandardMaterial({ color, transparent: true, opacity: op, depthWrite: false, roughness: 1 })
      : pbr('weathered_planks', { color: 0xc89a70 })
    const rope = op < 1 ? wood : new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 1 })
    const iron = op < 1 ? wood : new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6, metalness: 0.6 })
    g.userData = { mat: wood, rope, iron, inner: new THREE.Group(), L: 0, ghost: op < 1 }
    g.add(g.userData.inner)
    this.buildRungs(g, 4.2)
    return g
  }
  buildRungs(g, L) {
    const { inner, mat, rope, iron, ghost } = g.userData
    while (inner.children.length) inner.remove(inner.children[0])
    const W = 0.46
    for (const sx of [-W / 2, W / 2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.065, L, 0.085), mat)
      rail.position.set(sx, L / 2, 0); rail.castShadow = !ghost
      inner.add(rail)
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.1), iron); cap.position.set(sx, 0.05, 0); inner.add(cap)
    }
    for (let y = 0.25; y < L - 0.1; y += 0.3) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, W, 6), mat)
      rung.rotation.z = Math.PI / 2; rung.position.set(0, y, 0); rung.castShadow = !ghost
      inner.add(rung)
      if (!ghost) for (const sx of [-W / 2, W / 2]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 4, 8), rope); t.position.set(sx, y, 0); t.rotation.x = Math.PI / 2; inner.add(t) }
    }
    g.userData.L = L
  }
  // 足 F・向き u・横揺れ phi で置く
  poseLadder(g, F, u, phi, L, dHint) {
    if (Math.abs(g.userData.L - L) > 0.01) this.buildRungs(g, L)
    const Y = new THREE.Vector3(u[0], u[1], u[2]).normalize()
    let X = new THREE.Vector3(0, 1, 0).cross(Y)
    if (X.lengthSq() < 1e-4) X = new THREE.Vector3(-(dHint?.[2] ?? 0), 0, dHint?.[0] ?? 1)
    X.normalize()
    if (phi) X.applyAxisAngle(Y, phi)
    const Z = new THREE.Vector3().crossVectors(X, Y).normalize()
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z))
    g.position.set(F[0], F[1], F[2])
  }
  resize() {
    const w = innerWidth, h = innerHeight
    this.renderer.setSize(w, h)
    this.composer?.setSize(w, h)
    this.cam.aspect = w / h
    this.cam.fov = w < h ? 68 : 55
    this.cam.updateProjectionMatrix()
  }
  ray(px, py) {
    const v = new THREE.Vector3((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1, 0.5).unproject(this.cam)
    const o = this.cam.position.clone()
    const d = v.sub(o).normalize()
    return { o: [o.x, o.y, o.z], d: [d.x, d.y, d.z] }
  }
  toScreen(p) {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.cam)
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z < 1]
  }
  // 人の姿勢
  poseClimber(dt) {
    const sim = this.sim, pl = sim.pl, lad = sim.lad
    const P = this.player
    P.position.set(pl.p[0], pl.p[1], pl.p[2])
    let yaw = pl.yaw
    if (pl.mode === 'ladder' && lad.d) yaw = Math.atan2(lad.d[0], lad.d[2])
    P.rotation.y = yaw
    if (!this.ready) return
    const sp = Math.hypot(pl.v[0], pl.v[2])
    const ground = pl.mode === 'ground'
    const wWalk = ground ? Math.min(1, sp / 2) * (sp < 3.4 ? 1 : Math.max(0, 1 - (sp - 3.4) / 0.6)) : 0
    const wRun = ground ? Math.max(0, Math.min(1, (sp - 3.2) / 0.8)) : 0
    const a = this.acts
    if (a.Walk) { a.Walk.weight = wWalk; a.Walk.timeScale = Math.max(0.6, sp / 1.6) }
    if (a.Run) { a.Run.weight = wRun; a.Run.timeScale = sp / 4.2 }
    if (a.Idle) a.Idle.weight = Math.max(0, 1 - wWalk - wRun)
    this.mixer.update(pl.mode === 'ladder' ? 0 : dt)
    this.model.updateMatrixWorld(true)
    const B = this.B
    if (pl.mode === 'ladder' && lad.state === 'placed') {
      // はしごの段に手足を合わせる（2本の骨の IK）
      const L = ladderPose(lad)
      const side = new THREE.Vector3(0, 1, 0).cross(new THREE.Vector3(...L.u)).normalize()
      const out = new THREE.Vector3(...lad.d).multiplyScalar(-1)
      const at = s => new THREE.Vector3(L.F[0] + L.u[0] * s, L.F[1] + L.u[1] * s, L.F[2] + L.u[2] * s)
      const rung = s => Math.max(0.25, 0.25 + Math.round((s - 0.25) / 0.3) * 0.3)
      const ph = pl.s / 0.6
      const fr = Math.floor(ph), odd = fr % 2
      const lift = (ph - fr)
      for (const [n, sg] of [['L', -1], ['R', 1]]) {
        const lead = (sg > 0) === !!odd
        const fs = rung(pl.s + (lead ? 0.3 * lift : 0)) + (lead ? 0 : 0)
        const hs = rung(pl.s + 1.45 + (lead ? 0.3 : 0))
        const foot = at(fs).addScaledVector(side, sg * 0.12).addScaledVector(out, 0.05)
        const hand = at(hs).addScaledVector(side, sg * 0.2).addScaledVector(out, 0.04)
        const knee = at(fs + 0.6).addScaledVector(out, 0.8).addScaledVector(side, sg * 0.15)
        const elbow = at(hs - 0.4).addScaledVector(out, 0.5).addScaledVector(side, sg * 0.6)
        ik2(B['UpperLeg.' + n], B['LowerLeg.' + n], B['Foot.' + n], foot, knee)
        ik2(B['UpperArm.' + n], B['LowerArm.' + n], B['Wrist.' + n], hand, elbow)
      }
    } else if (lad.state === 'carry' && this.ladPose) {
      // 右手ではしごを肩に担ぐ
      const p = this.ladPose
      const k = lad.L * 0.42
      const hold = new THREE.Vector3(p.F[0] + p.u[0] * k, p.F[1] + p.u[1] * k + 0.05, p.F[2] + p.u[2] * k)
      const yaw = this.player.rotation.y
      const el = hold.clone().add(new THREE.Vector3(Math.cos(yaw) * 0.3, -0.5, -Math.sin(yaw) * 0.3))
      const n = this.sideR || 'R'
      ik2(B['UpperArm.' + n], B['LowerArm.' + n], B['Wrist.' + n], hold, el)
    }
  }
  render(alpha, dt, ghostPlan) {
    const sim = this.sim, pl = sim.pl, lad = sim.lad, W = sim.world
    const t = performance.now() / 1000
    for (const m of this.boxMeshes) {
      const b = m.userData.box
      m.visible = !!b.alive
      if (b.move || b.shake) m.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2)
      if (b.shake && b.alive && b.load > 0) { m.matrixAutoUpdate = true; m.position.x += (Math.random() - 0.5) * 0.05 * b.shake; m.position.z += (Math.random() - 0.5) * 0.05 * b.shake }
    }
    // はしご
    const L = lad.L
    const g = this.ladder
    g.visible = true
    let pose = null
    if (lad.state === 'carry') {
      const fw = [Math.sin(pl.yaw), 0, Math.cos(pl.yaw)]
      const side = [Math.cos(pl.yaw), 0, -Math.sin(pl.yaw)]
      // 右手で体の横に下げて運ぶ（カメラの前をふさがない）
      const sh = [pl.p[0] - side[0] * 0.42, pl.p[1] + 0.95, pl.p[2] - side[2] * 0.42]
      const u = norm3([fw[0], 0.16, fw[2]])
      const F = [sh[0] - u[0] * L * 0.42, sh[1] - u[1] * L * 0.42, sh[2] - u[2] * L * 0.42]
      pose = { F, u }
      if (lad.from && sim.tick - lad.fromTick < 12) {
        const k = (sim.tick - lad.fromTick) / 12, e = 1 - (1 - k) * (1 - k)
        pose = { F: lerp3(lad.from.F, F, e), u: norm3(lerp3(lad.from.u, u, e)) }
      }
    } else if (lad.state === 'falling') {
      const k = Math.min(1, lad.ft / lad.fdur)
      const toU = norm3(sub3(lad.toT, lad.toF))
      pose = { F: lerp3(lad.from.F, lad.toF, k * k), u: norm3(lerp3(lad.from.u, toU, Math.min(1, k * 1.4))) }
    } else if (lad.state === 'lost') g.visible = false
    else { const p = ladderPose(lad); pose = { F: p.F, u: p.u } }
    this.ladPose = pose
    if (pose) this.poseLadder(g, pose.F, pose.u, lad.state === 'placed' ? lad.phi : 0, L, lad.d)
    this.poseClimber(dt)
    if (ghostPlan && ghostPlan.pose) {
      this.ghost.visible = true
      this.poseLadder(this.ghost, ghostPlan.pose.F, ghostPlan.pose.u, 0, L, ghostPlan.d)
      this.ghost.userData.mat.color.setHex(ghostPlan.ok ? 0x9ef0a8 : 0xff7a60)
    } else this.ghost.visible = false
    // 旗
    for (let i = 0; i < this.flags.length; i++) {
      const f = this.flags[i]
      const pos = f.cloth.geometry.attributes.position
      for (let j = 0; j < pos.count; j++) {
        const x = f.base[j * 3]
        pos.array[j * 3 + 2] = Math.sin(t * 3.2 + x * 6 + i) * 0.09 * (x + 0.5)
      }
      pos.needsUpdate = true
      f.cloth.material.emissive.setHex(i === sim.flag ? 0x6a4a18 : 0x000000)
    }
    for (let i = 0; i < this.pickups.length; i++) this.pickups[i].visible = !sim.got[i]
    if (this.bell) this.bell.rotation.z = sim.done ? Math.sin(t * 5) * 0.25 : 0
    // 舞う紅葉（風が吹くと流れる）
    const wnd = W.windAt([pl.p[0], pl.p[1] + 1, pl.p[2]], sim.tick)
    this.windNow = Math.hypot(wnd[0], wnd[1])
    const o = new THREE.Object3D()
    for (let i = 0; i < this.fallSeed.length; i++) {
      const s = this.fallSeed[i]
      const ph = (t * (0.05 + s[3] * 0.05) + s[0]) % 1
      const x = pl.p[0] + (s[1] - 0.5) * 30 + Math.sin(t * 0.7 + i) * 0.6 + wnd[0] * ph * 1.2
      const z = pl.p[2] + (s[2] - 0.5) * 30 + Math.cos(t * 0.6 + i) * 0.6 + wnd[1] * ph * 1.2
      const y = pl.p[1] + 9 - ph * 16
      o.position.set(x, y, z); o.rotation.set(t * (1 + s[1]) + i, t * 1.3 + s[2] * 6, 0); o.updateMatrix()
      this.fall.setMatrixAt(i, o.matrix)
    }
    this.fall.instanceMatrix.needsUpdate = true
    // カメラ: 人の後ろ上。はしごの上では少し横へ（角度が見える）
    const tgt = new THREE.Vector3(pl.p[0], pl.p[1] + 1.45, pl.p[2])
    this.camT.lerp(tgt, 1 - Math.exp(-dt * 8))
    const idle = t - this.userCamT > 2.5
    if (idle && pl.mode === 'ladder' && lad.d) {
      // 斜め上から石垣と はしごを見下ろす（絵 C の構図）
      const ly = Math.atan2(-lad.d[0], -lad.d[2]) + 0.6
      this.camYaw += angDiff(this.camYaw, ly) * (1 - Math.exp(-dt * 1.5))
      this.camPitch += (0.62 - this.camPitch) * (1 - Math.exp(-dt * 1.2))
    }
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch)
    const off = new THREE.Vector3(Math.sin(this.camYaw) * cp, sp, Math.cos(this.camYaw) * cp)
    const hit = W.raycast([this.camT.x, this.camT.y, this.camT.z], [off.x, off.y, off.z], this.camDist, b => b.mat === 'leaves' || b.mat === 'moss')
    const dd = hit ? Math.max(1.2, hit.t - 0.3) : this.camDist
    this.cam.position.copy(this.camT).addScaledVector(off, dd)
    this.cam.lookAt(this.camT)
    this.sun.position.set(pl.p[0] + SUN_DIR.x * 50, pl.p[1] + SUN_DIR.y * 50, pl.p[2] + SUN_DIR.z * 50)
    this.sun.target.position.set(pl.p[0], pl.p[1], pl.p[2])
    this.sky.position.copy(this.cam.position)
    this.grade.uniforms.uTime.value = t % 10
    this.cam.updateMatrixWorld(); this.cam.matrixWorldInverse.copy(this.cam.matrixWorld).invert()
    if (this.sunV) this.sunV.value.copy(SUN_DIR).transformDirection(this.cam.matrixWorldInverse)
    this.composer.render(dt)
  }
  camFwd() { return [-Math.sin(this.camYaw), -Math.cos(this.camYaw)] }
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
// 2本の骨の IK（sky-bike と同じ考え方）: 付け根 A → 関節 B → 先 C を、先が target に来るよう曲げる。pole は関節を向ける側
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3()
function aim(bone, childW, targetW) {
  const bw = bone.getWorldPosition(new THREE.Vector3())
  const from = childW.clone().sub(bw).normalize(), to = targetW.clone().sub(bw).normalize()
  const dq = new THREE.Quaternion().setFromUnitVectors(from, to)
  const wq = bone.getWorldQuaternion(new THREE.Quaternion()), pq = bone.parent.getWorldQuaternion(new THREE.Quaternion())
  bone.quaternion.copy(pq.invert().multiply(dq.multiply(wq)))
  bone.updateMatrixWorld(true)
}
function ik2(A, B, C, target, pole) {
  if (!A || !B || !C) return
  A.getWorldPosition(_a); B.getWorldPosition(_b); C.getWorldPosition(_c)
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c)
  const d = target.clone().sub(_a), L = Math.max(0.05, Math.min(l1 + l2 - 0.002, d.length())), u = d.normalize()
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + L * L - l2 * l2) / (2 * l1 * L))), sinA = Math.sqrt(1 - cosA * cosA)
  const pv = pole.clone().sub(_a); pv.sub(u.clone().multiplyScalar(pv.dot(u))).normalize()
  const bD = _a.clone().addScaledVector(u, l1 * cosA).addScaledVector(pv, l1 * sinA)
  aim(A, _b.clone(), bD)
  B.getWorldPosition(_b); C.getWorldPosition(_c)
  aim(B, _c.clone(), _a.clone().addScaledVector(u, L))
}
