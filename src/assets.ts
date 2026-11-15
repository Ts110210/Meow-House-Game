// 素材加载器。每个素材位按这个顺序找图：页面里上传的 → public/assets/ 里的文件 → 没有（用代码画的占位图）。
import { ASSETS } from './assets.config';
import { DESTS, FUR_COLORS, ZONES } from './config';
import { blobs } from './platform/storage';
import { fileToDataUrl, knockOutWhite, loadImage } from './sprites';

export type Pic = HTMLCanvasElement;
export interface Slot { key: string; group: string; name: string; src: string; hint: string; kind: 'room' | 'object' | 'pet' | 'postcard' }

export class AssetStore {
  private pics = new Map<string, Pic>();
  private from = new Map<string, 'file' | 'upload'>();
  private listeners = new Set<(key: string) => void>();

  slots(): Slot[] {
    const out: Slot[] = [];
    out.push({ key: 'room.strip', group: '房间背景', name: `长图（盖住左边 ${ASSETS.room.strip.coverZones} 个区域）`, src: ASSETS.room.strip.src, hint: '约 3:1，建议 2160×720', kind: 'room' });
    for (const z of ZONES) out.push({ key: `room.zone.${z.id}`, group: '房间背景', name: `${z.name}（单独一张）`, src: ASSETS.room.zones[z.id], hint: '3:5，建议 432×720 的倍数', kind: 'room' });
    for (const [k, d] of Object.entries(ASSETS.objects)) out.push({ key: `object.${k}`, group: '家具和物品', name: d.label, src: d.src, hint: `透明背景 PNG，显示高度 ${d.height}`, kind: 'object' });
    for (const [k, src] of Object.entries(ASSETS.pets)) out.push({ key: `pet.${k}`, group: '默认宠物精灵图', name: FUR_COLORS[k]?.name ?? k, src, hint: '4 列，每格 256×256，每行一个动作', kind: 'pet' });
    for (const d of DESTS) out.push({ key: `postcard.${d.id}`, group: '明信片背景', name: d.name, src: ASSETS.postcards[d.id], hint: '3:2，建议 1200×800', kind: 'postcard' });
    return out;
  }

  get(key: string): Pic | undefined { return this.pics.get(key); }
  status(key: string): 'upload' | 'file' | 'code' { return this.from.get(key) ?? 'code'; }
  onChange(fn: (key: string) => void) { this.listeners.add(fn); }

  private toCanvas(img: HTMLImageElement, slot: Slot, removeWhite: boolean): Pic {
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth || img.width; cv.height = img.naturalHeight || img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: removeWhite })!;
    ctx.drawImage(img, 0, 0);
    if (removeWhite) knockOutWhite(ctx, cv.width, cv.height, slot.kind === 'pet' ? cv.width / 4 : 0);
    return cv;
  }
  private defaultRemoveWhite(slot: Slot) {
    return slot.kind === 'pet' ? ASSETS.removeWhiteBackground.pets : slot.kind === 'object' ? ASSETS.removeWhiteBackground.objects : false;
  }

  private async loadSlot(slot: Slot) {
    this.pics.delete(slot.key); this.from.delete(slot.key);
    try {
      const raw = await blobs.get('asset:' + slot.key);
      if (raw) {
        const { url, removeWhite } = JSON.parse(raw) as { url: string; removeWhite: boolean };
        this.pics.set(slot.key, this.toCanvas(await loadImage(url), slot, removeWhite)); this.from.set(slot.key, 'upload');
        return;
      }
    } catch { /* 读不出来就继续找文件 */ }
    try {
      const img = await loadImage(ASSETS.base + slot.src);
      this.pics.set(slot.key, this.toCanvas(img, slot, this.defaultRemoveWhite(slot))); this.from.set(slot.key, 'file');
    } catch { /* 没有这个文件：用代码画的占位图 */ }
  }

  async loadAll() { await Promise.all(this.slots().map((s) => this.loadSlot(s))); }

  /** 在页面里上传一张图来预览（存在这个浏览器里） */
  async upload(key: string, file: File, removeWhite: boolean): Promise<boolean> {
    return this.uploadDataUrl(key, await fileToDataUrl(file), removeWhite);
  }
  async uploadDataUrl(key: string, url: string, removeWhite: boolean): Promise<boolean> {
    const slot = this.slots().find((s) => s.key === key); if (!slot) return false;
    const saved = await blobs.set('asset:' + key, JSON.stringify({ url, removeWhite }));
    await this.loadSlot(slot);
    this.listeners.forEach((l) => l(key));
    return saved;
  }

  async clear(key: string) {
    const slot = this.slots().find((s) => s.key === key); if (!slot) return;
    await blobs.remove('asset:' + key);
    await this.loadSlot(slot);
    this.listeners.forEach((l) => l(key));
  }
}
