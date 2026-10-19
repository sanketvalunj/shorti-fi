import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/** Inline the (tiny) stylesheet into the HTML — no render-blocking request. */
function inlineCss(): Plugin {
  return {
    name: 'shortifi:inline-css',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      const css = bundle['style.css'];
      if (html?.type === 'asset' && css?.type === 'asset') {
        const link = /<link[^>]+href="[^"]*style\.css"[^>]*>/;
        html.source = String(html.source).replace(link, `<style>${String(css.source)}</style>`);
        delete bundle['style.css'];
      }
    },
  };
}

export default defineConfig({
  plugins: [inlineCss()],
  build: {
    minify: 'esbuild',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        chunkFileNames: 'chunk.js',
        assetFileNames: 'style.css',
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});