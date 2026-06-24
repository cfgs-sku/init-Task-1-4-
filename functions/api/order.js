// functions/api/order.js
// POST /api/order → 归档单个采购订单（旧版 CloudSyncV2 _pushOrders 使用）
// Body: { projectCode, projectName, month, archivedAt, buyer, items:[{n,b,s,u,q,p}] }
// 返回: { ok }

import { ok, err, handleOptions, genId } from './_shared.js';

export async function onRequestOptions() { return handleOptions(); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err('请求体解析失败'); }

  const { projectCode, projectName, month, archivedAt, buyer, items } = body || {};
  if (!projectName) return err('缺少 projectName');
  if (!Array.isArray(items) || !items.length) return err('items 为空');

  const db = env.DB;

  // 确保项目存在（按 code 或 name 查找，不存在则创建）
  let project = projectCode
    ? await db.prepare('SELECT id FROM projects WHERE code=?').bind(projectCode).first()
    : null;
  if (!project) {
    project = await db.prepare('SELECT id FROM projects WHERE name=?').bind(projectName).first();
  }
  if (!project) {
    const pid = genId('proj');
    await db.prepare(
      `INSERT INTO projects(id,name,code,created_at) VALUES(?,?,?,datetime('now'))`
    ).bind(pid, projectName, projectCode || '').run();
    project = { id: pid };
  }

  // 创建订单（标记为已归档）
  const orderId = genId('ord');
  const createdAt = archivedAt || new Date().toISOString();
  await db.prepare(`
    INSERT INTO orders(id,project_id,submitter_id,status,remark,created_at,updated_at)
    VALUES(?,?,'legacy','archived',?,?,datetime('now'))
  `).bind(orderId, project.id, `来自旧系统 ${month || ''} 归档`, createdAt).run();

  // 写入明细（旧格式字段：n=名称, b=品牌, s=规格, u=单位, q=数量, p=单价）
  for (const it of items) {
    const name = it.n || it.sku_name || it['物资名称'] || '';
    if (!name) continue;
    await db.prepare(`
      INSERT INTO order_items(id,order_id,sku_code,sku_name,brand,spec,unit,qty,est_price,is_temp)
      VALUES(?,?,?,?,?,?,?,?,?,0)
    `).bind(
      genId('item'), orderId,
      it.code || it.sku_code || '',
      name,
      it.b || it.brand || it['参考品牌'] || '',
      it.s || it.spec  || it['规格参数'] || '',
      it.u || it.unit  || it['单位'] || '',
      parseInt(it.q || it.qty || it['数量'] || 1),
      parseFloat(it.p || it.est_price || it['单价（元）'] || 0)
    ).run();
  }

  return ok({ order_id: orderId });
}
