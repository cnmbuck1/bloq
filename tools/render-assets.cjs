// Renders the iOS app icon and launch image from the game's own drawing code.
// Usage: npm run build:preview && node tools/render-assets.cjs   (needs Playwright's Chromium)
const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + resolve('preview/bloq.html'));
  await p.waitForFunction(() => window.__bloqArt);
  const out = await p.evaluate(() => ({
    icon: window.__bloqArt.renderAppIcon(1024).toDataURL('image/png'),
    launch: window.__bloqArt.renderLaunch(2732).toDataURL('image/png'),
  }));
  writeFileSync('resources/icon-1024.png', Buffer.from(out.icon.split(',')[1], 'base64'));
  writeFileSync('resources/splash-2732.png', Buffer.from(out.launch.split(',')[1], 'base64'));
  console.log('wrote resources/icon-1024.png and resources/splash-2732.png');
  await b.close();
})();
