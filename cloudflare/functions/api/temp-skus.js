// functions/api/temp-skus.js
// GET   /api/temp-skus?status=&project_id=   → 列表（HMQ 全局；Buyer 仅自己项目）
// POST  /api/temp-skus                        → 采购员添加临时 SKU
// PATCH /api/temp-skus/:id/promote            → HMQ 转正临时 SKU

import { ok, err, handleOptions, requireAuth, requireHMQ, genId, auditLog } from './_shared.js';

export async function onRequestOptions() { return handleOptions(); }

// ── GET ─────────────────────────────────────────────────────────
export async function onRequestGet({ request, env }) {
  let user;
  try { user = requireAuth(request, env); } catch(e) { return err(e.msg, e.status); }

  const db  = env.DB;
  const url = new URL(request.url);
  const status     = url.searchParams.get('status') || '';
  const project_id = user.role === 'buyer' ? user.project_id : (url.searchParams.get('project_id') || '');

  let where = [];
  let binds = [];
  if (project_id) { where.push('t.project_id=?'); binds.push(project_id); }
  if (status)     { where.push('t.status=?');     binds.push(status); }
  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const rows = await db.prepare(`
    SELECT t.*, p.name AS project_name, u.name AS creator_name
    FROM temp_skus t
    JOIN projects p ON p.id = t.project_id
    JOIN users    u ON u.id = t.creator_id
    ${whereSQL}
    ORDER BY t.created_at DESC
  `).bind(...binds).all();

  return ok({ list: rows.results || [] });
}

// ── POST ────────────────────────────────────────────────────────
export async function onRequestPost({ request, env }) {
  let user;
  try { user = requireAuth(request, env); } catch(e) { return err(e.msg, e.status); }
  if (user.role !== 'buyer') return err('仅采购员可添加临时 SKU', 403);

  let body;
  try { body = await request.json(); } catch { return err('请求体解析失败'); }

  // 必填字段校验（对应规范：名称、规格、单位、预计单价）
  const required = { name: '物资名称', spec: '规格型号', unit: '单位', est_price: '预计单价' };
  for (const [k, label] of Object.entries(required)) {
    if (!body[k] && body[k] !== 0) return err(`「${label}」为必填项`);
  }

  const db = env.DB;

  // 生成 TEMP 编码
  const lastRow = await db.prepare(
    `SELECT temp_code FROM temp_skus WHERE temp_code LIKE 'TEMP-%' ORDER BY created_at DESC LIMIT 1`
  ).first();
  let seq = 1;
  if (lastRow) {
    const m = lastRow.temp_code.match(/TEMP-\d{4}(\d+)/);
    if (m) seq = parseInt(m[1]) + 1;
  }
  const year = new Date().getFullYear();
  const tempCode = `TEMP-${year}${String(seq).padStart(4, '0')}`;

  const id = genId('tmp');
  await db.prepare(`
    INSERT INTO temp_skus
      (id,temp_code,name,brand,spec,unit,est_price,purchase_link,image_url,remark,
       project_id,creator_id,status,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'pending',datetime('now'))
  `).bind(
    id, tempCode,
    body.name.trim(), body.brand || '', body.spec.trim(), body.unit.trim(),
    parseFloat(body.est_price) || 0,
    body.purchase_link || '', body.image_url || '', body.remark || '',
    user.project_id, user.id
  ).run();

  await auditLog(db, user.id, 'add_temp', 'temp_sku', id, { temp_code: tempCode });

  return ok({ id, temp_code: tempCode });
}

// ── PATCH /api/temp-skus/:id/promote ───────────────────────────
export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'PATCH') return err('Method Not Allowed', 405);

  let user;
  try { user = requireHMQ(request, env); } catch(e) { return err(e.msg, e.status); }

  const id = params.id;
  let body;
  try { body = await request.json(); } catch { return err('请求体解析失败'); }

  const { action } = body || {}; // 'approve' | 'reject'
  if (!action) return err('缺少 action');
  if (!['approve', 'reject'].includes(action)) return err('action 只能是 approve 或 reject');

  const db  = env.DB;
  const tmp = await db.prepare('SELECT * FROM temp_skus WHERE id=?').bind(id).first();
  if (!tmp) return err('临时 SKU 不存在', 404);
  if (tmp.status !== 'pending') return err('该 SKU 已审核，无法重复操作');

  if (action === 'approve') {
    // 转正：写入 records（标准物资库）并更新 temp_skus 状态
    const stdCode = body.std_sku_code || tmp.temp_code.replace('TEMP-', 'SKU-');

    // 写入现有 records 云端接口（或直接写 D1 的 skus 表，根据实际情况调整）
    // 此处假设已有 /api/records 接口接受 PUT 上传 SKU
    // 同时更新 temp_skus 表
    await db.prepare(`
      UPDATE temp_skus SET status='approved', std_sku_code=?,
      reviewer_id=?, reviewed_at=datetime('now') WHERE id=?
    `).bind(stdCode, user.id, id).run();

    // 将所有含此 temp_code 的 order_items 的 is_temp 改为 0
    await db.prepare(
      `UPDATE order_items SET is_temp=0, sku_code=? WHERE sku_code=? AND is_temp=1`
    ).bind(stdCode, tmp.temp_code).run();

    await auditLog(db, user.id, 'promote', 'temp_sku', id, { std_code: stdCode });
    return ok({ std_sku_code: stdCode, message: '临时 SKU 已转正为标准物资' });

  } else {
    // 驳回
    await db.prepare(
      `UPDATE temp_skus SET status='rejected', reviewer_id=?, reviewed_at=datetime('now') WHERE id=?`
    ).bind(user.id, id).run();

    await auditLog(db, user.id, 'reject_temp', 'temp_sku', id, {});
    return ok({ message: '临时 SKU 已驳回' });
  }
}
