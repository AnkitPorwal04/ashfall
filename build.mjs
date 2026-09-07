import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('dist/src', { recursive: true });
for (const asset of ['index.html', 'style.css', 'src/game.js', 'src/engine.js']) {
  await copyFile(asset, `dist/${asset}`);
}
