import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const svgPath = path.join(root, 'src/client/public/logo-lorg.svg')
const pngPath = path.join(root, 'src/client/public/logo-lorg.png')

async function run() {
  if (!fs.existsSync(svgPath)) {
    if (fs.existsSync(pngPath)) {
      fs.unlinkSync(pngPath)
      console.log('Removed legacy PNG logo', pngPath)
    } else {
      console.log('No logo SVG present; skipping asset generation.')
    }
    return
  }

  const svg = fs.readFileSync(svgPath)
  await sharp(svg)
    .resize(512, 512, { fit: 'contain', background: { r: 11, g: 31, b: 45, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(pngPath)

  console.log('Generated PNG:', pngPath)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
