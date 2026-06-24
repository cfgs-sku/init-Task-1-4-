// functions/api/health.js
// GET /api/health → 连接测试（供旧版 CloudSyncV2 使用）

import { ok, handleOptions } from './_shared.js';

export async function onRequestOptions() { return handleOptions(); }

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare('SELECT 1 AS n').first();
    return ok({ status: 'ok', db: !!row });
  } catch (e) {
    return ok({ status: 'ok', db: false });
  }
}
