// 保存文件的平台层。
// 发布在 claude.ai 的预览页里，页面不能自己下载，要走平台提供的保存功能；
// 本地运行或打包成 App 时，用普通的下载链接。
export async function saveBlob(filename: string, blob: Blob): Promise<'saved' | 'declined' | 'failed'> {
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
    return 'saved';
  } catch { return 'failed'; }
}

export const canvasToBlob = (cv: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => cv.toBlob((b) => resolve(b), 'image/png'));
