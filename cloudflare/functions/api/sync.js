// functions/api/sync.js
// GET /api/sync → 全量拉取（供旧版 CloudSyncV2 使用）
// 返回 {ok, skuList, tempList, projects}

import { ok, err, handleOptions } from './_shared.js';

export async function onRequestOptions() { return handleOptions(); }

export async function onRequestGet({ env }) {
  const db = env.DB;
  try {
    // 标准物资库
    const skuRows = await db.prepare(
      `SELECT code, name, spec, unit, brand, category AS cat,
              last_price, is_temporary, project_id
       FROM sku_library
       WHERE is_temporary = 0
       ORDER BY name ASC
       LIMIT 5000`
    ).all();

    // 临时物资
    const tempRows = await db.prepare(
      `SELECT code AS sku, name, spec, unit, brand, category AS cat,
              last_price AS est_price, project_id, 'synced' AS syncStatus
       FROM sku_library
       WHERE is_temporary = 1
       ORDER BY updated_at DESC
       LIMIT 1000`
    ).all();

    // 项目列表
    const projRows = await db.prepare(
      `SELECT id, name AS projectName, code AS projectCode, created_at
       FROM projects
       ORDER BY created_at DESC`
    ).all();

    return ok({
      skuList:  skuRows.results  || [],
      tempList: tempRows.results || [],
      projects: projRows.results || [],
    });
  } catch (e) {
    return err('sync 查询失败: ' + e.message, 500);
  }
}
