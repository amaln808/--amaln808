// Copies the receipt reader (Tesseract) and its Arabic + English language files into
// public/tesseract, so the app serves them itself instead of an outside CDN.
// Runs before dev and build; the folder is not committed.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const out = 'public/tesseract'
mkdirSync(out, { recursive: true })
const copy = (from, name = from.split('/').pop()) => {
  if (!existsSync(join(out, name))) copyFileSync(from, join(out, name))
}
copy('node_modules/tesseract.js/dist/worker.min.js')
for (const f of readdirSync('node_modules/tesseract.js-core').filter((f) => f.endsWith('-lstm.wasm.js'))) copy(`node_modules/tesseract.js-core/${f}`)
for (const lang of ['ara', 'eng']) copy(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`)
console.log('tesseract files ready in', out)
