// HMQView.js — 招采部（HMQ）总控台视图
// 功能：全项目订单看板 → 审批/驳回 → 归档 → 临时 SKU 转正
// ════════════════════════════════════════════════════════════════

var HMQView = (function () {
  'use strict';

  var _tab     = 'orders';    // 'orders' | 'temp_skus' | 'projects'
  var _orders  = [];
  var _tempList = [];
  var _filterStatus = '';     // '' = 全部

  // ── 挂载 ─────────────────────────────────────────────────────
  function mount(container) {
    container.innerHTML =
      '<style>' + _css() + '</style>' +
      '<div class="hmq-wrap">' +
        '<div class="hmq-sidebar">' +
          _sidebarNav() +
        '</div>' +
        '<div class="hmq-main" id="hmq-main"></div>' +
      '</div>' +
      _promoteModal();

    _bindNav();
    _showTab(_tab);
  }

  // ── 侧边栏 ────────────────────────────────────────────────────
  function _sidebarNav() {
    return [
      ['orders',   '📋 采购订单总览'],
      ['temp_skus','🟡 临时 SKU 审核'],
      ['projects', '🏗️ 项目管理'],
    ].map(function(item) {
      return '<div class="hmq-nav-item' + (_tab===item[0]?' on':'') + '" data-tab="' + item[0] + '">' + item[1] + '</div>';
    }).join('');
  }

  function _bindNav() {
    document.querySelectorAll('.hmq-nav-item').forEach(function(el) {
      el.addEventListener('click', function() { _showTab(el.dataset.tab); });
    });
  }

  function _showTab(tab) {
    _tab = tab;
    document.querySelectorAll('.hmq-nav-item').forEach(function(el) {
      el.classList.toggle('on', el.dataset.tab === tab);
    });
    var main = document.getElementById('hmq-main');
    if (!main) return;
    if (tab === 'orders')    _renderOrders(main);
    if (tab === 'temp_skus') _renderTempSkus(main);
    if (tab === 'projects')  _renderProjects(main);
  }

  // ── 1. 采购订单总览 ───────────────────────────────────────────
  function _renderOrders(el) {
    el.innerHTML =
      '<div class="hmq-panel">' +
        '<div class="hmq-panel-hd">' +
          '全项目采购订单' +
          '<div class="hmq-filter" id="hmq-filter">' + _filterTabs() + '</div>' +
          '<button class="hmq-btn hmq-btn-xs" onclick="HMQView._refreshOrders()">🔄 刷新</button>' +
        '</div>' +
        '<div id="hmq-orders-body" class="hmq-loading">加载中…</div>' +
      '</div>';

    _bindFilterTabs();
    _refreshOrders();
  }

  function _filterTabs() {
    return [
      ['', '全部'],
      ['pending_review', '🟡 待审核'],
      ['purchasing',     '🔵 采购中'],
      ['received',       '🟢 已收货'],
      ['archived',       '⚫ 已归档'],
      ['rejected',       '🔴 已驳回'],
    ].map(function(f) {
      return '<span class="hmq-ftab' + (_filterStatus===f[0]?' on':'') + '" data-s="' + f[0] + '">' + f[1] + '</span>';
    }).join('');
  }

  function _bindFilterTabs() {
    document.querySelectorAll('.hmq-ftab').forEach(function(el) {
      el.addEventListener('click', function() {
        _filterStatus = el.dataset.s;
        document.querySelectorAll('.hmq-ftab').forEach(function(t){ t.classList.toggle('on', t.dataset.s === _filterStatus); });
        _refreshOrders();
      });
    });
  }

  function _refreshOrders() {
    var body = document.getElementById('hmq-orders-body');
    if (body) body.innerHTML = '<div class="hmq-loading">加载中…</div>';

    var qs = _filterStatus ? '?status=' + _filterStatus : '';
    RoleRouter.fetch('/api/orders' + qs)
      .then(function(res) {
        _orders = res.ok ? (res.orders || []) : [];
        if (body) body.innerHTML = _ordersHTML();
      })
      .catch(function() { if (body) body.innerHTML = '<div class="hmq-err">加载失败</div>'; });
  }

  function _ordersHTML() {
    if (!_orders.length) return '<div class="hmq-empty">暂无订单</div>';
    return '<div class="hmq-card-list">' + _orders.map(function(ord) {
      var actions   = OrderStatusTag.getActions(ord.status, 'hmq');
      var items     = ord.items || [];
      var tempCount = items.filter(function(it){ return it.is_temp; }).length;
      var total     = items.reduce(function(s, it){
        return s + (parseFloat(it.est_price) || 0) * (parseInt(it.qty) || 1);
      }, 0);

      return '<div class="hmq-card">' +
        // ── 卡片头 ──
        '<div class="hmq-card-hd">' +
          '<span class="hmq-card-proj">📁 ' + escapeHtml(ord.project_name || '') + '</span>' +
          OrderStatusTag.render(ord.status) +
          (tempCount ? '<span class="hmq-temp-hint">含 ' + tempCount + ' 项临时非标</span>' : '') +
          '<span class="hmq-card-total">合计 ¥' + total.toFixed(2) + '</span>' +
        '</div>' +
        // ── 元信息 ──
        '<div class="hmq-card-meta">' +
          '<span>📋 <code>' + escapeHtml(ord.id) + '</code></span>' +
          '<span>👤 ' + escapeHtml(ord.submitter_name || '') + '</span>' +
          '<span>🕐 ' + (ord.created_at || '').replace('T',' ').slice(0,16) + '</span>' +
          (ord.remark ? '<span>💬 ' + escapeHtml(ord.remark) + '</span>' : '') +
          (ord.reject_reason ? '<span class="hmq-reject">驳回原因：' + escapeHtml(ord.reject_reason) + '</span>' : '') +
        '</div>' +
        // ── 明细表格 ──
        '<div class="hmq-items-wrap">' +
          '<table class="hmq-items-table">' +
            '<thead><tr>' +
              '<th>#</th><th>物资名称</th><th>规格</th><th>品牌</th>' +
              '<th>单位</th><th>数量</th><th>单价(¥)</th><th>小计(¥)</th><th>采购链接</th><th>标识</th>' +
            '</tr></thead>' +
            '<tbody>' +
            items.map(function(it, i) {
              var price = parseFloat(it.est_price) || 0;
              var qty   = parseInt(it.qty) || 1;
              var url   = it.purchase_url || '';
              return '<tr' + (it.is_temp ? ' class="hmq-row-temp"' : '') + '>' +
                '<td>' + (i + 1) + '</td>' +
                '<td class="hmq-td-name"><strong>' + escapeHtml(it.sku_name || '') + '</strong>' +
                  (it.sku_code ? '<br><span class="hmq-sku-code">' + escapeHtml(it.sku_code) + '</span>' : '') +
                '</td>' +
                '<td>' + escapeHtml(it.spec  || '—') + '</td>' +
                '<td>' + escapeHtml(it.brand || '—') + '</td>' +
                '<td>' + escapeHtml(it.unit  || '—') + '</td>' +
                '<td class="hmq-td-num">' + qty + '</td>' +
                '<td class="hmq-td-num">' + (price ? price.toFixed(2) : '—') + '</td>' +
                '<td class="hmq-td-num hmq-td-sub">' + (price ? (price * qty).toFixed(2) : '—') + '</td>' +
                '<td>' + (url ? '<a href="' + escapeHtml(url) + '" target="_blank" class="hmq-buy-link">🛒 购买</a>' : '—') + '</td>' +
                '<td>' + OrderStatusTag.tempBadge(it.is_temp) + '</td>' +
              '</tr>';
            }).join('') +
            '</tbody>' +
            '<tfoot><tr>' +
              '<td colspan="8" class="hmq-tfoot-label">合计</td>' +
              '<td class="hmq-td-num hmq-tfoot-total">¥' + total.toFixed(2) + '</td>' +
              '<td></td>' +
            '</tr></tfoot>' +
          '</table>' +
        '</div>' +
        // ── 操作按钮 ──
        '<div class="hmq-card-foot">' +
          actions.map(function(a) {
            return '<button class="hmq-btn hmq-btn-' + a.cls.replace('btn-','') +
              '" onclick="HMQView._orderAction(\'' + ord.id + '\',\'' + a.action + '\',' +
              (a.needReason||false) + ')">' + a.label + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function _orderAction(ordId, action, needReason) {
    var reason = '';
    if (needReason) { reason = prompt('驳回原因（必填）：'); if (!reason?.trim()) return; }
    if (!confirm('确认执行「' + action + '」操作？')) return;

    RoleRouter.fetch('/api/orders/' + ordId + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ action: action, reject_reason: reason })
    }).then(function(res) {
      if (!res.ok) { alert('操作失败: ' + (res.error || '')); return; }

      // 归档且含临时 SKU → 弹转正提示
      if (action === 'archive' && res.has_temp_skus) {
        _showPromoteHint(ordId);
      } else {
        alert('操作成功 → 新状态：' + res.new_status);
      }
      _refreshOrders();
    }).catch(function() { alert('网络错误'); });
  }

  // ── 2. 临时 SKU 审核 Tab ──────────────────────────────────────
  function _renderTempSkus(el) {
    el.innerHTML =
      '<div class="hmq-panel">' +
        '<div class="hmq-panel-hd">临时 SKU 审核池 <button class="hmq-btn hmq-btn-xs" onclick="HMQView._refreshTemp()">🔄 刷新</button></div>' +
        '<div id="hmq-temp-body" class="hmq-loading">加载中…</div>' +
      '</div>';
    _refreshTemp();
  }

  function _refreshTemp() {
    var body = document.getElementById('hmq-temp-body');
    if (body) body.innerHTML = '<div class="hmq-loading">加载中…</div>';

    RoleRouter.fetch('/api/temp-skus?status=pending')
      .then(function(res) {
        _tempList = res.ok ? (res.list || []) : [];
        if (body) body.innerHTML = _tempHTML();
      })
      .catch(function() { if (body) body.innerHTML = '<div class="hmq-err">加载失败</div>'; });
  }

  function _tempHTML() {
    if (!_tempList.length) return '<div class="hmq-empty">暂无待审核临时物资</div>';
    return '<div class="hmq-card-list">' + _tempList.map(function(t) {
      return '<div class="hmq-card">' +
        '<div class="hmq-card-hd">' +
          '<span class="hmq-card-proj">📁 ' + escapeHtml(t.project_name || '') + '</span>' +
          OrderStatusTag.renderTemp(t.status) +
          '<span class="hmq-tmp-code">' + escapeHtml(t.temp_code) + '</span>' +
        '</div>' +
        '<div class="hmq-card-meta">' +
          '<span>物资：<strong>' + escapeHtml(t.name) + '</strong></span>' +
          '<span>规格：' + escapeHtml(t.spec || '') + '</span>' +
          '<span>单位：' + escapeHtml(t.unit || '') + '</span>' +
          '<span>预估价：¥' + (parseFloat(t.est_price) || 0).toFixed(2) + '</span>' +
          (t.brand ? '<span>品牌：' + escapeHtml(t.brand) + '</span>' : '') +
          '<span>提报人：' + escapeHtml(t.creator_name || '') + '</span>' +
          '<span>提报时间：' + t.created_at + '</span>' +
        '</div>' +
        (t.purchase_link ? '<div class="hmq-remark"><a href="' + escapeHtml(t.purchase_link) + '" target="_blank" class="hmq-link">🔗 采购参考链接</a></div>' : '') +
        (t.remark ? '<div class="hmq-remark">备注：' + escapeHtml(t.remark) + '</div>' : '') +
        '<div class="hmq-card-foot">' +
          '<button class="hmq-btn hmq-btn-green" onclick="HMQView._promoteTemp(\'' + t.id + '\',\'' + escapeHtml(t.temp_code) + '\',\'' + escapeHtml(t.name) + '\')">✅ 转正为标准 SKU</button>' +
          '<button class="hmq-btn hmq-btn-red"   onclick="HMQView._rejectTemp(\'' + t.id + '\')">❌ 驳回</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  // ── 转正弹窗 ─────────────────────────────────────────────────
  function _promoteModal() {
    return '<div id="hmq-promote-modal" class="hmq-modal-overlay" style="display:none">' +
      '<div class="hmq-modal-box">' +
        '<div class="hmq-modal-hd">临时 SKU 转正 <button class="hmq-modal-close" onclick="HMQView._closePromote()">✕</button></div>' +
        '<div class="hmq-modal-body">' +
          '<div class="hmq-promote-info" id="hmq-promote-info"></div>' +
          '<div class="hmq-field">' +
            '<label>分配标准 SKU 编码（可修改自动生成的）</label>' +
            '<input id="hmq-promote-code" class="hmq-input" type="text" placeholder="如：SKU-2026-00123">' +
          '</div>' +
        '</div>' +
        '<div class="hmq-modal-foot">' +
          '<button class="hmq-btn hmq-btn-gray" onclick="HMQView._closePromote()">取消</button>' +
          '<button class="hmq-btn hmq-btn-green" onclick="HMQView._confirmPromote()">✅ 确认转正</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  var _promotingId = null;
  function _promoteTemp(id, tempCode, name) {
    _promotingId = id;
    var info = document.getElementById('hmq-promote-info');
    if (info) info.innerHTML = '<p>将「<strong>' + escapeHtml(name) + '</strong>」（' + escapeHtml(tempCode) + '）转正为全局标准物资，所有项目采购员将可搜索复购。</p>';
    var codeInput = document.getElementById('hmq-promote-code');
    if (codeInput) codeInput.value = tempCode.replace('TEMP-', 'SKU-');
    var modal = document.getElementById('hmq-promote-modal');
    if (modal) modal.style.display = 'flex';
  }

  function _closePromote() {
    var modal = document.getElementById('hmq-promote-modal');
    if (modal) modal.style.display = 'none';
    _promotingId = null;
  }

  function _confirmPromote() {
    if (!_promotingId) return;
    var stdCode = (document.getElementById('hmq-promote-code')?.value || '').trim();
    if (!stdCode) { alert('请填写标准 SKU 编码'); return; }

    RoleRouter.fetch('/api/temp-skus/' + _promotingId + '/promote', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'approve', std_sku_code: stdCode })
    }).then(function(res) {
      if (!res.ok) { alert('转正失败: ' + (res.error || '')); return; }
      alert('✅ 转正成功！标准编码：' + stdCode);
      _closePromote();
      _refreshTemp();
    }).catch(function() { alert('网络错误'); });
  }

  function _rejectTemp(id) {
    if (!confirm('确认驳回该临时 SKU？')) return;
    RoleRouter.fetch('/api/temp-skus/' + id + '/promote', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reject' })
    }).then(function(res) {
      if (!res.ok) { alert('驳回失败: ' + (res.error||'')); return; }
      alert('已驳回');
      _refreshTemp();
    }).catch(function() { alert('网络错误'); });
  }

  // 归档含临时 SKU 订单时，提示进入转正审核
  function _showPromoteHint(ordId) {
    if (confirm('✅ 归档成功！\n\n该订单包含临时非标物资，是否前往「临时 SKU 审核」将其转正？')) {
      _showTab('temp_skus');
    }
  }

  // ── 3. 项目管理 Tab ───────────────────────────────────────────
  function _renderProjects(el) {
    el.innerHTML =
      '<div class="hmq-panel">' +
        '<div class="hmq-panel-hd">' +
          '项目管理' +
          '<button class="hmq-btn hmq-btn-primary" onclick="HMQView._showAddProject()">＋ 新建项目</button>' +
        '</div>' +
        '<div id="hmq-add-proj" style="display:none;padding:16px 20px;border-bottom:1px solid #f1f5f9">' +
          '<div style="display:flex;gap:8px;align-items:center">' +
            '<input id="hmq-proj-name" class="hmq-input" style="flex:1" placeholder="项目名称 *">' +
            '<input id="hmq-proj-code" class="hmq-input" style="width:120px" placeholder="项目编号（选填）">' +
            '<button class="hmq-btn hmq-btn-primary" onclick="HMQView._addProject()">确认新建</button>' +
            '<button class="hmq-btn hmq-btn-gray"    onclick="HMQView._hideAddProject()">取消</button>' +
          '</div>' +
        '</div>' +
        '<div id="hmq-proj-body" class="hmq-loading">加载中…</div>' +
      '</div>';

    RoleRouter.fetch('/api/projects')
      .then(function(res) {
        var body = document.getElementById('hmq-proj-body');
        if (!body) return;
        var list = res.ok ? (res.projects || []) : [];
        if (!list.length) { body.innerHTML = '<div class="hmq-empty">暂无项目</div>'; return; }
        body.innerHTML = '<table class="hmq-table"><thead><tr><th>项目名称</th><th>编号</th><th>订单数</th><th>创建时间</th></tr></thead><tbody>' +
          list.map(function(p) {
            return '<tr><td>' + escapeHtml(p.name) + '</td><td>' + escapeHtml(p.code||'') +
              '</td><td>' + (p.order_count||0) + '</td><td>' + p.created_at + '</td></tr>';
          }).join('') + '</tbody></table>';
      }).catch(function() { var b = document.getElementById('hmq-proj-body'); if(b) b.innerHTML='<div class="hmq-err">加载失败</div>'; });
  }

  function _showAddProject() { var el=document.getElementById('hmq-add-proj'); if(el) el.style.display=''; document.getElementById('hmq-proj-name')?.focus(); }
  function _hideAddProject() { var el=document.getElementById('hmq-add-proj'); if(el) el.style.display='none'; }

  function _addProject() {
    var name = (document.getElementById('hmq-proj-name')?.value || '').trim();
    var code = (document.getElementById('hmq-proj-code')?.value || '').trim();
    if (!name) { alert('项目名称不能为空'); return; }
    RoleRouter.fetch('/api/projects', { method:'POST', body: JSON.stringify({ name, code }) })
      .then(function(res) {
        if (!res.ok) { alert('创建失败: ' + (res.error||'')); return; }
        alert('项目「' + name + '」已创建');
        _hideAddProject();
        _renderProjects(document.getElementById('hmq-main'));
      }).catch(function() { alert('网络错误'); });
  }

  // ── CSS ───────────────────────────────────────────────────────
  function _css() {
    return [
      OrderStatusTag.css,
      '.hmq-wrap{display:flex;height:calc(100vh - 52px);overflow:hidden}',
      '.hmq-sidebar{width:190px;flex-shrink:0;background:#0f172a;padding:16px 0;display:flex;flex-direction:column;gap:2px}',
      '.hmq-nav-item{padding:11px 20px;color:#94a3b8;cursor:pointer;font-size:13px;transition:.1s}',
      '.hmq-nav-item:hover,.hmq-nav-item.on{background:#1e293b;color:#f1f5f9}',
      '.hmq-main{flex:1;overflow-y:auto;background:#f1f5f9;padding:24px}',
      '.hmq-panel{background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.08)}',
      '.hmq-panel-hd{padding:16px 20px;font-weight:700;font-size:15px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.hmq-filter{display:flex;gap:4px;flex:1;flex-wrap:wrap}',
      '.hmq-ftab{padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;color:#64748b;background:#f1f5f9;white-space:nowrap}',
      '.hmq-ftab:hover,.hmq-ftab.on{background:#1e293b;color:#f1f5f9}',
      '.hmq-card-list{padding:16px;display:flex;flex-direction:column;gap:12px}',
      '.hmq-card{border:1px solid #e2e8f0;border-radius:8px;padding:14px;background:#fff}',
      '.hmq-card-hd{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}',
      '.hmq-card-proj{font-weight:700;color:#0f172a}',
      '.hmq-tmp-code{font-size:12px;color:#7c3aed;font-family:monospace;background:#f5f3ff;padding:1px 6px;border-radius:4px}',
      '.hmq-temp-hint{font-size:12px;color:#7A5200;background:#FEF6E2;padding:2px 8px;border-radius:4px;border:1px solid #EAC860}',
      '.hmq-card-meta{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:#64748b;margin-bottom:8px}',
      '.hmq-card-meta strong{color:#0f172a}',
      '.hmq-card-total{margin-left:auto;font-size:13px;font-weight:700;color:#1e40af;background:#eff6ff;padding:2px 10px;border-radius:4px}',
      '.hmq-card-meta code{font-size:11px;color:#94a3b8;font-family:monospace}',
      '.hmq-items-wrap{overflow-x:auto;margin-bottom:10px;border:1px solid #e2e8f0;border-radius:6px}',
      '.hmq-items-table{width:100%;border-collapse:collapse;font-size:12px}',
      '.hmq-items-table th{background:#f8fafc;font-weight:600;color:#374151;padding:7px 10px;text-align:left;white-space:nowrap;border-bottom:1px solid #e2e8f0}',
      '.hmq-items-table td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top}',
      '.hmq-items-table tbody tr:last-child td{border-bottom:none}',
      '.hmq-items-table tfoot td{border-top:2px solid #e2e8f0;font-weight:700;background:#f8fafc;padding:7px 10px}',
      '.hmq-td-name{min-width:120px}',
      '.hmq-td-num{text-align:right;white-space:nowrap}',
      '.hmq-td-sub{color:#1e40af}',
      '.hmq-tfoot-label{text-align:right;color:#374151}',
      '.hmq-tfoot-total{color:#1e40af;font-size:13px}',
      '.hmq-row-temp{background:#fffbeb}',
      '.hmq-sku-code{font-size:10px;color:#94a3b8;font-family:monospace}',
      '.hmq-buy-link{color:#2563eb;text-decoration:none;font-size:12px;white-space:nowrap}.hmq-buy-link:hover{text-decoration:underline}',
      '.hmq-remark{font-size:12px;color:#64748b;margin-bottom:8px}',
      '.hmq-link{color:#2563eb;text-decoration:underline}',
      '.hmq-reject{font-size:12px;color:#9E251C;background:#FEF0EE;padding:2px 8px;border-radius:4px}',
      '.hmq-card-foot{display:flex;gap:8px;flex-wrap:wrap}',
      '.hmq-btn{padding:7px 14px;border-radius:6px;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:.12s;white-space:nowrap}',
      '.hmq-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.hmq-btn-primary{background:#2563eb;color:#fff}.hmq-btn-green{background:#16a34a;color:#fff}',
      '.hmq-btn-red{background:#dc2626;color:#fff}.hmq-btn-gray{background:#e5e7eb;color:#374151}',
      '.hmq-btn-xs{padding:3px 9px;font-size:12px}.hmq-btn-blue{background:#0284c7;color:#fff}',
      '.hmq-btn-amber{background:#d97706;color:#fff}',
      '.hmq-table{width:100%;border-collapse:collapse;font-size:13px}',
      '.hmq-table th,.hmq-table td{padding:10px 20px;border-bottom:1px solid #f1f5f9;text-align:left}',
      '.hmq-table th{background:#f8fafc;font-weight:600;color:#374151}',
      '.hmq-field{margin-bottom:12px}',
      '.hmq-field label{display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#374151}',
      '.hmq-input{padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;outline:none}',
      '.hmq-input:focus{border-color:#3b82f6}',
      '.hmq-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:center;justify-content:center}',
      '.hmq-modal-box{background:#fff;border-radius:12px;width:480px;max-width:95vw}',
      '.hmq-modal-hd{padding:16px 20px;font-weight:700;font-size:15px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center}',
      '.hmq-modal-close{border:none;background:none;cursor:pointer;font-size:18px;color:#94a3b8}',
      '.hmq-modal-body{padding:20px}',
      '.hmq-promote-info{font-size:13px;color:#374151;margin-bottom:16px;line-height:1.7;padding:12px;background:#f0fdf4;border-radius:6px;border:1px solid #a0d4ac}',
      '.hmq-modal-foot{padding:14px 20px;border-top:1px solid #f1f5f9;display:flex;gap:8px;justify-content:flex-end}',
      '.hmq-loading{padding:40px;text-align:center;color:#94a3b8}',
      '.hmq-empty{padding:40px;text-align:center;color:#94a3b8}',
      '.hmq-err{padding:24px;color:#dc2626;text-align:center}',
    ].join('');
  }

  // ── 公开 API ──────────────────────────────────────────────────
  return {
    mount:           mount,
    _refreshOrders:  _refreshOrders,
    _orderAction:    _orderAction,
    _refreshTemp:    _refreshTemp,
    _promoteTemp:    _promoteTemp,
    _rejectTemp:     _rejectTemp,
    _closePromote:   _closePromote,
    _confirmPromote: _confirmPromote,
    _showAddProject: _showAddProject,
    _hideAddProject: _hideAddProject,
    _addProject:     _addProject,
  };
})();
