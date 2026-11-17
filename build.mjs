import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const srcPath = path.join(dir, 'index.original.html');
const outPath = path.join(dir, 'index.html');

let html = fs.readFileSync(srcPath, 'utf8');
const tw = fs.readFileSync(path.join(dir, 'tw-play.js'), 'utf8');

// 1) 内联 Tailwind Play CDN，去掉外网依赖
html = html.replace(
  '<script src="https://cdn.tailwindcss.com"></script>',
  () => '<script>\n' + tw + '\n</script>'
);

// 2) 去掉 Google Fonts（国内经常连不上，改用系统自带字体）
html = html
  .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
  .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, '');

// 3) 头部补充 meta / 图标
html = html.replace(
  '<p class="text-xs text-slate-400 truncate mt-0.5">点击任意处跳跃 · 点击空中纸飞机拆信</p>',
  '<p class="text-xs text-slate-400 truncate mt-0.5">点击任意处跳跃 · 接住纸飞机拆信 · 点别人的头像挥手</p>'
);
html = html.replace(
  '  <title>深夜雨夜漂流咖啡馆 · Midnight Rain & Paper Planes</title>',
  `  <title>深夜雨夜漂流咖啡馆 · Midnight Rain & Paper Planes</title>
  <meta name="description" content="一个深夜里开着的漂流咖啡馆：窗外在下雨，点哪里小猫就跳到哪里，接住飞过的纸飞机写下你的信。" />
  <meta name="theme-color" content="#0b0d14" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta property="og:title" content="深夜雨夜漂流咖啡馆" />
  <meta property="og:description" content="窗外下着雨，点哪里小猫就跳到哪里。接住飞过的纸飞机，读一封陌生人的信。" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌙</text></svg>" />`
);

// 4) 给关键面板加 id，方便手机端样式覆盖
html = html.replace(
  '<div class="glass-panel rounded-2xl px-4 py-3 pointer-events-auto flex items-center gap-3.5 max-w-full">',
  '<div id="titlePanel" class="glass-panel rounded-2xl px-4 py-3 pointer-events-auto flex items-center gap-3.5 max-w-full">'
);
html = html.replace(
  '<div class="glass-panel rounded-2xl px-4 py-3 pointer-events-auto w-full sm:w-80 transition-all">',
  '<div id="radioPanel" class="glass-panel rounded-2xl px-4 py-3 pointer-events-auto w-full sm:w-80 transition-all">'
);
html = html.replace(
  '<div class="glass-panel rounded-full px-3 py-2 sm:px-4 sm:py-2.5 pointer-events-auto flex items-center gap-1.5 sm:gap-2.5 shadow-2xl max-w-full overflow-x-auto">',
  '<div id="dockBar" class="glass-panel rounded-full px-3 py-2 sm:px-4 sm:py-2.5 pointer-events-auto flex items-center gap-1.5 sm:gap-2.5 shadow-2xl max-w-full overflow-x-auto">'
);

// 5) 字体回退 + 手机适配
const patchCss = `
    /* ================= 本地化补丁 ================= */
    body, html {
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC",
                   "Microsoft YaHei", "Hiragino Sans GB", sans-serif;
    }
    .font-serif-sc {
      font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong",
                   "SimSun", "PingFang SC", serif;
    }
    #sceneCanvas { width: 100vw !important; height: 100vh !important; }
    @supports (height: 100dvh) {
      #sceneCanvas { height: 100dvh !important; }
    }

    /* ================= 手机竖屏适配 ================= */
    @media (max-width: 640px) {
      header {
        padding: 10px 10px 0 !important;
        gap: 8px !important;
      }
      header > div {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
      }
      header .glass-panel { padding: 10px 12px !important; }
      #titlePanel h1 { font-size: 13px; line-height: 1.25; }
      #titlePanel p { font-size: 11px; }
      #radioPanel > .mt-2\\.5 {
        margin-top: 7px !important;
        padding-top: 7px !important;
        gap: 10px !important;
      }
      #radioPanel input[type="range"] { height: 16px; }
      #radioPanel .px-2\\.5 { padding-left: 8px; padding-right: 8px; }

      footer {
        bottom: 0 !important;
        padding: 0 8px calc(10px + env(safe-area-inset-bottom)) !important;
      }
      #dockBar {
        gap: 5px !important;
        padding: 6px 9px !important;
        flex-wrap: nowrap;
        overflow: visible !important;
      }
      #dockBar .emoji-btn { width: 31px !important; height: 31px !important; font-size: 15px !important; }
      #dockBar #warmShareBtn,
      #dockBar #openFoldModalBtn { padding-left: 10px !important; padding-right: 10px !important; }
      #dockBar #openFoldModalBtn span { font-size: 11.5px; }
    }

    @media (max-width: 360px) {
      #dockBar .emoji-btn { width: 27px !important; height: 27px !important; }
      #titlePanel h1 { font-size: 12px; }
    }

    /* ================= 联机：真人来了，NPC 退到背景 ================= */
    .npc-faded { opacity: .38 !important; transition: opacity .8s ease; }
    .peer-cursor .peer-name { box-shadow: 0 0 10px rgba(125, 211, 252, .35); }
  </style>`;

html = html.replace('  </style>', patchCss);

// 6) 注入联机层（真·多人：能看见彼此、纸飞机真的飞到别人屏幕上）
const net = fs.readFileSync(path.join(dir, 'net.js'), 'utf8');
if (net.includes('</script')) throw new Error('net.js 含 </script，会截断页面');
html = html.replace('</body>', () => '<script>\n' + net + '\n</script>\n</body>');

fs.writeFileSync(outPath, html, 'utf8');
console.log('built', outPath, (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB');