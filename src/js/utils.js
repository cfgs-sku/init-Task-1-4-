// utils.js — 全局工具函数（Task 4：安全防护 + 异步锁）
// 必须在所有业务模块之前加载
// ═══════════════════════════════════════════════════════════

// ── XSS 防护 ─────────────────────────────────────────────
/**
 * 转义 HTML 特殊字符，防止 XSS
 * 用于所有 innerHTML 动态内容
 */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

// ── 异步操作锁（云端写入防重复提交） ──────────────────────
/**
 * 云同步期间禁用关键按钮，操作完成后自动恢复
 *
 * 用法：
 *   var unlock = syncLock(['btn-save-db', 'btn-archive', 'btn-clear-cart']);
 *   doCloudSync().finally(function(){ unlock(); });
 */
function syncLock(buttonIds) {
  var buttons = [];
  (buttonIds || []).forEach(function(id) {
    var el = document.getElementById(id);
    if (el && !el.disabled) {
      el.disabled = true;
      el._syncLocked = true;
      buttons.push(el);
    }
  });
  // 也可以传 HTMLElement 数组
  if (buttonIds && buttonIds[0] instanceof HTMLElement) {
    buttonIds.forEach(function(el) {
      if (!el.disabled) { el.disabled = true; el._syncLocked = true; buttons.push(el); }
    });
  }
  return function unlock() {
    buttons.forEach(function(el) { el.disabled = false; el._syncLocked = false; });
  };
}

// ── 地址自动回填（Task 4：Excel 导出时根据当前项目填充收货信息） ─
/**
 * 从 pc22_addresses 取当前项目的收货地址
 * @param {string} projectId — 采购中心项目 ID
 * @returns {{name:string, addr:string, phone:string}|null}
 */
function getProjectAddress(projectId) {
  if (!projectId) return null;
  try {
    var raw = localStorage.getItem('pc22_addresses');
    if (!raw) return null;
    var map = JSON.parse(raw);
    return map[projectId] || null;
  } catch(e) { return null; }
}
