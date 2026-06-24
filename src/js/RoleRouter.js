// RoleRouter.js — 登录门控 + 角色分发
// 职责：1) 检查 token；2) 未登录显示登录页；3) 已登录分发到对应角色视图
// ════════════════════════════════════════════════════════════════

var RoleRouter = (function () {
  'use strict';

  var API = 'https://csfw-purchase.pages.dev';
  var _user = null;          // { id, name, username, role, project_id, project }
  var _token = null;

  // ── 存取 token ────────────────────────────────────────────────
  function _saveSession(token, user) {
    _token = token;
    _user  = user;
    try {
      sessionStorage.setItem('sku25_token', token);
      sessionStorage.setItem('sku25_user',  JSON.stringify(user));
    } catch(e) {}
  }

  function _loadSession() {
    try {
      _token = sessionStorage.getItem('sku25_token') || null;
      var u  = sessionStorage.getItem('sku25_user');
      _user  = u ? JSON.parse(u) : null;
    } catch(e) { _token = null; _user = null; }
  }

  function _clearSession() {
    _token = null; _user = null;
    try { sessionStorage.removeItem('sku25_token'); sessionStorage.removeItem('sku25_user'); } catch(e) {}
  }

  // ── 带鉴权的 fetch 封装 ─────────────────────────────────────
  function apiFetch(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (_token) opts.headers['Authorization'] = 'Bearer ' + _token;
    opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
    return fetch(API + path, opts).then(function(r) { return r.json(); });
  }

  // ── 登录表单 HTML ─────────────────────────────────────────────
  function _renderLogin(errMsg) {
    var app = document.getElementById('rr-app');
    if (!app) return;
    app.innerHTML =
      '<div class="rr-login-wrap">' +
        '<div class="rr-login-box">' +
          '<div class="rr-login-logo">城服物资采购管理系统</div>' +
          '<div class="rr-login-sub">SKU25 · 多项目协同版</div>' +
          (errMsg ? '<div class="rr-login-err">' + escapeHtml(errMsg) + '</div>' : '') +
          '<div class="rr-login-field">' +
            '<label>账号</label>' +
            '<input id="rr-username" type="text" placeholder="输入账号" autocomplete="username" required>' +
          '</div>' +
          '<div class="rr-login-field">' +
            '<label>密码</label>' +
            '<input id="rr-password" type="password" placeholder="输入密码" autocomplete="current-password" required>' +
          '</div>' +
          '<button id="rr-login-btn" class="rr-login-submit">登 录</button>' +
          '<div class="rr-login-hint">采购员请联系招采部获取账号</div>' +
        '</div>' +
      '</div>';

    document.getElementById('rr-login-btn').addEventListener('click', _doLogin);
    document.getElementById('rr-password').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') _doLogin();
    });
    document.getElementById('rr-username').focus();
  }

  function _doLogin() {
    var username = (document.getElementById('rr-username').value || '').trim();
    var password = (document.getElementById('rr-password').value || '').trim();
    if (!username || !password) { _renderLogin('请输入账号和密码'); return; }

    var btn = document.getElementById('rr-login-btn');
    btn.disabled = true; btn.textContent = '登录中…';

    apiFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: username, password: password })
    }).then(function(res) {
      if (!res.ok) { _renderLogin(res.error || '账号或密码错误'); return; }
      _saveSession(res.token, res.user);
      _route();
    }).catch(function() {
      _renderLogin('网络错误，请检查连接后重试');
    });
  }

  // ── 角色分发 ──────────────────────────────────────────────────
  function _route() {
    if (!_user) { _renderLogin(); return; }

    var app = document.getElementById('rr-app');
    if (!app) return;

    // 渲染顶部导航栏（含角色标记 + 退出按钮）
    _renderNavBar();

    if (_user.role === 'hmq') {
      if (typeof HMQView !== 'undefined') HMQView.mount(app);
      else app.innerHTML = '<div style="padding:40px;color:red">HMQView 模块未加载</div>';
    } else {
      if (typeof BuyerView !== 'undefined') BuyerView.mount(app, _user);
      else app.innerHTML = '<div style="padding:40px;color:red">BuyerView 模块未加载</div>';
    }
  }

  function _renderNavBar() {
    var nav = document.getElementById('rr-navbar');
    if (!nav) return;
    var roleLabel = _user.role === 'hmq' ? '招采部' : '采购员';
    var projLabel = _user.project ? ('｜' + _user.project.name) : '';
    nav.innerHTML =
      '<div class="rr-nav-left">' +
        '<span class="rr-nav-title">城服物资采购系统</span>' +
        '<span class="rr-nav-role rr-role-' + _user.role + '">' + roleLabel + '</span>' +
        '<span class="rr-nav-proj">' + escapeHtml(projLabel) + '</span>' +
      '</div>' +
      '<div class="rr-nav-right">' +
        '<span class="rr-nav-user">👤 ' + escapeHtml(_user.name) + '</span>' +
        '<button class="rr-nav-logout" onclick="RoleRouter.logout()">退出</button>' +
      '</div>';
    nav.style.display = 'flex';
  }

  // ── 公开 API ──────────────────────────────────────────────────
  return {
    init: function () {
      _loadSession();
      _route();
    },
    logout: function () {
      _clearSession();
      var nav = document.getElementById('rr-navbar');
      if (nav) nav.style.display = 'none';
      _renderLogin();
    },
    getUser:  function () { return _user; },
    getToken: function () { return _token; },
    fetch: apiFetch   // 暴露给子视图使用
  };
})();
