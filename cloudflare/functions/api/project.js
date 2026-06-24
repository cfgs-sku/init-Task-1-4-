// functions/api/project.js
// GET  /api/project → 拉取项目列表（旧格式）
// POST /api/project → 批量上传项目（旧版 CloudSyncV2 _pushProjects 使用）

import { ok, err, handleOptions, genId } from './_shared.js';

export async function onRequestOptions() { return handleOptions(); }

export async function onRequestGet({ env }) {
  const db = env.DB;
  try {
    const rows = await db.prepare(
      `SELECT code AS projectCode, name AS projectName, created_at
       FROM projects ORDER BY created_at DESC`
    ).all();
    return ok({ items: rows.results || [] });
  } catch (e) {
    return err('查询失败: ' + e.message, 500);
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err('请求体解析失败'); }

  const items = body?.items;
  if (!Array.isArray(items) || !items.length) return err('items 不能为空');

  const db = env.DB;
  let added = 0, updated = 0;

  for (const r of items) {
    const name = r.projectName?.trim();
    const code = r.projectCode?.trim();
    if (!name) continue;

    const existing = code
      ? await db.prepare('SELECT id FROM projects WHERE code=?').bind(code).first()
      : await db.prepare('SELECT id FROM projects WHERE name=?').bind(name).first();

    if (existing) {
      await db.prepare(
        `UPDATE projects SET name=?, code=? WHERE id=?`
      ).bind(name, code || '', existing.id).run();
      updated++;
    } else {
      await db.prepare(
        `INSERT INTO projects(id,name,code,created_at) VALUES(?,?,?,datetime('now'))`
      ).bind(genId('proj'), name, code || '').run();
      added++;
    }
  }

  return ok({ added, updated });
}
