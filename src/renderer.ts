// renderer.ts — canvas drawing (dots, colors, eyes, logo) + scannability warnings
export type DotStyle = 'square' | 'rounded' | 'dots';
export type EyeStyle = 'square' | 'rounded';

export interface LogoOptions {
  image: ImageBitmap | HTMLImageElement;
  /** Logo size as a fraction of QR width (0.10–0.25) */
  scale: number;
}

export interface RenderOptions {
  size: number;               // CSS pixels
  margin?: number;            // quiet zone in modules (default 4, standards-compliant)
  fg: string;
  bg: string;
  transparentBg?: boolean;
  dotStyle?: DotStyle;
  eyeStyle?: EyeStyle;
  logo?: LogoOptions | null;
  pixelRatio?: number;        // override for export (defaults to devicePixelRatio)
}

const TAU = Math.PI * 2;

/* ---------- contrast / scannability guardrails ---------- */

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function checkContrast(fg: string, bg: string, transparent = false): string | null {
  const lf = luminance(fg);
  if (transparent) {
    return lf > 0.35
      ? 'Foreground is too light to scan reliably on most backgrounds. Use a dark color.'
      : null;
  }
  const lb = luminance(bg);
  if (lf > lb) {
    return 'Foreground is lighter than background. QR codes scan best dark-on-light.';
  }
  const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
  return ratio < 4 ? `Low contrast (${ratio.toFixed(1)}:1, recommended ≥ 4:1) — scanning may fail.` : null;
}

/* ---------- geometry helpers ---------- */

function inFinder(r: number, c: number, n: number): boolean {
  return (
    (r < 7 && c < 7) ||
    (r < 7 && c >= n - 7) ||
    (r >= n - 7 && c < 7)
  );
}

/** Draw one 7x7 finder pattern: outer ring (hole filled evenodd) + inner 3x3 eye. */
function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  style: EyeStyle
): void {
  const s = 7 * cell;
  ctx.beginPath();
  if (style === 'rounded') {
    ctx.roundRect(x, y, s, s, 2 * cell);
    ctx.roundRect(x + cell, y + cell, 5 * cell, 5 * cell, 1.35 * cell);
  } else {
    ctx.rect(x, y, s, s);
    ctx.rect(x + cell, y + cell, 5 * cell, 5 * cell);
  }
  ctx.fill('evenodd');

  ctx.beginPath();
  if (style === 'rounded') {
    ctx.roundRect(x + 2 * cell, y + 2 * cell, 3 * cell, 3 * cell, 0.9 * cell);
  } else {
    ctx.rect(x + 2 * cell, y + 2 * cell, 3 * cell, 3 * cell);
  }
  ctx.fill();
}

/* ---------- main render ---------- */

export function render(
  canvas: HTMLCanvasElement,
  matrix: boolean[][],
  opts: RenderOptions
): string[] {
  const warnings: string[] = [];
  const { size, fg, bg } = opts;
  const margin = opts.margin ?? 4;
  const dotStyle = opts.dotStyle ?? 'square';
  const eyeStyle = opts.eyeStyle ?? 'square';
  const transparent = !!opts.transparentBg;
  const logo = opts.logo ?? null;
  const n = matrix.length;
  const total = n + margin * 2;
  const cell = size / total;
  const dpr = opts.pixelRatio ?? Math.max(1, window.devicePixelRatio || 1);

  // Crisp output on retina / export at exact pixel size
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const contrastWarn = checkContrast(fg, bg, transparent);
  if (contrastWarn) warnings.push(contrastWarn);

  if (!transparent) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }

  // Logo box in module coordinates (data area origin at 0,0)
  let lb: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let logoPx = 0;
  if (logo) {
    const frac = Math.min(Math.max(logo.scale, 0.1), 0.25);
    if (frac > 0.2) {
      warnings.push('Logo covers more than 20% of the code — scan reliability may drop.');
    }
    logoPx = frac * n * cell;
    const pad = logoPx * 0.1;
    const half = (logoPx + pad * 2) / 2 / cell;
    const cx = n / 2;
    lb = { x0: cx - half, y0: cx - half, x1: cx + half, y1: cx + half };
  }

  const ox = margin * cell;
  const oy = margin * cell;
  const eps = Math.max(0.5, cell * 0.05); // overlap kills hairline gaps

  const covered = (r: number, c: number): boolean => {
    if (inFinder(r, c, n)) return true;
    if (lb) {
      const cx = c + 0.5;
      const cy = r + 0.5;
      if (cx >= lb.x0 && cx <= lb.x1 && cy >= lb.y0 && cy <= lb.y1) return true;
    }
    return false;
  };

  /* --- data modules, batched into one path per style --- */
  ctx.fillStyle = fg;
  ctx.beginPath();

  if (dotStyle === 'square') {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!matrix[r]![c] || covered(r, c)) continue;
        ctx.rect(ox + c * cell, oy + r * cell, cell + eps, cell + eps);
      }
    }
  } else if (dotStyle === 'dots') {
    const rad = cell * 0.425;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!matrix[r]![c] || covered(r, c)) continue;
        const x = ox + (c + 0.5) * cell;
        const y = oy + (r + 0.5) * cell;
        ctx.moveTo(x + rad, y);
        ctx.arc(x, y, rad, 0, TAU);
      }
    }
  } else {
    // 'rounded': round only isolated outer corners (connected style)
    const rad = cell * 0.45;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!matrix[r]![c] || covered(r, c)) continue;
        const up = r > 0 && matrix[r - 1]![c] === true;
        const down = r < n - 1 && matrix[r + 1]![c] === true;
        const left = c > 0 && matrix[r]![c - 1] === true;
        const right = c < n - 1 && matrix[r]![c + 1] === true;
        const x = ox + c * cell;
        const y = oy + r * cell;
        const tl = up || left ? 0 : rad;
        const tr = up || right ? 0 : rad;
        const br = down || right ? 0 : rad;
        const bl = down || left ? 0 : rad;
        if (tl + tr + br + bl === 0) {
          ctx.rect(x, y, cell + eps, cell + eps);
        } else {
          ctx.roundRect(x, y, cell, cell, [tl, tr, br, bl]);
        }
      }
    }
  }
  ctx.fill();

  /* --- the three finder patterns, drawn separately for scannability --- */
  drawEye(ctx, ox, oy, cell, eyeStyle);
  drawEye(ctx, ox + (n - 7) * cell, oy, cell, eyeStyle);
  drawEye(ctx, ox, oy + (n - 7) * cell, cell, eyeStyle);

  /* --- logo on a bg-colored rounded padding box --- */
  if (logo && lb) {
    const boxW = (lb.x1 - lb.x0) * cell;
    const bx = ox + lb.x0 * cell;
    const by = oy + lb.y0 * cell;
    if (!transparent) {
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxW, boxW * 0.15);
      ctx.fill();
    }
    const img = logo.image;
    const iw = 'naturalWidth' in img ? img.naturalWidth || img.width : img.width;
    const ih = 'naturalHeight' in img ? img.naturalHeight || img.height : img.height;
    if (iw && ih) {
      const fit = Math.min(logoPx / iw, logoPx / ih);
      const dw = iw * fit;
      const dh = ih * fit;
      ctx.drawImage(img, bx + (boxW - dw) / 2, by + (boxW - dh) / 2, dw, dh);
    }
  }

  return warnings;
}