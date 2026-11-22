// 两个小玩法的画面：陪它玩（逗猫棒）、陪它捞鱼。
// 只用 Canvas 2D 画（不进 Pixi 场景），结束时把成绩交给 onDone，结算在 sim.finishWand / finishFishing。
// 猫用它自己精灵图里的动作（rowFor 会处理缺了的动作）。
import { CONFIG, SPRITE, type ActionName } from './config';
import { rowFor, type SpriteSet } from './sprites';

export interface MiniGame { el: HTMLElement; stop: () => void }

/** 从精灵图里画一帧：x、y = 脚底中间，size = 格子画多大，dir = 1 面朝右、-1 面朝左 */
function drawCat(c: CanvasRenderingContext2D, set: SpriteSet, action: ActionName, frame: number, x: number, y: number, size: number, dir: number) {
  const C = SPRITE.cell; const row = rowFor(set, action);
  c.save(); c.translate(x, y); c.scale(dir, 1);
  c.drawImage(set.sheet, (frame % SPRITE.framesPerRow) * C, row * C, C, C, -size / 2, -size * 0.9, size, size);
  c.restore();
}

/** 外框：画布 + 上面一行（剩余时间、成绩）+ 下面一句提示 */
function frame(hint: string) {
  const el = document.createElement('div'); el.className = 'mini';
  const bar = document.createElement('div'); bar.className = 'mini-bar';
  const cv = document.createElement('canvas'); cv.className = 'mini-cv';
  const tip = document.createElement('p'); tip.className = 'soft'; tip.textContent = hint;
  el.append(bar, cv, tip);
  const W = 360, H = 300; const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; const c = cv.getContext('2d')!; c.scale(dpr, dpr);
  /** 手指在画布上的位置（按 360×300 算） */
  const at = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  return { el, bar, cv, c, W, H, at };
}

