# 深夜雨夜漂流咖啡馆 · Midnight Rain & Paper Planes

线上地址：https://yuniuy.github.io/midnight-cafe/

## 改页面怎么办
1. 改 `index.original.html`（原始版，带 CDN 外链）
2. `D:\DS\node.exe build.mjs` → 生成单文件 `index.html`（内联 Tailwind、去 Google Fonts、补移动端 CSS）
3. `git add index.html && git commit -m "更新" && git push`
4. 等约 1 分钟，GitHub Pages 自动更新

## 说明
- `index.html` 零外网依赖，国内/离线都能打开。
- 页面里的"5 人同频"是本地模拟访客，不是真联机。
