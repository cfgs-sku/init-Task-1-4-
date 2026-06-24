// functions/api/sku.js
// POST /api/sku → 批量上传标准物资（旧版 CloudSyncV2 _pushSku 使用）
// Body: { items: [{code, name, spec, unit, brand, cat, level, ...}] }
// 返回: { ok, added, updated }

import { ok, err, handleOptions } from './_shared.js';

export async function onRequestOptions() { return handleOptions(); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err('请求体解析失败'); }

  const items = body?.items;
  if (!Array.isArray(items) || !items.length) return err('items 不能为空');

  const db = env.DB;
  let added = 0, updated = 0;

  for (const r of items) {
    if (!r.code || !r.name) continue;
    const existing = await db.prepare(
      'SELECT code FROM sku_library WHERE code=?'
    ).bind(r.code).first();

    if (existing) {
      await db.prepare(`
        UPDATE sku_library
        SET name=?, spec=?, unit=?, brand=?, category=?, last_price=?, updated_at=datetime('now')
        WHERE code=?
      `).bind(
        r.name, r.spec || '', r.unit || '', r.brand || '',
        r.cat || r.category || '其他',
        parseFloat(r.last_price || r.price || 0),
        r.code
      ).run();
      updated++;
    } else {
      await db.prepare(`
        INSERT INTO sku_library(code,name,spec,unit,brand,category,is_temporary,last_price,updated_at)
        VALUES(?,?,?,?,?,?,0,?,datetime('now'))
      `).bind(
        r.code, r.name, r.spec || '', r.unit || '', r.brand || '',
        r.cat || r.category || '其他',
        parseFloat(r.last_price || r.price || 0)
      ).run();
      added++;
    }
  }

  return ok({ added, updated });
}
