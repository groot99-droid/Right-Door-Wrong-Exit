// Procedural texture generation for the walk scenes. Nothing here is downloaded:
// every map (albedo, roughness, normal) is computed on the CPU from seeded value
// noise when a scene is prepared, so a phone on a slow connection pays nothing
// beyond three.js itself. Sizes are chosen per device in walk.js (`quality`).
import * as THREE from 'three';

// --- Seeded value noise ------------------------------------------------------
function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

// Tileable value noise on a `period` lattice: sampling x in [0, period) wraps.
export function noise2(x, y, period, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const ax = ((x0 % period) + period) % period, ay = ((y0 % period) + period) % period;
  const bx = (ax + 1) % period, by = (ay + 1) % period;
  const v00 = hash2(ax, ay, seed), v10 = hash2(bx, ay, seed);
  const v01 = hash2(ax, by, seed), v11 = hash2(bx, by, seed);
  const top = v00 + (v10 - v00) * fx;
  const bot = v01 + (v11 - v01) * fx;
  return top + (bot - top) * fy;
}

// Fractal sum of tileable noise. u,v in [0,1); `scale` = lattice cells per tile at octave 0.
export function fbm(u, v, scale, octaves, seed, gain = 0.5, lacunarity = 2) {
  let amp = 1, sum = 0, norm = 0, freq = scale;
  for (let o = 0; o < octaves; o++) {
    const p = Math.max(1, Math.round(freq));
    sum += amp * noise2(u * p, v * p, p, seed + o * 17);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
function mixRgb(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

// --- Texture packaging ---------------------------------------------------------
export function dataTexture(rgba, size, { srgb = false, aniso = 4, repeat = [1, 1] } = {}) {
  const tex = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

// Tangent-space normal map from a tileable height field (values 0..1).
export function heightToNormal(height, size, strength = 1) {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size, yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const dx = (height[y * size + xp] - height[y * size + xm]) * strength;
      const dy = (height[yp * size + x] - height[ym * size + x]) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

function writeRgb(out, i, r, g, b) {
  out[i] = clamp01(r) * 255;
  out[i + 1] = clamp01(g) * 255;
  out[i + 2] = clamp01(b) * 255;
  out[i + 3] = 255;
}

// A grey map (roughness / ao) from a float array.
function greyMap(values, size) {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = clamp01(values[i]) * 255;
    out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  return out;
}

// --- Generators ------------------------------------------------------------------
// Each returns { map, normalMap?, roughnessMap?, tile: metres per repeat }.

// Deep-pile carpet: a dense high-frequency fibre field over slow tonal drift, with the
// pile direction brushed so it catches light in bands (the shag in the dining room).
export function carpet(size, { color = '#3f6b3a', shade = '#243f22', light = '#5a8a4f', seed = 1, tile = 1.2 } = {}) {
  const base = hexToRgb(color), dark = hexToRgb(shade), lit = hexToRgb(light);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const drift = fbm(u, v, 3, 3, seed);                 // wear / vacuum bands
      const tufts = fbm(u, v, 96, 3, seed + 3, 0.55);      // fibre clumps
      const fibre = noise2(u * size * 0.9, v * size * 0.9, Math.round(size * 0.9), seed + 9); // per-texel sparkle
      const brush = 0.5 + 0.5 * Math.sin((u * 7 + drift * 2) * Math.PI * 2);
      let h = tufts * 0.7 + fibre * 0.3;
      height[y * size + x] = h;
      let t = clamp01(0.35 + (h - 0.5) * 1.3 + (drift - 0.5) * 0.35 + (brush - 0.5) * 0.12);
      let c = t < 0.5 ? mixRgb(dark, base, t * 2) : mixRgb(base, lit, (t - 0.5) * 2);
      rough[y * size + x] = 0.86 + (fibre - 0.5) * 0.15;
      writeRgb(rgba, (y * size + x) * 4, c[0], c[1], c[2]);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 90), size),
    roughnessMap: dataTexture(greyMap(rough, size), size),
    tile,
  };
}

// Painted plaster: a faint orange-peel relief, small tonal clouds and a few thin hairline
// imperfections so the wall never reads as a flat colour.
export function plaster(size, { color = '#e8dcc3', seed = 2, tile = 2.0, relief = 1.0 } = {}) {
  const base = hexToRgb(color);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const peel = fbm(u, v, 64, 3, seed, 0.5);
      const cloud = fbm(u, v, 4, 3, seed + 5);
      const grime = fbm(u, v, 2, 2, seed + 11);
      height[y * size + x] = peel;
      const tone = 1 + (cloud - 0.5) * 0.08 - Math.max(0, grime - 0.6) * 0.18;
      writeRgb(rgba, (y * size + x) * 4, base[0] * tone, base[1] * tone, base[2] * tone);
      rough[y * size + x] = 0.82 + (peel - 0.5) * 0.2;
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, (size / 400) * relief), size),
    roughnessMap: dataTexture(greyMap(rough, size), size),
    tile,
  };
}

