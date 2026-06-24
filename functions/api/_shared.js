// _shared.js — 所有 API 函数共用的工具方法
// Cloudflare Pages Functions 共享模块

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
  });
}

export function err(msg, status = 400) {
  return json({ ok: false, error: msg }, status);
}

export function ok(data = {}) {
  return json({ ok: true, ...data });
}

/** 从 Authorization: Bearer <token> 解出 userId（简单 base64 token） */
export function authUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    // token = base64(userId:username:role:projectId)
    const parts = atob(token).split(':');
    return { id: parts[0], username: parts[1], role: parts[2], project_id: parts[3] || null };
  } catch {
    return null;
  }
}

/** 要求已登录，否则返回 401 */
export function requireAuth(request, env) {
  const user = authUser(request, env);
  if (!user) throw { status: 401, msg: '未登录或 Token 已失效' };
  return user;
}

/** 要求 HMQ 或 admin 角色 */
export function requireHMQ(request, env) {
  const user = requireAuth(request, env);
  if (user.role !== 'hmq' && user.role !== 'admin') throw { status: 403, msg: '无权限：仅招采部可操作' };
  return user;
}

/** 生成简单 ID */
export function genId(prefix = 'id') {
  return prefix + '_' + Date.now() + Math.random().toString(36).slice(2, 6);
}

/** 写审计日志 */
export async function auditLog(db, userId, action, targetType, targetId, detail = {}) {
  await db.prepare(
    `INSERT INTO audit_logs(id,user_id,action,target_type,target_id,detail,created_at)
     VALUES(?,?,?,?,?,?,datetime('now'))`
  ).bind(genId('log'), userId, action, targetType, targetId, JSON.stringify(detail)).run();
}

/** CORS 预检处理 */
export function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
  });
}
