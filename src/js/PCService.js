// PCService.js — 采购中心 (PCService) + 定制采购 (CustomService)
var PCService = (function(){
  var _pid   = null;
  var _tab   = 'sku';
  var _carts = {};
  var _addrs = {};
  var _tmp   = {};
  var _qi    = [];
  var _qf    = -1;
  var _qt    = null;
  var _histAll  = [];
  var _histFlt  = '';
  var _histCat  = '';

  function _sc(){ try{ localStorage.setItem(_K.CARTS, JSON.stringify(_carts)); }catch(e){} }
  function _sa(){ try{ localStorage.setItem(_K.ADDR,  JSON.stringify(_addrs)); }catch(e){} }

  function _gc(id){
    var pid = id || _pid;
    if(!pid) return [];
    if(!_carts[pid]) _carts[pid] = [];
    // 规范化：确保所有 item.id 都是字符串（兼容旧数据）
    var arr = _carts[pid];
    for(var _i=0; _i<arr.length; _i++){
      if(typeof arr[_i].id !== 'string') arr[_i].id = String(arr[_i].id);
    }
    return arr;
  }
  function _ga(id){
    var pid = id || _pid;
    if(!pid) return [];
    if(!_addrs[pid]) _addrs[pid] = [];
    return _addrs[pid];
  }
  function _activeAddr(pid){
    var aa = _ga(pid);
    var tid = _tmp[pid || _pid];
    if(tid){
      for(var i=0; i<aa.length; i++){ if(aa[i].id===tid) return aa[i]; }
    }
    for(var i=0; i<aa.length; i++){ if(aa[i].isDefault) return aa[i]; }
    return aa[0] || null;
  }

  // ── 渲染侧栏
  function _renderRail(){
    var el = document.getElementById('pc-rail-list');
    if(!el) return;
    var projs = ProjectService.all();
    // 采购员只看自己被分配的项目（无buyer字段的项目对所有人可见）
    var currentUser = null;
    if(typeof AuthSystem !== 'undefined' && AuthSystem.currentUser) {
      currentUser = AuthSystem.currentUser;
    }
    if(currentUser && currentUser.role === 'buyer') {
      projs = projs.filter(function(p) {
        return !p.buyer || p.buyer === currentUser.id;
      });
    }
    if(!projs.length){
      el.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--t3)">点下方「＋ 新增项目」开始</div>';
      _updateNavBadge(projs);
      return;
    }
    var userList   = [];
    var presetList = [];
    for(var i=0; i<projs.length; i++){
      if(projs[i].isPreset) presetList.push(projs[i]);
      else                  userList.push(projs[i]);
    }

    var html = '';

    if(userList.length){
      html += '<div style="padding:4px 10px 2px;font-size:9px;font-weight:700;color:var(--t3);letter-spacing:.05em;background:var(--s3)">我的项目</div>';
      for(var i=0; i<userList.length; i++){
        html += _piHtml(userList[i]);
      }
    }
    if(presetList.length){
      html += '<div style="padding:4px 10px 2px;font-size:9px;font-weight:700;color:var(--t3);letter-spacing:.05em;background:var(--s3)">历史采购项目</div>';
      for(var i=0; i<presetList.length; i++){
        html += _piHtml(presetList[i]);
      }
    }
    el.innerHTML = html;
    _updateNavBadge(projs);
  }

  function _piHtml(p){
    var n   = _gc(p.id).length;
    var on  = (p.id === _pid);
    var cnt = 0;
    if(p.isPreset && typeof PRESET_ORDERS!=='undefined' && PRESET_ORDERS[p.name]){
      cnt = PRESET_ORDERS[p.name][0].items.length;
    }
    var sub = p.isPreset
      ? ('<small>历史' + cnt + '条</small>')
      : (p.code ? '<small>' + p.code + '</small>' : '');

    // 使用 data 属性避免引号嵌套问题
    var cls  = 'pc-pi' + (on ? ' on' : '');
    var badgeCls = 'pc-pi-b' + (n===0 ? ' zero' : '');
    var del  = p.isPreset ? '' :
      '<button class="pc-pi-del" onclick="event.stopPropagation();PCService.delProj(this.dataset.pid)" data-pid="'+p.id+'" title="删除">✕</button>';
    return '<div class="'+cls+'" data-pid="'+p.id+'" id="pc-pi-'+p.id+'" onclick="PCService.switchProj(this.dataset.pid)">'
      + '<div class="pc-pi-n"><strong>'+p.name+'</strong>'+sub+'</div>'
      + '<span class="'+badgeCls+'">'+n+'</span>'
      + del
      + '</div>';
  }

  function _updateNavBadge(projs){
    var total = 0;
    for(var i=0; i<projs.length; i++) total += _gc(projs[i].id).length;
    var b = document.getElementById('pc-nav-b');
    if(b){ b.textContent = total; b.style.display = total ? 'inline' : 'none'; }
  }

  // ── 渲染购物车
  function _renderCart(){
    var cntEl = document.getElementById('pc-cart-cnt');
    var totEl = document.getElementById('pc-total-amt');
    var el    = document.getElementById('pc-cart-list');
    if(!el || !_pid) return;
    var cart = _gc();
    if(cntEl) cntEl.textContent = cart.length + ' 项';
    if(!cart.length){
      el.innerHTML = '<div class="empty-cart"><div class="empty-ico">🛒</div><div class="empty-txt">从左侧搜索添加物资</div></div>';
      if(totEl) totEl.textContent = '—';
      return;
    }
    var total = 0, hasP = false;
    var rows = [];
    for(var i=0; i<cart.length; i++){
      var it = cart[i];
      if(it.price){ total += it.price * (it.qty||1); hasP = true; }
      var isTemp = typeof TempSKU!=='undefined' && TempSKU.isTemp(it);
      var tag = isTemp
        ? TempSKU.tagHtml(it)
        : (it.isNew
          ? '<span class="tag tag-n" style="font-size:9px">✦新码</span>'
          : '<span class="tag tag-m" style="font-size:9px">✓</span>');
      var sub = it.price
        ? ('小计 ¥' + (it.price*(it.qty||1)).toFixed(2))
        : '';
      var rowStyle = isTemp ? ' style="background:#FFFBEC"' : '';
      rows.push(
        '<div class="ci"' + rowStyle + '>'
        + '<div class="ci-qty">'
        +   '<div style="font-size:9px;color:var(--t3);text-align:center;margin-bottom:2px">数量</div>'
        +   '<div class="pc-qty">'
        +     '<button type="button" data-id="'+it.id+'" data-d="-1" onclick="PCService.qty(this.dataset.id,-1)">−</button>'
        +     '<input type="number" min="1" value="'+it.qty+'" data-id="'+it.id+'"'
        +       ' style="width:40px;text-align:center;padding:2px 3px;font-size:12px;border:1.5px solid #bbb;border-radius:4px;background:#fff;cursor:text"'
        +       ' onblur="PCService.setQtyNoRender(this.dataset.id,this.value)"'
        +       ' onkeydown="if(event.key===\'Enter\'){PCService.setQtyNoRender(this.dataset.id,this.value);this.blur()}">'
        +     '<button type="button" data-id="'+it.id+'" data-d="1"  onclick="PCService.qty(this.dataset.id,1)">＋</button>'
        +   '</div>'
        + '</div>'
        + '<div class="ci-body">'
        +   '<div class="ci-name">'+it.name+tag+'</div>'
        +   '<div class="ci-code">'+(it.code||'—')+'</div>'
        +   '<div class="ci-meta">'+(it.brand?it.brand+' · ':'')+((it.spec&&it.spec.slice(0,35))?it.spec.slice(0,35)+' · ':'')+( it.unit||'')+'</div>'
        +   '<div style="margin-top:4px;display:flex;align-items:center;gap:6px">'
        +     '<span style="font-size:10px;color:var(--t2)">单价 ¥</span>'
        +     '<input type="number" min="0" step="0.01" value="'+(it.price||'')+'" placeholder="未录" '
        +       'style="width:68px;padding:2px 5px;font-size:11px;border:1px solid var(--bd2);border-radius:4px" '
        +       'data-id="'+it.id+'" onchange="PCService.setPrice(this.dataset.id,this.value)">'
        +     '<span class="ci-sub" id="ci-sub-'+it.id+'" style="font-size:11px;color:var(--green);font-weight:700">'+sub+'</span>'
        +   '</div>'
        + '</div>'
        + '<button class="ci-del" data-id="'+it.id+'" onclick="PCService.del(this.dataset.id)">✕</button>'
        + '</div>'
      );
    }
    el.innerHTML = rows.join('');
    if(totEl) totEl.textContent = hasP
      ? ('¥' + total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','))
      : '（单价未录入）';
  }

  // ── 渲染地址条
  function _renderAddrBar(){
    var el = document.getElementById('pc-addr-display');
    if(!el || !_pid) return;
    var a = _activeAddr(_pid);
    if(!a){
      el.className = 'pc-addr-warn';
      el.textContent = '⚠ 未设置地址';
    } else {
      el.className = 'pc-addr-val';
      el.textContent = a.name + '　' + a.addr + (a.contact ? '　' + a.contact : '');
    }
  }

  // ── 渲染地址管理TAB
  function _renderAddrTab(){
    var el = document.getElementById('pc-addr-list');
    if(!el || !_pid) return;
    var aa = _ga();
    if(!aa.length){
      el.innerHTML = '<div class="empty-cart"><div class="empty-ico">📍</div><div class="empty-txt">暂无地址</div></div>';
      return;
    }
    var rows = [];
    for(var i=0; i<aa.length; i++){
      var a = aa[i];
      rows.push(
        '<div class="addr-card2' + (a.isDefault?' is-default':'') + '">'
        + '<div class="addr-card2-top">'
        +   '<span class="addr-card2-name">'+a.name+'</span>'
        +   (a.isDefault?'<span class="tag" style="background:var(--green);color:#fff;font-size:9px">默认</span>':'')
        +   '<div style="margin-left:auto;display:flex;gap:4px">'
        +     (!a.isDefault?'<button class="btn btn-ghost btn-xs" data-id="'+a.id+'" onclick="PCService.setDefAddr(this.dataset.id)">设默认</button>':'')
        +     '<button class="btn btn-ghost btn-xs" data-id="'+a.id+'" onclick="PCService.showAddrEdit(this.dataset.id)">编辑</button>'
        +     '<button class="btn btn-ghost btn-xs" style="color:var(--red)" data-id="'+a.id+'" onclick="PCService.delAddr(this.dataset.id)">删除</button>'
        +   '</div>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--t2);margin-top:3px">'+a.addr+'</div>'
        + (a.contact?'<div style="font-size:11px;color:var(--t3)">👤 '+a.contact+(a.phone?' 📞 '+a.phone:'')+'</div>':'')
        + (a.timeReq?'<div style="font-size:11px;color:var(--t3)">⏰ '+a.timeReq+'</div>':'')
        + (a.note?'<div style="font-size:11px;color:var(--t3)">📝 '+a.note+'</div>':'')
        + '</div>'
      );
    }
    el.innerHTML = rows.join('');
  }

  // ── 搜索
  function _doSearch(val){
    if(!val.trim()){ _closeSearch(); return; }
    var hits = [];
    if(typeof DB !== 'undefined' && typeof sim === 'function'){
      for(var i=0; i<DB.length; i++){
        var s = sim(val, DB[i].name);
        if(s >= 0.28) hits.push({r:DB[i], s:s});
      }
    }
    hits.sort(function(a,b){ return b.s-a.s; });
    _qi = hits.slice(0,9);
    var drop = document.getElementById('pc-qs-drop');
    if(!drop) return;
    var html = '';
    if(!_qi.length){
      html = '<div class="pc-notfound">'
        + '<div class="pc-notfound-inner">'
        + '<div class="pc-nf-msg">⚠ 未找到匹配SKU：<strong>' + val + '</strong></div>'
        + '<button class="pc-nf-btn" onclick="TempSKU.openModal(\''+val.replace(/'/g,"\\'")+'\',\'pc\')">🟡 创建临时物资</button>'
        + '</div></div>';
    } else {
      for(var i=0; i<_qi.length; i++){
        var h = _qi[i];
        var pct = Math.round(h.s*100);
        html += '<div class="qs-item" data-idx="'+i+'" onclick="PCService.pick(+this.dataset.idx)">'
          + '<div style="display:flex;align-items:baseline;gap:4px">'
          +   '<span class="qs-name">' + (typeof hl==='function'?hl(h.r.name,val):h.r.name) + '</span>'
          +   '<span class="qs-pct '+(pct>=85?'pct-hi':'pct-md')+'">'+pct+'%</span>'
          + '</div>'
          + '<div class="qs-sub"><span class="qs-code">'+h.r.code+'</span>'
          +   (h.r.brand?'<span>'+h.r.brand+'</span>':'')
          +   '<span style="color:var(--t3)">'+h.r.cat1+'</span>'
          + '</div>'
          + (h.r.spec?'<div style="font-size:10px;color:var(--t3)">'+h.r.spec.slice(0,48)+'</div>':'')
          + '</div>';
      }
    }
    drop.innerHTML = html;
    drop.classList.add('open');
    _showDupHint(val);
  }

  function _showDupHint(name){
    var hint = document.getElementById('pc-dup-hint');
    var lst  = document.getElementById('pc-dup-list');
    if(!hint || !lst) return;
    if(!name || name.length < 2){ hint.classList.remove('on'); return; }
    var sims = SKUService.findSimilarSKU(name, '', 0.62);
    if(!sims.length){ hint.classList.remove('on'); return; }
    var rows = [];
    for(var i=0; i<sims.length; i++){
      var s = sims[i];
      rows.push(
        '<div class="dup-row">'
        + '<span class="dup-pct">'+s.similarity+'%</span>'
        + '<div style="flex:1;min-width:0">'
        +   '<div style="font-size:11px;font-weight:600">'+s.itemName+'</div>'
        +   (s.spec?'<div style="font-size:10px;color:var(--t3)">'+s.spec.slice(0,40)+'</div>':'')
        + '</div>'
        + '<span style="font-family:monospace;font-size:10px;color:var(--blue);font-weight:700">'+s.skuId+'</span>'
        + '<button class="btn btn-ghost btn-xs" data-code="'+s.skuId+'" onclick="PCService.addByCode(this.dataset.code)">加入</button>'
        + '</div>'
      );
    }
    lst.innerHTML = rows.join('');
    hint.classList.add('on');
  }

  function _closeSearch(){
    var d = document.getElementById('pc-qs-drop');
    if(d) d.classList.remove('open');
    _qi = []; _qf = -1;
    var h = document.getElementById('pc-dup-hint');
    if(h) h.classList.remove('on');
  }

  // ── 历史记录 TAB
  function _renderHistTab(pid){
    var el = document.getElementById('ph-list');
    if(!el) return;
    var orders = ProjectService.getHistoryOrders(pid);
    _histAll = [];
    if(!orders || !orders.length){
      el.innerHTML = '<div class="empty-cart"><div class="empty-ico">📋</div><div class="empty-txt">该项目暂无历史采购记录</div></div>';
      _updateHistStats([]);
      return;
    }
    for(var i=0; i<orders.length; i++){
      var o = orders[i];
      var batch = o.archivedAt || o.month || '';
      var items = o.items || [];
      for(var j=0; j<items.length; j++){
        var cp = {};
        var src = items[j];
        for(var k in src){ if(src.hasOwnProperty(k)) cp[k] = src[k]; }
        cp._batch = batch;
        _histAll.push(cp);
      }
    }
    // 类目过滤器
    var cats = {};
    for(var i=0; i<_histAll.length; i++){
      var cat = _histAll[i].cat1 || '';
      if(cat) cats[cat] = true;
    }
    var catArr = Object.keys(cats).sort();
    var catSel = document.getElementById('ph-cat-filter');
    if(catSel){
      var catOpts = '<option value="">全部类目</option>';
      for(var i=0; i<catArr.length; i++){
        catOpts += '<option value="'+catArr[i]+'">'+catArr[i]+'</option>';
      }
      catSel.innerHTML = catOpts;
      catSel.value = _histCat;
    }
    _renderHistList(_histAll);
  }

  function _renderHistList(items){
    var el = document.getElementById('ph-list');
    if(!el) return;
    if(!items.length){
      el.innerHTML = '<div class="empty-cart"><div class="empty-ico">🔍</div><div class="empty-txt">无匹配物资</div></div>';
      _updateHistStats([]);
      return;
    }
    _updateHistStats(items);
    // 按类目分组
    var groups = {};
    var order  = [];
    for(var i=0; i<items.length; i++){
      var cat = items[i].cat1 || '其他';
      if(!groups[cat]){ groups[cat]=[]; order.push(cat); }
      groups[cat].push(items[i]);
    }
    order.sort();
    var html = '';
    for(var gi=0; gi<order.length; gi++){
      var cat = order[gi];
      var arr = groups[cat];
      var catAmt = 0;
      for(var i=0; i<arr.length; i++){
        if(arr[i].price) catAmt += arr[i].price * (arr[i].qty||1);
      }
      // 类目标题行 — 用 data-cat 避免引号问题
      html += '<div style="padding:5px 14px 3px;font-size:10px;font-weight:700;color:var(--t2);'
            + 'background:var(--s2);border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:8px">'
            + '<span>'+cat+'</span>'
            + '<span style="font-weight:400;color:var(--t3)">'+arr.length+'种</span>'
            + (catAmt?'<span style="font-weight:400;color:var(--t3)">¥'+catAmt.toLocaleString()+'</span>':'')
            + '<button class="btn btn-ghost btn-xs" style="margin-left:auto" data-cat="'+cat.replace(/"/g,'&quot;')+'" '
            +   'onclick="PCService.addCatToCart(this.dataset.cat)" title="整类加入购物车">↓ 加入购物车</button>'
            + '</div>';
      // 物资行
      for(var i=0; i<arr.length; i++){
        var it = arr[i];
        var priceStr = it.price
          ? ('¥'+it.price+' × '+(it.qty||1)+(it.unit||'')+' = ¥'+(it.price*(it.qty||1)).toFixed(0))
          : ((it.qty||1)+(it.unit||''));
        var tag = (typeof TempSKU!=='undefined' && TempSKU.isTemp(it))
          ? TempSKU.tagHtml(it)
          : (it.isNew
            ? '<span class="tag tag-n" style="font-size:9px">✦新码</span>'
            : '<span class="tag tag-m" style="font-size:9px">✓</span>');
        html += '<div class="ci" style="padding:7px 12px">'
          + '<div style="flex:1;min-width:0">'
          +   '<div class="ci-name" style="font-size:12px">'+it.name+tag+'</div>'
          +   '<div class="ci-code">'+(it.code||'—')+'</div>'
          +   '<div class="ci-meta">'
          +     (it.brand?it.brand+' · ':'')
          +     (it.spec?it.spec.slice(0,40)+' · ':'')
          +     priceStr
          +     (it._batch?'<span style="color:var(--t3)"> · '+it._batch+'</span>':'')
          +   '</div>'
          + '</div>'
          // 用 data-* 存参数，避免字符串转义地狱
          + '<button class="btn btn-ghost btn-xs" style="flex-shrink:0;margin-left:8px" '
          +   'data-code="'+(it.code||'')+'" '
          +   'data-name="'+it.name.replace(/"/g,'&quot;')+'" '
          +   'data-brand="'+(it.brand||'').replace(/"/g,'&quot;')+'" '
          +   'data-spec="'+(it.spec||'').replace(/"/g,'&quot;')+'" '
          +   'data-unit="'+(it.unit||'')+'" '
          +   'data-price="'+(it.price||0)+'" '
          +   'data-qty="'+(it.qty||1)+'" '
          +   'onclick="PCService.addHistItem(this)">'
          +   '加入购物车'
          + '</button>'
          + '</div>';
      }
    }
    el.innerHTML = html;
  }

  function _updateHistStats(items){
    var cats = {}, amt = 0;
    for(var i=0; i<items.length; i++){
      var it = items[i];
      if(it.cat1) cats[it.cat1] = true;
      if(it.price) amt += it.price * (it.qty||1);
    }
    var catCount = Object.keys(cats).length;
    var si = document.getElementById('ph-stat-items');
    var sa = document.getElementById('ph-stat-amt');
    var sc = document.getElementById('ph-stat-cats');
    if(si) si.textContent = '共 ' + items.length + ' 条物资';
    if(sa) sa.textContent = amt ? ('历史金额 ¥' + Math.round(amt).toLocaleString()) : '（无价格数据）';
    if(sc) sc.textContent = catCount + ' 个类目';
  }

  // ── public API
  return {
    init: function(){
      try{ var r=localStorage.getItem(_K.CARTS); if(r) _carts=JSON.parse(r); }catch(e){}
      try{ var r=localStorage.getItem(_K.ADDR);  if(r) _addrs=JSON.parse(r); }catch(e){}
    },

    // 项目操作
    toggleForm: function(){
      var f = document.getElementById('pc-add-form');
      if(!f) return;
      f.classList.toggle('on');
      if(f.classList.contains('on')){
        var inp = document.getElementById('pc-f-name');
        if(inp) setTimeout(function(){ inp.focus(); }, 50);
      }
    },
    hideForm: function(){
      var f = document.getElementById('pc-add-form');
      if(f) f.classList.remove('on');
    },
    createProj: function(){
      var n  = (document.getElementById('pc-f-name').value || '').trim();
      var c2 = (document.getElementById('pc-f-code').value || '').trim();
      if(!n){ alert('请填写项目名称'); return; }
      var p = ProjectService.create(n, c2);
      if(!p) return;
      document.getElementById('pc-f-name').value = '';
      document.getElementById('pc-f-code').value = '';
      PCService.hideForm();
      PCService.switchProj(p.id);
    },
    delProj: function(id){
      if(!ProjectService.remove(id)) return;
      if(_pid === id) _pid = null;
      _renderRail();
      if(!_pid){
        var np = document.getElementById('pc-no-proj');
        var ws = document.getElementById('pc-ws');
        if(np) np.style.display = '';
        if(ws) ws.classList.remove('on');
      }
    },
    switchProj: function(id){
      _pid = id;
      _renderRail();
      var np = document.getElementById('pc-no-proj');
      var ws = document.getElementById('pc-ws');
      if(np) np.style.display = 'none';
      if(ws) ws.classList.add('on');
      _renderCart();
      _renderAddrBar();
      if(_tab === 'addr') _renderAddrTab();
      if(_tab === 'cus'  && typeof CustomService !== 'undefined') CustomService.renderList(id);
      if(_tab === 'hist') _renderHistTab(id);
      // 同步更新顶栏项目名（如果旧系统有同名项目）
      var proj = ProjectService.get(id);
      if(proj){
        var pn = document.getElementById('proj-panel-name');
        if(pn) pn.textContent = proj.name;
        // 同步旧系统 currentProject（让采购清单页也知道当前项目）
        var pm = (typeof projectList!=='undefined') ?
          projectList.find(function(p){ return p.name===proj.name; }) : null;
        if(pm && typeof currentProject!=='undefined'){
          currentProject = pm;
          if(typeof renderProjectBadge==='function') renderProjectBadge();
          if(typeof renderProjectOrders==='function') renderProjectOrders();
          if(typeof buildProjectIndex==='function') buildProjectIndex();
          try{ localStorage.setItem(KEY_CURPROJ, JSON.stringify(pm)); }catch(e){}
        } else {
          // 没有旧系统对应项目，至少更新顶栏显示
          var badge = document.getElementById('proj-badge');
          if(badge){
            badge.textContent = '📁 ' + proj.name;
            badge.style.background = 'rgba(42,122,59,.25)';
            badge.style.color = '#90EAA0';
          }
          var pn2 = document.getElementById('proj-panel-name');
          if(pn2) pn2.textContent = proj.name;
        }
      }
    },
    getPid: function(){ return _pid; },
    getCurrentProject: function(){ return ProjectService.get(_pid); },

    // TAB
    tab: function(name, el){
      _tab = name;
      var tabs  = document.querySelectorAll('.pc-tab');
      var panes = document.querySelectorAll('.pc-pane');
      for(var i=0; i<tabs.length;  i++) tabs[i].classList.remove('on');
      for(var i=0; i<panes.length; i++) panes[i].classList.remove('on');
      if(el) el.classList.add('on');
      var pane = document.getElementById('pcp-' + name);
      if(pane) pane.classList.add('on');
      if(name === 'addr') _renderAddrTab();
      if(name === 'cus'  && _pid && typeof CustomService !== 'undefined') CustomService.renderList(_pid);
      if(name === 'hist' && _pid) _renderHistTab(_pid);
    },

    // 搜索
    initSearch: function(){
      var inp = document.getElementById('pc-qs-inp');
      var clr = document.getElementById('pc-qs-clr');
      if(!inp || inp._pc22bound) return;
      inp._pc22bound = true;
      inp.addEventListener('input', function(){
        var v = this.value;
        if(clr) clr.className = 'qs-clear' + (v ? ' on' : '');
        if(_qt) clearTimeout(_qt);
        if(!v.trim()){ _closeSearch(); return; }
        _qt = setTimeout(function(){ _doSearch(v); }, 140);
      });
      inp.addEventListener('keydown', function(e){
        var drop = document.getElementById('pc-qs-drop');
        if(!drop || !drop.classList.contains('open')) return;
        if(e.key==='ArrowDown'){ e.preventDefault(); _qf=Math.min(_qi.length-1,_qf+1); }
        else if(e.key==='ArrowUp'){  e.preventDefault(); _qf=Math.max(-1,_qf-1); }
        else if(e.key==='Enter'){    e.preventDefault(); if(_qf>=0) PCService.pick(_qf); }
        else if(e.key==='Escape') _closeSearch();
        var items = drop.querySelectorAll('.qs-item');
        for(var i=0; i<items.length; i++) items[i].classList.toggle('hi', i===_qf);
      });
      document.addEventListener('click', function(e){
        if(!e.target.closest('#pc-qs-box')) _closeSearch();
      });
    },
    clearSearch: function(){
      var inp = document.getElementById('pc-qs-inp');
      var clr = document.getElementById('pc-qs-clr');
      if(inp) inp.value = '';
      if(clr) clr.className = 'qs-clear';
      _closeSearch();
    },
    pick: function(i){
      var h = _qi[i]; if(!h) return;
      if(!_pid){ alert('请先选择项目'); return; }
      _closeSearch();
      var r = h.r;
      _gc().push({ id:'i'+Date.now(), purchaseType:'standard',
        name:r.name, code:r.code, brand:r.brand||'', spec:r.spec||'', unit:r.unit||'',
        cat1:r.cat1||'', cat2:r.cat2||'', cat3:r.cat3||'', qty:1, price:0, isNew:false });
      _sc(); _renderCart(); _renderRail();
      var inp = document.getElementById('pc-qs-inp');
      if(inp) inp.value = '';
    },
    addByCode: function(code){
      if(!code || !_pid) return;
      var r = null;
      if(typeof DB !== 'undefined'){
        for(var i=0; i<DB.length; i++){ if(DB[i].code===code){ r=DB[i]; break; } }
      }
      if(!r) return;
      _gc().push({ id:'i'+Date.now(), purchaseType:'standard',
        name:r.name, code:r.code, brand:r.brand||'', spec:r.spec||'', unit:r.unit||'',
        cat1:r.cat1||'', cat2:r.cat2||'', cat3:r.cat3||'', qty:1, price:0, isNew:false });
      _sc(); _renderCart(); _renderRail();
    },
    addItem: function(item){
      if(!_pid) return;
      _gc().push(item); _sc(); _renderCart(); _renderRail();
    },
    del: function(id){
      if(!_pid) return;
      var cart = _gc();
      var newCart = [];
      for(var i=0; i<cart.length; i++){ if(cart[i].id!==id) newCart.push(cart[i]); }
      _carts[_pid] = newCart;
      _sc(); _renderCart(); _renderRail();
    },
    qty: function(id, d){
      var cart = _gc();
      for(var i=0; i<cart.length; i++){
        if(String(cart[i].id)===String(id)){ cart[i].qty=Math.max(1,(cart[i].qty||1)+d); break; }
      }
      _sc(); _renderCart();
    },
    setQty: function(id, v){
      var cart = _gc();
      for(var i=0; i<cart.length; i++){
        if(String(cart[i].id)===String(id)){ cart[i].qty=Math.max(1,parseInt(v)||1); break; }
      }
      _sc(); _renderCart();
    },
    // 只更新数据不重渲（保持 input 焦点），失焦时再重渲
    setQtyNoRender: function(id, v){
      var cart = _gc();
      var changed = false;
      var curItem = null;
      for(var i=0; i<cart.length; i++){
        if(String(cart[i].id)===String(id)){
          var newQty = Math.max(1, parseInt(v)||1);
          if(cart[i].qty !== newQty){ cart[i].qty = newQty; changed = true; }
          curItem = cart[i];
          break;
        }
      }
      if(changed){
        _sc();
        // 更新该行的小计显示
        if(curItem){
          var subEl = document.getElementById('ci-sub-'+id);
          if(subEl){
            subEl.textContent = curItem.price
              ? ('小计 ¥' + (curItem.price*(curItem.qty||1)).toFixed(2))
              : '';
          }
        }
        // 更新合计栏
        var cart2 = _gc();
        var total = 0, hasP = false;
        for(var i=0; i<cart2.length; i++){
          if(cart2[i].price){ total += cart2[i].price*(cart2[i].qty||1); hasP = true; }
        }
        var totEl = document.getElementById('pc-total-amt');
        if(totEl) totEl.textContent = hasP
          ? ('¥'+total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','))
          : '（单价未录入）';
      }
    },
    setPrice: function(id, v){
      var cart = _gc();
      for(var i=0; i<cart.length; i++){
        if(String(cart[i].id)===String(id)){ cart[i].price=parseFloat(v)||0; break; }
      }
      _sc(); _renderCart();
    },
    clearCart: function(){
      if(!_pid) return;
      if(_gc().length && !confirm('确认清空当前项目购物车？')) return;
      _carts[_pid] = [];
      _sc(); _renderCart(); _renderRail();
    },
    clearCartSilent: function(pid){
      var p = pid || _pid; if(!p) return;
      _carts[p] = []; _sc(); _renderCart(); _renderRail();
    },
    getCart: function(pid){ return _gc(pid); },
    getCurrentProjectId: function(){ return _pid; },
    exportXlsx: function(){
      if(!_pid) return;
      var cart = _gc();
      if(!cart.length){ alert('购物车为空'); return; }
      var proj = ProjectService.get(_pid) || {name:'项目'};
      var addr = _activeAddr(_pid);
      if(typeof XLSX === 'undefined'){ alert('XLSX库未加载'); return; }

      var addrStr = addr ? addr.addr : '';
      var stdRows = [], tmpRows = [], todoMap = {};

      for(var i=0; i<cart.length; i++){
        var it = cart[i];
        var isTemp = typeof TempSKU!=='undefined' && TempSKU.isTemp(it);
        if(isTemp){
          tmpRows.push({
            '临时编码': it.code||'',
            '物资名称': it.name,
            '规格型号': it.spec||'',
            '单位':     it.unit||'',
            '数量':     it.qty,
            '采购链接': it.purchaseLink||'',
            '备注':     it.remark||'',
            '送货地址': addrStr
          });
          // 收集待完善清单（去重）
          var k = it.code||it.name;
          if(!todoMap[k]){
            todoMap[k] = {
              '临时编码': it.code||'',
              '名称':     it.name,
              '规格':     it.spec||'',
              '单位':     it.unit||'',
              '采购链接': it.purchaseLink||''
            };
          }
        } else {
          stdRows.push({
            '序号':     i+1,
            '物料编码': it.code||'',
            '物资名称': it.name,
            '品牌':     it.brand||'',
            '规格型号': it.spec||'',
            '单位':     it.unit||'',
            '数量':     it.qty,
            '单价':     it.price||'',
            '小计':     it.price ? parseFloat((it.price*(it.qty||1)).toFixed(2)) : '',
            '送货地址': addrStr
          });
        }
      }

      var wb = XLSX.utils.book_new();

      // Sheet1：标准采购
      var ws1 = XLSX.utils.json_to_sheet(stdRows.length ? stdRows : [{'说明':'本次无标准SKU采购'}]);
      ws1['!cols'] = [{wch:6},{wch:18},{wch:22},{wch:12},{wch:30},{wch:8},{wch:8},{wch:10},{wch:12},{wch:30}];
      XLSX.utils.book_append_sheet(wb, ws1, '📦 标准采购');

      // Sheet2：临时物资
      var ws2 = XLSX.utils.json_to_sheet(tmpRows.length ? tmpRows : [{'说明':'本次无临时物资'}]);
      ws2['!cols'] = [{wch:14},{wch:22},{wch:30},{wch:8},{wch:8},{wch:40},{wch:30},{wch:30}];
      XLSX.utils.book_append_sheet(wb, ws2, '🟡 临时物资');

      // Sheet3：SKU待完善清单
      var todoArr = Object.values(todoMap);
      var ws3 = XLSX.utils.json_to_sheet(todoArr.length ? todoArr : [{'说明':'无待完善物资'}]);
      ws3['!cols'] = [{wch:14},{wch:22},{wch:30},{wch:8},{wch:40}];
      XLSX.utils.book_append_sheet(wb, ws3, '📋 SKU待完善清单');

      XLSX.writeFile(wb, proj.name+'_采购清单_'+today()+'.xlsx');
    },

    // 地址操作
    showAddrEdit: function(editId){
      var ov = document.getElementById('pc-addr-edit-ov');
      if(!ov) return;
      var titleEl = document.getElementById('pc-ae-title');
      var eidEl   = document.getElementById('pc-ae-eid');
      if(eidEl) eidEl.value = editId || '';
      if(titleEl) titleEl.textContent = editId ? '编辑地址' : '添加地址';
      var a = {};
      if(editId){
        var aa = _ga();
        for(var i=0; i<aa.length; i++){ if(aa[i].id===editId){ a=aa[i]; break; } }
      }
      var fields = ['name','addr','contact','phone','time','note'];
      for(var i=0; i<fields.length; i++){
        var inp = document.getElementById('pc-ae-'+fields[i]);
        if(inp) inp.value = a[fields[i]] || '';
      }
      var defChk = document.getElementById('pc-ae-def');
      if(defChk) defChk.checked = !!a.isDefault || !_ga().length;
      ov.classList.add('open');
    },
    closeAddrEdit: function(){
      var ov = document.getElementById('pc-addr-edit-ov');
      if(ov) ov.classList.remove('open');
    },
    saveAddr: function(){
      var nameV = (document.getElementById('pc-ae-name').value||'').trim();
      var addrV = (document.getElementById('pc-ae-addr').value||'').trim();
      if(!nameV||!addrV){ alert('地点名称和地址为必填'); return; }
      var aa    = _ga();
      var isDef = document.getElementById('pc-ae-def').checked;
      if(isDef){ for(var i=0; i<aa.length; i++) aa[i].isDefault=false; }
      var eid = document.getElementById('pc-ae-eid').value;
      if(eid){
        for(var i=0; i<aa.length; i++){
          if(aa[i].id===eid){
            aa[i].name=nameV; aa[i].addr=addrV;
            aa[i].contact=(document.getElementById('pc-ae-contact').value||'').trim();
            aa[i].phone=(document.getElementById('pc-ae-phone').value||'').trim();
            aa[i].timeReq=(document.getElementById('pc-ae-time').value||'').trim();
            aa[i].note=(document.getElementById('pc-ae-note').value||'').trim();
            aa[i].isDefault=isDef;
            break;
          }
        }
      } else {
        aa.push({
          id:'addr22_'+Date.now(), name:nameV, addr:addrV,
          contact:(document.getElementById('pc-ae-contact').value||'').trim(),
          phone:(document.getElementById('pc-ae-phone').value||'').trim(),
          timeReq:(document.getElementById('pc-ae-time').value||'').trim(),
          note:(document.getElementById('pc-ae-note').value||'').trim(),
          isDefault:isDef
        });
      }
      var hasDefault = false;
      for(var i=0; i<aa.length; i++){ if(aa[i].isDefault) hasDefault=true; }
      if(!hasDefault && aa.length) aa[0].isDefault=true;
      _sa(); this.closeAddrEdit(); _renderAddrTab(); _renderAddrBar();
    },
    delAddr: function(id){
      if(!_pid || !confirm('确认删除此地址？')) return;
      var aa = _ga();
      var newAA = [];
      for(var i=0; i<aa.length; i++){ if(aa[i].id!==id) newAA.push(aa[i]); }
      _addrs[_pid] = newAA;
      _sa(); _renderAddrTab(); _renderAddrBar();
    },
    setDefAddr: function(id){
      var aa = _ga();
      for(var i=0; i<aa.length; i++) aa[i].isDefault=(aa[i].id===id);
      _sa(); _renderAddrTab(); _renderAddrBar();
    },
    openAddrPick: function(){
      if(!_pid) return;
      var aa  = _ga();
      var cur = _activeAddr(_pid) || {};
      var bd  = document.getElementById('pc-addr-pick-bd');
      if(!bd) return;
      if(!aa.length){
        bd.innerHTML = '<div style="text-align:center;color:var(--t3);font-size:12px;padding:16px">请先添加地址</div>';
      } else {
        var rows = ['<div style="font-size:11px;color:var(--t2);margin-bottom:8px">切换后仅影响本次</div>'];
        for(var i=0; i<aa.length; i++){
          var a = aa[i];
          rows.push(
            '<div class="addr-card2'+(a.id===cur.id?' is-default':'')+'" style="cursor:pointer" '
            + 'data-id="'+a.id+'" onclick="PCService.tempAddr(this.dataset.id)">'
            + '<div class="addr-card2-top"><span class="addr-card2-name">'+a.name+'</span>'
            + (a.isDefault?'<span class="tag" style="background:var(--green);color:#fff;font-size:9px">默认</span>':'')
            + '</div>'
            + '<div style="font-size:11px;color:var(--t2)">'+a.addr+'</div>'
            + (a.contact?'<div style="font-size:11px;color:var(--t3)">👤 '+a.contact+'</div>':'')
            + '</div>'
          );
        }
        bd.innerHTML = rows.join('');
      }
      var ov = document.getElementById('pc-addr-pick-ov');
      if(ov) ov.classList.add('open');
    },
    closeAddrPick: function(){
      var ov = document.getElementById('pc-addr-pick-ov');
      if(ov) ov.classList.remove('open');
    },
    tempAddr: function(id){
      _tmp[_pid] = id;
      _renderAddrBar();
      this.closeAddrPick();
    },
    getActiveAddr: function(pid){ return _activeAddr(pid || _pid); },

    // 历史记录操作
    histSearch: function(q){
      _histFlt = q || '';
      var catSel = document.getElementById('ph-cat-filter');
      _histCat = catSel ? catSel.value : '';
      var items = [];
      for(var i=0; i<_histAll.length; i++){
        var it = _histAll[i];
        if(_histCat && it.cat1 !== _histCat) continue;
        if(_histFlt){
          var ql = _histFlt.toLowerCase();
          var match = (it.name&&it.name.toLowerCase().indexOf(ql)>=0)
            || (it.code&&it.code.toLowerCase().indexOf(ql)>=0)
            || (it.brand&&it.brand.toLowerCase().indexOf(ql)>=0)
            || (it.spec&&it.spec.toLowerCase().indexOf(ql)>=0);
          if(!match) continue;
        }
        items.push(it);
      }
      _renderHistList(items);
    },
    addHistItem: function(btn){
      if(!_pid){ alert('请先选择项目'); return; }
      var code  = btn.dataset.code  || '';
      var name  = btn.dataset.name  || '';
      var brand = btn.dataset.brand || '';
      var spec  = btn.dataset.spec  || '';
      var unit  = btn.dataset.unit  || '';
      var price = parseFloat(btn.dataset.price) || 0;
      var qty   = parseInt(btn.dataset.qty)     || 1;
      var dbR   = null;
      if(code && typeof DB!=='undefined'){
        for(var i=0; i<DB.length; i++){ if(DB[i].code===code){ dbR=DB[i]; break; } }
      }
      _gc().push({ id:'i'+Date.now(), purchaseType:'standard',
        name:name, code:code, brand:brand, spec:spec, unit:unit,
        cat1:(dbR?dbR.cat1:''), cat2:(dbR?dbR.cat2:''), cat3:(dbR?dbR.cat3:''),
        qty:qty, price:price, isNew:!code });
      _sc(); _renderCart(); _renderRail();
      btn.textContent = '✓已加';
      btn.style.color = 'var(--green)';
      btn.disabled = true;
    },
    addAllHistToCart: function(){
      if(!_pid){ alert('请先选择项目'); return; }
      var items = _histAll;
      if(!items.length){ alert('该项目无历史物资'); return; }
      if(!confirm('将 ' + items.length + ' 条历史物资全部加入购物车？')) return;
      for(var i=0; i<items.length; i++){
        var it  = items[i];
        var dbR = null;
        if(it.code && typeof DB!=='undefined'){
          for(var j=0; j<DB.length; j++){ if(DB[j].code===it.code){ dbR=DB[j]; break; } }
        }
        _gc().push({ id:'i'+Date.now(), purchaseType:'standard',
          name:it.name, code:it.code||'', brand:it.brand||'', spec:it.spec||'', unit:it.unit||'',
          cat1:(dbR?dbR.cat1:it.cat1)||'', cat2:(dbR?dbR.cat2:it.cat2)||'', cat3:(dbR?dbR.cat3:it.cat3)||'',
          qty:it.qty||1, price:it.price||0, isNew:!it.code });
      }
      _sc(); _renderCart(); _renderRail();
      var proj = ProjectService.get(_pid);
      alert('已将 ' + items.length + ' 条物资加入「' + (proj?proj.name:'项目') + '」购物车');
    },
    addCatToCart: function(cat){
      if(!_pid){ alert('请先选择项目'); return; }
      var added = 0;
      for(var i=0; i<_histAll.length; i++){
        var it = _histAll[i];
        if(it.cat1 !== cat) continue;
        var dbR = null;
        if(it.code && typeof DB!=='undefined'){
          for(var j=0; j<DB.length; j++){ if(DB[j].code===it.code){ dbR=DB[j]; break; } }
        }
        _gc().push({ id:'i'+Date.now(), purchaseType:'standard',
          name:it.name, code:it.code||'', brand:it.brand||'', spec:it.spec||'', unit:it.unit||'',
          cat1:(dbR?dbR.cat1:it.cat1)||'', cat2:(dbR?dbR.cat2:it.cat2)||'', cat3:(dbR?dbR.cat3:it.cat3)||'',
          qty:it.qty||1, price:it.price||0, isNew:!it.code });
        added++;
      }
      if(added){ _sc(); _renderCart(); _renderRail(); }
    },

    // 页面进入
    onEnter: function(){
      _renderRail();
      if(_pid) this.switchProj(_pid);
    }
  };
})();

// ───────────────────────────────────────────────────
// CustomService — 定制采购申请
// ───────────────────────────────────────────────────
var CustomService = (function(){
  var _orders = [];
  var _seq    = 0;

  function _save(){ try{ localStorage.setItem(_K.CUST, JSON.stringify(_orders)); }catch(e){} }
  function _load(){
    try{
      var r = localStorage.getItem(_K.CUST);
      if(r){
        _orders = JSON.parse(r);
        if(_orders.length){
          var m = (_orders[0].customId||'').match(/(\d+)$/);
          if(m) _seq = parseInt(m[1]);
        }
      }
    }catch(e){}
  }
  function _genId(){
    _seq++;
    var d = new Date();
    return 'CUS' + d.getFullYear()
      + String(d.getMonth()+1).padStart(2,'0')
      + String(d.getDate()).padStart(2,'0')
      + String(_seq).padStart(4,'0');
  }
  function _stCls(s){
    var map={'待下单':'sp-waiting','已完成':'sp-done'};
    return map[s]||'sp-pending';
  }
  function _flow(cur){
    var steps=['待下单','已完成'];
    var html='<div class="status-flow">';
    for(var i=0; i<steps.length; i++){
      var s=steps[i], ci=steps.indexOf(cur);
      html += '<div class="sf-s'+(i<ci?' done':i===ci?' cur':'')+'">'+s+'</div>';
    }
    return html + '</div>';
  }

  return {
    init: _load,
    submit: function(){
      var pid  = PCService.getPid();
      if(!pid){ alert('请先选择项目'); return; }
      var name = (document.getElementById('cf-name').value||'').trim();
      if(!name){ alert('产品名称为必填项'); return; }
      var proj = ProjectService.get(pid) || {name:'未知'};
      var ord = {
        customId: _genId(),
        purchaseType: 'custom',
        projectId:    pid,
        projectName:  proj.name,
        itemName:     name,
        spec:     (document.getElementById('cf-spec').value||'').trim(),
        qty:      parseInt(document.getElementById('cf-qty').value)||1,
        unit:     (document.getElementById('cf-unit').value||'').trim(),
        budget:   parseFloat(document.getElementById('cf-budget').value)||0,
        supplier: (document.getElementById('cf-supplier').value||'').trim(),
        purchaseLink: (document.getElementById('cf-link').value||'').trim(),
        remark:   (document.getElementById('cf-remark').value||'').trim(),
        status:   '待下单',
        createTime: new Date().toLocaleString('zh-CN')
      };
      _orders.unshift(ord);
      _save();
      this.reset();
      this.renderList(pid);
      alert('✅ 定制采购申请已提交！\n编号：' + ord.customId);
    },
    reset: function(){
      var ids = ['cf-name','cf-spec','cf-unit','cf-supplier','cf-link','cf-remark'];
      for(var i=0; i<ids.length; i++){
        var el = document.getElementById(ids[i]);
        if(el) el.value = '';
      }
      var q = document.getElementById('cf-qty'); if(q) q.value='1';
      var b = document.getElementById('cf-budget'); if(b) b.value='';
    },
    renderList: function(pid){
      var el  = document.getElementById('pc-cus-list');
      var cnt = document.getElementById('pc-cus-cnt');
      if(!el) return;
      var list = [];
      for(var i=0; i<_orders.length; i++){
        if(_orders[i].projectId===pid) list.push(_orders[i]);
      }
      if(cnt) cnt.textContent = list.length + ' 项';
      if(!list.length){
        el.innerHTML = '<div class="empty-cart"><div class="empty-ico">✏</div><div class="empty-txt">暂无定制申请</div></div>';
        return;
      }
      var rows = [];
      for(var i=0; i<list.length; i++){
        var o = list[i];
        rows.push(
          '<div class="cus-card">'
          + '<div class="cus-card-body">'
          +   '<div class="cus-name">'+o.itemName+(o.spec?' <small style="font-size:10px;color:var(--t2);font-weight:400">'+o.spec+'</small>':'')+'</div>'
          +   '<div class="cus-id">'+o.customId+'</div>'
          +   '<div class="cus-meta">×'+o.qty+(o.unit||'')+(o.budget?' · 预算 ¥'+o.budget:'')+(o.supplier?' · '+o.supplier:'')+'<br>'+o.createTime+'</div>'
          + '</div>'
          + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">'
          +   '<span class="status-pill '+_stCls(o.status)+'">'+o.status+'</span>'
          +   '<button class="btn btn-ghost btn-xs" data-cid="'+o.customId+'" onclick="CustomService.detail(this.dataset.cid)">详情</button>'
          +   '<button class="btn btn-ghost btn-xs" style="color:var(--blue)" data-cid="'+o.customId+'" onclick="CustomService.addToCart(this.dataset.cid,this)" title="加入当前项目购物车">＋ 加购物车</button>'
          + '</div>'
          + '</div>'
        );
      }
      el.innerHTML = rows.join('');
    },
    detail: function(cid){
      var o = null;
      for(var i=0; i<_orders.length; i++){ if(_orders[i].customId===cid){ o=_orders[i]; break; } }
      if(!o) return;
      var ov = document.getElementById('cus-detail-ov'); if(!ov) return;
      document.getElementById('cus-dtl-title').textContent = o.customId + ' — ' + o.itemName;
      var bd = document.getElementById('cus-dtl-bd');
      var info = [['编号',o.customId],['项目',o.projectName],['名称',o.itemName],
        ['规格',o.spec||'—'],['数量',o.qty+(o.unit||'')],['预算','¥'+(o.budget||0)],
        ['供应商',o.supplier||'—'],['状态',o.status],['创建',o.createTime]];
      var infoHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-bottom:10px">';
      for(var i=0; i<info.length; i++){
        infoHtml += '<div><label style="font-size:10px;font-weight:700;color:var(--t3);display:block">'+info[i][0]+'</label><span style="font-size:12px">'+info[i][1]+'</span></div>';
      }
      infoHtml += '</div>';
      bd.innerHTML = _flow(o.status) + infoHtml
        + (o.purchaseLink?'<div style="margin-bottom:6px"><label style="font-size:10px;font-weight:700;color:var(--t3);display:block">采购链接</label><a href="'+o.purchaseLink+'" target="_blank" style="font-size:11px;color:var(--blue)">'+o.purchaseLink.slice(0,60)+'</a></div>':'')
        + (o.remark?'<div><label style="font-size:10px;font-weight:700;color:var(--t3);display:block">备注</label><div style="font-size:12px;color:var(--t2)">'+o.remark+'</div></div>':'');
      var ft = document.getElementById('cus-dtl-ft');
      var btns = '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'cus-detail-ov\').classList.remove(\'open\')">关闭</button>';
      if(o.status==='待下单')
        btns += '<button class="btn btn-ghost btn-sm" data-cid="'+cid+'" onclick="CustomService.saveToSKU(this.dataset.cid)" title="录入标准SKU库">📦 录入SKU库</button>'
              + '<button class="btn btn-green btn-sm" data-cid="'+cid+'" onclick="CustomService.setStatus(this.dataset.cid,\'已完成\')">✓ 标记完成</button>';
      ft.innerHTML = btns;
      ov.classList.add('open');
    },
    setStatus: function(cid, status){
      for(var i=0; i<_orders.length; i++){
        if(_orders[i].customId===cid){ _orders[i].status=status; break; }
      }
      _save();
      var ov = document.getElementById('cus-detail-ov');
      if(ov) ov.classList.remove('open');
      var pid = PCService.getPid();
      if(pid) this.renderList(pid);
    },
    getAll: function(){ return _orders; },

    // ── 加入购物车（定制申请物资 → 当前项目购物车）
    addToCart: function(cid, btn){
      var o = null;
      for(var i=0; i<_orders.length; i++){ if(_orders[i].customId===cid){ o=_orders[i]; break; } }
      if(!o) return;
      var pid = typeof PCService!=='undefined' ? PCService.getPid() : null;
      if(!pid){ alert('请先在采购中心选择项目'); return; }
      // 以定制申请信息构造购物车条目
      var item = {
        id: Date.now()+Math.random(),
        purchaseType: 'custom',
        name:     o.itemName,
        code:     '',          // 定制品不赋码
        brand:    '',
        spec:     o.spec  || '',
        unit:     o.unit  || '',
        cat1:'定制采购', cat2:'', cat3:'',
        qty:      o.qty   || 1,
        price:    o.budget || 0,
        isNew:    false,
        cusId:    o.customId,
        supplier: o.supplier || ''
      };
      PCService.addItem(item);
      if(btn){ btn.textContent='✓已加'; btn.style.color='var(--green)'; btn.disabled=true; }
    },

    // ── 下载批量导入模板
    downloadTemplate: function(){
      if(typeof XLSX === 'undefined'){ alert('XLSX库未加载'); return; }
      var cols = [
        '产品名称','规格型号','数量','单位',
        '预算金额(元)','指定供应商','采购链接','备注说明'
      ];
      var example = ['定制展架','2m×1m 铝合金框',2,'套',1200,'XXX广告公司','https://...','请提前确认颜色'];
      var ws = XLSX.utils.aoa_to_sheet([cols, example]);
      ws['!cols'] = cols.map(function(){ return {wch:18}; });
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '定制采购导入模板');
      XLSX.writeFile(wb, '定制采购批量导入模板.xlsx');
    },

    // ── 录入 SKU 库（审批通过的定制品转为标准SKU）
    saveToSKU: function(cid){
      var o = null;
      for(var i=0; i<_orders.length; i++){ if(_orders[i].customId===cid){ o=_orders[i]; break; } }
      if(!o) return;
      if(o.status!=='待下单'){ alert('仅待下单状态的申请可录入SKU库'); return; }
      // 弹出新增面板（复用现有赋码面板）
      // 若有 newPanel，直接填充数据
      var nm = document.getElementById('nf-name');
      if(nm){
        nm.value = o.itemName;
        var spec = document.getElementById('nf-spec'); if(spec) spec.value = o.spec||'';
        var brand = document.getElementById('nf-brand'); if(brand) brand.value = o.supplier||'';
        var unit = document.getElementById('nf-unit'); if(unit) unit.value = o.unit||'';
        // 切换到采购清单页并打开新增面板
        if(typeof goPage==='function') goPage('p-cart');
        var npBtn = document.getElementById('btn-open-new-panel');
        if(npBtn) npBtn.click();
        // 关闭定制详情弹窗
        var ov = document.getElementById('cus-detail-ov');
        if(ov) ov.classList.remove('open');
        alert('已将「'+o.itemName+'」信息填入新增SKU表单，请选择类目后保存入库');
      } else {
        // 无新增面板时，直接用 nextCode 尝试赋码
        alert('请前往「采购清单」页使用「✦ 新增物资赋码」功能将「'+o.itemName+'」录入SKU库');
        if(typeof goPage==='function') goPage('p-cart');
        var ov = document.getElementById('cus-detail-ov');
        if(ov) ov.classList.remove('open');
      }
    },

    // ── 批量导入 Excel
    importBatch: function(input){
      var file = input.files[0]; if(!file) return;
      var pid = typeof PCService!=='undefined' ? PCService.getPid() : null;
      if(!pid){ alert('请先选择项目再导入'); input.value=''; return; }
      var proj = typeof ProjectService!=='undefined' ? ProjectService.get(pid) : {name:'未知'};
      var reader = new FileReader();
      reader.onload = function(e){
        try{
          var wb   = XLSX.read(e.target.result, {type:'binary'});
          var ws   = wb.Sheets[wb.SheetNames[0]];
          var data = XLSX.utils.sheet_to_json(ws);
          if(!data.length){ alert('文件为空或格式不正确'); return; }
          var added = 0;
          data.forEach(function(row){
            var name = String(row['产品名称']||row['物资名称']||'').trim();
            if(!name || name==='nan') return;
            var o = {
              customId: _genId(),
              purchaseType: 'custom',
              projectId:   pid,
              projectName: proj.name,
              itemName:    name,
              spec:        String(row['规格型号']||row['规格']||'').trim(),
              qty:         parseFloat(row['数量'])||1,
              unit:        String(row['单位']||'').trim(),
              budget:      parseFloat(row['预算金额(元)']||row['预算']||0)||0,
              supplier:    String(row['指定供应商']||row['供应商']||'').trim(),
              purchaseLink:String(row['采购链接']||'').trim(),
              remark:      String(row['备注说明']||row['备注']||'').trim(),
              status:      '待下单',
              createTime:  new Date().toLocaleString('zh-CN')
            };
            _orders.unshift(o);
            added++;
          });
          if(added){
            _save();
            CustomService.renderList(pid);
            alert('✅ 成功导入 '+added+' 条定制采购申请（状态：待下单）');
          } else {
            alert('未读取到有效数据，请检查表头格式');
          }
        }catch(err){
          alert('导入失败：'+err.message);
        }
        input.value='';
      }.bind(this);
      reader.readAsBinaryString(file);
    }
  };
})();


// ───────────────────────────────────────────────────
// 整合 goPage（链式）
// ───────────────────────────────────────────────────
(function(){
  var _orig = goPage;
  goPage = function(id){
    _orig(id);
    if(id === 'p-procure') PCService.onEnter();
    if(id === 'p-demand') DemandService.onEnter();
    if(id === 'p-review') ReviewService.onEnter();
    if(id === 'p-users') UserService.onEnter();
    if(id === 'p-audit') AuditService.onEnter();
    if(id === 'p-stats') StatsService.onEnter();
    if(id === 'p-merge') MergeService.onEnter();
  };
})();

// ───────────────────────────────────────────────────
// 初始化
// ───────────────────────────────────────────────────
(function(){
  ProjectService.init();
  PCService.init();
  CustomService.init();

  // 页面加载后，把旧系统的 currentProject 同步到采购中心
  window.addEventListener('load', function(){
    setTimeout(function(){
      // 从 localStorage 恢复旧系统当前项目
      try{
        var saved = localStorage.getItem(typeof KEY_CURPROJ!=='undefined'?KEY_CURPROJ:'curProject_v1');
        if(saved){
          var cp = JSON.parse(saved);
          if(cp && cp.name && typeof ProjectService!=='undefined'){
            var np = ProjectService.getByName(cp.name);
            if(np && typeof PCService!=='undefined'){
              // 静默切换（不触发 renderRail 等 UI，避免在非采购中心页面报错）
              PCService.init(); // 确保加载了 localStorage 数据
            }
          }
        }
      }catch(e){}
    }, 300);
  });
})();


// ════════════════════════════════════════════════════
//  TempSKU — 临时物资机制
//  新增模块，不修改任何现有代码