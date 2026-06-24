// functions/api/orders.js
// GET    /api/orders?status=&project_id=&page=&page_size=
// POST   /api/orders                   → 采购员提交购物车
// PATCH  /api/orders/:id/status        → 状态机流转（HMQ 审批 / 双端收货 / HMQ 归档）

import { ok, err, handleOptions, requireAuth, requireHMQ, genId, auditLog } from './_shared.js';

// ── 状态机合法流转表 ────────────────────────────────────────────
const TRANSITIONS = {
  // [当前状态]: { [操作]: 目标状态, 需要角色 }
  pending_review: {
    approve:  { next: 'purchasing', role: 'hmq' },
    reject:   { next: 'rejected',   role: 'hmq' },
  },
  purchasing: {
    receive:  { next: 'received',   role: 'any' }, // 双端均可
  },
  received: {
    archive:  { next: 'archived',   role: 'hmq' },
  },
  rejected: {
    resubmit: { next: 'pending_review', role: 'buyer' }, // 采购员重新提交
  },
};

export async function onRequestOptions() { return handleOptions(); }

// ── GET /api/orders ─────────────────────────────────────────────
export async function onRequestGet({ request, env }) {
  let user;
  try { user = requireAuth(request, env); } catch(e) { return err(e.msg, e.status); }

  const db = env.DB;
  const url = new URL(request.url);
  const status     = url.searchParams.get('status') || '';
  const project_id = url.searchParams.get('project_id') || '';
  const page       = parseInt(url.searchParams.get('page') || '1');
  const pageSize   = parseInt(url.searchParams.get('page_size') || '20');
  const offset     = (page - 1) * pageSize;

  // 权限过滤：采购员只能看自己项目
  const effectiveProject = user.role === 'buyer' ? user.project_id : (project_id || null);

  let where = [];
  let binds = [];

  if (effectiveProject) { where.push('o.project_id=?'); binds.push(effectiveProject); }
  if (status)           { where.push('o.status=?');     binds.push(status); }

  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const countRow = await db.prepare(
    `SELECT COUNT(*) as n FROM orders o ${whereSQL}`
  ).bind(...binds).first();

  const rows = await db.prepare(`
    SELECT o.id, o.status, o.remark, o.reject_reason,
           o.created_at, o.updated_at,
           p.name  AS project_name,
           u.name  AS submitter_name,
           u.role  AS submitter_role
    FROM orders o
    JOIN projects p ON p.id = o.project_id
    JOIN users    u ON u.id = o.submitter_id
    ${whereSQL}
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...binds, pageSize, offset).all();

  // 附带每个订单的 items（简要）
  const orders = await Promise.all((rows.results || []).map(async ord => {
    const items = await db.prepare(
      'SELECT sku_code,sku_name,qty,unit,est_price,is_temp FROM order_items WHERE order_id=?'
    ).bind(ord.id).all();
    return { ...ord, items: items.results || [] };
  }));

  return ok({ orders, total: countRow.n, page, page_size: pageSize });
}

// ── POST /api/orders ────────────────────────────────────────────
export async function onRequestPost({ request, env }) {
  let user;
  try { user = requireAuth(request, env); } catch(e) { return err(e.msg, e.status); }
  if (user.role !== 'buyer') return err('仅采购员可提交订单', 403);

  let body;
  try { body = await request.json(); } catch { return err('请求体解析失败'); }

  const { items, remark } = body || {};
  if (!items || !items.length) return err('购物车为空');

  // 校验每项必填字段
  for (const it of items) {
    if (!it.sku_name || !it.unit || !it.qty) {
      return err(`物资「${it.sku_name || '?'}」缺少必填字段（名称/单位/数量）`);
    }
  }

  const db = env.DB;
  const orderId = genId('ord');

  await db.prepare(`
    INSERT INTO orders(id,project_id,submitter_id,status,remark,created_at,updated_at)
    VALUES(?,?,?,'pending_review',?,datetime('now'),datetime('now'))
  `).bind(orderId, user.project_id, user.id, remark || '').run();

  for (const it of items) {
    await db.prepare(`
      INSERT INTO order_items(id,order_id,sku_code,sku_name,brand,spec,unit,qty,est_price,is_temp)
      VALUES(?,?,?,?,?,?,?,?,?,?)
    `).bind(
      genId('item'), orderId,
      it.sku_code || '', it.sku_name || '',
      it.brand || '', it.spec || '', it.unit || '',
      parseInt(it.qty) || 1, parseFloat(it.est_price) || 0,
      it.is_temp ? 1 : 0
    ).run();
  }

  await auditLog(db, user.id, 'submit', 'order', orderId, { item_count: items.length });

  return ok({ order_id: orderId });
}

// ── PATCH /api/orders/:id/status ───────────────────────────────
export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'PATCH') return err('Method Not Allowed', 405);

  let user;
  try { user = requireAuth(request, env); } catch(e) { return err(e.msg, e.status); }

  const orderId = params.id;
  let body;
  try { body = await request.json(); } catch { return err('请求体解析失败'); }

  const { action, reject_reason, remark } = body || {};
  if (!action) return err('缺少 action 字段');

  const db = env.DB;
  const order = await db.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
  if (!order) return err('订单不存在', 404);

  const trans = TRANSITIONS[order.status]?.[action];
  if (!trans) return err(`当前状态「${order.status}」不支持操作「${action}」`, 422);

  // 角色检查（admin 拥有等同 hmq 的全部权限）
  const effectiveRole = user.role === 'admin' ? 'hmq' : user.role;
  if (trans.role !== 'any' && effectiveRole !== trans.role) {
    return err(`操作「${action}」需要角色「${trans.role}」`, 403);
  }

  // 采购员只能操作自己项目的订单
  if (user.role === 'buyer' && order.project_id !== user.project_id) {
    return err('无权操作其他项目的订单', 403);
  }

  // 驳回原因必填
  if (action === 'reject' && !reject_reason?.trim()) {
    return err('驳回时必须填写原因');
  }

  await db.prepare(`
    UPDATE orders SET status=?, reject_reason=?, remark=COALESCE(?,remark),
    updated_at=datetime('now') WHERE id=?
  `).bind(trans.next, reject_reason || '', remark, orderId).run();

  // 归档时：自动将订单中的临时 SKU 在 sku_library 转正（is_temporary→0, project_id→NULL）
  let promotedCount = 0;
  if (action === 'archive') {
    // 1. 找出本订单所有临时明细的 sku_code
    const tempItems = await db.prepare(
      `SELECT DISTINCT sku_code FROM order_items WHERE order_id=? AND is_temp=1`
    ).bind(orderId).all();

    const tempCodes = (tempItems.results || []).map(r => r.sku_code);

    if (tempCodes.length > 0) {
      // 2. 在 sku_library 中将这些临时 SKU 转正（全局通用）
      for (const code of tempCodes) {
        const res = await db.prepare(
          `UPDATE sku_library SET is_temporary=0, project_id=NULL, updated_at=datetime('now')
           WHERE code=? AND is_temporary=1`
        ).bind(code).run();
        if (res.changes > 0) promotedCount++;
      }

      // 3. 同步更新 temp_skus 表状态（如果有）
      for (const code of tempCodes) {
        await db.prepare(
          `UPDATE temp_skus SET status='approved', reviewed_at=datetime('now'), reviewer_id=?
           WHERE temp_code=? AND status='pending'`
        ).bind(user.id, code).run();
      }

      await auditLog(db, user.id, 'auto_promote', 'order', orderId, {
        promoted_sku_codes: tempCodes,
        promoted_count: promotedCount
      });
    }
  }

  await auditLog(db, user.id, action, 'order', orderId, { next_status: trans.next });

  return ok({
    order_id: orderId,
    new_status: trans.next,
    has_temp_skus: promotedCount > 0,
    auto_promoted: promotedCount
  });
}
