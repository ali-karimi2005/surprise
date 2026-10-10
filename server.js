// ✏️ ==========================================================
// ✏️ سرور کوچک: ذخیره‌ی همه کلیک‌ها و جواب‌ها + پنل ادمین
// ✏️ اجرا: node server.js  →  سپس http://localhost:3000
// ✏️ ==========================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
// ✏️ یوزر و رمز ادمین (می‌توانید از متغیر محیطی هم بگیرید)
const ADMIN_USER = process.env.ADMIN_USER || 'ronin';
const ADMIN_PASS = process.env.ADMIN_PASS || '338161';

const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

// دیتابیس ساده در فایل JSON
let db = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : { submissions: {} };
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
const tokens = new Set();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

// هر مرورگر یک شناسه دارد و همه‌ی داده‌هایش زیر همان ثبت می‌شود
const sub = (sid) => {
  if (!db.submissions[sid]) db.submissions[sid] = { created: new Date().toISOString(), events: [] };
  return db.submissions[sid];
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // ثبت هر کلیک یا رویداد
  if (req.method === 'POST' && url.pathname === '/api/event') {
    const b = await readBody(req);
    if (!b.sid) return sendJson(res, 400, {});
    sub(b.sid).events.push({ time: new Date().toISOString(), type: String(b.type || ''), detail: b.detail || {} });
    save();
    return sendJson(res, 200, { ok: true });
  }

  // ذخیره سرگرمی‌ها و اخلاق‌ها
  if (req.method === 'POST' && url.pathname === '/api/profile') {
    const b = await readBody(req);
    if (!b.sid) return sendJson(res, 400, {});
    const s = sub(b.sid);
    s.hobbies = Array.isArray(b.hobbies) ? b.hobbies : [];
    s.traits = String(b.traits || '');
    save();
    return sendJson(res, 200, { ok: true });
  }

  // ذخیره‌ی نهایی: شانس‌ها و مسیر انتخابی
  if (req.method === 'POST' && url.pathname === '/api/final') {
    const b = await readBody(req);
    if (!b.sid) return sendJson(res, 400, {});
    const s = sub(b.sid);
    s.hobbies = Array.isArray(b.hobbies) ? b.hobbies : s.hobbies || [];
    s.traits = b.traits !== undefined ? String(b.traits) : s.traits || '';
    s.yes_chance = Number(b.yes_chance) || null;
    s.relationship_chance = Number(b.relationship_chance) || null;
    s.route = String(b.route || '');
    s.finished = new Date().toISOString();
    s.events.push({ time: s.finished, type: 'final', detail: { yes_chance: s.yes_chance, relationship_chance: s.relationship_chance, route: s.route } });
    save();
    return sendJson(res, 200, { ok: true });
  }

  // ورود ادمین
  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    const b = await readBody(req);
    if (b.username === ADMIN_USER && b.password === ADMIN_PASS) {
      const token = crypto.randomBytes(24).toString('hex');
      tokens.add(token);
      return sendJson(res, 200, { token });
    }
    return sendJson(res, 401, { error: 'یوزر یا رمز اشتباه است' });
  }

  // داده‌های ادمین
  if (req.method === 'GET' && url.pathname === '/api/admin/data') {
    if (!tokens.has(req.headers['x-token'])) return sendJson(res, 401, { error: 'unauthorized' });
    const list = Object.entries(db.submissions).map(([sid, v]) => ({ sid, ...v }))
      .sort((a, b) => (a.created < b.created ? 1 : -1));
    return sendJson(res, 200, list);
  }

  // فایل‌های استاتیک (صفحه اصلی، ادمین، عکس‌ها)
  const reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(PUBLIC, path.normalize(reqPath));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`صفحه اصلی: http://localhost:${PORT}  |  ادمین: http://localhost:${PORT}/admin.html`));
