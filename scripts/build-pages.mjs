// These are real HTML pages so readers and crawlers do not need the game bundle,
// camera access, or JavaScript. npm's predev/prebuild hooks keep them up to date.
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { ONLINE_GAMES } from '../src/game/onlineProtocol.js';
import { pages } from './site-pages.mjs';

const escape = (value) => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const updated = 'October 13, 2026';
const base = 'https://galawgaw.com';
// Reuse the app's outlined wordmark and installed fonts on script-free pages.
const logoSource = await readFile(new URL('../src/components/arcade/Logo.tsx', import.meta.url), 'utf8');
const wordmark = logoSource.match(/const WORDMARK\s*=\s*"([^"]+)"/)?.[1];
if (!wordmark) throw new Error('Could not read the shared GALAWGAW wordmark.');
await writeFile(new URL('../public/wordmark.svg', import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 240 4560 960"><path d="${wordmark}" fill="#eceefa"/></svg>`);
await mkdir(new URL('../public/fonts/', import.meta.url), { recursive: true });
await Promise.all([
  copyFile(new URL('../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2', import.meta.url), new URL('../public/fonts/geist.woff2', import.meta.url)),
  copyFile(new URL('../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2', import.meta.url), new URL('../public/fonts/space-grotesk.woff2', import.meta.url)),
]);
const gameGuides = ONLINE_GAMES.map(game => `
  <section id="${escape(game.id)}" class="game-guide">
    <p class="eyebrow">${game.coop ? 'Work together' : 'Head to head'} · ${game.mode === 'hand' ? 'Hand tracking' : 'Body tracking'}</p>
    <h3>${escape(game.title)}</h3>
    <p>${escape(game.blurb)}</p>
    <ol>${game.tutorial.map(step => `<li>${escape(step)}</li>`).join('')}</ol>
  </section>`).join('');
const gameContents = `<ul class="game-index">${ONLINE_GAMES.map(game => `<li><a href="#${escape(game.id)}">${escape(game.title)}</a></li>`).join('')}</ul>`;

for (const page of pages) {
  const links = pages.map(item => `<a href="../${item.slug}/"${item.slug === page.slug ? ' aria-current="page"' : ''}>${escape(item.label)}</a>`).join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0b0b14">
  <title>${escape(page.label)} — GALAWGAW</title>
  <meta name="description" content="${escape(page.description)}">
  <link rel="canonical" href="${base}/${page.slug}/">
  <link rel="icon" type="image/svg+xml" href="../favicon.svg">
  <link rel="stylesheet" href="../info.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <a href="../" class="brand" aria-label="GALAWGAW home"><img src="../favicon.svg" width="32" height="32" alt=""><img src="../wordmark.svg" width="105" height="22" alt="GALAWGAW"></a>
    <a href="../#games" class="play-link">Back to the games <span aria-hidden="true">↗</span></a>
  </header>
  <div class="page-layout">
    <aside><p class="nav-label">Around the arcade</p><nav aria-label="Site information">${links}</nav></aside>
    <main id="main" tabindex="-1">
      <p class="eyebrow">${escape(page.eyebrow)}</p>
      <h1>${escape(page.title)}</h1>
      <p class="intro">${escape(page.intro)}</p>
      ${page.policy ? `<p class="updated">Last updated: <time datetime="2026-10-13">${updated}</time></p>` : ''}
      ${page.body.replace('<!-- GAME_INDEX -->', gameContents).replace('<!-- GAME_GUIDES -->', gameGuides)}
    </main>
  </div>
  <footer class="site-footer"><p>Good company. Questionable moves.</p><a href="../">Back to GALAWGAW</a><span>© 2026 GALAWGAW</span></footer>
</body>
</html>
`;
  const dir = new URL(`../public/${page.slug}/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL('index.html', dir), html);
}
const urls = [`${base}/`, ...pages.map(page => `${base}/${page.slug}/`)];
await writeFile(new URL('../public/sitemap.xml', import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}
</urlset>\n`);
console.log(`Generated ${pages.length} information pages, ${ONLINE_GAMES.length} game guides, and sitemap.xml.`);
