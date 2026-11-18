// 瞬间相册里的照片：游戏自己抓拍的时刻。照片不存图片，只存「谁、在哪、在做什么」，要看的时候用背景、家具和宠物的动作帧拼出来，
// 所以换了正式素材之后，旧照片也会跟着变成新画风。每种瞬间里宠物站在哪、做什么动作，写在下面的 LAYOUT 里。
import { CONFIG, DECOR, MOMENTS, ZONES, type ActionName, type DayTime, type Season } from '../config';
import { ASSETS } from '../assets.config';
import { drawObject, drawTop, drawWindowView, drawZone } from './room';
import { drawDecor } from './decor';
import { drawFrame, type SpriteSet } from '../sprites';

/** 一只宠物在照片里的位置（按 432×720 的区域算，x、y 是脚底）、动作、用第几帧、是不是朝左 */
type Pose = [x: number, y: number, action: ActionName, frame: number, flip?: boolean];
/** objects = 这张照片里要画的家具；front = 画完宠物之后，再把这件家具的前半边盖上去（宠物在它里面）；guest = 最后一个位置给邻居猫 */
/** at = 写这些位置时那件家具在哪（种类、x、底边 y、高度）：家具挪了、变大了，照片里的宠物跟着挪 */
const LAYOUT: Record<string, { at?: [string, number, number, number]; objects: string[]; front?: string; poses: Pose[]; guest?: boolean; note?: string }> = {
  bedFull: { at: ['bed', 240, 566, 150], objects: ['nightstand', 'bed'], poses: [[176, 491, 'sleep', 0], [257, 491, 'sleep', 1], [339, 491, 'sleep', 2, true]] },
  treeFull: { at: ['cattree', 330, 566, 340], objects: ['sofa', 'cattree'], poses: [[282, 273, 'sit', 0], [380, 380, 'sleep', 1, true], [290, 487, 'idle', 0]] },
  fishing: { at: ['pond', 262, 700, 84], objects: ['pond'], poses: [[84, 662, 'fish', 2], [190, 608, 'fish', 1], [334, 608, 'fish', 2, true]] },
  butterfly: { at: ['pond', 262, 700, 84], objects: ['pond'], poses: [[150, 604, 'fish', 1], [236, 604, 'jump', 2, true]] },
  // 屋顶那一层：从平顶右边裁一块（ROOF_X 起 432 宽），两只坐在平顶上
  stargaze: { objects: [], poses: [[228, 440, 'sit', 0, true], [276, 440, 'sit', 2, true]] },
  groom: { objects: ['sofa'], poses: [[186, 640, 'groom', 0], [262, 642, 'happy', 1, true], [90, 680, 'sit', 0]] },
  box: { at: ['box', 340, 654, 92], objects: ['door', 'box'], front: 'box', poses: [[340, 650, 'idle', 0]] },
  tunnel: { at: ['tunnel', 170, 672, 80], objects: ['tunnel'], front: 'tunnel', poses: [[251, 670, 'idle', 0]] },
  rainWatch: { objects: ['counter', 'bowl'], poses: [[121, 306, 'sit', 0], [300, 660, 'sit', 2, true]] },
  heater: { at: ['heater', 100, 656, 112], objects: ['nightstand', 'bed', 'heater'], poses: [[194, 662, 'sleep', 0, true], [262, 692, 'sit', 1, true], [330, 664, 'sleep', 2, true]] },
  sulk: { objects: ['sofa'], poses: [[216, 650, 'sit', 3, true]], note: '哼' },
  neighbor: { objects: ['sofa'], guest: true, poses: [[176, 644, 'play', 1], [264, 646, 'play', 2, true]] },
};

/** 屋顶的照片从上层图的哪里开始裁（平顶的右边，和游戏里看星星的位置一样） */
const ROOF_X = 2364;
/** PET = 「最初设计」大小的猫在照片里画多大（432 宽的区域里），每只再乘自己的大小 */
const W = 432, TOP = 100, VIEW_H = 576, OUT_W = 480, OUT_H = 640, PET = 201.6;

export interface MomentInfo { kind: string; season: string; time: string }

