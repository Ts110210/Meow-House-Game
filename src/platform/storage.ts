// 存档的平台层。网页版用 localStorage（小数据）+ IndexedDB（精灵图）。
// 以后打包成安卓 App 时，只需要把这个文件里的实现换成
// @capacitor/preferences 和 @capacitor/filesystem，游戏其他代码不用动。

import { mirrorRemove, mirrorSet } from './native';

const mem = new Map<string, string>();
let warned = false;

export const kv = {
  get(key: string): string | null {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) return v;
    } catch { /* 存储不可用时用内存 */ }
    return mem.get(key) ?? null;
  },
  set(key: string, value: string): boolean {
    mem.set(key, value);
    mirrorSet(key, value); // 安卓 App 里多存一份
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      if (!warned) { warned = true; console.warn('本机存储不可用，存档只保留在这次打开期间'); }
      return false;
    }
  },
  remove(key: string) {
    mem.delete(key); mirrorRemove(key);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

// ---------- 大块数据（上传的精灵图） ----------

const DB_NAME = 'pet-game';
const STORE = 'blobs';
const blobMem = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

export const blobs = {
  async get(key: string): Promise<string | null> {
    if (blobMem.has(key)) return blobMem.get(key)!;
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        r.onsuccess = () => resolve((r.result as string) ?? null);
        r.onerror = () => reject(r.error);
      });
    } catch { return null; }
  },
  async set(key: string, value: string): Promise<boolean> {
    blobMem.set(key, value);
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch { return false; }
  },
  async remove(key: string) {
    blobMem.delete(key);
    try {
      const db = await openDb();
      db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
    } catch { /* ignore */ }
  },
  async clear() {
    blobMem.clear();
    try {
      const db = await openDb();
      db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
    } catch { /* ignore */ }
  },
};
