// 整张切图：一张白底、画了好几件物品的图，按内容自动切成一件一件，去白底、裁掉空白；
// 窗户按素材模板的比例挖空玻璃；最后打成 zip（按 public/assets/ 的文件夹放好）。
// 找物品、打 zip 这两件事是纯函数（不碰画面），有测试；去白底和裁图要用 canvas。
import { ASSETS } from './assets.config';

// ---------- 按内容找物品：把图分成小格子，有颜色的格子连在一起的算一件 ----------

export interface Blob2 { /** 哪些格子（格子编号 = gy * gw + gx） */ cells: number[]; x0: number; y0: number; x1: number; y1: number; mass: number }
export interface Labels { gw: number; gh: number; cell: number; label: Int32Array; blobs: Blob2[] }

/**
 * alpha = 每个像素是不是有内容（0/1），w×h。cell = 格子多大（像素），gap = 隔几个空格子以内还算连在一起（画里的小缝不会把一件切成两件）。
 * 返回每一件的格子和范围（像素），按从上到下、从左到右排好；太小的杂点去掉。
 */
export function labelPieces(alpha: Uint8Array, w: number, h: number, cell: number, gap = 1, minMass = 0.0004): Labels {
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const occ = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) { const gy = (y / cell) | 0; for (let x = 0; x < w; x++) if (alpha[y * w + x]) occ[gy * gw + ((x / cell) | 0)] = 1; }
  const label = new Int32Array(gw * gh).fill(-1); const blobs: Blob2[] = [];
  for (let start = 0; start < gw * gh; start++) {
    if (!occ[start] || label[start] >= 0) continue;
    const id = blobs.length; const b: Blob2 = { cells: [], x0: Infinity, y0: Infinity, x1: -1, y1: -1, mass: 0 };
    const stack = [start]; label[start] = id;
    while (stack.length) {
      const c = stack.pop()!; b.cells.push(c); b.mass++;
      const cx = c % gw, cy = (c / gw) | 0;
      b.x0 = Math.min(b.x0, cx * cell); b.y0 = Math.min(b.y0, cy * cell); b.x1 = Math.max(b.x1, Math.min(w, (cx + 1) * cell)); b.y1 = Math.max(b.y1, Math.min(h, (cy + 1) * cell));
      // 隔着 gap 个空格子以内的也算连着
      for (let dy = -gap - 1; dy <= gap + 1; dy++) for (let dx = -gap - 1; dx <= gap + 1; dx++) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const n = ny * gw + nx; if (occ[n] && label[n] < 0) { label[n] = id; stack.push(n); }
      }
    }
    blobs.push(b);
  }
  // 太小的杂点（比整张图的万分之几还小）不要
  const keep = blobs.filter((b) => b.mass >= Math.max(2, gw * gh * minMass));
  const order = [...keep].sort((a, b) => (Math.abs(a.y0 - b.y0) > cell * 6 ? a.y0 - b.y0 : a.x0 - b.x0));
  const remap = new Map<number, number>(); order.forEach((b) => remap.set(blobs.indexOf(b), order.indexOf(b)));
  for (let i = 0; i < label.length; i++) label[i] = label[i] >= 0 ? remap.get(label[i]) ?? -1 : -1;
  return { gw, gh, cell, label, blobs: order };
}

// ---------- 打 zip（不压缩，PNG 本来就压缩过了） ----------

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(data: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** 把几个文件打成一个 zip。name 用 / 分隔文件夹 */
export function makeZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder(); const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  const now = new Date(); const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1); const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name); const crc = crc32(f.data); const size = f.data.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, time, true); local.setUint16(12, date, true); local.setUint32(14, crc, true); local.setUint32(18, size, true); local.setUint32(22, size, true);
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, time, true); cen.setUint16(14, date, true); cen.setUint32(16, crc, true); cen.setUint32(20, size, true); cen.setUint32(24, size, true);
    cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + size;
  }
  const cenSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)]; const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

/** 素材格子的 key 对应的窗户玻璃（object.kitchenWindow、object.kitchenWindow@cream…），不是窗户返回 null */
export function glassOf(key: string): [number, number, number, number] | null {
  const m = /^object\.([A-Za-z]+)(@.*)?$/.exec(key); return m ? ASSETS.objects[m[1]]?.glass ?? null : null;
}

// ---------- 用 canvas 的部分 ----------

/** 和四条边连着的白色（> 232）变透明，物品里面的白色不动（和 sprites.ts 的 knockOutWhite 一样，这里单独一份，免得测试时带上 PixiJS） */
function knockWhite(d: Uint8ClampedArray, w: number, h: number) {
  const isW = (i: number) => d[i * 4 + 3] > 0 && d[i * 4] > 232 && d[i * 4 + 1] > 232 && d[i * 4 + 2] > 232;
  const seen = new Uint8Array(w * h); const stack: number[] = [];
  const push = (i: number) => { if (!seen[i] && isW(i)) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) { const i = stack.pop()!; d[i * 4 + 3] = 0; const x = i % w; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (i >= w) push(i - w); if (i < w * (h - 1)) push(i + w); }
}

