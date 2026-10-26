// Renders a static design board (docs/design/**/boards/*.html) to a full-page PNG at 1440px.
// Usage: node scripts/render-design-board.mjs <board.html> <out.png>
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [, , file, out] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(resolve(file)).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: true });
console.log('fonts', await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i).join(', ')), errors.join(';') || 'no errors');
await browser.close();
