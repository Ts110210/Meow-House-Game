import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor 的工程配置：把 dist/ 里的网页装进安卓 App。
const config: CapacitorConfig = {
  // 应用的唯一编号。想换就在第一次生成安卓工程（npx cap add android）之前换，之后再换比较麻烦。
  appId: 'com.uermm.meow',
  appName: 'uermm meow',
  webDir: 'dist',
  android: {
    // 允许在 Chrome 里用 chrome://inspect 调试 App 里的网页（正式发布前可以改成 false）
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    LocalNotifications: {
      // 通知栏小图标用应用自带的图标
      iconColor: '#E08E79',
    },
  },
};

export default config;