/** 一局的计时：每帧调 step(dt, 已过的时间)，到点了调 onDone；画布不在页面上了（面板关了）就停，不结算 */
function loop(cv: HTMLCanvasElement, time: number, step: (dt: number, t: number) => void, end: () => void) {
  let last = performance.now(), t = 0, stopped = false, gone = 0;
  const tick = (now: number) => {
    if (stopped) return;
    if (!cv.isConnected) { if (++gone > 3) { stopped = true; return; } } else gone = 0;
    const dt = Math.min(50, now - last); last = now; t += dt;
    step(dt, t);
    if (t >= time) { stopped = true; end(); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => { stopped = true; };
}

/** 陪它玩：拖着逗猫棒晃，猫会追着扑。逗猫棒要一直动，停太久它就坐下不玩了 */
export function wandGame(set: SpriteSet, name: string, onDone: (catches: number) => void): MiniGame {
  const W = CONFIG.minigame.wand; const f = frame(`拖着逗猫棒晃来晃去，${name}会追着扑。别停太久，不然它就没兴趣了。`);
  const { c, W: w, H: h, cv } = f; const ground = h - 34; const size = 150;
  const feather = { x: w * 0.75, y: h * 0.45, vx: 0, vy: 0, speed: 0 };
  const cat = { x: w * 0.3, dir: 1, state: 'watch' as 'watch' | 'crouch' | 'pounce' | 'bored' | 'happy', t: 0, next: 1200, still: 0 };
  let catches = 0, flash = 0, msg = '';
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); move(e); });
  cv.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') move(e); });
  function move(e: PointerEvent) { const p = f.at(e); feather.vx = p.x - feather.x; feather.vy = p.y - feather.y; feather.x = Math.max(10, Math.min(w - 10, p.x)); feather.y = Math.max(40, Math.min(ground - 10, p.y)); }
  const stop = loop(cv, W.time, (dt, t) => {
    // 逗猫棒有多「活」：最近移动的速度（像素/秒，慢慢衰减）
    feather.speed = feather.speed * 0.9 + (Math.hypot(feather.vx, feather.vy) / Math.max(1, dt)) * 1000 * 0.1; feather.vx = feather.vy = 0;
    cat.still = feather.speed < W.lively ? cat.still + dt : 0;
    cat.t += dt;
    const dx = feather.x - cat.x; const reach = size * W.reach * 2.2;
    if (cat.state === 'pounce') {
      // 扑出去：0.45 秒落地，落地时逗猫棒还在爪子下面就算扑中
      cat.x += cat.dir * 220 * (dt / 1000);
      if (cat.t > 450) {
        const hit = Math.abs(feather.x - (cat.x + cat.dir * size * 0.25)) < size * W.reach && feather.y > ground - size * 0.9;
        if (hit) { catches++; flash = 500; msg = '扑中了！'; cat.state = 'happy'; } else { msg = '差一点！'; flash = 400; cat.state = 'watch'; }
        cat.t = 0; cat.next = W.pounceEvery[0] + Math.random() * (W.pounceEvery[1] - W.pounceEvery[0]);
      }
    } else if (cat.state === 'happy') { if (cat.t > 600) { cat.state = 'watch'; cat.t = 0; } }
    else if (cat.still > W.boredAfter) { cat.state = 'bored'; }
    else {
      if (cat.state === 'bored') { cat.state = 'watch'; cat.t = 0; }
      cat.dir = dx >= 0 ? 1 : -1;
      // 离得远就走近一点；够得着、又到了该扑的时候：先蹲下、屁股扭两下，再扑
      if (Math.abs(dx) > reach) cat.x += Math.sign(dx) * 90 * (dt / 1000);
      if (cat.state === 'watch' && cat.t > cat.next && Math.abs(dx) < reach * 1.2) { cat.state = 'crouch'; cat.t = 0; }
      else if (cat.state === 'crouch' && cat.t > 380) { cat.state = 'pounce'; cat.t = 0; }
    }
    cat.x = Math.max(size * 0.35, Math.min(w - size * 0.35, cat.x)); flash = Math.max(0, flash - dt);
    // 画
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#F6EDE0'; c.fillRect(0, 0, w, ground); c.fillStyle = '#D9B98F'; c.fillRect(0, ground, w, h - ground);
    c.strokeStyle = 'rgba(90,70,52,.18)'; for (let y = ground + 10; y < h; y += 12) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    const act: ActionName = cat.state === 'pounce' ? 'jump' : cat.state === 'crouch' ? 'fish' : cat.state === 'happy' ? 'happy' : cat.state === 'bored' ? 'sit' : Math.abs(dx) > reach ? 'walk' : 'idle';
    const fr = cat.state === 'pounce' ? Math.min(3, Math.floor(cat.t / 115)) : Math.floor(t / 160) % 4;
    const lift = cat.state === 'pounce' ? Math.sin(Math.min(1, cat.t / 450) * Math.PI) * 40 : 0;
    drawCat(c, set, act, fr, cat.x, ground + 6 - lift, size, cat.dir);
    // 逗猫棒：从右上角伸下来的杆子、绳子和羽毛
    c.strokeStyle = '#8A6A4E'; c.lineWidth = 3; c.beginPath(); c.moveTo(w + 10, 0); c.lineTo(feather.x + 30, feather.y - 70); c.stroke();
    c.strokeStyle = '#5A4634'; c.lineWidth = 1; c.beginPath(); c.moveTo(feather.x + 30, feather.y - 70); c.quadraticCurveTo(feather.x + 10, feather.y - 30, feather.x, feather.y); c.stroke();
    c.fillStyle = '#E8836B'; c.beginPath(); c.ellipse(feather.x, feather.y + 8, 6, 14, 0.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#F2C14E'; c.beginPath(); c.ellipse(feather.x - 6, feather.y + 10, 4, 11, -0.4, 0, Math.PI * 2); c.fill();
    if (cat.state === 'bored') { c.fillStyle = 'rgba(90,70,52,.7)'; c.font = '14px sans-serif'; c.textAlign = 'center'; c.fillText('…没意思', cat.x, ground - size * 0.75); }
    if (flash > 0) { c.globalAlpha = Math.min(1, flash / 300); c.fillStyle = '#5A4634'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.fillText(msg, w / 2, 34); c.globalAlpha = 1; }
    f.bar.textContent = `扑中 ${catches} 次　还剩 ${Math.max(0, Math.ceil((W.time - t) / 1000))} 秒`;
  }, () => onDone(catches));
  return { el: f.el, stop };
}

