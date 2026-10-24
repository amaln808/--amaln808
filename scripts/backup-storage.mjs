// Downloads every file from the four private buckets into the given folder.
import { createClient } from '@supabase/supabase-js'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const target = process.argv[2]
const { url } = JSON.parse(await readFile('src/data/supabase.config.json', 'utf8'))
const supabase = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const BUCKETS = ['products', 'lab-certificates', 'receipts', 'branding']

async function listAll(bucket, prefix = '') {
  const files = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw error
    for (const e of data) {
      const path = prefix ? `${prefix}/${e.name}` : e.name
      if (e.id === null) files.push(...(await listAll(bucket, path))) // folder
      else files.push(path)
    }
    if (data.length < 1000) return files
  }
}

let count = 0
for (const bucket of BUCKETS) {
  for (const path of await listAll(bucket)) {
    const { data, error } = await supabase.storage.from(bucket).download(path)
    if (error) throw error
    const file = join(target, bucket, path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, Buffer.from(await data.arrayBuffer()))
    count++
  }
}
await mkdir(target, { recursive: true })
console.log(`${count} files saved`)
