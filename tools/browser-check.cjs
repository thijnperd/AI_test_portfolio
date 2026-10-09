#!/usr/bin/env node
/* browser-check.cjs — headless browser verification for the projects in this
 * repo, driven by Playwright.
 *
 * Playwright is installed globally (see tools/README.md). This script resolves
 * it from the global npm root if it is not on the local NODE_PATH, so it runs
 * from anywhere without adding a dependency to any project.
 *
 * Usage:
 *   node tools/browser-check.cjs <url-or-path> [options]
 *
 * Options:
 *   --wait <ms>          wait after load before checking   (default 1000)
 *   --size <WxH>         viewport size                      (default 1000x700)
 *   --expect <selector>  fail unless this element exists   (repeatable)
 *   --press <key>        press a key after load            (repeatable)
 *   --click <selector>   click an element after load       (repeatable)
 *   --screenshot <file>  save a PNG of the final state
 *   --eval <js>          evaluate JS in the page, print the result
 *   --touch              emulate a touch device: `pointer: coarse` and
 *                        `hover: none` match and touch events fire
 *   --dpr <n>            device pixel ratio (default 1; pair with --touch)
 *   --headed             show a real window (default: headless)
 *
 * Output: a JSON summary { url, title, expect, pressed, evals, errors, ok }.
 * Exit code is 1 when any console error, page error, or missing --expect is
 * found; 0 otherwise.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (err) {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(root, 'playwright'));
  }
}

let chromium;
try {
  chromium = loadPlaywright().chromium;
} catch (err) {
  console.error('Playwright is not available. Install it with:\n' +
    '  npm install -g playwright\n  playwright install chromium\n' +
    'Then run this script again. (' + err.message + ')');
  process.exit(2);
}

const opts = {
  wait: 1000,
  width: 1000,
  height: 700,
  headless: true,
  shot: null,
  expect: [],
  press: [],
  click: [],
  evalJs: null,
  touch: false,
  dpr: 1,
};

const argv = process.argv.slice(2);
let target = null;
const need = function (flag, i) {
  if (i + 1 >= argv.length) {
    console.error('Missing value for ' + flag);
    process.exit(2);
  }
  return argv[i + 1];
};

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--screenshot') { opts.shot = need(a, i); i++; }
  else if (a === '--wait') { opts.wait = parseInt(need(a, i), 10); i++; }
  else if (a === '--size') {
    const parts = need(a, i).split('x');
    opts.width = parseInt(parts[0], 10);
    opts.height = parseInt(parts[1], 10);
    i++;
  } else if (a === '--expect') { opts.expect.push(need(a, i)); i++; }
  else if (a === '--press') { opts.press.push(need(a, i)); i++; }
  else if (a === '--click') { opts.click.push(need(a, i)); i++; }
  else if (a === '--eval') { opts.evalJs = need(a, i); i++; }
  else if (a === '--touch') { opts.touch = true; }
  else if (a === '--dpr') { opts.dpr = Number(need(a, i)) || 1; i++; }
  else if (a === '--headed') { opts.headless = false; }
  else if (a === '--help' || a === '-h') {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace('/*', '').replace(/^#!.*\n/, ''));
    process.exit(0);
  } else if (!target) { target = a; }
  else { console.error('Unexpected argument: ' + a); process.exit(2); }
}

if (!target) {
  console.error('usage: node tools/browser-check.cjs <url-or-path> [--wait ms] [--size WxH] ' +
    '[--expect sel] [--press key] [--click sel] [--screenshot file] [--eval js] ' +
    '[--touch] [--dpr n] [--headed]');
  process.exit(2);
}

function toUrl(t) {
  if (/^https?:\/\//.test(t) || t.startsWith('file://')) return t;
  return 'file://' + path.resolve(t).replace(/\\/g, '/');
}

(async function main() {
  const url = toUrl(target);
  const browser = await chromium.launch({ headless: opts.headless });
  // `--touch` is what makes a coarse-pointer layout testable at all: without
  // it Chromium reports `pointer: fine`, so every `@media (pointer: coarse)`
  // rule is dead and a mobile check would silently test the desktop layout.
  const page = await browser.newPage({
    viewport: { width: opts.width, height: opts.height },
    hasTouch: opts.touch,
    isMobile: opts.touch,
    deviceScaleFactor: opts.dpr,
  });

  const errors = [];
  page.on('console', function (m) { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });

  await page.goto(url);
  await page.waitForTimeout(opts.wait);

  for (const key of opts.press) {
    await page.keyboard.press(key);
    await page.waitForTimeout(120);
  }
  for (const sel of opts.click) {
    await page.click(sel).catch(function (e) { errors.push('click ' + sel + ': ' + e.message); });
    await page.waitForTimeout(120);
  }

  const missing = [];
  for (const sel of opts.expect) {
    const n = await page.locator(sel).count();
    if (n === 0) missing.push(sel);
  }

  let evaluated = null;
  if (opts.evalJs) {
    try {
      evaluated = await page.evaluate(opts.evalJs);
    } catch (e) {
      errors.push('eval: ' + e.message);
    }
  }

  if (opts.shot) {
    fs.mkdirSync(path.dirname(path.resolve(opts.shot)), { recursive: true });
    await page.screenshot({ path: opts.shot });
  }

  const summary = {
    url: url,
    title: await page.title(),
    touch: opts.touch,
    dpr: opts.dpr,
    expect: opts.expect.map(function (s) { return { selector: s, found: missing.indexOf(s) === -1 }; }),
    pressed: opts.press,
    evals: evaluated,
    errors: errors,
    ok: errors.length === 0 && missing.length === 0,
  };
  console.log(JSON.stringify(summary, null, 2));

  await browser.close();
  process.exit(summary.ok ? 0 : 1);
})().catch(function (e) {
  console.error('FAILED: ' + e.message);
  process.exit(1);
});
