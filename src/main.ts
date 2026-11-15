import './style.css';
import { AssetStore } from './assets';
import { Game } from './game';
import { loadLayout } from './layout';
import { cancelReminders, restoreFromMirror, scheduleReminders, setupAppEvents } from './platform/native';
import * as sim from './sim';
import { Scene } from './scene';
import { UI } from './ui';
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
    onObject: (kind) => ui?.onObject(kind),
    onZone: (i) => ui?.setZone(i),
    onEdit: (kind) => ui?.editChanged(kind),
    onBgEdit: (done) => ui?.bgChanged(done),
  });
  await scene.init(document.getElementById('stage')!);
  ui = new UI(game, scene, document.getElementById('ui')!);
  scene.relayout(); scene.scrollToZone(2, true);
  ui.setZone(2);
  assets.onChange(async (key) => { if (key.startsWith('pet.')) await game.reloadDefaultSprites(); ui?.assetsChanged(); scene.rebuildArt(); });
  // 切到后台或关掉页面时存一次档
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
  window.addEventListener('pagehide', () => game.save());
  window.addEventListener('beforeunload', () => game.save());
  // 请浏览器尽量不要自动清掉这个页面的数据（不支持或被拒绝也没关系）
  try { void navigator.storage?.persist?.(); } catch { /* ignore */ }
  // 安卓 App：返回键先关面板，没东西可关就收到后台；切到后台时存档并安排提醒
  const plan = () => {
    if (!game.state.settings.notify) { void cancelReminders(); return; }
    const now = Date.now();
    void scheduleReminders(sim.planReminders(game.state).map((r) => ({ title: r.title, body: r.body, at: now + r.inMs })));
  };
  setupAppEvents({
    onBack: () => ui?.handleBack() ?? false,
    onPause: () => { game.save(); plan(); },
    onResume: () => { void cancelReminders(); },
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') ui?.handleBack(); });
  (window as any).__game = game; (window as any).__scene = scene; // 方便在控制台里调试
}

// 地址以 #back-screen 结尾时，这个页面只当背屏画面用（安卓上由 BackScreenActivity 打开）
const BACK = location.hash === '#back-screen';
window.addEventListener('hashchange', () => { if ((location.hash === '#back-screen') !== BACK) location.reload(); });

(BACK ? bootBackScreen() : boot()).catch((err) => {
  console.error(err);
  document.getElementById('ui')!.innerHTML = '<div style="padding:24px;pointer-events:auto">游戏没能启动：' + String(err?.message ?? err) + '</div>';
});
