import '../mute-auto.mjs'
// 起動だけ確かめて、エラーを全部出す
import pw from 'playwright'
import { spawn } from 'node:child_process'
const PORT = 6900 + Math.floor(Math.random() * 300)
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
await new Promise(r => setTimeout(r, 600))
const b = await pw.chromium.launch()
const p = await b.newPage()
const errs = []
p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()) }); p.on('requestfailed', r => errs.push('failed ' + r.url()))
await p.goto(`http://localhost:${PORT}/`, { timeout: 180000 })
await p.waitForTimeout(8000)
console.log('ready', await p.evaluate(() => !!window.__slReady), await p.evaluate(() => window.sl && sl.view.castleStats))
console.log(errs.slice(0, 10).join('\n'))
await b.close(); srv.kill()
