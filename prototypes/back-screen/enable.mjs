// 把背屏原型装进安卓工程 / 从安卓工程里拿掉。
//   node prototypes/back-screen/enable.mjs        装进去
//   node prototypes/back-screen/enable.mjs off    拿掉
// 做的事只有两件：复制 BackScreenActivity.java，在 AndroidManifest.xml 里登记它。
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const javaDir = join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'chen', 'backscreenpet');
const javaFile = join(javaDir, 'BackScreenActivity.java');
const manifestFile = join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const BEGIN = '        <!-- 背屏原型：开始 -->', END = '        <!-- 背屏原型：结束 -->';
const BLOCK = `${BEGIN}
        <activity
            android:name=".BackScreenActivity"
            android:label="背屏宠物（背屏）"
            android:theme="@style/AppTheme.NoActionBar"
            android:taskAffinity="com.chen.backscreenpet.back"
            android:launchMode="singleTask"
            android:resizeableActivity="true"
            android:excludeFromRecents="true"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:exported="true" />
${END}
`;

if (!existsSync(manifestFile)) { console.error('找不到 android/ 工程。先运行一次 npm run android:sync'); process.exit(1); }
let manifest = readFileSync(manifestFile, 'utf8');
const strip = (m) => { const a = m.indexOf(BEGIN), b = m.indexOf(END); return a >= 0 && b > a ? m.slice(0, a) + m.slice(b + END.length + 1) : m; };

if (process.argv[2] === 'off') {
  writeFileSync(manifestFile, strip(manifest));
  if (existsSync(javaFile)) rmSync(javaFile);
  console.log('已拿掉背屏原型。重新打包：npm run android');
} else {
  if (!existsSync(javaDir)) { console.error('找不到 ' + javaDir + '\n如果你改过 capacitor.config.ts 里的 appId，请把这个脚本和 BackScreenActivity.java 第一行的包名一起改掉。'); process.exit(1); }
  copyFileSync(join(here, 'BackScreenActivity.java'), javaFile);
  manifest = strip(manifest);
  const marker = '        <provider';
  if (!manifest.includes(marker)) { console.error('AndroidManifest.xml 的结构和预期不一样，没有改动。'); process.exit(1); }
  writeFileSync(manifestFile, manifest.replace(marker, BLOCK + marker));
  console.log('已装进背屏原型。重新打包安装：npm run android，然后按 docs/背屏调研.md 的步骤用 adb 把它挪到背屏。');
}
