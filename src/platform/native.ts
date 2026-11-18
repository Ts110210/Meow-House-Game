// 安卓 App 里才有的东西：返回键、切到后台、本地通知、把存档多存一份到系统的偏好设置里。
// 在网页里这些函数都什么也不做，所以游戏其他地方可以放心调用。
import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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
// 通知频道：重要程度设成「高」，来的时候会在屏幕上方弹出横幅（不是闹钟，声音是普通的通知音）。
// 频道一旦建好，重要程度改不了，所以换了设置就换一个新名字。
const CHANNEL = 'pet-reminders-v2';
/** 游戏提醒用的编号范围。测试通知用 999，不在这个范围里，所以不会被「重新安排提醒」顺手取消掉 */
const FIRST_ID = 1000, MAX = 20;
let channelReady = false;
/** 每条通知都要带上 isExactNotification: false。
 *  通知插件从 8.3.0 起，只要有一条通知想要精确闹钟（默认就是想要）而 App 没有「闹钟和提醒」权限，schedule() 就会自己跳到系统的那个设置页。
 *  我们在 AndroidManifest 里特意去掉了这个权限（提醒不用准点到秒），所以永远拿不到，结果每次安排提醒都跳过去；
 *  按返回回到游戏又会再安排一次、再跳过去，在荣耀手机上卡死在设置页出不来。不要精确闹钟，插件就不会跳，提醒照样会来，只是可能晚几分钟。 */
const NOT_EXACT = { isExactNotification: false } as const;

async function ensureChannel() {
  if (channelReady) return;
  await LocalNotifications.createChannel({ id: CHANNEL, name: '宠物提醒', description: '宠物饿了、回家了', importance: 4, visibility: 1 });
  channelReady = true;
}

export async function notifyPermission(ask: boolean): Promise<boolean> {
  if (!isNative) return false;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted' && ask) p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
  } catch { return false; }
}

/** 取消游戏安排的提醒（不动测试通知） */
export async function cancelReminders() {
  if (!isNative) return;
  try {
    const mine = (await LocalNotifications.getPending()).notifications.filter((n) => n.id >= FIRST_ID && n.id < FIRST_ID + MAX);
    if (mine.length) await LocalNotifications.cancel({ notifications: mine.map((n) => ({ id: n.id })) });
  } catch { /* ignore */ }
}

/** 把游戏的提醒换成这一批。同一个编号再安排一次就是覆盖，所以不用先全部取消。
 *  游戏开着的时候每分钟调用一次，切到后台时再调用一次：这样即使系统在切后台的瞬间把 App 冻住，提醒也早就安排好了。 */
export async function scheduleReminders(list: Reminder[]) {
  if (!isNative) return;
  try {
    if (!(await notifyPermission(false))) return;
    await ensureChannel();
    const next = list.filter((r) => r.at > Date.now() + 5000).sort((a, b) => a.at - b.at).slice(0, MAX);
    const stale = (await LocalNotifications.getPending()).notifications.filter((n) => n.id >= FIRST_ID + next.length && n.id < FIRST_ID + MAX);
    if (stale.length) await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) });
    if (next.length) await LocalNotifications.schedule({ notifications: next.map((r, i) => ({ id: FIRST_ID + i, title: r.title, body: r.body, channelId: CHANNEL, ...NOT_EXACT, schedule: { at: new Date(r.at), allowWhileIdle: true } })) });
  } catch { /* 安排不上不影响游戏 */ }
}

/** 发一条测试通知。seconds = 0：马上发（确认通知权限和横幅）；> 0：过这么久再发（确认退到桌面后也能收到）。
 *  返回为什么没发成（发成了就是空字符串）。 */
export async function testNotification(seconds: number): Promise<string> {
  if (!isNative) return '网页版发不了离开后的通知，要在安卓 App 里试';
  if (!(await notifyPermission(true))) return '系统没有允许通知，请到手机设置里给这个 App 打开通知权限';
  try {
    await ensureChannel();
    await LocalNotifications.schedule({ notifications: [{ id: seconds > 0 ? 999 : 998, title: '测试通知', body: seconds > 0 ? '看到这条，说明退到桌面后的提醒能正常弹出来' : '看到这条，说明通知权限和横幅是好的', channelId: CHANNEL, ...NOT_EXACT, schedule: { at: new Date(Date.now() + Math.max(1, seconds) * 1000), allowWhileIdle: true } }] });
    return '';
  } catch (e) { return '安排通知时出错：' + String((e as Error)?.message ?? e); }
}

/** 通知现在的状态，一行一条，给开发者面板看：权限有没有、现在排着哪些提醒 */
export async function notifyStatus(): Promise<string[]> {
  if (!isNative) return ['网页版：没有系统通知'];
  const out: string[] = [];
  try { const p = await LocalNotifications.checkPermissions(); out.push('通知权限：' + (p.display === 'granted' ? '已允许' : `没有允许（${p.display}）`)); } catch (e) { out.push('查不到通知权限：' + String((e as Error)?.message ?? e)); }
  try { const en = await LocalNotifications.areEnabled(); out.push('系统里这个 App 的通知开关：' + (en.value ? '开' : '关')); } catch { /* 老版本没有这个接口 */ }
  try {
    const pend = (await LocalNotifications.getPending()).notifications;
    out.push(`已经排好的通知：${pend.length} 条`);
    for (const n of pend.slice(0, 8)) { const at = n.schedule?.at ? new Date(n.schedule.at as any) : null; out.push(`　#${n.id} ${n.title}` + (at ? ` · ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}:${String(at.getSeconds()).padStart(2, '0')}` : '')); }
  } catch (e) { out.push('查不到排好的通知：' + String((e as Error)?.message ?? e)); }
  return out;
}

// ---------- 存文件 ----------

interface SaveFilePlugin { save(o: { filename: string; data: string; mime: string }): Promise<{ folder: string; image: boolean }> }
const SaveFile = registerPlugin<SaveFilePlugin>('SaveFile');
const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result).split(',')[1] ?? ''); fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob); });

/** 直接存到手机上：图片进相册，其他文件进「下载」。返回存到了哪（一句给主人看的话）；存不了返回 null（旧系统或出错，改用分享）。 */
export async function saveToDevice(filename: string, blob: Blob): Promise<string | null> {
  if (!isNative) return null;
  try {
    const r = await SaveFile.save({ filename, data: await toBase64(blob), mime: blob.type || 'application/octet-stream' });
    return r.image ? '已保存到相册（BackScreenPet 文件夹）' : `已保存到「下载/BackScreenPet」：${filename}`;
  } catch { return null; }
}

/** 安卓 App 里「下载」文件：先写到缓存，再弹出系统的分享面板（可以存到相册、文件，或发到别的 App） */
export async function shareFile(filename: string, blob: Blob): Promise<'shared' | 'cancelled' | 'failed'> {
  if (!isNative) return 'failed';
  try {
    const data = await new Promise<string>((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result).split(',')[1] ?? ''); fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob); });
    const file = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    try { await Share.share({ title: filename, files: [file.uri], dialogTitle: '保存或发送' }); return 'shared'; }
    catch (e) { return /cancel/i.test(String((e as Error)?.message ?? e)) ? 'cancelled' : 'failed'; }
  } catch { return 'failed'; }
}
