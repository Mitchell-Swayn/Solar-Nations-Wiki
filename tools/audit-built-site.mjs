import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { a11y } from '../node_modules/astro/dist/runtime/client/dev-toolbar/apps/audit/rules/a11y.js';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const pages = [];

function collectPages(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) collectPages(path);
    else if (name.endsWith('.html')) pages.push(path);
  }
}

collectPages(root);

const issues = new Map();
const performanceIssues = new Map();

function recordIssue(collection, code, path, element) {
  const entries = collection.get(code) ?? [];
  if (entries.length < 10) entries.push(`${relative(root, path)}: ${element.outerHTML.slice(0, 180)}`);
  collection.set(code, entries);
}

for (const path of pages) {
  const { document } = parseHTML(readFileSync(path, 'utf8'));
  globalThis.document = document;
  for (const rule of a11y) {
    for (const element of document.querySelectorAll(rule.selector)) {
      let failed = true;
      try {
        failed = rule.match ? Boolean(await rule.match(element)) : true;
      } catch (error) {
        throw new Error(`${rule.code} failed while auditing ${relative(root, path)}: ${error.message}`);
      }
      if (!failed) continue;
      recordIssue(issues, rule.code, path, element);
    }
  }

  const adaptiveImages = document.querySelectorAll('img[data-auto-loading]');
  if (adaptiveImages.length > 0 && !readFileSync(path, 'utf8').includes('updateAdaptiveImageLoading')) {
    recordIssue(performanceIssues, 'perf-adaptive-loading-script', path, adaptiveImages[0]);
  }
  for (const image of document.querySelectorAll('img')) {
    const src = image.getAttribute('src');
    if (src && !src.startsWith('data:')) {
      if (/^(?:[a-z+]+:)?\/\//i.test(src)) {
        recordIssue(performanceIssues, 'perf-use-image-component', path, image);
      } else {
        const assetPath = join(root, decodeURIComponent(new URL(src, 'https://wiki.invalid').pathname).replace(/^\//, ''));
        if (!existsSync(assetPath) || statSync(assetPath).size >= 20480) {
          recordIssue(performanceIssues, 'perf-use-image-component', path, image);
        }
      }
    }
    if (!image.hasAttribute('loading')) recordIssue(performanceIssues, 'perf-use-loading-lazy', path, image);
    if (image.getAttribute('loading') === 'lazy' && !image.hasAttribute('data-auto-loading')) {
      recordIssue(performanceIssues, 'perf-use-loading-eager', path, image);
    }
    if (src?.toLowerCase().endsWith('.gif')) recordIssue(performanceIssues, 'perf-use-videos', path, image);
  }
  for (const frame of document.querySelectorAll('iframe')) {
    if (!frame.hasAttribute('loading') && !frame.hasAttribute('data-auto-loading')) {
      recordIssue(performanceIssues, 'perf-use-loading-lazy', path, frame);
    }
  }
  for (const island of document.querySelectorAll('astro-island')) {
    if (Number.parseFloat(island.getAttribute('server-render-time')) > 500) {
      recordIssue(performanceIssues, 'perf-slow-component-server-render', path, island);
    }
    if (Number.parseFloat(island.getAttribute('client-render-time')) > 500) {
      recordIssue(performanceIssues, 'perf-slow-component-client-hydration', path, island);
    }
  }
}

const allIssues = new Map([...issues, ...performanceIssues]);
if (allIssues.size > 0) {
  for (const [code, entries] of allIssues) {
    console.error(`\n${code}`);
    for (const entry of entries) console.error(`  ${entry}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Astro accessibility and performance audit passed for ${pages.length} generated pages.`);
}