/** sets = 照片里每只宠物的精灵图（按 petIds 的顺序）；guest = 邻居猫的精灵图；skin = 每件家具现在用哪款皮肤；room = 房间风格 */
export function renderMoment(m: MomentInfo, sets: (SpriteSet | undefined)[], opts: { guest?: SpriteSet; /** 每只的大小（按最初设计算，和 sets 同顺序；邻居的在 guest 那个位置） */ sizes?: number[]; /** 这个区域里摆着的装饰（照片里也画出来） */ decor?: { kind: string; x: number; y: number }[]; skin?: (kind: string) => string; room?: string } = {}): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = OUT_W; cv.height = OUT_H; const c = cv.getContext('2d')!;
  const def = MOMENTS[m.kind], lay = LAYOUT[m.kind]; if (!def || !lay) return cv;
  const zi = ZONES.findIndex((z) => z.id === def.zone); const time = m.time as DayTime, season = m.season as Season;
  const k = OUT_W / W; c.save(); c.scale(k, k); c.translate(0, -TOP);
  const env = { time, season, weather: m.kind === 'rainWatch' ? 'rain' as const : 'clear' as const };
  c.drawImage(def.zone === 'roof' ? drawTop(ROOF_X, W, env, opts.room) : drawZone(def.zone, zi, env, opts.room), 0, 0, W, 720);
  const obj = (kind: string, from = 0) => {
    const d = ASSETS.objects[kind]; const img = drawObject(kind, d?.seasonal ? season : opts.skin?.(kind)); if (!d || !img) return;
    const h = d.height, w = (h * img.width) / img.height;
    c.drawImage(img, 0, img.height * from, img.width, img.height * (1 - from), d.x - w / 2, d.y - h + h * from, w, h * (1 - from));
  };
  // 照片里画：铺在地上的装饰 → 墙上的装饰 → 这个区域的固定家具、照片要的家具、摆在地上的装饰（按底边排前后）
  const dec = (d: { kind: string; x: number; y: number }) => { const dd = DECOR[d.kind]; const img = drawDecor(d.kind, opts.skin?.(d.kind)); if (!dd || !img) return; const h = dd.height, w = (h * img.width) / img.height; c.drawImage(img, d.x - w / 2, d.y - h, w, h); };
  const decor = opts.decor ?? [];
  decor.filter((d) => DECOR[d.kind]?.layer === 'floor').forEach(dec); decor.filter((d) => DECOR[d.kind]?.layer === 'wall').forEach(dec);
  const kinds = new Set([...Object.entries(ASSETS.objects).filter(([, d]) => d.zone === def.zone && !d.needsOwned).map(([k2]) => k2), ...lay.objects]);
  const draws: { y: number; fn: () => void }[] = [...[...kinds].map((k2) => ({ y: ASSETS.objects[k2]?.y ?? 0, fn: () => {
    const d = ASSETS.objects[k2]; if (d?.glass) { const img = drawObject(k2); if (img) { const h = d.height, w = (h * img.width) / img.height, [a, b, cc, dd] = d.glass; c.drawImage(drawWindowView(w * (cc - a), h * (dd - b), env, d.x), d.x - w / 2 + a * w, d.y - h + b * h, w * (cc - a), h * (dd - b)); } }
    obj(k2);
  } })), ...decor.filter((d) => DECOR[d.kind]?.layer === 'stand').map((d) => ({ y: d.y, fn: () => dec(d) }))];
  draws.sort((a, b) => a.y - b.y).forEach((d) => d.fn());
  const cast = [...sets]; if (lay.guest && opts.guest) cast[lay.poses.length - 1] = opts.guest;
  const sz = [...(opts.sizes ?? [])]; if (lay.guest && opts.guest && opts.sizes?.length) sz[lay.poses.length - 1] = opts.sizes[opts.sizes.length - 1];
  // 家具挪过、变大过：宠物的位置按家具现在的位置和大小换算
  const at = lay.at ? ASSETS.objects[lay.at[0]] : null; const r = at ? at.height / lay.at![3] : 1;
  const place = (x: number, y: number): [number, number] => at ? [Math.max(40, Math.min(W - 40, at.x + (x - lay.at![1]) * r)), at.y - (lay.at![2] - y) * r] : [x, y];
  lay.poses.forEach(([x0, y0, action, frame, flip], i) => { const set = cast[i]; const [x, y] = place(x0, y0); const P = PET * (sz[i] ?? 0.85); if (set) drawFrame(c, set, action, frame, x - P / 2, y - P * 0.9, P, !!flip); });
  if (lay.front) obj(lay.front, ASSETS.objects[lay.front]?.frontFrom ?? 0);
  if (lay.note) { const [x, y] = place(lay.poses[0][0], lay.poses[0][1]); c.fillStyle = '#E88A7A'; c.beginPath(); (c as any).roundRect(x - 26, y - PET * 0.86, 52, 34, 17); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 20px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(lay.note, x, y - PET * 0.86 + 24); }
  if (m.kind === 'rainWatch') { const d = ASSETS.objects.kitchenWindow, img = drawObject('kitchenWindow'); if (d?.glass && img) { const h = d.height, w = (h * img.width) / img.height, gx = d.x - w / 2 + d.glass[0] * w, gy = d.y - h + d.glass[1] * h, gw = w * (d.glass[2] - d.glass[0]), gh = h * (d.glass[3] - d.glass[1]); c.strokeStyle = 'rgba(230,240,246,0.8)'; c.lineWidth = 1.4; for (let i = 0; i < 14; i++) { const x = gx + ((i * 37.1) % gw), y = gy + ((i * 29.3) % (gh - 16)); c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y + 13); c.stroke(); } } }
  c.restore();
  // 傍晚和夜里：和游戏里一样整张压暗一点（屋里偏暖，露天偏蓝）
  if (time !== 'day') { const tone = CONFIG.light[time]; c.globalCompositeOperation = 'multiply'; c.fillStyle = ['balcony', 'garden', 'roof'].includes(def.zone) ? tone.outdoor : tone.indoor; c.fillRect(0, 0, OUT_W, OUT_H); c.globalCompositeOperation = 'source-over'; }
  // 相片的白边
  c.strokeStyle = '#FFFDF6'; c.lineWidth = 14; c.strokeRect(7, 7, OUT_W - 14, OUT_H - 14);
  return cv;
}
