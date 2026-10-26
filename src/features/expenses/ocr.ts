import type { Worker } from 'tesseract.js'

let worker: Promise<Worker> | null = null
const asset = (name: string) => new URL(`tesseract/${name}`, document.baseURI).href
let report: (progress: number) => void = () => {}

/**
 * Reads the text of a receipt photo on the iPad itself (the photo is not sent
 * anywhere). The reader and its Arabic + English language files load on first
 * use (several MB) and are kept by the browser for next time.
 */
export async function readReceipt(image: Blob, onProgress: (progress: number) => void): Promise<string> {
  report = onProgress
  worker ??= import('tesseract.js').then(({ createWorker }) =>
    createWorker(['ara', 'eng'], 1, {
      // Served by the app itself (copied by scripts/copy-tesseract.mjs), not a CDN
      workerPath: asset('worker.min.js'),
      corePath: asset(''),
      langPath: asset(''),
      workerBlobURL: false,
      logger: (m) => {
        if (m.status === 'recognizing text') report(0.3 + m.progress * 0.7)
        else if (typeof m.progress === 'number') report(Math.min(0.3, m.progress * 0.3))
      },
    }),
  )
  try {
    const w = await worker
    const { data } = await w.recognize(image)
    report(1)
    return data.text
  } catch (e) {
    worker = null // try a fresh reader next time (e.g. the language files failed to load)
    throw e
  }
}
