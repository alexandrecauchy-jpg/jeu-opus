// Textures procédurales (pierre du sol, briques des murs) avec cartes de relief.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

// Calcule une carte de normales à partir d'une carte de hauteur (niveaux de gris).
function normalFromHeight(hctx, size, strength) {
  const src = hctx.getImageData(0, 0, size, size).data;
  const [c, ctx] = canvas(size);
  const out = ctx.createImageData(size, size);
  const h = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

function speckle(ctx, hctx, size, r, n, alpha) {
  for (let i = 0; i < n; i++) {
    const x = r() * size, y = r() * size, s = 1 + r() * 2.5;
    const v = r();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${alpha * r()})` : `rgba(0,0,0,${alpha * 1.5 * r()})`;
    ctx.fillRect(x, y, s, s);
    hctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${0.15 * r()})` : `rgba(0,0,0,${0.2 * r()})`;
    hctx.fillRect(x, y, s, s);
  }
}

function crack(ctx, hctx, r, x, y, len) {
  ctx.strokeStyle = 'rgba(10,8,6,0.7)';
  hctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = hctx.lineWidth = 1.5;
  ctx.beginPath(); hctx.beginPath();
  ctx.moveTo(x, y); hctx.moveTo(x, y);
  let a = r() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    a += (r() - 0.5) * 1.2;
    x += Math.cos(a) * 8; y += Math.sin(a) * 8;
    ctx.lineTo(x, y); hctx.lineTo(x, y);
  }
  ctx.stroke(); hctx.stroke();
}

function finish(c, renderer, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function floorTextures(renderer) {
  const size = 512;
  const r = rng(42);
  const [c, ctx] = canvas(size);
  const [hc, hctx] = canvas(size);
  ctx.fillStyle = '#1a1714'; ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#000'; hctx.fillRect(0, 0, size, size);
  // Dalles irrégulières : 2 rangées, joints décalés
  const rows = [[0, 256], [256, 512]];
  rows.forEach(([y0, y1], ri) => {
    let x = ri ? -90 : 0;
    const end = x + size;
    while (x < end) {
      let w = 150 + r() * 110;
      if (x + w > end - 80) w = end - x;
      const g = 58 + r() * 26;
      for (const shift of [0, size, -size]) {
        const sx = x + shift + 6;
        ctx.fillStyle = `rgb(${g + 6},${g + 2},${g - 4})`;
        ctx.beginPath();
        ctx.roundRect(sx, y0 + 6, w - 12, y1 - y0 - 12, 14);
        ctx.fill();
        const grd = hctx.createRadialGradient(sx + w / 2, (y0 + y1) / 2, 10, sx + w / 2, (y0 + y1) / 2, w * 0.8);
        grd.addColorStop(0, '#d8d8d8'); grd.addColorStop(1, '#9a9a9a');
        hctx.fillStyle = grd;
        hctx.beginPath();
        hctx.roundRect(sx, y0 + 6, w - 12, y1 - y0 - 12, 14);
        hctx.fill();
      }
      x += w;
    }
  });
  // Variation de teinte, mousse et taches
  for (let i = 0; i < 40; i++) {
    const x = r() * size, y = r() * size, rad = 20 + r() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const moss = r() > 0.8;
    g.addColorStop(0, moss ? 'rgba(40,60,30,0.25)' : `rgba(${r() > 0.5 ? '0,0,0' : '120,100,80'},0.18)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  speckle(ctx, hctx, size, r, 6000, 0.12);
  for (let i = 0; i < 7; i++) crack(ctx, hctx, r, r() * size, r() * size, 4 + r() * 8);
  const normal = normalFromHeight(hctx, size, 6);
  return { map: finish(c, renderer), normalMap: finish(normal, renderer, false) };
}

export function wallTextures(renderer) {
  const size = 512;
  const r = rng(7);
  const [c, ctx] = canvas(size);
  const [hc, hctx] = canvas(size);
  ctx.fillStyle = '#15120f'; ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#000'; hctx.fillRect(0, 0, size, size);
  const bh = 64;
  for (let row = 0; row < size / bh; row++) {
    let x = row % 2 ? -64 : 0;
    const end = x + size;
    while (x < end) {
      let w = 110 + r() * 50;
      if (x + w > end - 70) w = end - x;
      const g = 52 + r() * 30;
      const warm = r() * 10;
      for (const shift of [0, size, -size]) {
        const sx = x + shift;
        ctx.fillStyle = `rgb(${g + warm},${g + 2},${g - 6})`;
        ctx.beginPath(); ctx.roundRect(sx + 4, row * bh + 4, w - 8, bh - 8, 8); ctx.fill();
        hctx.fillStyle = `rgb(${190 + r() * 40},${190},${190})`;
        hctx.beginPath(); hctx.roundRect(sx + 4, row * bh + 4, w - 8, bh - 8, 10); hctx.fill();
      }
      x += w;
    }
  }
  // Coulures sombres et salpêtre
  for (let i = 0; i < 30; i++) {
    const x = r() * size, len = 60 + r() * 200;
    const g = ctx.createLinearGradient(x, 0, x, len);
    g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, 6 + r() * 20, len);
  }
  for (let i = 0; i < 25; i++) {
    const x = r() * size, y = r() * size, rad = 15 + r() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, r() > 0.6 ? 'rgba(45,70,35,0.3)' : 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  speckle(ctx, hctx, size, r, 5000, 0.12);
  for (let i = 0; i < 5; i++) crack(ctx, hctx, r, r() * size, r() * size, 3 + r() * 6);
  const normal = normalFromHeight(hctx, size, 5);
  return { map: finish(c, renderer), normalMap: finish(normal, renderer, false) };
}

// Petite texture ronde et douce pour les particules et les flammes.
export function glowTexture() {
  const [c, ctx] = canvas(64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function flameTexture() {
  const [c, ctx] = canvas(64);
  const g = ctx.createRadialGradient(32, 40, 2, 32, 36, 30);
  g.addColorStop(0, 'rgba(255,250,200,1)');
  g.addColorStop(0.3, 'rgba(255,170,50,0.9)');
  g.addColorStop(0.7, 'rgba(220,60,10,0.35)');
  g.addColorStop(1, 'rgba(120,20,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(32, 2);
  ctx.bezierCurveTo(50, 24, 60, 44, 32, 62);
  ctx.bezierCurveTo(4, 44, 14, 24, 32, 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Halo au sol (cercle de visée / zones de danger)
export function ringTexture() {
  const [c, ctx] = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 30, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.92, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
