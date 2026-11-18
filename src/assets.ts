// 素材加载器。每个素材位按这个顺序找图：页面里上传的 → public/assets/ 里的文件 → 没有（用代码画的占位图）。
import { ASSETS } from './assets.config';
import { DESTS, FUR_COLORS, SEASON_NAMES, ZONES, DECOR, SKINS, ROOM_THEMES } from './config';
import { blobs } from './platform/storage';
import { fileToDataUrl, knockOutWhite, loadImage } from './sprites';

export type Pic = HTMLCanvasElement;
export interface Slot { key: string; group: string; name: string; src: string; hint: string; kind: 'room' | 'object' | 'pet' | 'postcard' | 'avatar' }

export class AssetStore {
  private pics = new Map<string, Pic>();
  private from = new Map<string, 'file' | 'upload'>();
  private listeners = new Set<(key: string) => void>();

  slots(): Slot[] {
    const out: Slot[] = [];
    out.push({ key: 'room.strip', group: '房间背景', name: `长图（盖住左边 ${ASSETS.room.strip.coverZones} 个区域）`, src: ASSETS.room.strip.src, hint: '约 3:1，建议 2160×720', kind: 'room' });
    out.push({ key: 'room.full', group: '房间背景', name: '整张图（上下两层：屋顶和天空、8 个区域）', src: ASSETS.room.full.src, hint: '3456×1440，有它就不用别的背景图；按 docs/构图底稿.png 的构图生成', kind: 'room' });
    out.push({ key: 'room.top', group: '房间背景', name: '上面一层（屋顶和天空）', src: ASSETS.room.top, hint: '3456×720，横向 8 等分对着下面 8 个区域', kind: 'room' });
    for (const z of ZONES) out.push({ key: `room.zone.${z.id}`, group: '房间背景', name: `${z.name}（单独一张）`, src: ASSETS.room.zones[z.id], hint: '3:5，建议 432×720 的倍数', kind: 'room' });
    for (const [k, d] of Object.entries(ASSETS.objects)) {
      // 跟着季节换图的（院子的树）：四季各一张，没有默认那张
      if (d.seasonal) { for (const [sid, sn] of Object.entries(SEASON_NAMES)) out.push({ key: `object.${k}@${sid}`, group: '家具和物品', name: `${d.label}（${sn}）`, src: d.src.replace(/\.png$/, `-${sid}.png`), hint: `透明背景 PNG，显示高度 ${d.height}`, kind: 'object' }); continue; }
      out.push({ key: `object.${k}`, group: '家具和物品', name: d.label, src: d.src, hint: `透明背景 PNG，显示高度 ${d.height}`, kind: 'object' });
    }
    for (const [k, src] of Object.entries(ASSETS.decor)) out.push({ key: `decor.${k}`, group: '装饰', name: DECOR[k]?.name ?? k, src, hint: `透明背景 PNG，底边贴地，显示高度 ${DECOR[k]?.height ?? 80}`, kind: 'object' });
    for (const [k, d] of Object.entries(ASSETS.props)) out.push({ key: `prop.${k}`, group: '吃饭时摆在地上的', name: d.label, src: d.src, hint: `透明背景 PNG，底边贴地，显示高度 ${d.height}`, kind: 'object' });
    for (const [k, src] of Object.entries(ASSETS.pets)) out.push({ key: `pet.${k}`, group: '默认宠物精灵图', name: FUR_COLORS[k]?.name ?? k, src, hint: '4 列，每格 256×256，每行一个动作', kind: 'pet' });
    for (const [k, src] of Object.entries(ASSETS.pets)) out.push({ key: `pet2.${k}`, group: '默认宠物精灵图（第二张：爬梯子等）', name: FUR_COLORS[k]?.name ?? k, src: src.replace(/\.png$/, '-2.png'), hint: '4 列，每格 256×256；第 1 行爬梯子，后面的行留给以后的新动作', kind: 'pet' });
    for (const [k, src] of Object.entries(ASSETS.pets)) out.push({ key: `avatar.${k}`, group: '默认宠物头像', name: FUR_COLORS[k]?.name ?? k, src: src.replace(/\.png$/, '-avatar.png'), hint: '正方形，建议 256×256', kind: 'avatar' });
    // 皮肤和房间风格的图片：文件名 = 默认款的文件名加上「-皮肤名」，比如 objects/bed-mint.png、room/strip-seaside.png
    const withId = (src: string, id: string) => src.replace(/\.png$/, `-${id}.png`);
    for (const r of ROOM_THEMES.slice(1)) {
      out.push({ key: `room.strip@${r.id}`, group: `房间风格 · ${r.name}`, name: '长图', src: withId(ASSETS.room.strip.src, r.id), hint: '和默认的长图一样的尺寸和布局（地板线、分界线共用）', kind: 'room' });
      out.push({ key: `room.full@${r.id}`, group: `房间风格 · ${r.name}`, name: '整张图', src: withId(ASSETS.room.full.src, r.id), hint: '和默认的整张图一样大、一样的构图', kind: 'room' });
      out.push({ key: `room.top@${r.id}`, group: `房间风格 · ${r.name}`, name: '上面一层（屋顶和天空）', src: withId(ASSETS.room.top, r.id), hint: '和默认的那张一样大', kind: 'room' });
      for (const z of ZONES) out.push({ key: `room.zone.${z.id}@${r.id}`, group: `房间风格 · ${r.name}`, name: `${z.name}（单独一张）`, src: withId(ASSETS.room.zones[z.id], r.id), hint: '3:5，和默认的那张一样大', kind: 'room' });
    }
    for (const k of SKINS.slice(1)) {
      for (const [o, d] of Object.entries(ASSETS.objects)) if (!d.seasonal) out.push({ key: `object.${o}@${k.id}`, group: `皮肤 · ${k.name}`, name: d.label, src: withId(d.src, k.id), hint: '和默认款一样的大小和轮廓，底边贴地', kind: 'object' });
      for (const [o, src] of Object.entries(ASSETS.decor)) out.push({ key: `decor.${o}@${k.id}`, group: `皮肤 · ${k.name}`, name: DECOR[o]?.name ?? o, src: withId(src, k.id), hint: '和默认款一样的大小和轮廓，底边贴地', kind: 'object' });
    }
    for (const d of DESTS) out.push({ key: `postcard.${d.id}`, group: '明信片背景', name: d.name, src: ASSETS.postcards[d.id], hint: '3:2，建议 1200×800', kind: 'postcard' });
    return out;
  }

  get(key: string): Pic | undefined { return this.pics.get(key); }
  /** 某一款皮肤（或某一套房间风格）的图片；那一款没有图片时退回默认款的图片 */
  getSkinned(key: string, id?: string): Pic | undefined { return (id ? this.pics.get(`${key}@${id}`) : undefined) ?? this.pics.get(key); }
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
