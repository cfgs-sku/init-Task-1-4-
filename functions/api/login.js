// functions/api/login.js
// POST /api/login  →  { username, password }  →  { ok, token, user }
// GET  /api/login  →  返回当前登录用户信息（需 Authorization 头）

import { ok, err, handleOptions, authUser, genId } from './_shared.js';

export async function onRequestOptions() { return handleOptions(); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err('请求体解析失败'); }

  const { username, password } = body || {};
  if (!username || !password) return err('缺少账号或密码');

  const db = env.DB;
  const user = await db.prepare(
    'SELECT id,name,username,role,project_id FROM users WHERE username=? AND password=?'
  ).bind(username.trim(), password).first();

  if (!user) return err('账号或密码错误', 401);

  // 生成简单 token = base64(id:username:role:projectId)
  const tokenPayload = [user.id, user.username, user.role, user.project_id || ''].join(':');
  const token = btoa(tokenPayload);

  // 若有项目，附带项目信息
  let project = null;
  if (user.project_id) {
    project = await db.prepare('SELECT id,name,code FROM projects WHERE id=?')
      .bind(user.project_id).first();
  }

  return ok({ token, user: { ...user, project } });
}

export async function onRequestGet({ request, env }) {
  const u = authUser(request, env);
  if (!u) return err('未登录', 401);

  const db = env.DB;
  const user = await db.prepare(
    'SELECT id,name,username,role,project_id FROM users WHERE id=?'
  ).bind(u.id).first();

  if (!user) return err('用户不存在', 404);

  let project = null;
  if (user.project_id) {
    project = await db.prepare('SELECT id,name,code FROM projects WHERE id=?')
      .bind(user.project_id).first();
  }

  return ok({ user: { ...user, project } });
}