/** 切图的结果：去好白底的整张图、每一件的格子 */
export interface Sheet { src: HTMLCanvasElement; labels: Labels }

/** 读一张白底图：太大先缩到长边 maxSide，去掉和四边连着的白底，再把贴着透明的发白边缘变淡，找出每一件 */
export function readSheet(img: HTMLImageElement | HTMLCanvasElement, maxSide = 4096): Sheet {
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  const ctx = src.getContext('2d', { willReadFrequently: true })!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h); const d = id.data;
  knockWhite(d, w, h);
  // 去白底后留下的一圈发白的毛边：贴着透明、又很白的点，按白的程度变透明
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4; if (d[i + 3] === 0) continue;
    const edge = d[i - 4 + 3] === 0 || d[i + 4 + 3] === 0 || d[i - w * 4 + 3] === 0 || d[i + w * 4 + 3] === 0; if (!edge) continue;
    const light = Math.min(d[i], d[i + 1], d[i + 2]); if (light > 200) d[i + 3] = Math.round(d[i + 3] * Math.max(0, (255 - light) / 55));
  }
  ctx.putImageData(id, 0, 0);
  const alpha = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) alpha[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  const cell = Math.max(2, Math.round(Math.max(w, h) / 500));
  return { src, labels: labelPieces(alpha, w, h, cell, 1) };
}

/** 把几块（合并的话是好几块）裁成一张图：只要这些块的格子里的像素，四周的空白裁掉 */
export function cropPieces(sheet: Sheet, ids: number[]): HTMLCanvasElement {
  const { src, labels } = sheet; const { gw, cell, label } = labels; const set = new Set(ids);
  const bs = ids.map((i) => labels.blobs[i]).filter(Boolean);
  const x0 = Math.min(...bs.map((b) => b.x0)), y0 = Math.min(...bs.map((b) => b.y0)), x1 = Math.max(...bs.map((b) => b.x1)), y1 = Math.max(...bs.map((b) => b.y1));
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, x0, y0, w, h, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h); const d = id.data;
  let tx0 = w, ty0 = h, tx1 = -1, ty1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = ((x + x0) / cell) | 0, gy = ((y + y0) / cell) | 0; const i = (y * w + x) * 4;
    if (!set.has(label[gy * gw + gx])) { d[i + 3] = 0; continue; } // 别的物品伸进这个框里的部分不要
    if (d[i + 3] > 8) { if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; if (y < ty0) ty0 = y; if (y > ty1) ty1 = y; }
  }
  ctx.putImageData(id, 0, 0);
  if (tx1 < 0) return cv;
  const out = document.createElement('canvas'); out.width = tx1 - tx0 + 1; out.height = ty1 - ty0 + 1;
  out.getContext('2d')!.drawImage(cv, tx0, ty0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** 窗户：按素材模板写的比例（左、上、右、下，0–1）把玻璃挖空。返回新的一张，不改原图 */
export function cutGlass(cv: HTMLCanvasElement, glass: [number, number, number, number]): HTMLCanvasElement {
  const out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height; const ctx = out.getContext('2d')!;
  ctx.drawImage(cv, 0, 0); const [a, b, c, d] = glass;
  ctx.clearRect(Math.round(a * cv.width), Math.round(b * cv.height), Math.round((c - a) * cv.width), Math.round((d - b) * cv.height));
  return out;
}

export const canvasBytes = (cv: HTMLCanvasElement) => new Promise<Uint8Array>((resolve, reject) => cv.toBlob(async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('PNG 生成失败'))), 'image/png'));

// ---------- 读 zip（导入素材包用）：支持不压缩和 deflate 压缩（浏览器自带的 DecompressionStream 解压） ----------

/** 解压 deflate（zip 里最常见的压缩方式） */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

/** 读出 zip 里的每个文件（按中央目录读，带数据描述符的 zip 也行）。文件夹、加密的、不认识的压缩方式跳过 */
export async function readZip(bytes: Uint8Array): Promise<{ name: string; data: Uint8Array }[]> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('不是 zip 文件');
  const count = dv.getUint16(end + 10, true); let p = dv.getUint32(end + 16, true);
  const out: { name: string; data: Uint8Array }[] = []; const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || flags & 1) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + csize);
    if (method === 0) out.push({ name, data: raw.slice() });
    else if (method === 8) out.push({ name, data: await inflateRaw(raw) });
  }
  return out;
}

/** zip 里的路径对应哪个素材格子：去掉前面的 public/assets/、assets/ 或者任意外层文件夹，和素材模板的路径（slot.src）对上 */
export function matchAssetPath(name: string, srcs: string[]): string | null {
  const n = name.replace(/\\/g, '/').replace(/^\/+/, '');
  const hit = srcs.filter((src) => n === src || n.endsWith('/' + src));
  return hit.sort((a, b) => b.length - a.length)[0] ?? null;
}