// Wood: long grain along v with turbulence, ring banding and pores. `tone` selects the species.
export function wood(size, { color = '#8a5a2b', dark = '#4b2d12', seed = 3, tile = 1.0, rings = 14, gloss = 0.45 } = {}) {
  const base = hexToRgb(color), deep = hexToRgb(dark);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const warp = fbm(u, v, 3, 3, seed) - 0.5;
      const fine = fbm(u, v, 40, 2, seed + 4);
      // rings run along v (the long axis); u crosses the grain
      const ring = 0.5 + 0.5 * Math.sin((u + warp * 0.35 + fine * 0.02) * Math.PI * 2 * rings + v * 1.2);
      const streak = fbm(u * 40, v, 6, 2, seed + 8);
      // soften: most of the board sits in the mid tones, only the ring edges go dark
      const t = clamp01(0.35 + Math.pow(ring, 1.6) * 0.45 + (streak - 0.5) * 0.4);
      const c = mixRgb(deep, base, t);
      const pores = fine > 0.72 ? 0.9 : 1;
      height[y * size + x] = t * 0.6 + fine * 0.4;
      rough[y * size + x] = gloss + (1 - t) * 0.18 + (fine - 0.5) * 0.1;
      writeRgb(rgba, (y * size + x) * 4, c[0] * pores, c[1] * pores, c[2] * pores);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 900), size),
    roughnessMap: dataTexture(greyMap(rough, size), size),
    tile,
  };
}

// Pleated sheer curtain: vertical folds (albedo shading + a strong normal) and a loose weave.
export function curtain(size, { color = '#efe9dc', seed = 4, pleats = 9 } = {}) {
  const base = hexToRgb(color);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const sway = (fbm(u, v, 2, 2, seed) - 0.5) * 0.08;
      const fold = 0.5 + 0.5 * Math.sin((u + sway) * Math.PI * 2 * pleats);
      const weave = noise2(u * size * 0.5, v * size * 0.5, Math.round(size * 0.5), seed + 2);
      const h = fold * 0.9 + weave * 0.1;
      height[y * size + x] = h;
      const tone = 0.72 + fold * 0.32 + (weave - 0.5) * 0.06;
      writeRgb(rgba, (y * size + x) * 4, base[0] * tone, base[1] * tone, base[2] * tone);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 40), size),
    tile: 1,
  };
}

// Ceiling tile grid (the hallway): 0.5 x 0.25 m tiles with a recessed grout and a pinhole
// speckle, matching the brick-texture set-up in the source .blend.
export function ceilingTile(size, { a = '#ebebe6', b = '#e1e1d9', mortar = '#999891', seed = 5, tile = 2.0 } = {}) {
  const ca = hexToRgb(a), cb = hexToRgb(b), cm = hexToRgb(mortar);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const cols = 4, rows = 8; // per 2 m tile
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const row = Math.floor(v * rows);
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const uu = u * cols + (row % 2 ? 0.5 : 0);
      const fu = uu - Math.floor(uu), fv = v * rows - row;
      const edge = Math.min(fu, 1 - fu, fv * 2, (1 - fv) * 2);
      const grout = edge < 0.03 ? 1 : edge < 0.06 ? (0.06 - edge) / 0.03 : 0;
      const which = hash2(Math.floor(uu), row, seed) > 0.5 ? ca : cb;
      const speckle = noise2(u * size * 0.6, v * size * 0.6, Math.round(size * 0.6), seed + 3) > 0.83 ? 0.82 : 1;
      const c = mixRgb(which, cm, grout);
      height[y * size + x] = (1 - grout) * 0.8 + speckle * 0.2;
      writeRgb(rgba, (y * size + x) * 4, c[0] * speckle, c[1] * speckle, c[2] * speckle);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 300), size),
    tile,
  };
}

