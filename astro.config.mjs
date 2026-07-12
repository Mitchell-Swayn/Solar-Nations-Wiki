// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://mitchell-swayn.github.io',
  base: process.env.GITHUB_PAGES ? '/Solar-Nations-Wiki/' : '/',
  trailingSlash: 'always',
});
