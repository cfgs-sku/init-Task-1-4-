// functions/api/tempSku.js
// POST /api/tempSku → 批量上传临时物资（旧版 CloudSyncV2 _pushTemp 使用）
// Body: { items: [{sku, name, spec, unit, brand, est_price, ...}] }
// 返回: { ok, added, newCodes: [] }

import { ok, err, handleOptions } from './_shared.js';

export async function onRequestOptions() { return handleOptions(); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err('请求体解析失败'); }

  const items = body?.items;
  if (!Array.isArray(items) || !items.length) return err('items 不能为空');

  const db = env.DB;
  let added = 0;
  const newCodes = [];

  // 生成临时编码前缀
  const year = new Date().getFullYear();
  const countRow = await db.prepare(
    'SELECT COUNT(*) as n FROM sku_library WHERE code LIKE ?'
  ).bind(`TEMP-${year}%`).first();
  let seq = (countRow?.n || 0) + 1;

  for (const r of items) {
    if (!r.name) continue;

    // 优先复用原有编码，否则生成新的
    const code = (r.sku && /^TMP-\d/.test(r.sku))
      ? r.sku
      : `TEMP-${year}${String(seq++).padStart(4, '0')}`;

    const existing = await db.prepare(
      'SELECT code FROM sku_library WHERE code=?'
    ).bind(code).first();

    if (!existing) {
      await db.prepare(`
        INSERT INTO sku_library(code,name,spec,unit,brand,category,is_temporary,last_price,updated_at)
        VALUES(?,?,?,?,?,?,1,?,datetime('now'))
      `).bind(
        code, r.name, r.spec || '', r.unit || '', r.brand || '',
        r.cat || r.category || '临时非标',
        parseFloat(r.est_price || r.price || 0)
      ).run();
      added++;
      newCodes.push(code);
    }
  }

  return ok({ added, newCodes });
}
