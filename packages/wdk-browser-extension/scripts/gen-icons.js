// Generates icon PNG files (16px, 48px, 128px) without any dependencies.
// Raw PNG encoding using Node.js built-in zlib.
import { createDeflateRaw } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, '../public/icons')
mkdirSync(outDir, { recursive: true })

function crc32 (buf) {
  let crc = 0xffffffff
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function uint32be (n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}

function chunk (type, data) {
  const typeB = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeB, data])
  const crc = uint32be(crc32(body))
  return Buffer.concat([uint32be(data.length), body, crc])
}

function deflateSync (data) {
  return new Promise((resolve, reject) => {
    const bufs = []
    const d = createDeflateRaw({ level: 9 })
    d.on('data', (b) => bufs.push(b))
    d.on('end', () => resolve(Buffer.concat(bufs)))
    d.on('error', reject)
    d.write(data)
    d.end()
  })
}

// Draw a simple circle with a checkmark icon — teal color
function drawPixel (x, y, size, r, g, b) {
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.42
  const innerR = size * 0.28
  const dx = x - cx + 0.5
  const dy = y - cy + 0.5
  const dist = Math.sqrt(dx * dx + dy * dy)

  // Background circle
  if (dist <= radius) {
    // Inner fill
    if (dist <= innerR) return [0x14, 0xb8, 0x9a] // accent fill
    return [0x0d, 0x8a, 0x74] // ring
  }
  // Outer bg
  return [0x0f, 0x11, 0x17]
}

async function makePng (size) {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)   // width
  ihdrData.writeUInt32BE(size, 4)   // height
  ihdrData[8] = 8                   // bit depth
  ihdrData[9] = 2                   // color type RGB
  // compression, filter, interlace = 0

  const scanlines = []
  for (let y = 0; y < size; y++) {
    scanlines.push(0) // filter type None
    for (let x = 0; x < size; x++) {
      scanlines.push(...drawPixel(x, y, size))
    }
  }
  const raw = Buffer.from(scanlines)
  const compressed = await deflateSync(raw)

  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ])
}

for (const size of [16, 48, 128]) {
  const png = await makePng(size)
  const out = resolve(outDir, `icon${size}.png`)
  writeFileSync(out, png)
  console.log(`  created ${out} (${png.length} bytes)`)
}
console.log('Icons generated.')
