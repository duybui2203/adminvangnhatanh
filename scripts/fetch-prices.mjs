// Lấy giá vàng từ các nguồn công khai và ghi ra data/prices/latest.json
// Đơn vị thống nhất: nghìn đồng / lượng (giống bảng giá trên báo).
// Chạy bởi GitHub Actions (xem .github/workflows/gold-prices.yml). Không cần thư viện ngoài.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (compatible; VangNhatAnhBot/1.0)';
const TIMEOUT = 20000;

async function get(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...(opts.headers || {}) }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}
const num = (s) => { const n = Number(String(s ?? '').replace(/[^\d]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const perChiVndToLuongK = (v) => (v == null ? null : Math.round(v / 100));        // 14,400,000 đ/chỉ -> 144,000 nghìn/lượng
const perChiKToLuongK = (v) => (v == null ? null : v * 10);                      // 14,400 nghìn/chỉ -> 144,000 nghìn/lượng
const decode = (s) => s.replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c)).replace(/&amp;/g, '&');

// ---- Nguồn 1: PNJ (JSON, nghìn đồng/chỉ) -> dùng cho dòng SJC
async function pnj() {
  const j = JSON.parse(await get('https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00'));
  const row = (j.data || []).find((r) => r.masp === 'SJC');
  if (!row) throw new Error('no SJC row');
  return { buy: perChiKToLuongK(num(row.giamua)), sell: perChiKToLuongK(num(row.giaban)) };
}
// ---- Nguồn 2: DOJI (XML, nghìn đồng/lượng)
async function doji() {
  const x = await get('http://giavang.doji.vn/api/giavang/?api_key=258fbd2a72ce8481089d88c678e9fe4f');
  const rows = [...x.matchAll(/<Row Name='([^']+)'[^>]*Sell='([^']*)'\s+Buy='([^']*)'/g)].map((m) => ({ name: m[1], sell: num(m[2]), buy: num(m[3]) }));
  const pick = (re) => rows.find((r) => re.test(r.name) && r.buy && r.sell);
  const hn = pick(/DOJI HN lẻ/i), hcm = pick(/DOJI HCM lẻ/i);
  return { hn: hn && { buy: hn.buy, sell: hn.sell }, hcm: hcm && { buy: hcm.buy, sell: hcm.sell } };
}
// ---- Nguồn 3: Bảo Tín Minh Châu (JSON, đồng/chỉ)
async function btmc() {
  const j = JSON.parse(await get('https://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=3kd8ub1llcg9t45hnoh8hmn7t5kc2v'));
  const rows = (j.DataList?.Data || []).map((r) => { const i = r['@row']; return { name: r['@n_' + i] || '', buy: num(r['@pb_' + i]), sell: num(r['@ps_' + i]) }; });
  const pick = (re) => { const r = rows.find((r) => re.test(r.name)); return r && r.buy && r.sell ? { buy: perChiVndToLuongK(r.buy), sell: perChiVndToLuongK(r.sell) } : null; };
  return { vrtl: pick(/^VÀNG MIẾNG VRTL/i), sjc: pick(/^VÀNG MIẾNG SJC/i) };
}
// ---- Nguồn 4: Bảo Tín Mạnh Hải (HTML, nghìn đồng/chỉ, ví dụ "14.530")
async function btmh() {
  const h = decode(await get('https://baotinmanhhai.vn/bang-gia-vang'));
  const text = h.replace(/<[^>]+>/g, '|').replace(/\s+/g, ' ');
  const m = text.match(/Kim Gia Bảo 24K[^|]*\|[\s|]*[\d.,]+[\s|]*\|[\s|]*([\d.]+)[\s|]*\|[\s|]*([\d.]+)/i);
  if (!m) throw new Error('row not found');
  return { buy: perChiKToLuongK(num(m[1])), sell: perChiKToLuongK(num(m[2])) };
}
// ---- Nguồn 5: Phú Quý (HTML, đồng/chỉ, ví dụ "14,400,000")
async function phuquy() {
  const h = decode(await get('https://phuquygroup.vn/'));
  const text = h.replace(/<[^>]+>/g, '|').replace(/\s+/g, ' ');
  const m = text.match(/Vàng miếng SJC[\s|]*([\d,]+)[\s|]*([\d,]+)/i);
  if (!m) throw new Error('row not found');
  return { buy: perChiVndToLuongK(num(m[1])), sell: perChiVndToLuongK(num(m[2])) };
}

// ---- Nguồn 0 (chính): bảng giá trên 24h.com.vn (tổng hợp giavang.net, pnj, baotinmanhhai) – có cả giá hôm qua
const strip = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
async function h24() {
  const h = decode(await get('https://www.24h.com.vn/gia-vang-hom-nay-c425.html', { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', Accept: 'text/html' } }));
  const tbl = h.match(/<table class="gia-vang-search-data-table">([\s\S]*?)<\/table>/);
  if (!tbl) throw new Error('table not found');
  const out = {};
  for (const tr of tbl[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (cells.length < 5) continue;
    const v = (c) => { const m = c.match(/\d{1,3}(?:,\d{3})+/); return m ? num(m[0]) : null; };
    out[strip(cells[0])] = { buy: v(cells[1]), sell: v(cells[2]), prevBuy: v(cells[3]), prevSell: v(cells[4]) };
  }
  const head = h.match(/Hôm qua \((\d{2})\/(\d{2})\/(\d{4})\)/);
  const prevDate = head ? `${head[3]}-${head[2]}-${head[1]}` : null;
  if (!Object.keys(out).length) throw new Error('no rows');
  return { rows: out, prevDate };
}

// Danh sách dòng hiển thị (giữ đúng thứ tự như bảng mẫu)
const ROWS = [
  { id: 'sjc',       name: 'SJC',         key: 'sjc' },
  { id: 'doji-hn',   name: 'DOJI HN',     key: 'doji hn' },
  { id: 'doji-sg',   name: 'DOJI SG',     key: 'doji sg' },
  { id: 'btmh',      name: 'BTMH',        key: 'btmh' },
  { id: 'btmc-vrtl', name: 'BTMC VRTL',   key: 'btmc vrtl' },
  { id: 'btmc-sjc',  name: 'BTMC SJC',    key: 'btmc sjc' },
  { id: 'phuquy-sjc',name: 'PHÚ QUÝ SJC', key: 'phu quy sjc' },
];
const FALLBACK_SOURCE = { 'sjc': 'pnj.com.vn', 'doji-hn': 'doji.vn', 'doji-sg': 'doji.vn', 'btmh': 'baotinmanhhai.vn', 'btmc-vrtl': 'btmc.vn', 'btmc-sjc': 'btmc.vn', 'phuquy-sjc': 'phuquygroup.vn' };

async function safe(label, fn) { try { return await fn(); } catch (e) { console.warn(`[warn] ${label}: ${e.message}`); return null; } }

const [h, p, d, b, mh, pq] = await Promise.all([safe('24h', h24), safe('pnj', pnj), safe('doji', doji), safe('btmc', btmc), safe('btmh', btmh), safe('phuquy', phuquy)]);
const fallback = {
  'sjc': p || b?.sjc || null,
  'doji-hn': d?.hn || null,
  'doji-sg': d?.hcm || d?.hn || null,
  'btmh': mh,
  'btmc-vrtl': b?.vrtl || null,
  'btmc-sjc': b?.sjc || null,
  'phuquy-sjc': pq,
};

// Giữ lại giá cũ nếu nguồn tạm thời lỗi (đánh dấu stale)
let prev = null;
try { prev = JSON.parse(await readFile('data/prices/latest.json', 'utf8')); } catch {}
const prevMap = Object.fromEntries((prev?.rows || []).map((r) => [r.id, r]));

const now = new Date();
const rows = ROWS.map(({ key, ...r }) => {
  const m = h?.rows?.[key];                                  // ưu tiên 24h.com.vn (khớp bảng người dùng xem)
  if (m && m.buy && m.sell) return { ...r, source: '24h.com.vn', buy: m.buy, sell: m.sell, prevBuy: m.prevBuy, prevSell: m.prevSell, time: now.toISOString(), stale: false };
  const f = fallback[r.id];                                  // dự phòng: API/website của từng hãng
  const o = prevMap[r.id];
  if (f && f.buy && f.sell) return { ...r, source: FALLBACK_SOURCE[r.id], buy: f.buy, sell: f.sell, prevBuy: o?.prevBuy ?? null, prevSell: o?.prevSell ?? null, time: now.toISOString(), stale: false };
  if (o && o.buy && o.sell) return { ...r, source: o.source, buy: o.buy, sell: o.sell, prevBuy: o.prevBuy ?? null, prevSell: o.prevSell ?? null, time: o.time, stale: true };
  return { ...r, source: FALLBACK_SOURCE[r.id], buy: null, sell: null, prevBuy: null, prevSell: null, time: null, stale: true };
});

const vnDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); // YYYY-MM-DD
const out = { unit: 'nghìn đồng/lượng', updatedAt: now.toISOString(), date: vnDate, prevDate: h?.prevDate || prev?.prevDate || null, rows };

await mkdir('data/prices/history', { recursive: true });
await writeFile('data/prices/latest.json', JSON.stringify(out, null, 2) + '\n');
await writeFile(`data/prices/history/${vnDate}.json`, JSON.stringify(out, null, 2) + '\n');
console.table(rows.map((r) => ({ name: r.name, buy: r.buy, sell: r.sell, prevBuy: r.prevBuy, prevSell: r.prevSell, source: r.source, stale: r.stale })));
