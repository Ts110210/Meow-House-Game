// 安卓 App 里才有的东西：返回键、切到后台、本地通知、把存档多存一份到系统的偏好设置里。
// 在网页里这些函数都什么也不做，所以游戏其他地方可以放心调用。
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';

export const isNative = Capacitor.isNativePlatform();

// ---------- 存档镜像 ----------
// WebView 的 localStorage 平时是可靠的，但系统清理数据或某些机型异常时可能丢。
// 所以每次存档同时写一份到 Preferences；启动时如果 localStorage 里没有，就从 Preferences 拿回来。

export function mirrorSet(key: string, value: string) { if (isNative) void Preferences.set({ key, value }).catch(() => {}); }
export function mirrorRemove(key: string) { if (isNative) void Preferences.remove({ key }).catch(() => {}); }

export async function restoreFromMirror(keys: string[]) {
  if (!isNative) return;
  for (const key of keys) {
    try {
      if (localStorage.getItem(key) !== null) continue;
      const { value } = await Preferences.get({ key });
      if (value) localStorage.setItem(key, value);
    } catch { /* 拿不回来就算了，按新存档开始 */ }
  }
}

// ---------- 返回键、前后台 ----------

/** onBack 返回 true = 游戏自己处理了（比如关掉了面板）；返回 false = 没东西可关，把 App 收到后台 */
export function setupAppEvents(opts: { onBack: () => boolean; onPause: () => void; onResume: () => void }) {
  if (!isNative) return;
  void App.addListener('backButton', () => { if (!opts.onBack()) void App.minimizeApp(); });
  void App.addListener('appStateChange', ({ isActive }) => { if (isActive) opts.onResume(); else opts.onPause(); });
}

// ---------- 本地通知 ----------

export interface Reminder { title: string; body: string; at: number }
const CHANNEL = 'pet-reminders';
let channelReady = false;

export async function notifyPermission(ask: boolean): Promise<boolean> {
  if (!isNative) return false;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted' && ask) p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
  } catch { return false; }
}

export async function cancelReminders() {
  if (!isNative) return;
  try { const pending = await LocalNotifications.getPending(); if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) }); } catch { /* ignore */ }
}

/** 把还没发生的提醒全部换成这一批。在 App 切到后台时调用。 */
export async function scheduleReminders(list: Reminder[]) {
  if (!isNative) return;
  await cancelReminders();
  if (!list.length || !(await notifyPermission(false))) return;
  try {
    if (!channelReady) { await LocalNotifications.createChannel({ id: CHANNEL, name: '宠物提醒', description: '宠物饿了、回家了', importance: 3 }); channelReady = true; }
    await LocalNotifications.schedule({ notifications: list.slice(0, 20).map((r, i) => ({ id: 1000 + i, title: r.title, body: r.body, channelId: CHANNEL, schedule: { at: new Date(r.at), allowWhileIdle: true } })) });
  } catch { /* 安排不上不影响游戏 */ }
}