// The hallway's painted wall from the .blend: two mustard tones blended by a slow noise,
// multiplied by a faint fine grain and a hairline crack ramp.
export function backroomsWall(size, { seed = 6, tile = 3.0 } = {}) {
  const c0 = [0.82, 0.68, 0.12], c1 = [0.92, 0.79, 0.2];
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const slow = fbm(u, v, 10, 2, seed);
      const fine = fbm(u, v, 20, 2, seed + 7);
      const paper = fbm(u, v, 160, 3, seed + 3, 0.6);          // the wallpaper's tooth
      const stripe = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 18); // faint printed stripe
      const streak = fbm(u, v * 0.25, 1, 2, seed + 13);         // vertical drips
      const c = mixRgb(c0, c1, slow);
      const grime = 0.55 + fine * 0.45;
      const drip = 1 - Math.max(0, streak - 0.62) * 0.35;
      const tooth = 0.9 + paper * 0.16 + (stripe - 0.5) * 0.05;
      height[y * size + x] = paper * 0.7 + fine * 0.3;
      rough[y * size + x] = 0.78 + (paper - 0.5) * 0.2;
      const k = grime * drip * tooth;
      writeRgb(rgba, (y * size + x) * 4, c[0] * k, c[1] * k, c[2] * k);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 500), size),
    roughnessMap: dataTexture(greyMap(rough, size), size),
    tile,
  };
}

// Faded family photo: a warm sepia print with soft, unreadable figures in the middle
// distance. Every frame on the wall gets a different seed, so no two are alike.
export function photo(size, { seed = 7, warm = true } = {}) {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const tint = warm ? [0.93, 0.82, 0.66] : [0.8, 0.82, 0.86];
  const figures = 1 + Math.floor(hash2(seed, 1, 3) * 3);
  const fig = [];
  for (let i = 0; i < figures; i++) {
    fig.push({
      x: 0.25 + hash2(seed, i + 2, 5) * 0.5,
      y: 0.62 - hash2(seed, i + 9, 5) * 0.1,
      w: 0.08 + hash2(seed, i + 4, 7) * 0.06,
      h: 0.22 + hash2(seed, i + 6, 7) * 0.16,
      tone: 0.22 + hash2(seed, i + 8, 9) * 0.3,
    });
  }
  const skyDark = hash2(seed, 3, 11) > 0.5;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const grain = noise2(u * size, v * size, size, seed + 21);
      const bg = skyDark ? 0.42 + v * 0.25 : 0.78 - v * 0.3;
      let l = bg + (fbm(u, v, 3, 3, seed) - 0.5) * 0.25;
      for (const f of fig) {
        const headY = f.y - f.h * 0.95;
        const head = Math.hypot((u - f.x) / (f.w * 0.42), (v - headY) / (f.h * 0.2));
        const shoulders = Math.hypot((u - f.x) / (f.w * 1.15), (v - (f.y - f.h * 0.35)) / (f.h * 0.45));
        const torso = Math.max(Math.abs(u - f.x) / (f.w * 0.95), (v - (f.y - f.h * 0.35)) / (f.h * 0.75));
        const inside = Math.min(head, v > headY + f.h * 0.15 ? Math.min(shoulders, torso) : 9);
        if (inside < 1.1) {
          const face = head < 0.9 ? 0.25 : 0;   // faces a shade lighter than clothes
          l = lerp(l, f.tone + face, clamp01((1.1 - inside) / 0.22));
        }
      }
      // a soft horizon behind them
      if (Math.abs(v - 0.58) < 0.012) l *= 0.9;
      const vignette = 1 - Math.pow(Math.hypot(u - 0.5, v - 0.5) * 1.35, 2.2) * 0.6;
      l = clamp01(l * vignette + (grain - 0.5) * 0.08);
      writeRgb(rgba, (y * size + x) * 4, l * tint[0], l * tint[1], l * tint[2]);
    }
  }
  const tex = dataTexture(rgba, size, { srgb: true });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return { map: tex, tile: 1 };
}

// Soft blotchy shade for the lamp: warm paper with a slightly translucent look.
export function lampshade(size, { seed = 8 } = {}) {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const fibre = fbm(u, v, 30, 3, seed);
      const l = 0.86 + (fibre - 0.5) * 0.14;
      writeRgb(rgba, (y * size + x) * 4, l, l * 0.94, l * 0.82);
    }
  }
  return { map: dataTexture(rgba, size, { srgb: true }), tile: 1 };
}
