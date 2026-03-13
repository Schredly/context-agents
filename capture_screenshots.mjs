import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:5173';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const pages = [
  { name: '01-tenants', path: '/tenants', wait: 1500 },
  { name: '02-integrations', path: '/integrations', wait: 1500 },
  { name: '03-integration-config', path: null, wait: 1500 }, // will find first integration
  { name: '04-tools', path: '/tools', wait: 1500 },
  { name: '05-skills', path: '/skills', wait: 1500 },
  { name: '06-use-cases', path: '/use-cases', wait: 1500 },
  { name: '07-actions', path: '/actions', wait: 1500 },
];

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  for (const pg of pages) {
    let url;
    if (pg.path) {
      url = `${BASE}${pg.path}`;
    } else if (pg.name === '03-integration-config') {
      // Navigate to integrations first, then click the first one
      await page.goto(`${BASE}/integrations`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      // Find first integration card/link
      const firstLink = await page.$('a[href*="/integrations/"]');
      if (firstLink) {
        await firstLink.click();
        await page.waitForTimeout(pg.wait);
        await page.screenshot({ path: `${OUT}/${pg.name}.png`, fullPage: true });
        console.log(`Captured: ${pg.name}`);
        continue;
      } else {
        console.log(`Skipped: ${pg.name} (no integrations found)`);
        continue;
      }
    }

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(pg.wait);
    await page.screenshot({ path: `${OUT}/${pg.name}.png`, fullPage: true });
    console.log(`Captured: ${pg.name}`);
  }

  await browser.close();
  console.log(`\nAll screenshots saved to ${OUT}/`);
}

run().catch(console.error);