/** 陪它捞鱼：鱼在池塘里游，看准了点一下，猫的爪子拍下去，拍中就捞上来 */
export function fishingGame(set: SpriteSet, name: string, onDone: (caught: number) => void): MiniGame {
  const F = CONFIG.minigame.fishing; const f = frame(`鱼游过来的时候点一下，${name}的爪子会拍下去。爪子落下要一点点时间，往鱼前面点。`);
  const { c, W: w, H: h, cv } = f; const pond = { x: w / 2, y: h * 0.52, rx: w * 0.44, ry: h * 0.34 };
  type Fish = { x: number; y: number; a: number; v: number; turn: number; gone: number };
  const spawn = (): Fish => { const a = Math.random() * Math.PI * 2; return { x: pond.x + Math.cos(a) * pond.rx * 0.5, y: pond.y + Math.sin(a) * pond.ry * 0.5, a: Math.random() * Math.PI * 2, v: 40 + Math.random() * 40, turn: 0, gone: 0 }; };
  const fish: Fish[] = Array.from({ length: F.fish }, spawn);
  const strikes: { x: number; y: number; t: number; done: boolean; hit: boolean }[] = [];
  let caught = 0, catT = F.cooldown;
  cv.style.touchAction = 'none';
  // 爪子收回来之前点了没用（不能乱点一通）
  cv.addEventListener('pointerdown', (e) => { if (catT < F.cooldown) return; const p = f.at(e); strikes.push({ x: p.x, y: p.y, t: 0, done: false, hit: false }); catT = 0; });
  const inPond = (x: number, y: number, k = 0.9) => ((x - pond.x) / (pond.rx * k)) ** 2 + ((y - pond.y) / (pond.ry * k)) ** 2 < 1;
  const paw = w * F.paw;
  const stop = loop(cv, F.time, (dt, t) => {
    const s = dt / 1000; catT += dt;
    for (const fi of fish) {
      if (fi.gone > 0) { fi.gone -= dt; if (fi.gone <= 0) Object.assign(fi, spawn()); continue; }
      fi.turn += (Math.random() - 0.5) * 3 * s; fi.a += fi.turn * s; fi.turn *= 0.98;
      const nx = fi.x + Math.cos(fi.a) * fi.v * s, ny = fi.y + Math.sin(fi.a) * fi.v * s;
      if (inPond(nx, ny, 0.82)) { fi.x = nx; fi.y = ny; } else fi.a += Math.PI * (0.6 + Math.random() * 0.4);
    }
    for (const st of strikes) {
      st.t += dt;
      if (!st.done && st.t >= F.strikeDelay) {
        st.done = true;
        const hit = fish.find((fi) => fi.gone <= 0 && Math.hypot(fi.x - st.x, fi.y - st.y) < paw);
        if (hit) { st.hit = true; caught++; hit.gone = 1400; }
      }
    }
    while (strikes.length && strikes[0].t > 700) strikes.shift();
    // 画：草地、池塘、鱼影、水花、左下角的猫
    c.clearRect(0, 0, w, h); c.fillStyle = '#BFD89A'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#C9B79A'; c.beginPath(); c.ellipse(pond.x, pond.y, pond.rx + 10, pond.ry + 10, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#8CC4C9'; c.beginPath(); c.ellipse(pond.x, pond.y, pond.rx, pond.ry, 0, 0, Math.PI * 2); c.fill();
    for (const fi of fish) {
      if (fi.gone > 0) continue;
      c.save(); c.translate(fi.x, fi.y); c.rotate(fi.a); c.fillStyle = 'rgba(40,70,80,.45)';
      c.beginPath(); c.ellipse(0, 0, 14, 6, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(-12, 0); c.lineTo(-22, -6); c.lineTo(-22, 6); c.closePath(); c.fill(); c.restore();
    }
    for (const st of strikes) {
      const k = Math.min(1, st.t / F.strikeDelay);
      if (!st.done) { c.strokeStyle = 'rgba(90,70,52,.5)'; c.lineWidth = 2; c.beginPath(); c.arc(st.x, st.y, paw * (1.4 - k * 0.4), 0, Math.PI * 2); c.stroke(); }
      else { const a = 1 - (st.t - F.strikeDelay) / 480; if (a > 0) { c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = 3; c.beginPath(); c.arc(st.x, st.y, paw * (1 + (1 - a)), 0, Math.PI * 2); c.stroke(); if (st.hit) { c.fillStyle = `rgba(90,70,52,${a})`; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.fillText('捞到了！', st.x, st.y - paw - 6); } } }
    }
    const striking = catT < F.strikeDelay + 200;
    drawCat(c, set, striking ? 'fish' : 'sit', striking ? Math.min(3, Math.floor(catT / 100)) : Math.floor(t / 220) % 4, 64, h - 4, 120, 1);
    f.bar.textContent = `捞到 ${caught} 条　还剩 ${Math.max(0, Math.ceil((F.time - t) / 1000))} 秒`;
  }, () => onDone(caught));
  return { el: f.el, stop };
}
