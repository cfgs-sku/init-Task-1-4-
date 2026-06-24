// BuyerView.js — 采购员端完整视图
// 流程：项目锁定 → 选品（标准库/历史Tab）→ 购物车 → 提交申请 → 我的订单 → 确认收货
// ════════════════════════════════════════════════════════════════

var BuyerView = (function () {
  'use strict';

  var _user    = null;
  var _cart    = [];     // { sku_code, sku_name, brand, spec, unit, qty, est_price, is_temp }
  var _orders  = [];
  var _tab     = 'search'; // 'search' | 'history' | 'cart' | 'orders'

  // ── 挂载入口 ─────────────────────────────────────────────────
  function mount(container, user) {
    _user = user;
    _cart = [];
    _render(container);
    _loadOrders();
  }

  // ── 整体框架 ──────────────────────────────────────────────────
  function _render(container) {
    container.innerHTML =
      '<style>' + _css() + '</style>' +
      '<div class="bv-wrap">' +
        '<div class="bv-sidebar">' +
          _sidebarNav() +
        '</div>' +
        '<div class="bv-main" id="bv-main"></div>' +
      '</div>';

    _bindSidebarNav();
    _showTab(_tab);
  }

  function _sidebarNav() {
    return [
      ['search',  '🔍 选品（标准库）'],
      ['history', '📋 项目历史'],
      ['cart',    '🛒 购物车'],
      ['orders',  '📦 我的订单'],
    ].map(function(item) {
      return '<div class="bv-nav-item' + (_tab === item[0] ? ' on' : '') +
             '" data-tab="' + item[0] + '">' + item[1] +
             (item[0] === 'cart' ? ' <span class="bv-cart-badge" id="bv-cart-cnt">' + _cart.length + '</span>' : '') +
             '</div>';
    }).join('');
  }

  function _bindSidebarNav() {
    document.querySelectorAll('.bv-nav-item').forEach(function(el) {
      el.addEventListener('click', function() { _showTab(el.dataset.tab); });
    });
  }

  function _showTab(tab) {
    _tab = tab;
    document.querySelectorAll('.bv-nav-item').forEach(function(el) {
      el.classList.toggle('on', el.dataset.tab === tab);
    });
    var main = document.getElementById('bv-main');
    if (!main) return;
    if (tab === 'search')  _renderSearch(main);
    if (tab === 'history') _renderHistory(main);
    if (tab === 'cart')    _renderCart(main);
    if (tab === 'orders')  _renderOrders(main);
  }

  // ── 1. 标准库搜索 Tab ─────────────────────────────────────────
  function _renderSearch(el) {
    el.innerHTML =
      '<div class="bv-panel">' +
        '<div class="bv-panel-hd">物资标准库</div>' +
        '<div class="bv-search-bar">' +
          '<input id="bv-q" class="bv-input" placeholder="搜索物资名称 / 编码 / 规格…" oninput="BuyerView._onSearch()">' +
        '</div>' +
        '<div id="bv-sku-list" class="bv-sku-list">输入关键词开始搜索</div>' +
        '<div class="bv-panel-foot">' +
          '<button class="bv-btn bv-btn-amber" onclick="BuyerView._openTempModal()">＋ 找不到？添加临时非标物资</button>' +
        '</div>' +
      '</div>' +
      _tempSkuModal();
  }

  var _searchTimer = null;
  function _onSearch() {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(function() {
      var q = (document.getElementById('bv-q')?.value || '').trim();
      if (!q) { document.getElementById('bv-sku-list').innerHTML = '输入关键词开始搜索'; return; }
      _doSearch(q);
    }, 300);
  }

  function _doSearch(q) {
    var el = document.getElementById('bv-sku-list');
    el.innerHTML = '<div class="bv-loading">搜索中…</div>';

    // 优先走 API 查 D1 数据库，降级为本地 DB 搜索
    if (typeof RoleRouter !== 'undefined') {
      RoleRouter.fetch('/api/skus?type=library&q=' + encodeURIComponent(q) +
                       '&project_id=' + encodeURIComponent((_user && _user.project_id) || '') +
                       '&page_size=30')
        .then(function(res) {
          var list = (res.ok && res.skus) ? res.skus : [];
          _renderSkuList(el, list, q);
        })
        .catch(function() { _doSearchLocal(el, q); });
    } else {
      _doSearchLocal(el, q);
    }
  }

  // 降级：搜本地 DB 全局变量（兼容旧版离线数据）
  function _doSearchLocal(el, q) {
    var results = [];
    if (typeof DB !== 'undefined' && Array.isArray(DB)) {
      var qn = q.toLowerCase();
      for (var i = 0; i < DB.length && results.length < 30; i++) {
        var r = DB[i];
        if ((r.name && r.name.toLowerCase().indexOf(qn) >= 0) ||
            (r.code && r.code.toLowerCase().indexOf(qn) >= 0) ||
            (r.spec && r.spec.toLowerCase().indexOf(qn) >= 0)) {
          results.push(r);
        }
      }
    }
    _renderSkuList(el, results, q);
  }

  function _renderSkuList(el, results, q) {
    if (!results.length) {
      el.innerHTML = '<div class="bv-empty">未找到「' + escapeHtml(q) + '」相关物资<br><small>可点击下方按钮添加临时非标</small></div>';
      return;
    }
    el.innerHTML = results.map(function(r) {
      var name = r.name || r.sku_name || '';
      var code = r.code || r.sku_code || '';
      var spec = r.spec || '';
      var brand = r.brand || '';
      var unit = r.unit || '';
      return '<div class="bv-sku-row">' +
        '<div class="bv-sku-info">' +
          '<div class="bv-sku-name">' + escapeHtml(name) + ' <span class="bv-sku-code">' + escapeHtml(code) + '</span></div>' +
          '<div class="bv-sku-meta">' + escapeHtml(spec) + (brand ? ' · ' + escapeHtml(brand) : '') + (unit ? ' · ' + escapeHtml(unit) : '') + '</div>' +
        '</div>' +
        '<button class="bv-btn bv-btn-sm bv-btn-primary" onclick="BuyerView._addToCart(' +
          JSON.stringify({code:code,name:name,brand:brand,spec:spec,unit:unit,est_price:r.last_price||r.est_price||0}).replace(/"/g,'&quot;') +
        ')">加入购物车</button>' +
      '</div>';
    }).join('');
  }

  // ── 临时 SKU 弹窗 ─────────────────────────────────────────────
  function _tempSkuModal() {
    return '<div id="bv-tmp-modal" class="bv-modal-overlay" style="display:none">' +
      '<div class="bv-modal-box">' +
        '<div class="bv-modal-hd">添加临时非标物资 <button class="bv-modal-close" onclick="BuyerView._closeTempModal()">✕</button></div>' +
        '<div class="bv-modal-body">' +
          _field('bv-tmp-name',   '物资名称 *',   'text',   '必填，如：防锈漆') +
          _field('bv-tmp-spec',   '规格型号 *',   'text',   '必填，如：500g/桶 红色') +
          _field('bv-tmp-unit',   '单位 *',       'text',   '必填，如：桶') +
          _field('bv-tmp-price',  '预计单价（元）*', 'number', '必填') +
          _field('bv-tmp-brand',  '参考品牌',     'text',   '选填') +
          _field('bv-tmp-qty',    '数量',         'number', '默认 1', '1') +
          _field('bv-tmp-link',   '采购参考链接', 'text',   '选填，震坤行/京东链接') +
          _field('bv-tmp-remark', '备注说明',     'text',   '选填') +
        '</div>' +
        '<div class="bv-modal-foot">' +
          '<button class="bv-btn bv-btn-gray" onclick="BuyerView._closeTempModal()">取消</button>' +
          '<button class="bv-btn bv-btn-primary" onclick="BuyerView._submitTemp()">提交临时物资</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function _field(id, label, type, placeholder, defVal) {
    return '<div class="bv-field">' +
      '<label>' + label + '</label>' +
      '<input id="' + id + '" class="bv-input" type="' + type + '" placeholder="' + placeholder + '"' +
      (defVal ? ' value="' + defVal + '"' : '') + '>' +
    '</div>';
  }

  function _openTempModal()  { var m = document.getElementById('bv-tmp-modal'); if(m) m.style.display='flex'; }
  function _closeTempModal() { var m = document.getElementById('bv-tmp-modal'); if(m) m.style.display='none'; }

  function _submitTemp() {
    var get = function(id) { return (document.getElementById(id)?.value || '').trim(); };
    var body = {
      name:      get('bv-tmp-name'),
      spec:      get('bv-tmp-spec'),
      unit:      get('bv-tmp-unit'),
      est_price: parseFloat(get('bv-tmp-price')) || 0,
      brand:     get('bv-tmp-brand'),
      purchase_link: get('bv-tmp-link'),
      remark:    get('bv-tmp-remark'),
    };

    // 前端必填校验
    if (!body.name)      { alert('请填写物资名称');   return; }
    if (!body.spec)      { alert('请填写规格型号');   return; }
    if (!body.unit)      { alert('请填写单位');       return; }
    if (!body.est_price) { alert('请填写预计单价');   return; }

    RoleRouter.fetch('/api/temp-skus', { method: 'POST', body: JSON.stringify(body) })
      .then(function(res) {
        if (!res.ok) { alert('提交失败: ' + (res.error || '未知错误')); return; }
        // 同时加入购物车
        var qty = parseInt(document.getElementById('bv-tmp-qty')?.value) || 1;
        _addToCartItem({
          sku_code: res.temp_code, sku_name: body.name, brand: body.brand,
          spec: body.spec, unit: body.unit, qty: qty, est_price: body.est_price, is_temp: true
        });
        _closeTempModal();
        alert('临时物资已提交审核（' + res.temp_code + '），并已加入购物车');
      })
      .catch(function() { alert('网络错误，请重试'); });
  }

  // ── 2. 项目历史 Tab ───────────────────────────────────────────
  function _renderHistory(el) {
    el.innerHTML = '<div class="bv-panel"><div class="bv-panel-hd">本项目历史采购记录</div><div id="bv-hist-list" class="bv-loading">加载中…</div></div>';

    RoleRouter.fetch('/api/orders?status=archived&project_id=' + (_user.project_id || ''))
      .then(function(res) {
        var histEl = document.getElementById('bv-hist-list');
        if (!histEl) return;
        if (!res.ok || !res.orders.length) {
          histEl.innerHTML = '<div class="bv-empty">暂无历史记录</div>'; return;
        }
        histEl.innerHTML = res.orders.map(function(ord) {
          return '<div class="bv-ord-card">' +
            '<div class="bv-ord-hd"><span class="bv-ord-id">' + escapeHtml(ord.id) + '</span>' +
            OrderStatusTag.render(ord.status) + '</div>' +
            '<div class="bv-ord-items">' +
              (ord.items || []).map(function(it) {
                return '<div class="bv-ord-item">' +
                  escapeHtml(it.sku_name) + ' × ' + it.qty + ' ' + escapeHtml(it.unit) +
                  OrderStatusTag.tempBadge(it.is_temp) +
                  '<button class="bv-btn bv-btn-xs" onclick="BuyerView._addToCart(' +
                  JSON.stringify({ code: it.sku_code, name: it.sku_name, spec: '', unit: it.unit, is_temp: it.is_temp }).replace(/"/g,'&quot;') +
                  ')">＋ 加入购物车</button>' +
                '</div>';
              }).join('') +
            '</div>' +
            '<div class="bv-ord-time">' + ord.created_at + '</div>' +
          '</div>';
        }).join('');
      })
      .catch(function() {
        var histEl = document.getElementById('bv-hist-list');
        if (histEl) histEl.innerHTML = '<div class="bv-empty bv-err">加载失败，请刷新重试</div>';
      });
  }

  // ── 3. 购物车 Tab ─────────────────────────────────────────────
  function _addToCart(r) {
    _addToCartItem({
      sku_code: r.code || r.sku_code || '',
      sku_name: r.name || r.sku_name || '',
      brand:    r.brand || '',
      spec:     r.spec  || '',
      unit:     r.unit  || '',
      qty:      1,
      est_price: parseFloat(r.est_price || r.price || 0),
      is_temp:  r.is_temp || false
    });
  }

  function _addToCartItem(item) {
    // 若已存在则数量 +1
    for (var i = 0; i < _cart.length; i++) {
      if (_cart[i].sku_code === item.sku_code && _cart[i].sku_name === item.sku_name) {
        _cart[i].qty += (item.qty || 1);
        _updateCartBadge();
        if (_tab === 'cart') _showTab('cart');
        return;
      }
    }
    _cart.push(item);
    _updateCartBadge();
    if (_tab === 'cart') _showTab('cart');
    else { _showNotice('已加入购物车 (' + _cart.length + ')'); }
  }

  function _updateCartBadge() {
    var el = document.getElementById('bv-cart-cnt');
    if (el) el.textContent = _cart.length;
  }

  function _renderCart(el) {
    if (!_cart.length) {
      el.innerHTML =
        '<div class="bv-panel">' +
          '<div class="bv-panel-hd">采购购物车</div>' +
          '<div class="bv-empty">购物车为空，请先到「选品」或「项目历史」选择物资</div>' +
        '</div>';
      return;
    }

    el.innerHTML =
      '<div class="bv-panel">' +
        '<div class="bv-panel-hd">采购购物车 <span class="bv-badge">' + _cart.length + ' 项</span></div>' +
        '<table class="bv-table">' +
          '<thead><tr><th>#</th><th>物资名称</th><th>规格</th><th>单位</th><th>数量</th><th>预估单价</th><th>标识</th><th>操作</th></tr></thead>' +
          '<tbody id="bv-cart-tbody">' + _cartRows() + '</tbody>' +
        '</table>' +
        '<div class="bv-cart-foot">' +
          '<div class="bv-field bv-remark-field">' +
            '<label>备注说明</label>' +
            '<input id="bv-order-remark" class="bv-input" placeholder="可选：说明采购用途或特殊要求">' +
          '</div>' +
          '<button class="bv-btn bv-btn-gray" onclick="BuyerView._clearCart()">清空购物车</button>' +
          '<button class="bv-btn bv-btn-primary" onclick="BuyerView._submitOrder()">📤 提交采购申请</button>' +
        '</div>' +
      '</div>';
  }

  function _cartRows() {
    return _cart.map(function(item, i) {
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + escapeHtml(item.sku_name) + '</td>' +
        '<td>' + escapeHtml(item.spec || '') + '</td>' +
        '<td>' + escapeHtml(item.unit) + '</td>' +
        '<td><input type="number" class="bv-qty-inp" value="' + item.qty + '" min="1" ' +
          'onchange="BuyerView._updateQty(' + i + ',this.value)"></td>' +
        '<td><input type="number" class="bv-price-inp" value="' + (item.est_price || '') + '" min="0" step="0.01" ' +
          'placeholder="0.00" onchange="BuyerView._updatePrice(' + i + ',this.value)"></td>' +
        '<td>' + OrderStatusTag.tempBadge(item.is_temp) + '</td>' +
        '<td><button class="bv-btn bv-btn-xs bv-btn-red" onclick="BuyerView._removeItem(' + i + ')">移除</button></td>' +
      '</tr>';
    }).join('');
  }

  function _updateQty(i, v)   { if (_cart[i]) { _cart[i].qty = Math.max(1, parseInt(v) || 1); } }
  function _updatePrice(i, v) { if (_cart[i]) { _cart[i].est_price = parseFloat(v) || 0; } }
  function _removeItem(i)     { _cart.splice(i, 1); _updateCartBadge(); _showTab('cart'); }
  function _clearCart()       { if (!confirm('确认清空购物车？')) return; _cart = []; _updateCartBadge(); _showTab('cart'); }

  function _submitOrder() {
    if (!_cart.length) { alert('购物车为空'); return; }
    if (!confirm('确认提交本次采购申请（共 ' + _cart.length + ' 项）？')) return;

    var remark = (document.getElementById('bv-order-remark')?.value || '').trim();
    var btn = document.querySelector('.bv-btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }

    RoleRouter.fetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ items: _cart, remark: remark })
    }).then(function(res) {
      if (!res.ok) { alert('提交失败: ' + (res.error || '未知')); if(btn){btn.disabled=false;btn.textContent='📤 提交采购申请';} return; }
      _cart = [];
      _updateCartBadge();
      alert('✅ 申请已提交！订单号：' + res.order_id + '\n招采部审核后将更新状态。');
      _showTab('orders');
    }).catch(function() { alert('网络错误，请重试'); if(btn){btn.disabled=false;} });
  }

  // ── 4. 我的订单 Tab ───────────────────────────────────────────
  function _loadOrders() {
    RoleRouter.fetch('/api/orders?project_id=' + (_user.project_id || ''))
      .then(function(res) {
        _orders = res.ok ? (res.orders || []) : [];
        if (_tab === 'orders') _showTab('orders');
      }).catch(function() {});
  }

  function _renderOrders(el) {
    el.innerHTML =
      '<div class="bv-panel">' +
        '<div class="bv-panel-hd">我的采购订单 <button class="bv-btn bv-btn-xs" onclick="BuyerView._refreshOrders()">🔄 刷新</button></div>' +
        '<div id="bv-orders-body">' + _ordersHTML() + '</div>' +
      '</div>';
  }

  function _refreshOrders() {
    var body = document.getElementById('bv-orders-body');
    if (body) body.innerHTML = '<div class="bv-loading">加载中…</div>';
    RoleRouter.fetch('/api/orders?project_id=' + (_user.project_id || ''))
      .then(function(res) {
        _orders = res.ok ? (res.orders || []) : [];
        if (body) body.innerHTML = _ordersHTML();
      }).catch(function() { if(body) body.innerHTML = '<div class="bv-err">加载失败</div>'; });
  }

  function _ordersHTML() {
    if (!_orders.length) return '<div class="bv-empty">暂无订单记录</div>';
    return _orders.map(function(ord) {
      var actions = OrderStatusTag.getActions(ord.status, 'buyer');
      return '<div class="bv-ord-card">' +
        '<div class="bv-ord-hd">' +
          '<span class="bv-ord-id">' + escapeHtml(ord.id) + '</span>' +
          OrderStatusTag.render(ord.status) +
          (ord.reject_reason ? '<span class="bv-reject-reason">驳回原因：' + escapeHtml(ord.reject_reason) + '</span>' : '') +
        '</div>' +
        '<div class="bv-ord-items">' +
          (ord.items || []).map(function(it) {
            return '<span class="bv-ord-item-pill">' +
              escapeHtml(it.sku_name) + ' ×' + it.qty +
              OrderStatusTag.tempBadge(it.is_temp) +
            '</span>';
          }).join('') +
        '</div>' +
        '<div class="bv-ord-foot">' +
          '<span class="bv-ord-time">' + ord.created_at + '</span>' +
          actions.map(function(a) {
            return '<button class="bv-btn bv-btn-sm ' + a.cls + '" ' +
              'onclick="BuyerView._orderAction(\'' + ord.id + '\',\'' + a.action + '\',' + (a.needReason||false) + ')">' +
              a.label + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function _orderAction(ordId, action, needReason) {
    var reason = '';
    if (needReason) { reason = prompt('请输入原因：'); if (!reason) return; }
    if (!confirm('确认执行「' + action + '」？')) return;

    RoleRouter.fetch('/api/orders/' + ordId + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ action: action, reject_reason: reason })
    }).then(function(res) {
      if (!res.ok) { alert('操作失败: ' + (res.error || '')); return; }
      alert('操作成功');
      _refreshOrders();
    }).catch(function() { alert('网络错误'); });
  }

  function _showNotice(msg) {
    var n = document.createElement('div');
    n.className = 'bv-notice'; n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(function() { n.remove(); }, 2000);
  }

  // ── CSS ───────────────────────────────────────────────────────
  function _css() {
    return [
      OrderStatusTag.css,
      '.bv-wrap{display:flex;height:calc(100vh - 52px);overflow:hidden}',
      '.bv-sidebar{width:180px;flex-shrink:0;background:#1e293b;padding:16px 0;display:flex;flex-direction:column;gap:2px}',
      '.bv-nav-item{padding:10px 20px;color:#94a3b8;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px;transition:.1s}',
      '.bv-nav-item:hover,.bv-nav-item.on{background:#334155;color:#f1f5f9}',
      '.bv-cart-badge{background:#ef4444;color:#fff;border-radius:10px;padding:1px 6px;font-size:11px;font-weight:700}',
      '.bv-main{flex:1;overflow-y:auto;background:#f8fafc;padding:24px}',
      '.bv-panel{background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden}',
      '.bv-panel-hd{padding:16px 20px;font-weight:700;font-size:15px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px}',
      '.bv-panel-foot{padding:12px 20px;border-top:1px solid #f1f5f9;display:flex;gap:8px;align-items:center}',
      '.bv-search-bar{padding:14px 20px}',
      '.bv-input{width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;outline:none;transition:.15s}',
      '.bv-input:focus{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.15)}',
      '.bv-sku-list{padding:0 20px 16px}',
      '.bv-sku-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9}',
      '.bv-sku-name{font-weight:600;font-size:13px}',
      '.bv-sku-code{font-size:11px;color:#94a3b8;font-weight:400;margin-left:6px}',
      '.bv-sku-meta{font-size:12px;color:#64748b;margin-top:2px}',
      '.bv-table{width:100%;border-collapse:collapse;font-size:13px}',
      '.bv-table th,.bv-table td{padding:9px 12px;border-bottom:1px solid #f1f5f9;text-align:left}',
      '.bv-table th{background:#f8fafc;font-weight:600;color:#374151}',
      '.bv-qty-inp,.bv-price-inp{width:72px;padding:4px 8px;border:1px solid #e2e8f0;border-radius:5px;font-size:13px}',
      '.bv-cart-foot{padding:14px 20px;border-top:1px solid #f1f5f9;display:flex;gap:8px;align-items:center}',
      '.bv-remark-field{flex:1;display:flex;align-items:center;gap:8px}',
      '.bv-remark-field label{white-space:nowrap;font-size:13px;color:#374151}',
      '.bv-ord-card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:10px}',
      '.bv-ord-hd{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}',
      '.bv-ord-id{font-size:12px;color:#94a3b8;font-family:monospace}',
      '.bv-ord-items{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}',
      '.bv-ord-item-pill{background:#f1f5f9;border-radius:4px;padding:3px 8px;font-size:12px}',
      '.bv-ord-foot{display:flex;align-items:center;gap:8px}',
      '.bv-ord-time{font-size:11px;color:#94a3b8;flex:1}',
      '.bv-reject-reason{font-size:12px;color:#9E251C;background:#FEF0EE;padding:2px 8px;border-radius:4px}',
      '.bv-field{margin-bottom:12px}',
      '.bv-field label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:4px}',
      '.bv-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:center;justify-content:center}',
      '.bv-modal-box{background:#fff;border-radius:12px;width:500px;max-width:95vw;max-height:88vh;overflow-y:auto}',
      '.bv-modal-hd{padding:16px 20px;font-weight:700;font-size:15px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between}',
      '.bv-modal-close{border:none;background:none;cursor:pointer;font-size:18px;color:#94a3b8}',
      '.bv-modal-body{padding:20px;display:flex;flex-direction:column;gap:4px}',
      '.bv-modal-foot{padding:14px 20px;border-top:1px solid #f1f5f9;display:flex;gap:8px;justify-content:flex-end}',
      '.bv-btn{padding:7px 14px;border-radius:6px;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:.12s;white-space:nowrap}',
      '.bv-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.bv-btn-primary{background:#2563eb;color:#fff}.bv-btn-primary:hover{background:#1d4ed8}',
      '.bv-btn-green{background:#16a34a;color:#fff}.bv-btn-gray{background:#e5e7eb;color:#374151}',
      '.bv-btn-red{background:#dc2626;color:#fff}.bv-btn-amber{background:#d97706;color:#fff}',
      '.bv-btn-blue{background:#0284c7;color:#fff}.bv-btn-sm{padding:5px 10px;font-size:12px}',
      '.bv-btn-xs{padding:3px 8px;font-size:11px}.bv-badge{background:#e5e7eb;color:#374151;border-radius:10px;padding:1px 8px;font-size:12px}',
      '.bv-loading{padding:40px;text-align:center;color:#94a3b8}',
      '.bv-empty{padding:40px;text-align:center;color:#94a3b8;line-height:1.8}',
      '.bv-err{color:#dc2626}',
      '.bv-notice{position:fixed;bottom:24px;right:24px;background:#1e293b;color:#f1f5f9;padding:10px 18px;border-radius:8px;font-size:13px;z-index:9999;animation:fadeIn .2s}',
      '@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    ].join('');
  }

  // ── 公开 API ──────────────────────────────────────────────────
  return {
    mount:          mount,
    _onSearch:      _onSearch,
    _addToCart:     _addToCart,
    _openTempModal: _openTempModal,
    _closeTempModal:_closeTempModal,
    _submitTemp:    _submitTemp,
    _updateQty:     _updateQty,
    _updatePrice:   _updatePrice,
    _removeItem:    _removeItem,
    _clearCart:     _clearCart,
    _submitOrder:   _submitOrder,
    _refreshOrders: _refreshOrders,
    _orderAction:   _orderAction,
  };
})();
