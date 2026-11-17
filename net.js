/**
 * 雨夜频道 · 真·联机层（零依赖，手写 MQTT over WebSocket）
 * ------------------------------------------------------------------
 * 只做四件事：
 *   1. 让同一个房间里的人互相看见（头像 + 名字 + 位置）
 *   2. 有人"添一盏暖光"时，其他人的窗户也一起亮一下
 *   3. 纸飞机真的会飞到别人屏幕上，写的话是真话，回信也是真的
 *   4. 点一下别人的头像，可以朝他挥手
 * 连不上就安静地退回单机，绝不弹报错糊住整页。
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- 配置 */
  var BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt'
  ];
  var ROOM = (location.hash.match(/[#&]r=([A-Za-z0-9_-]{3,24})/) || [])[1] || 'lobby';
  var TOPIC = 'midnight-cafe/v2/' + ROOM;
  var SID = Math.random().toString(36).slice(2, 10);
  var PING_MS = 40000;
  var HI_MS = 15000;
  var PEER_TTL = 45000;

  /* ---------------------------------------------------------------- 小工具 */
  function rand(n) { return Math.random().toString(36).slice(2, 2 + n); }
  function encLen(n) {
    var out = [];
    do { var d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 0x80; out.push(d); } while (n > 0);
    return out;
  }
  function utf8(s) {
    var b = new TextEncoder().encode(s);
    return [b.length >> 8, b.length & 255].concat(Array.prototype.slice.call(b));
  }
  function concat(a, b) {
    var c = new Uint8Array(a.length + b.length);
    c.set(a, 0); c.set(b, a.length);
    return c;
  }
  function ok() { return typeof NET_DISABLED === 'undefined'; }

  /* ---------------------------------------------------------------- 我是谁 */
  var myName = (function () {
    try { return localStorage.getItem('mc_name') || ('@旅人·' + (10 + Math.floor(Math.random() * 89))); }
    catch (e) { return '@旅人·' + (10 + Math.floor(Math.random() * 89)); }
  })();
  var myColor = '#fde68a';
  var myType = 'cat';

  /* ---------------------------------------------------------------- 原生页面里的全局钩子 */
  function $(id) { return document.getElementById(id); }
  var layer = $('cursorsLayer');
  var myState = null;
  try { if (typeof userState !== 'undefined') myState = userState; } catch (e) { }
  function avatarSVG(color, type) {
    try { if (typeof createAvatarSVG === 'function') return createAvatarSVG(color, type); } catch (e) { }
    return '<svg width="28" height="28" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="' + color + '"/></svg>';
  }
  function toast(txt) {
    try { if (typeof showToast === 'function') { showToast(txt); return; } } catch (e) { }
    var d = document.createElement('div');
    d.textContent = txt;
    d.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:99;padding:8px 14px;border-radius:999px;background:rgba(15,23,42,.85);color:#fde68a;font-size:12px;border:1px solid rgba(251,191,36,.3)';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 3200);
  }
  function playSfx(k) { try { if (typeof audioEngine !== 'undefined') audioEngine.playSfx(k); } catch (e) { } }
  function myPos() {
    if (myState && typeof myState.x === 'number') return { x: myState.x, y: myState.y };
    var el = document.querySelector('#userSprite');
    if (el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    return { x: innerWidth / 2, y: innerHeight * 0.55 };
  }
  function norm(p) { return { x: +(p.x / (innerWidth || 1)).toFixed(4), y: +(p.y / (innerHeight || 1)).toFixed(4) }; }
  function denorm(n) { return { x: n.x * innerWidth, y: n.y * innerHeight }; }

  /* ---------------------------------------------------------------- 远端旅人 */
  var peers = new Map();   // id -> {el, x, y, tx, ty, name, color, type, seen}

  function addPeer(m) {
    var d = denorm(m.p || { x: 0.5, y: 0.5 });
    var el = document.createElement('div');
    el.className = 'visitor-cursor z-20 peer-cursor';
    el.style.left = d.x + 'px';
    el.style.top = d.y + 'px';
    el.style.opacity = '0';
    el.style.transition = 'opacity .6s ease';
    el.innerHTML =
      '<div class="relative flex flex-col items-center">' +
        '<div class="peer-sprite" style="filter:drop-shadow(0 0 12px rgba(125,211,252,0.9))">' +
          avatarSVG(m.color || '#93c5fd', m.type || 'ghost') +
        '</div>' +
        '<span class="peer-name mt-1 px-2 py-0.5 rounded-full text-[10px] bg-sky-400/20 text-sky-100 border border-sky-300/40 whitespace-nowrap backdrop-blur-sm">' +
          escapeHTML(m.n || '@旅人') +
        '</span>' +
      '</div>';
    el.addEventListener('pointerdown', function (ev) {
      ev.stopPropagation();
      publish({ t: 'e', id: SID, n: myName, e: '👋' });
      bubble(myEl(), '👋');
      bubble(el, '👋');
    });
    layer.appendChild(el);
    requestAnimationFrame(function () { el.style.opacity = '1'; });
    var p = { el: el, x: d.x, y: d.y, tx: d.x, ty: d.y, name: m.n || '@旅人', color: m.color, type: m.type, seen: Date.now() };
    peers.set(m.id, p);
    updateCount();
    return p;
  }

  function removePeer(id, quiet) {
    var p = peers.get(id);
    if (!p) return;
    p.el.style.opacity = '0';
    setTimeout(function () { p.el.remove(); }, 600);
    peers.delete(id);
    updateCount();
    if (!quiet) toast('🌫️ ' + p.name + ' 悄悄离开了');
  }

  function updateCount() {
    var n = peers.size + 1;
    var span = $('onlineCount');
    if (span) {
      span.textContent = n;
      var badge = span.parentElement;
      if (badge) badge.title = '真人 ' + n + ' 位（房间：' + ROOM + '）';
    }
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function fadeNpcs() {
    var list = document.querySelectorAll('#cursorsLayer .visitor-cursor');
    Array.prototype.forEach.call(list, function (el) {
      if (el.classList.contains('peer-cursor')) return;
      if (el.querySelector('#userSprite')) return;
      el.classList.add('npc-faded');
    });
  }

  function bubble(el, emoji) {
    if (!el) return;
    var b = document.createElement('div');
    b.className = 'emoji-bubble absolute -top-9 left-1/2 px-2.5 py-1 rounded-full glass-panel text-sm shadow-lg pointer-events-none';
    b.textContent = emoji;
    el.appendChild(b);
    setTimeout(function () { b.remove(); }, 3200);
  }
  function myEl() {
    var s = document.querySelector('#userSprite');
    return s ? s.closest('.visitor-cursor') : null;
  }

  // 平滑跟随
  function tick() {
    var mp = myPos();
    peers.forEach(function (p) {
      p.x += (p.tx - p.x) * 0.16;
      p.y += (p.ty - p.y) * 0.16;
      // 跟"我"重叠时把对方的显示位置挪开一点，不然两个名牌会叠在一起
      var ox = 0, oy = 0;
      if (Math.abs(p.x - mp.x) < 50 && Math.abs(p.y - mp.y) < 50) { ox = 56; oy = -8; }
      p.el.style.left = (p.x + ox) + 'px';
      p.el.style.top = (p.y + oy) + 'px';
    });
    requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------------- MQTT */
  var ws = null, buf = new Uint8Array(0), connected = false, pid = 1;
  var brokerIdx = 0, retry = 0, timers = [], intentionalClose = false, everConnected = false;
  var DBG = (window.__net = { tx: 0, rx: 0, errs: [], build: 'v5-fix' });
  function note(where, e) {
    try { DBG.errs.push(where + ': ' + (e && e.message ? e.message : String(e))); if (DBG.errs.length > 12) DBG.errs.shift(); } catch (_) { }
  }

  function clearTimers() { timers.forEach(clearInterval); timers = []; }

  function connect() {
    var url = BROKERS[brokerIdx % BROKERS.length];
    intentionalClose = false;
    try { ws = new WebSocket(url, 'mqtt'); } catch (e) { return scheduleRetry(); }
    ws.binaryType = 'arraybuffer';

    ws.onopen = function () {
      var clientId = 'mcweb' + SID;
      var body = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c].concat(utf8(clientId));
      ws.send(new Uint8Array([0x10].concat(encLen(body.length), body)));
    };

    ws.onmessage = function (ev) {
      try {
        buf = concat(buf, new Uint8Array(ev.data));
        parseFrames();
      } catch (e) { note('onmessage', e); }
    };

    ws.onclose = function () {
      var was = connected;
      connected = false;
      document.documentElement.setAttribute('data-net', 'off');
      clearTimers();
      if (was) toast('📡 频道断了，正在重连…');
      if (!intentionalClose) scheduleRetry();
    };
    ws.onerror = function () { /* onclose 会接手 */ };
  }

  function scheduleRetry() {
    retry++;
    brokerIdx++;
    var wait = Math.min(20000, 1000 * Math.pow(2, Math.min(retry, 5)));
    setTimeout(connect, wait);
  }

  function sendRaw(bytes) {
    if (ws && ws.readyState === 1) { ws.send(bytes); DBG.tx++; return true; }
    return false;
  }

  function subscribe() {
    var body = [pid >> 8, pid & 255].concat(utf8(TOPIC), [0x00]);
    pid = (pid + 1) & 0xffff;
    sendRaw(new Uint8Array([0x82].concat(encLen(body.length), body)));
  }

  function publish(obj) {
    var payload = Array.prototype.slice.call(new TextEncoder().encode(JSON.stringify(obj)));
    var body = utf8(TOPIC).concat(payload);
    return sendRaw(new Uint8Array([0x30].concat(encLen(body.length), body)));
  }

  function parseFrames() {
    var i = 0;
    while (buf.length - i >= 2) {
      var first = buf[i], type = first >> 4, qos = (first >> 1) & 3;
      var mult = 1, len = 0, b, p = i + 1;
      do {
        if (p >= buf.length) { buf = buf.subarray(i); return; }
        b = buf[p++]; len += (b & 127) * mult; mult *= 128;
      } while (b & 0x80);
      if (buf.length - p < len) { buf = buf.subarray(i); return; }
      var body = buf.subarray(p, p + len);
      handleFrame(type, body, qos);
      i = p + len;
    }
    buf = buf.subarray(i);
  }

  function handleFrame(type, body, qos) {
    if (type === 2) {                      // CONNACK
      if (body[1] === 0) {
        connected = true; retry = 0;
        document.documentElement.setAttribute('data-net', 'on');
        subscribe();
        clearTimers();
        timers.push(setInterval(function () { sendRaw(new Uint8Array([0xc0, 0x00])); }, PING_MS));
        timers.push(setInterval(hello, HI_MS));
        timers.push(setInterval(prune, 5000));
        hello();
        updateCount();
        if (!everConnected) {
          everConnected = true;
          toast('🌙 已接入雨夜频道 · 房间 ' + ROOM);
        } else {
          toast('🌙 回到雨夜频道了');
        }
      } else {
        ws.close();
      }
      return;
    }
    if (type === 9) return;                 // SUBACK
    if (type === 13) return;                // PINGRESP
    if (type === 3) {                       // PUBLISH
      var tl = (body[0] << 8) | body[1];
      var off = 2 + tl;
      if (qos > 0 && body.length >= off + 2) {
        var pkid = (body[off] << 8) | body[off + 1];
        off += 2;
        sendRaw(new Uint8Array([0x40, 0x02, pkid >> 8, pkid & 255]));   // PUBACK
      }
      var payload = body.subarray(off);
      DBG.rx++;
      try { onMessage(JSON.parse(new TextDecoder().decode(payload))); } catch (e) {
        DBG.raw = { qos: qos, tl: tl, body: Array.prototype.slice.call(body.subarray(0, 40)), off: off };
        note('onMessage', e);
      }
      return;
    }
  }

  function hello() {
    var n = norm(myPos());
    publish({ t: 'hi', id: SID, n: myName, color: myColor, type: myType, p: n });
  }

  function prune() {
    var now = Date.now();
    peers.forEach(function (p, id) { if (now - p.seen > PEER_TTL) removePeer(id, true); });
  }

  function onMessage(m) {
    if (!m || m.id === SID) return;
    var p = peers.get(m.id);
    if (m.t === 'hi') {
      if (!p) {
        addPeer(m);
        toast('🌙 ' + (m.n || '有人') + ' 游进了这间咖啡馆，你们在同一间屋子里');
        fadeNpcs();
      } else {
        p.seen = Date.now();
        if (m.p) { var d = denorm(m.p); p.tx = d.x; p.ty = d.y; }
      }
      hello();
      return;
    }
    if (m.t === 'p') {
      if (!p) { addPeer({ id: m.id, n: m.n || '@旅人', p: m.p }); }
      else {
        p.seen = Date.now();
        var dd = denorm(m.p); p.tx = dd.x; p.ty = dd.y;
      }
      return;
    }
    if (m.t === 'bye') { removePeer(m.id); return; }
    if (m.t === 'e') {
      var target = p ? p.el : null;
      bubble(target || myEl(), m.e || '👋');
      return;
    }
    if (m.t === 'w') {
      if (p) p.seen = Date.now();
      warmFlash();
      toast('🕯️ ' + (m.n || '有人') + ' 添了一盏暖光');
      return;
    }
    if (m.t === 'f') {
      // 真人的纸飞机：交给原生生成器，别人点开就是真信
      try {
        if (typeof spawnPaperPlane === 'function') {
          spawnPaperPlane({
            author: (m.n || '@旅人') + ' 寄',
            text: m.text,
            paper: m.paper || 'cream',
            likes: 1,
            replies: []
          }, false);
          toast('✈️ 一架纸飞机载着 ' + (m.n || '远方的人') + ' 的心事飞过');
        }
      } catch (e) { }
      return;
    }
  }

  function warmFlash() {
    var aura = $('warmAura');
    if (!aura) return;
    aura.classList.remove('warm-overlay-active');
    void aura.offsetWidth;
    aura.classList.add('warm-overlay-active');
  }

  /* ---------------------------------------------------------------- 本地事件钩子 */
  // 位置广播（节流）
  var last = { x: -999, y: -999 };
  setInterval(function () {
    if (!connected) return;
    var p = myPos();
    if (Math.abs(p.x - last.x) < 5 && Math.abs(p.y - last.y) < 5) return;
    last = p;
    publish({ t: 'p', id: SID, n: myName, p: norm(p) });
  }, 120);

  // 添一盏暖光 → 别人也亮
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#warmShareBtn')) return;
    publish({ t: 'w', id: SID, n: myName });
  }, true);

  // 放飞纸飞机 → 真的飞给别人
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#launchPlaneBtn')) return;
    var input = $('planeMessageInput');
    var text = input ? input.value.trim() : '';
    if (!text) return;
    var paper = 'cream';
    try { if (typeof selectedPaper !== 'undefined') paper = selectedPaper; } catch (err) { }
    setTimeout(function () { publish({ t: 'f', id: SID, n: myName, text: text.slice(0, 300), paper: paper }); }, 40);
  }, true);

  // 回信复飞 → 也飞给别人
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#relaunchPlaneBtn')) return;
    var reply = $('replyInput');
    var text = reply ? reply.value.trim() : '';
    var note = null;
    try { if (typeof currentOpenedPlane !== 'undefined') note = currentOpenedPlane; } catch (err) { }
    var body = text || (note && note.text) || '';
    if (!body) return;
    setTimeout(function () { publish({ t: 'f', id: SID, n: myName, text: String(body).slice(0, 300), paper: (note && note.paper) || 'cream' }); }, 40);
  }, true);

  // 改名字：点自己的名牌
  document.addEventListener('click', function (e) {
    var span = e.target.closest ? e.target.closest('.visitor-cursor .text-amber-200') : null;
    if (!span || !span.textContent.match(/旅人/)) return;
    var v = prompt('给自己取个名字（朋友会看到）', myName);
    if (v && v.trim()) {
      myName = v.trim().slice(0, 16);
      try { localStorage.setItem('mc_name', myName); } catch (err) { }
      span.textContent = myName;
      hello();
      toast('✍️ 名字改成 ' + myName);
    }
  }, true);

  // 离开
  window.addEventListener('pagehide', function () { try { publish({ t: 'bye', id: SID }); } catch (e) { } });
  window.addEventListener('beforeunload', function () { try { publish({ t: 'bye', id: SID }); } catch (e) { } });

  /* ---------------------------------------------------------------- 开跑 */
  if (!layer) return;
  requestAnimationFrame(tick);
  updateCount();
  connect();
})();


