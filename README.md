# 深夜雨夜漂流咖啡馆 · Midnight Rain & Paper Planes

线上地址：https://yuniuy.github.io/midnight-cafe/

## 怎么玩
- 打开链接就能进，点屏幕任意处小猫会跳过去；点空中的纸飞机可以拆信、回信、再放飞。
- **真人联机**：同一个链接打开的人会出现在同一间屋子里（默认房间 `lobby`），能看到彼此的光点、名牌、挥手、暖光，纸飞机也是真的飞到对方屏幕上。
- 想开一间只属于你们的屋子：在链接后面加 `#r=任意英文`，例如
  `https://yuniuy.github.io/midnight-cafe/#r=rainy-night`，把这个带 `#r=` 的链接发给朋友即可。
- 点自己的名牌可以改名。

## 文件
| 文件 | 作用 |
| --- | --- |
| `index.original.html` | 原始版（带 Tailwind / Google Fonts 外链），改内容从这里改 |
| `net.js` | 联机层：手写的 MQTT over WebSocket，零依赖 |
| `build.mjs` | 构建：内联 Tailwind 和 net.js、去外链、补移动端 CSS → `index.html` |
| `tw-play.js` | 内联用的 Tailwind Play CDN 副本（离线构建用） |
| `index.html` | **构建产物 = 线上页面**，单文件、零外网依赖 |

## 改页面 / 改联机怎么办
1. 改 `index.original.html`（页面）或 `net.js`（联机）
2. `D:\DS\node.exe build.mjs` → 重新生成 `index.html`
3. `git add -A && git commit -m "更新" && git push`
4. 等约 1 分钟，GitHub Pages 自动更新

## 联机实现说明
- 协议：MQTT 3.1.1 over WebSocket，浏览器端手写编解码（`net.js`，不引第三方库）。
- Broker 自动切换：`broker.emqx.io:8084` → `broker.hivemq.com:8884` → `test.mosquitto.org:8081`。
- 房间 topic：`midnight-cafe/v2/<房间名>`，房间名来自 `location.hash` 的 `#r=`，默认 `lobby`。
- 消息类型：`hi`（上线/心跳，也带位置）、`p`（移动，120ms 节流）、`e`（挥手）、`w`（温暖之光）、`f`（纸飞机+信件正文）、`bye`（离开）。
- 45 秒没心跳的会自动消失；真人到场后，页面自带的 4 个模拟访客会淡下去。
- 调试：浏览器控制台看 `window.__net`（收发包计数、错误、构建标记）。
