// export.ts — PNG download + clipboard copy (offscreen, exact pixel size)
import { render } from './renderer';
import type { RenderOptions } from './renderer';

export type ExportSize = 512 | 1024 | 2048;

/** Render an offscreen canvas at exact export size (no devicePixelRatio scaling). */
export function renderExport(
  matrix: boolean[][],
  opts: Omit<RenderOptions, 'size' | 'pixelRatio'>,
  exportSize: ExportSize
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  render(canvas, matrix, { ...opts, size: exportSize, pixelRatio: 1 });
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))), 'image/png');
  });
}

/** Filename like qr-wifi-20261008.png */
export function buildFilename(type: string): string {
  const d = new Date();
  const stamp =
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  return `qr-${type}-${stamp}.png`;
}

export async function downloadPNG(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await toBlob(canvas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Give the browser a beat to start the download before revoking
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function copyToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  const blob = await toBlob(canvas);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}