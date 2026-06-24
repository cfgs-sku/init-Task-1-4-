// functions/api/skus.js
// GET  /api/skus?type=library|history&project_id=X&q=keyword&page=1
//   type=library  → 全局标准SKU（is_temporary=0）+ 当前项目临时SKU
//   type=history  → 当前项目已归档订单的高频复购物资
// POST /api/skus  → 采购员申报临时SKU（写入 sku_library，is_temporary=1）

import { ok, err, handleOptions, requireAuth, genId } from './_shared.js';

export async function onRequestOptions() { return handleOptions(); }

// ── GET /api/skus ────────────────────────────────────────────────
export async function onRequestGet({ request, env }) {
  let user;
  try { user = requireAuth(request, env); } catch(e) { return err(e.msg, e.status); }

  const db = env.DB;
  const url = new URL(request.url);
  const type       = url.searchParams.get('type') || 'library';
  const project_id = url.searchParams.get('project_id') || user.project_id || '';
  const q          = url.searchParams.get('q') || '';
  const page       = parseInt(url.searchParams.get('page') || '1');
  const pageSize   = parseInt(url.searchParams.get('page_size') || '50');
  const offset     = (page - 1) * pageSize;

  if (type === 'history') {
    // 项目历史高频复购：查当前项目已归档订单的明细，去重并按复购次数排序
    if (!project_id) return err('缺少 project_id');
    const rows = await db.prepare(`
      SELECT oi.sku_code, oi.sku_name, oi.brand, oi.spec, oi.unit,
             COUNT(*) AS purchase_count,
             MAX(oi.est_price) AS last_price
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.project_id = ?
        AND o.status = 'archived'
        ${q ? "AND (oi.sku_name LIKE ? OR oi.sku_code LIKE ?)" : ''}
      GROUP BY oi.sku_code
      ORDER BY purchase_count DESC
      LIMIT ? OFFSET ?
    `).bind(...(q ? [project_id, `%${q}%`, `%${q}%`] : [project_id]), pageSize, offset).all();

    return ok({ skus: rows.results || [], type: 'history' });
  }

  // type=library：全局标准SKU + 当前项目的临时SKU
  let where = ['(s.is_temporary = 0 OR s.project_id = ?)'];
  let binds = [project_id || ''];
  if (q) {
    where.push('(s.name LIKE ? OR s.code LIKE ? OR s.category LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSQL = 'WHERE ' + where.join(' AND ');

  const countRow = await db.prepare(
    `SELECT COUNT(*) as n FROM sku_library s ${whereSQL}`
  ).bind(...binds).first();

  const rows = await db.prepare(`
    SELECT s.id, s.code, s.name, s.spec, s.unit, s.brand,
           s.category, s.is_temporary, s.project_id, s.last_price,
           s.purchase_url
    FROM sku_library s ${whereSQL}
    ORDER BY s.is_temporary ASC, s.name ASC
    LIMIT ? OFFSET ?
  `).bind(...binds, pageSize, offset).all();

  return ok({ skus: rows.results || [], total: countRow?.n || 0, page, type: 'library' });
}

// ── POST /api/skus ───────────────────────────────────────────────
// 采购员添加临时SKU进标准库（is_temporary=1，关联当前项目）
export async function onRequestPost({ request, env }) {
  let user;
  try { user = requireAuth(request, env); } catch(e) { return err(e.msg, e.status); }
  if (user.role !== 'buyer' && user.role !== 'hmq' && user.role !== 'admin') {
    return err('权限不足', 403);
  }

  let body;
  try { body = await request.json(); } catch { return err('请求体解析失败'); }

  const { name, spec, unit, brand, category, est_price, project_id } = body || {};
  if (!name || !spec || !unit) return err('物资名称、规格、单位为必填项');

  const db = env.DB;
  const effectiveProjId = project_id || user.project_id || '';

  // 生成临时编码：TEMP-YYYYNNNN
  const year = new Date().getFullYear();
  const countRow = await db.prepare(
    `SELECT COUNT(*) as n FROM sku_library WHERE code LIKE ?`
  ).bind(`TEMP-${year}%`).first();
  const seq = (countRow?.n || 0) + 1;
  const code = `TEMP-${year}${String(seq).padStart(4, '0')}`;

  await db.prepare(`
    INSERT INTO sku_library(code, name, spec, unit, brand, category, is_temporary, project_id, last_price, updated_at)
    VALUES(?,?,?,?,?,?,1,?,?,datetime('now'))
  `).bind(code, name, spec, unit, brand || '', category || '临时非标', effectiveProjId, parseFloat(est_price) || 0).run();

  const inserted = await db.prepare('SELECT * FROM sku_library WHERE code=?').bind(code).first();
  return ok({ sku: inserted });
}
