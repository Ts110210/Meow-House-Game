import './style.css';
import { AssetStore } from './assets';
import { Game } from './game';
import { loadLayout } from './layout';
import { cancelReminders, isNative, notifyPermission, restoreFromMirror, scheduleReminders, setupAppEvents } from './platform/native';
import * as sim from './sim';
import { Scene } from './scene';
import { UI } from './ui';
import { initAudio, pauseAudio } from './audio';
import { bootBackScreen } from './backscreen';

async function boot() {
  // 安卓 App：浏览器存储里没有存档时，从系统偏好设置里拿回来
  await restoreFromMirror(['pet-game-save-v1', 'pet-game-save-backup', 'pet-game-layout-v2']);
  loadLayout();
  const assets = new AssetStore();
  await assets.loadAll();
  const game = new Game(assets);
  await game.init();
  let ui: UI | null = null;
  const scene = new Scene(game, assets, {
    onPet: (id) => ui?.openPet(id),
    onObject: (kind, id) => ui?.onObject(kind, id),
    onZone: (i) => ui?.setZone(i),
    onEdit: (kind) => ui?.editChanged(kind),
    onDecor: (id, msg) => ui?.decorChanged(id, msg),
    onMoment: (id) => ui?.momentCaught(id),
    onBgEdit: (done) => ui?.bgChanged(done),
  });
  await scene.init(document.getElementById('stage')!);
  initAudio();
  ui = new UI(game, scene, document.getElementById('ui')!);
  scene.relayout(); scene.scrollToZone(2, true);
  ui.setZone(2);
  assets.onChange(async (key) => { if (key.startsWith('pet.') || key.startsWith('avatar.')) await game.reloadDefaultSprites(); ui?.assetsChanged(); scene.rebuildArt(); });
  // 切到后台或关掉页面时存一次档
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); else game.welcome(); });
  setTimeout(() => game.welcome(), 1500); // 打开游戏：看看门口有没有客人
  window.addEventListener('pagehide', () => game.save());
  window.addEventListener('beforeunload', () => game.save());
  // 请浏览器尽量不要自动清掉这个页面的数据（不支持或被拒绝也没关系）
  try { void navigator.storage?.persist?.(); } catch { /* ignore */ }
  // 安卓 App：返回键先关面板，没东西可关就收到后台；切到后台时存档并安排提醒
  // minAhead：只安排这么久以后的提醒。游戏开着时用 2 分钟，这样正在玩的时候不会弹通知；切到后台时用 0。
  const plan = (minAhead: number) => {
    if (!game.state.settings.notify) { void cancelReminders(); return; }
    const now = Date.now();
    void scheduleReminders(sim.planReminders(game.state).filter((r) => r.inMs >= minAhead).map((r) => ({ title: r.title, body: r.body, at: now + r.inMs })));
  };
  // 游戏开着的时候就把提醒排好，每分钟更新一次：不依赖「切到后台的那一瞬间」，那一瞬间系统可能已经把 App 冻住了
  let front = true;
  setInterval(() => { if (front) plan(2 * 60_000); }, 60_000);
  setTimeout(() => plan(2 * 60_000), 3000);
  // 提醒开着而系统还没问过通知权限：打开游戏时问一次（系统只会弹一次窗）
  if (isNative && game.state.settings.notify) void notifyPermission(true);
  setupAppEvents({
    onBack: () => ui?.handleBack() ?? false,
    onPause: () => { front = false; game.save(); plan(0); pauseAudio(true); },
    onResume: () => { front = true; game.welcome(); plan(2 * 60_000); pauseAudio(false); },
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') ui?.handleBack(); });
  (window as any).__game = game; (window as any).__scene = scene; (window as any).__sim = sim; // 方便在控制台里调试
}

// 地址以 #back-screen 结尾时，这个页面只当背屏画面用（安卓上由 BackScreenActivity 打开）
const BACK = location.hash === '#back-screen';
window.addEventListener('hashchange', () => { if ((location.hash === '#back-screen') !== BACK) location.reload(); });

(BACK ? bootBackScreen() : boot()).catch((err) => {
  console.error(err);
  document.getElementById('ui')!.innerHTML = '<div style="padding:24px;pointer-events:auto">游戏没能启动：' + String(err?.message ?? err) + '</div>';
});
