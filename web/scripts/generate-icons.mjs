import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#1a1a18"/>
  <text x="${size / 2}" y="${size / 2}" font-family="system-ui, sans-serif"
        font-size="${size * 0.55}" font-weight="600" fill="#ffffff"
        text-anchor="middle" dominant-baseline="central">K</text>
</svg>`;

const sizes = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

await mkdir('public/icons', { recursive: true });

for (const { name, size } of sizes) {
  await sharp(Buffer.from(svg(size))).png().toFile(`public/icons/${name}`);
  console.log(`сгенерировано: public/icons/${name}`);
}
