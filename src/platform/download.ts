// 保存文件的平台层。
// 发布在 claude.ai 的预览页里，页面不能自己下载，要走平台提供的保存功能；
// 本地运行或打包成 App 时，用普通的下载链接。
import { isNative, shareFile } from './native';

/** 返回值：saved = 已经保存；shared = 弹出了分享面板；declined = 主人取消了；unknown = 交给浏览器了但没法确认；failed = 没成 */
export async function saveBlob(filename: string, blob: Blob): Promise<'saved' | 'shared' | 'declined' | 'unknown' | 'failed'> {
  if (isNative) { const r = await shareFile(filename, blob); return r === 'shared' ? 'shared' : r === 'cancelled' ? 'declined' : 'failed'; }
  try {
    const use = (window as any).claude?.use;
    if (typeof use === 'function') {
      const downloads = await Promise.race([use('downloads'), new Promise((r) => setTimeout(() => r(null), 4000))]) as any;
      if (downloads && typeof downloads.save === 'function') {
        try { await downloads.save({ filename, data: blob }); return 'saved'; }
        catch (e: any) { return e?.code === 'declined' ? 'declined' : 'failed'; }
      }
    }
  } catch { /* 没有平台保存功能，往下走普通下载 */ }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'unknown'; // 普通网页下载没有回执
  } catch { return 'failed'; }
}

/** 把 saveBlob 的结果变成给主人看的一句话 */
export function saveMessage(r: Awaited<ReturnType<typeof saveBlob>>, fallback: string): string {
  return r === 'saved' ? '已保存' : r === 'shared' ? '' : r === 'declined' ? '没有保存' : r === 'unknown' ? '已经开始下载；如果没看到文件，' + fallback : '这里保存不了，' + fallback;
}

export const canvasToBlob = (cv: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => cv.toBlob((b) => resolve(b), 'image/png'));
