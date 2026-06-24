// functions/api/projects.js
// GET  /api/projects          → 项目列表（HMQ 全部；Buyer 仅自己）
// POST /api/projects          → HMQ 新建项目

import { ok, err, handleOptions, requireAuth, requireHMQ, genId } from './_shared.js';

export async function onRequestOptions() { return handleOptions(); }

export async function onRequestGet({ request, env }) {
  let user;
  try { user = requireAuth(request, env); } catch(e) { return err(e.msg, e.status); }

  const db = env.DB;

  if (user.role === 'buyer') {
    const proj = await db.prepare('SELECT * FROM projects WHERE id=?')
      .bind(user.project_id).first();
    return ok({ projects: proj ? [proj] : [] });
  }

  const rows = await db.prepare(
    'SELECT p.*, COUNT(o.id) AS order_count FROM projects p LEFT JOIN orders o ON o.project_id=p.id GROUP BY p.id ORDER BY p.created_at DESC'
  ).all();
  return ok({ projects: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  let user;
  try { user = requireHMQ(request, env); } catch(e) { return err(e.msg, e.status); }

  let body;
  try { body = await request.json(); } catch { return err('请求体解析失败'); }

  const { name, code } = body || {};
  if (!name?.trim()) return err('项目名称不能为空');

  const db = env.DB;
  const id = genId('proj');
  await db.prepare(
    `INSERT INTO projects(id,name,code,created_at) VALUES(?,?,?,datetime('now'))`
  ).bind(id, name.trim(), code || '').run();

  return ok({ id, name: name.trim() });
}
