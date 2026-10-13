// claude-task-deck — Claude Code の作業（道具の呼び出し）を、窓の並びとして映す小さな番。
// 依存なし（Node.js 18+）。Claude Code が手元に書く会話の記録（~/.claude/projects/**/*.jsonl）を読むだけで、何も書き換えない。
//   DATA_DIR   記録の置き場（既定 ~/.claude/projects。Docker では /data）
//   PORT       待ち受けるポート（既定 8787）
//   HOST       待ち受けるアドレス（既定 127.0.0.1。Docker では 0.0.0.0）
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const DATA = process.env.DATA_DIR || path.join(os.homedir(), '.claude', 'projects');
const PORT = +(process.env.PORT || 8787), HOST = process.env.HOST || '127.0.0.1';
const PUB = path.join(__dirname, 'public');

// いちばん新しい記録を探す（projects/<フォルダ>/<会話>.jsonl）
function newest() {
  let best = null, bt = 0;
  let dirs; try { dirs = fs.readdirSync(DATA, { withFileTypes: true }); } catch { return null; }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dir = path.join(DATA, d.name); let fl; try { fl = fs.readdirSync(dir); } catch { continue; }
    for (const f of fl) { if (!f.endsWith('.jsonl')) continue; const fp = path.join(dir, f); try { const t = fs.statSync(fp).mtimeMs; if (t > bt) { bt = t; best = fp; } } catch {} }
  }
  return best;
}

const short = i => { if (!i || typeof i !== 'object') return ''; const v = i.description || i.command || i.file_path || i.path || i.pattern || i.query || i.url || i.prompt || i.skill || ''; return String(v).replace(/\s+/g, ' ').slice(0, 160); };
const isHuman = o => { if (o.type !== 'user' || o.isMeta || o.isSidechain || o.isCompactSummary) return false; const c = o.message && o.message.content; if (typeof c === 'string') return !!c.trim() && !/^</.test(c.trim()); return Array.isArray(c) && !c.some(b => b && b.type === 'tool_result') && c.some(b => b && b.type === 'text'); };

// 記録の一行を出来事へ直す
function events(o) {
  const ev = [];
  if (!o || o.isSidechain) return ev;
  if (o.type === 'system' && (o.subtype === 'turn_duration' || o.subtype === 'stop_hook_summary')) { ev.push({ ev: 'turn', state: 'end' }); return ev; }
  if (o.type === 'user') {
    if (isHuman(o)) { ev.push({ ev: 'turn', state: 'start' }); return ev; }
    const c = o.message && o.message.content;
    if (Array.isArray(c)) for (const b of c) if (b && b.type === 'tool_result') ev.push({ ev: 'tooldone', id: b.tool_use_id, err: !!b.is_error });
  } else if (o.type === 'assistant') {
    const m = o.message || {}, c = m.content;
    if (Array.isArray(c)) for (const b of c) if (b && b.type === 'tool_use') ev.push({ ev: 'tool', id: b.id, name: b.name, arg: short(b.input) });
    if (m.stop_reason === 'end_turn' || m.stop_reason === 'stop_sequence') ev.push({ ev: 'turn', state: 'end' });
  }
  return ev;
}

const clients = new Set();
const cast = e => { const s = 'data: ' + JSON.stringify(e) + '\n\n'; for (const r of clients) { try { r.write(s); } catch {} } };

// いまの状態（動いている道具・一仕事の最中か）＝記録の末尾から数える。繋いだ画面へ最初に渡す
let cur = { file: null, pos: 0, rest: '', tools: new Map(), busy: false };
// 見出しに出す名前＝その会話のフォルダ名（記録の頭に在る cwd の末尾）。読めなければ記録のフォルダ名
function label(fp) {
  if (!fp) return '';
  try { const fd = fs.openSync(fp, 'r'), b = Buffer.alloc(65536), n = fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd); const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(b.slice(0, n).toString('utf8')); if (m) { const c = JSON.parse('"' + m[1] + '"').replace(/[\\/]+$/, ''); return c.split(/[\\/]/).pop() || c; } } catch {}
  return path.basename(path.dirname(fp));
}
function apply(e) {
  if (e.ev === 'tool') cur.tools.set(e.id, e); else if (e.ev === 'tooldone') cur.tools.delete(e.id);
  else if (e.ev === 'turn') { cur.busy = e.state === 'start'; if (!cur.busy) cur.tools.clear(); }
  if (e.ev === 'tool') cur.busy = true;
}
function open(fp) {
  cur = { file: fp, pos: 0, rest: '', tools: new Map(), busy: false };
  try {
    const sz = fs.statSync(fp).size, from = Math.max(0, sz - 800000), fd = fs.openSync(fp, 'r'), b = Buffer.alloc(sz - from);
    fs.readSync(fd, b, 0, b.length, from); fs.closeSync(fd);
    let s = b.toString('utf8'); if (from) s = s.slice(s.indexOf('\n') + 1);
    const nl = s.lastIndexOf('\n'); cur.rest = s.slice(nl + 1); cur.pos = sz;
    for (const line of s.slice(0, nl + 1).split('\n')) { if (!line) continue; let o; try { o = JSON.parse(line); } catch { continue; } events(o).forEach(apply); }
    if (Date.now() - fs.statSync(fp).mtimeMs > 600000) { cur.busy = false; cur.tools.clear(); }   // 十分以上動いていない記録は、作業中とは言わない
  } catch {}
  cast({ ev: 'session', name: label(fp) });
  cast({ ev: 'state', busy: cur.busy, tools: [...cur.tools.values()] });
}
function tick() {
  if (!cur.file) return;
  let sz; try { sz = fs.statSync(cur.file).size; } catch { return; }
  if (sz < cur.pos) return open(cur.file);
  if (sz === cur.pos) return;
  let b; try { const fd = fs.openSync(cur.file, 'r'); b = Buffer.alloc(sz - cur.pos); fs.readSync(fd, b, 0, b.length, cur.pos); fs.closeSync(fd); } catch { return; }
  cur.pos = sz; const s = cur.rest + b.toString('utf8'), nl = s.lastIndexOf('\n'); cur.rest = s.slice(nl + 1);
  for (const line of s.slice(0, nl + 1).split('\n')) { if (!line) continue; let o; try { o = JSON.parse(line); } catch { continue; } for (const e of events(o)) { apply(e); cast(e); } }
}
setInterval(tick, 350);
setInterval(() => { const n = newest(); if (n && n !== cur.file) open(n); }, 2000);
{ const n = newest(); if (n) open(n); }
setInterval(() => cast({ ev: 'ping' }), 20000);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n'); clients.add(res); req.on('close', () => clients.delete(res));
    res.write('data: ' + JSON.stringify({ ev: 'session', name: label(cur.file), found: !!cur.file, dir: DATA }) + '\n\n');
    res.write('data: ' + JSON.stringify({ ev: 'state', busy: cur.busy, tools: [...cur.tools.values()] }) + '\n\n');
    return;
  }
  const f = path.join(PUB, path.normalize(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
}).listen(PORT, HOST, () => console.log('claude-task-deck: http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT + '  (reading ' + DATA + (cur.file ? '' : ' — no session files found yet') + ')'));
