// 瞬间相册里的照片：游戏自己抓拍的时刻。照片不存图片，只存「谁、在哪、在做什么」，要看的时候用背景、家具和宠物的动作帧拼出来，
// 所以换了正式素材之后，旧照片也会跟着变成新画风。每种瞬间里宠物站在哪、做什么动作，写在下面的 LAYOUT 里。
import { CONFIG, MOMENTS, ZONES, type ActionName, type DayTime, type Season } from '../config';
import { ASSETS } from '../assets.config';
import { drawObject, drawZone } from './room';
import { drawFrame, type SpriteSet } from '../sprites';

/** 一只宠物在照片里的位置（按 432×720 的区域算，x、y 是脚底）、动作、用第几帧、是不是朝左 */
type Pose = [x: number, y: number, action: ActionName, frame: number, flip?: boolean];
/** objects = 这张照片里要画的家具；front = 画完宠物之后，再把这件家具的前半边盖上去（宠物在它里面）；guest = 最后一个位置给邻居猫 */
const LAYOUT: Record<string, { objects: string[]; front?: string; poses: Pose[]; guest?: boolean; note?: string }> = {
  bedFull: { objects: ['nightstand', 'bed'], poses: [[176, 491, 'sleep', 0], [257, 491, 'sleep', 1], [339, 491, 'sleep', 2, true]] },
  treeFull: { objects: ['sofa', 'cattree'], poses: [[282, 273, 'sit', 0], [380, 380, 'sleep', 1, true], [290, 487, 'idle', 0]] },
  fishing: { objects: ['pond'], poses: [[84, 662, 'fish', 2], [190, 608, 'fish', 1], [334, 608, 'fish', 2, true]] },
  butterfly: { objects: ['pond'], poses: [[150, 604, 'fish', 1], [236, 604, 'jump', 2, true]] },
  stargaze: { objects: [], poses: [[140, 626, 'sit', 0], [262, 660, 'sit', 2, true], [60, 680, 'sit', 1]] },
  groom: { objects: ['sofa'], poses: [[186, 640, 'groom', 0], [262, 642, 'happy', 1, true], [90, 680, 'sit', 0]] },
  box: { objects: ['door', 'box'], front: 'box', poses: [[340, 650, 'idle', 0]] },
  tunnel: { objects: ['tunnel'], front: 'tunnel', poses: [[251, 670, 'idle', 0]] },
  rainWatch: { objects: ['counter', 'bowl'], poses: [[121, 306, 'sit', 0], [300, 660, 'sit', 2, true]] },
  heater: { objects: ['nightstand', 'bed', 'heater'], poses: [[194, 662, 'sleep', 0, true], [262, 692, 'sit', 1, true], [330, 664, 'sleep', 2, true]] },
  sulk: { objects: ['sofa'], poses: [[216, 650, 'sit', 3, true]], note: '哼' },
  neighbor: { objects: ['sofa'], guest: true, poses: [[176, 644, 'play', 1], [264, 646, 'play', 2, true]] },
};

const W = 432, TOP = 100, VIEW_H = 576, OUT_W = 480, OUT_H = 640, PET = 201.6;

export interface MomentInfo { kind: string; season: string; time: string }

/** sets = 照片里每只宠物的精灵图（按 petIds 的顺序）；guest = 邻居猫的精灵图；skin = 每件家具现在用哪款皮肤；room = 房间风格 */
export function renderMoment(m: MomentInfo, sets: (SpriteSet | undefined)[], opts: { guest?: SpriteSet; skin?: (kind: string) => string; room?: string } = {}): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = OUT_W; cv.height = OUT_H; const c = cv.getContext('2d')!;
  const def = MOMENTS[m.kind], lay = LAYOUT[m.kind]; if (!def || !lay) return cv;
  const zi = ZONES.findIndex((z) => z.id === def.zone); const time = m.time as DayTime, season = m.season as Season;
  const k = OUT_W / W; c.save(); c.scale(k, k); c.translate(0, -TOP);
  c.drawImage(drawZone(def.zone, zi, { time, season, weather: m.kind === 'rainWatch' ? 'rain' : 'clear' }, opts.room), 0, 0, W, 720);
  const obj = (kind: string, from = 0) => {
    const d = ASSETS.objects[kind]; const img = drawObject(kind, opts.skin?.(kind)); if (!d || !img) return;
    const h = d.height, w = (h * img.width) / img.height;
    c.drawImage(img, 0, img.height * from, img.width, img.height * (1 - from), d.x - w / 2, d.y - h + h * from, w, h * (1 - from));
  };
  for (const o of lay.objects) obj(o);
  const cast = [...sets]; if (lay.guest && opts.guest) cast[lay.poses.length - 1] = opts.guest;
  lay.poses.forEach(([x, y, action, frame, flip], i) => { const set = cast[i]; if (set) drawFrame(c, set, action, frame, x - PET / 2, y - PET * 0.9, PET, !!flip); });
  if (lay.front) obj(lay.front, ASSETS.objects[lay.front]?.frontFrom ?? 0);
  if (lay.note) { const [x, y] = lay.poses[0]; c.fillStyle = '#E88A7A'; c.beginPath(); (c as any).roundRect(x - 26, y - PET * 0.86, 52, 34, 17); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 20px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(lay.note, x, y - PET * 0.86 + 24); }
  if (m.kind === 'rainWatch') { c.strokeStyle = 'rgba(230,240,246,0.8)'; c.lineWidth = 1.4; for (let i = 0; i < 14; i++) { const x = 46 + ((i * 37.1) % 150), y = 174 + ((i * 29.3) % 108); c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y + 13); c.stroke(); } }
  c.restore();
  // 傍晚和夜里：和游戏里一样整张压暗一点（屋里偏暖，露天偏蓝）
  if (time !== 'day') { const tone = CONFIG.light[time]; c.globalCompositeOperation = 'multiply'; c.fillStyle = ['balcony', 'garden', 'roof'].includes(def.zone) ? tone.outdoor : tone.indoor; c.fillRect(0, 0, OUT_W, OUT_H); c.globalCompositeOperation = 'source-over'; }
  // 相片的白边
  c.strokeStyle = '#FFFDF6'; c.lineWidth = 14; c.strokeRect(7, 7, OUT_W - 14, OUT_H - 14);
  return cv;
}
