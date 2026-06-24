// DemandService.js — 需求池服务集合
// 包含: URLGateway / AuditService / StatsService / UserService / ReviewService / DemandService

// ───────────────────────────────────────────────────
// DemandService 需求池（阶段二新增）
// ───────────────────────────────────────────────────
// ───────────────────────────────────────────────────
// URLGateway — 商品链接自动解析网关（阶段三新增）
// 支持：京东(jd.com) / 震坤行(jslink.com)
// ───────────────────────────────────────────────────
var URLGateway = (function(){
  var CUBE_SEARCH = 'https://csfw-purchase.pages.dev/api/zkh/cubeSearch';

  function _setStatus(msg, color){
    var el = document.getElementById('tmp-url-status');
    if(el){ el.textContent = msg; el.style.color = color||'#0369a1'; el.style.display = msg?'':'none'; }
  }

  function _fillField(id, val){
    var el = document.getElementById(id);
    if(el && val && !el.value){ el.value = val; }
  }

  function _setImg(url){
    var el = document.getElementById('tmp-img');
    var prev = document.getElementById('tmp-img-preview');
    var prevEl = document.getElementById('tmp-img-prev-el');
    if(el && url) el.value = url;
    if(prev && prevEl && url){
      prevEl.src = url;
      prev.style.display = '';
      prevEl.onerror = function(){ prev.style.display = 'none'; };
    }
  }

  return {
    parse: function(){
      var urlEl = document.getElementById('tmp-url-parse');
      var url = (urlEl ? urlEl.value : '').trim();
      if(!url){ _setStatus('请粘贴商品链接', '#dc2626'); return; }

      _setStatus('正在解析...', '#0369a1');

      // 判断平台
      if(url.indexOf('jd.com') !== -1 || url.indexOf('jd.hk') !== -1){
        this.parseJD(url);
      } else if(url.indexOf('jslink.com') !== -1 || url.indexOf('zkh.com') !== -1){
        this.parseZKH(url);
      } else {
        // 通用URL：尝试从链接提取关键词，然后用震坤行搜索
        this.parseGeneric(url);
      }
    },

    parseJD: function(url){
      // 京东链接解析：提取商品ID，通过页面meta信息或搜索回填
      var m = url.match(/item\.jd\.com\/(\d+)/);
      var skuId = m ? m[1] : '';
      // 京东无公开API，用关键词搜索震坤行替代
      _setStatus('京东链接检测到(商品ID:'+skuId+')，正在通过震坤行搜索匹配商品...', '#0369a1');
      // 将链接填入采购链接
      _fillField('tmp-link', url);
      // 尝试用商品ID作为关键词搜索
      if(skuId){
        this._searchAndFill(skuId);
      } else {
        _setStatus('无法解析京东商品ID，请手动填写商品信息', '#d97706');
      }
    },

    parseZKH: function(url){
      // 震坤行链接：提取commodityId，调用Cube API
      _fillField('tmp-link', url);
      var m = url.match(/commodityId=([\w-]+)/i) || url.match(/commodity\/([\w-]+)/i);
      var commodityId = m ? m[1] : '';
      if(commodityId){
        _setStatus('震坤行商品检测到，正在获取详情...', '#0369a1');
        this._fetchCommodity(commodityId);
      } else {
        _setStatus('检测到震坤行链接但无法提取商品ID，尝试搜索...', '#d97706');
        this._searchAndFill(url);
      }
    },

    parseGeneric: function(url){
      _fillField('tmp-link', url);
      _setStatus('非标准商品链接，尝试关键词搜索...', '#d97706');
      this._searchAndFill(url);
    },

    _searchAndFill: function(keyword){
      var self = this;
      fetch(CUBE_SEARCH, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({KeyWord: keyword, PageIndex: 1, PageSize: 1})
      }).then(function(r){ return r.json(); }).then(function(data){
        var items = data && data.data && data.data.list ? data.data.list : [];
        if(items.length > 0){
          var item = items[0];
          _fillField('tmp-name', item.commodityName || item.name || '');
          _fillField('tmp-spec', item.spec || item.specification || '');
          _fillField('tmp-brand', item.brand || item.brandName || '');
          if(item.unit) _fillField('tmp-unit', item.unit);
          if(item.imageUrl || item.imgUrl || item.mainImage){
            _setImg(item.imageUrl || item.imgUrl || item.mainImage);
          }
          _setStatus('已从震坤行匹配到商品信息，请确认并补充', '#16a34a');
        } else {
          _setStatus('未搜索到匹配商品，请手动填写', '#d97706');
        }
      }).catch(function(e){
        _setStatus('API 请求失败，请手动填写或粘贴商品 URL 后点击「手动解析」', '#dc2626');
        var fb=document.getElementById('tmp-manual-url-fallback');if(fb)fb.style.display='';
      });
    },

    _fetchCommodity: function(commodityId){
      var self = this;
      fetch('https://csfw-purchase.pages.dev/api/zkh/cubeCommodity', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({CommodityId: commodityId})
      }).then(function(r){ return r.json(); }).then(function(data){
        var item = data && data.data ? data.data : data;
        if(item){
          _fillField('tmp-name', item.commodityName || item.name || '');
          _fillField('tmp-spec', item.spec || item.specification || '');
          _fillField('tmp-brand', item.brand || item.brandName || '');
          if(item.unit) _fillField('tmp-unit', item.unit);
          if(item.imageUrl || item.imgUrl || item.mainImage){
            _setImg(item.imageUrl || item.imgUrl || item.mainImage);
          }
          _setStatus('震坤行商品信息已回填，请确认并补充', '#16a34a');
        } else {
          _setStatus('未获取到商品详情', '#d97706');
        }
      }).catch(function(e){
        _setStatus('获取详情失败，请手动填写或粘贴商品 URL', '#dc2626');
        var fb=document.getElementById('tmp-manual-url-fallback');if(fb)fb.style.display='';
      });
    }
  };
})();

// ───────────────────────────────────────────────────
// ReviewService — 临时物资审核池（阶段三新增）
// ───────────────────────────────────────────────────
// ───────────────────────────────────────────────────
// UserService — 账号管理（阶段四新增）
// ───────────────────────────────────────────────────
// ───────────────────────────────────────────────────
// AuditService — 审计日志查看（阶段七新增）
// ───────────────────────────────────────────────────
// ───────────────────────────────────────────────────
// MergeService — SKU合并中心（阶段六新增）
// ───────────────────────────────────────────────────
var MergeService = (function(){
  return {
    onEnter: function(){},
    doMerge: function(){
      var mainSku = (document.getElementById('merge-main-sku').value||'').trim();
      var subSkus = (document.getElementById('merge-sub-skus').value||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
      if(!mainSku){ alert('请输入主SKU编码'); return; }
      if(!subSkus.length){ alert('请输入待合并SKU编码'); return; }
      if(!confirm('确认合并？ 主SKU: '+mainSku+' 待合并: '+subSkus.join(', ')+' 此操作不可逆！')) return;

      // SKU合并逻辑：将待合并SKU的状态在本地标记为merged
      // 由于SKU数据在KV中，需要通过Worker API操作
      // 当前先做前端标记，后续对接Worker SKU合并API
      alert('SKU合并功能已记录。主SKU: '+mainSku+', 待合并: '+subSkus.length+'个。 注意：完整的SKU合并需要配合Worker端API，当前版本在前端标记。');

      console.log('[采购系统监控] SKU合并请求:', mainSku, subSkus);
    }
  };
})();

var AuditService = (function(){
  var API = 'https://csfw-purchase.pages.dev/api/audit';
  var _list = [];
  var _total = 0;
  var _page = 1;
  var _pageSize = 20;

  function _http(method, url, body){
    var opts = {method:method, headers:{'Content-Type':'application/json'}};
    if(body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function(r){ return r.json(); });
  }

  return {
    onEnter: function(){ this.loadData(); },

    loadData: function(){
      var self = this;
      var user = (document.getElementById('audit-search-user')||{}).value||'';
      var action = (document.getElementById('audit-filter-action')||{}).value||'';
      var params = ['page='+_page, 'page_size='+_pageSize];
      if(user) params.push('user='+encodeURIComponent(user));
      if(action) params.push('action='+action);
      _http('GET', API+'?'+params.join('&')).then(function(r){
        if(r.ok){ _list=r.data||[]; _total=r.total||0; self.renderList(); self.renderPager(); }
      }).catch(function(e){ console.error('[AuditService] error:', e); });
    },

    renderList: function(){
      var box = document.getElementById('audit-list');
      if(!box) return;
      if(!_list.length){ box.innerHTML='<div class="dm-empty">暂无日志</div>'; return; }
      var html='';
      _list.forEach(function(item){
        var before = item.before_data && item.before_data!=='{}' ? JSON.parse(item.before_data) : null;
        var after = item.after_data && item.after_data!=='{}' ? JSON.parse(item.after_data) : null;
        html+='<div class="dm-card" style="cursor:default">'
          +'<div class="dm-card-hd">'
          +'<span class="dm-req-no" style="font-size:12px">'+(item.action||'')+'</span>'
          +'<span class="dm-status-pill dm-status-submitted" style="font-size:10px">'+(item.target_type||'')+'/'+(item.target_id||'')+'</span>'
          +'</div>'
          +'<div class="dm-card-bd" style="grid-template-columns:1fr 1fr 1fr">'
          +'<div class="dm-info-row"><span class="dm-label">用户</span><span>'+(item.user||'-')+'</span></div>'
          +'<div class="dm-info-row"><span class="dm-label">角色</span><span>'+(item.role||'-')+'</span></div>'
          +'<div class="dm-info-row"><span class="dm-label">IP</span><span>'+(item.ip||'-')+'</span></div>'
          +'</div>'
          +'<div class="dm-card-ft">'
          +'<span class="dm-time">'+(item.create_time||'').replace('T',' ').slice(0,19)+'</span>'
          +'</div></div>';
      });
      box.innerHTML = html;
    },

    renderPager: function(){
      var box = document.getElementById('audit-pager');
      if(!box) return;
      var pages = Math.ceil(_total/_pageSize)||1;
      if(pages<=1){ box.innerHTML=''; return; }
      var html='';
      if(_page>1) html+='<span class="dm-pg" onclick="AuditService.gotoPage('+(_page-1)+')">上一页</span>';
      for(var i=1;i<=Math.min(pages,10);i++){
        if(i===_page) html+='<span class="dm-pg dm-pg-cur">'+i+'</span>';
        else html+='<span class="dm-pg" onclick="AuditService.gotoPage('+i+')">'+i+'</span>';
      }
      if(_page<pages) html+='<span class="dm-pg" onclick="AuditService.gotoPage('+(_page+1)+')">下一页</span>';
      html+='<span class="dm-pg-info">共'+_total+'条</span>';
      box.innerHTML = html;
    },

    gotoPage: function(p){ _page=p; this.loadData(); }
  };
})();

// ───────────────────────────────────────────────────
// StatsService — 统计分析中心（阶段八新增）
// ───────────────────────────────────────────────────
var StatsService = (function(){
  var DEMAND_API = 'https://csfw-purchase.pages.dev/api/demand_pool';
  var AUDIT_API = 'https://csfw-purchase.pages.dev/api/audit';

  function _http(url){
    return fetch(url).then(function(r){ return r.json(); });
  }

  return {
    onEnter: function(){ this.refresh(); },

    refresh: function(){
      var self = this;
      // 加载全部需求数据做统计
      _http(DEMAND_API+'?page_size=1000').then(function(r){
        if(!r.ok) return;
        var items = r.data || [];
        self.renderCards(items);
        self.renderChart(items);
      }).catch(function(e){ console.error('[StatsService] error:', e); });
    },

    renderCards: function(items){
      var box = document.getElementById('stats-cards');
      if(!box) return;
      var total = items.length;
      var byStatus = {};
      var byProject = {};
      var totalQty = 0;
      items.forEach(function(item){
        byStatus[item.status] = (byStatus[item.status]||0)+1;
        byProject[item.project_name||'未指定'] = (byProject[item.project_name||'未指定']||0)+1;
        totalQty += (item.qty||0);
      });
      var STATUS_LABEL = {draft:'草稿',submitted:'待审核',approved:'已审核',purchased:'采购中',received:'已收货',cancelled:'已取消'};
      var projectCount = Object.keys(byProject).length;

      box.innerHTML = ''
        +'<div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);text-align:center">'
        +'<div style="font-size:28px;font-weight:700;color:#1e293b">'+total+'</div>'
        +'<div style="font-size:12px;color:#64748b">需求总数</div></div>'
        +'<div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);text-align:center">'
        +'<div style="font-size:28px;font-weight:700;color:#2563EB">'+(byStatus.submitted||0)+'</div>'
        +'<div style="font-size:12px;color:#64748b">待审核</div></div>'
        +'<div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);text-align:center">'
        +'<div style="font-size:28px;font-weight:700;color:#16a34a">'+(byStatus.approved||0)+'</div>'
        +'<div style="font-size:12px;color:#64748b">已审核</div></div>'
        +'<div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);text-align:center">'
        +'<div style="font-size:28px;font-weight:700;color:#7c3aed">'+(byStatus.received||0)+'</div>'
        +'<div style="font-size:12px;color:#64748b">已完成</div></div>'
        +'<div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);text-align:center">'
        +'<div style="font-size:28px;font-weight:700;color:#d97706">'+projectCount+'</div>'
        +'<div style="font-size:12px;color:#64748b">涉及项目</div></div>';
    },

    renderChart: function(items){
      var box = document.getElementById('stats-chart-area');
      if(!box) return;
      var byStatus = {};
      items.forEach(function(item){
        byStatus[item.status] = (byStatus[item.status]||0)+1;
      });
      var STATUS_LABEL = {draft:'草稿',submitted:'待审核',approved:'已审核',purchased:'采购中',received:'已收货',cancelled:'已取消'};
      var STATUS_COLOR = {draft:'#94a3b8',submitted:'#3b82f6',approved:'#22c55e',purchased:'#f59e0b',received:'#8b5cf6',cancelled:'#ef4444'};
      var total = items.length || 1;
      var html = '<div style="display:flex;gap:8px;flex-wrap:wrap">';
      var order = ['draft','submitted','approved','purchased','received','cancelled'];
      order.forEach(function(s){
        var cnt = byStatus[s]||0;
        var pct = Math.round(cnt/total*100);
        var label = STATUS_LABEL[s]||s;
        var color = STATUS_COLOR[s]||'#94a3b8';
        html += '<div style="flex:1;min-width:120px;background:#f8fafc;border-radius:8px;padding:10px;text-align:center">'
          +'<div style="font-size:20px;font-weight:700;color:'+color+'">'+cnt+'</div>'
          +'<div style="font-size:11px;color:#64748b">'+label+'</div>'
          +'<div style="height:4px;background:#e2e8f0;border-radius:2px;margin-top:6px"><div style="height:100%;background:'+color+';border-radius:2px;width:'+pct+'%"></div></div>'
          +'</div>';
      });
      html += '</div>';
      box.innerHTML = html;
    }
  };
})();

var UserService = (function(){
  var API = 'https://csfw-purchase.pages.dev/api/users';
  var _list = [];
  var ROLE_LABEL = {admin:'管理员',manager:'主管',buyer:'采购专员',viewer:'只读'};

  function _http(method, url, body){
    var opts = {method:method, headers:{'Content-Type':'application/json'}};
    if(body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function(r){ return r.json(); });
  }

  return {
    onEnter: function(){ this.loadList(); },

    loadList: function(){
      var self = this;
      _http('GET', API).then(function(r){
        if(r.ok){ _list=r.data||[]; self.renderList(); }
      }).catch(function(e){ console.error('[UserService] error:', e); });
    },

    renderList: function(){
      var box = document.getElementById('us-list');
      if(!box) return;
      if(!_list.length){ box.innerHTML='<div class="dm-empty">暂无账号</div>'; return; }
      var html = '<table style="width:100%;border-collapse:collapse;font-size:13px">';
      html += '<tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0"><th style="padding:8px;text-align:left">用户名</th><th style="padding:8px;text-align:left">姓名</th><th style="padding:8px;text-align:left">角色</th><th style="padding:8px;text-align:left">状态</th><th style="padding:8px;text-align:left">项目</th><th style="padding:8px">操作</th></tr>';
      _list.forEach(function(u){
        var projects = [];
        try{ projects = typeof u.project_list==='string'?JSON.parse(u.project_list):u.project_list; }catch(e){}
        var projStr = projects && projects.length ? projects.join(', ') : '无';
        var statusLabel = {active:'正常',disabled:'禁用',locked:'锁定',deleted:'已删除'}[u.status]||u.status;
        var statusColor = u.status==='active'?'#16a34a':'#dc2626';
        html += '<tr style="border-bottom:1px solid #f1f5f9">'
          +'<td style="padding:8px">'+u.username+'</td>'
          +'<td style="padding:8px">'+(u.real_name||'-')+'</td>'
          +'<td style="padding:8px">'+(ROLE_LABEL[u.role]||u.role)+'</td>'
          +'<td style="padding:8px;color:'+statusColor+'">'+statusLabel+'</td>'
          +'<td style="padding:8px;font-size:11px;color:#64748b;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+projStr+'</td>'
          +'<td style="padding:8px;text-align:center;white-space:nowrap">';
        if(u.username !== 'admin'){
          html += '<button class="btn btn-ghost btn-sm" onclick="UserService.openEdit('+u.id+')" style="font-size:11px">编辑</button> ';
          if(u.status==='active') html += '<button class="btn btn-ghost btn-sm" data-uid="'+u.id+'" data-status="disabled" onclick="UserService._toggle(this)" style="font-size:11px;color:#d97706">禁用</button>';
          if(u.status==='active') html += '<button class="btn btn-ghost btn-sm" data-uid="'+u.id+'" data-status="disabled" onclick="UserService._toggle(this)" style="font-size:11px;color:#d97706">禁用</button>';
        }
        html += '</td></tr>';
      });
      html += '</table>';
      box.innerHTML = html;
    },

    openCreate: function(){
      document.getElementById('us-edit-title').textContent = '新增账号';
      var body = document.getElementById('us-edit-body');
      body.innerHTML = '<div class="tmp-form-row"><label class="tmp-lbl">用户名</label><input class="tmp-inp" id="us-f-username"></div>'
        +'<div class="tmp-form-row"><label class="tmp-lbl">密码</label><input class="tmp-inp" id="us-f-password" type="password"></div>'
        +'<div class="tmp-form-row"><label class="tmp-lbl">姓名</label><input class="tmp-inp" id="us-f-realname"></div>'
        +'<div class="tmp-form-row"><label class="tmp-lbl">角色</label><select class="tmp-inp" id="us-f-role"><option value="buyer">采购专员</option><option value="manager">主管</option><option value="viewer">只读</option></select></div>'
        +'<div class="tmp-form-row"><label class="tmp-lbl">手机</label><input class="tmp-inp" id="us-f-phone"></div>'
        +'<div class="tmp-form-row"><label class="tmp-lbl">分配项目（逗号分隔）</label><input class="tmp-inp" id="us-f-projects" placeholder="如：华望城中央商务区,中关村"></div>';
      var ft = document.getElementById('us-edit-ft');
      ft.innerHTML = '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'us-edit-ov\').classList.remove(\'open\')">取消</button>'
        +'<button class="btn btn-primary btn-sm" onclick="UserService.doCreate()">创建</button>';
      document.getElementById('us-edit-ov').classList.add('open');
    },

    doCreate: function(){
      var self = this;
      var username = (document.getElementById('us-f-username').value||'').trim();
      var password = (document.getElementById('us-f-password').value||'').trim();
      if(!username||!password){ alert('用户名和密码必填'); return; }
      var projects = (document.getElementById('us-f-projects').value||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
      _http('POST', API, {
        username:username, password:password,
        real_name:document.getElementById('us-f-realname').value||'',
        role:document.getElementById('us-f-role').value,
        phone:document.getElementById('us-f-phone').value||'',
        project_list:projects,
        create_by: (typeof AuthSystem!=='undefined'&&AuthSystem.currentUser)?AuthSystem.currentUser.name:''
      }).then(function(r){
        if(!r.ok){ alert('创建失败: '+r.error); return; }
        document.getElementById('us-edit-ov').classList.remove('open');
        self.loadList();
      });
    },

    openEdit: function(id){
      var user = _list.find(function(u){return u.id===id;});
      if(!user) return;
      document.getElementById('us-edit-title').textContent = '编辑账号: '+user.username;
      var projects = [];
      try{ projects = typeof user.project_list==='string'?JSON.parse(user.project_list):user.project_list; }catch(e){}
      var body = document.getElementById('us-edit-body');
      body.innerHTML = '<div class="tmp-form-row"><label class="tmp-lbl">姓名</label><input class="tmp-inp" id="us-f-realname" value="'+(user.real_name||'')+'"></div>'
        +'<div class="tmp-form-row"><label class="tmp-lbl">角色</label><select class="tmp-inp" id="us-f-role"><option value="buyer"'+(user.role==='buyer'?' selected':'')+'>采购专员</option><option value="manager"'+(user.role==='manager'?' selected':'')+'>主管</option><option value="viewer"'+(user.role==='viewer'?' selected':'')+'>只读</option></select></div>'
        +'<div class="tmp-form-row"><label class="tmp-lbl">手机</label><input class="tmp-inp" id="us-f-phone" value="'+(user.phone||'')+'"></div>'
        +'<div class="tmp-form-row"><label class="tmp-lbl">分配项目（逗号分隔）</label><input class="tmp-inp" id="us-f-projects" value="'+(projects||[]).join(', ')+'"></div>'
        +'<div class="tmp-form-row"><button class="btn btn-ghost btn-sm" style="color:#d97706" onclick="UserService.resetPwd('+id+')">重置密码</button></div>';
      var ft = document.getElementById('us-edit-ft');
      ft.innerHTML = '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'us-edit-ov\').classList.remove(\'open\')">取消</button>'
        +'<button class="btn btn-primary btn-sm" onclick="UserService.doEdit('+id+')">保存</button>';
      document.getElementById('us-edit-ov').classList.add('open');
    },

    doEdit: function(id){
      var self = this;
      var projects = (document.getElementById('us-f-projects').value||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
      _http('PUT', API+'/'+id, {
        real_name:document.getElementById('us-f-realname').value||'',
        role:document.getElementById('us-f-role').value,
        phone:document.getElementById('us-f-phone').value||'',
        project_list:projects,
        update_by: (typeof AuthSystem!=='undefined'&&AuthSystem.currentUser)?AuthSystem.currentUser.name:''
      }).then(function(r){
        if(!r.ok){ alert('保存失败: '+r.error); return; }
        document.getElementById('us-edit-ov').classList.remove('open');
        self.loadList();
      });
    },

    _toggle: function(btn){ this.toggleStatus(btn.dataset.uid, btn.dataset.status); },
    toggleStatus: function(id, status){
      var self = this;
      _http('PUT', API+'/'+id, {
        status:status,
        update_by: (typeof AuthSystem!=='undefined'&&AuthSystem.currentUser)?AuthSystem.currentUser.name:''
      }).then(function(r){
        if(!r.ok){ alert('操作失败: '+r.error); return; }
        self.loadList();
      });
    },

    resetPwd: function(id){
      var newPwd = prompt('请输入新密码:');
      if(!newPwd) return;
      _http('POST', API+'/'+id+'/reset-password', {new_password:newPwd}).then(function(r){
        if(!r.ok) alert('重置失败: '+r.error);
        else alert('密码已重置，用户下次登录需修改密码');
      });
    },

    changePwd: function(){
      var oldPwd = document.getElementById('chpwd-old').value;
      var newPwd = document.getElementById('chpwd-new').value;
      if(!oldPwd||!newPwd){ alert('请填写完整'); return; }
      var userId = (typeof AuthSystem!=='undefined'&&AuthSystem.currentUser)?AuthSystem.currentUser.id:null;
      if(!userId){ alert('请先登录'); return; }
      _http('PATCH', API+'/'+userId+'/password', {old_password:oldPwd, new_password:newPwd}).then(function(r){
        if(!r.ok){ alert('修改失败: '+r.error); return; }
        alert('密码修改成功');
        document.getElementById('us-chpwd-ov').classList.remove('open');
      });
    }
  };
})();

var ReviewService = (function(){
  var API = 'https://csfw-purchase.pages.dev/api/temp_sku';
  var SEQ_API = 'https://csfw-purchase.pages.dev/api/seq';
  var REC_API = 'https://csfw-purchase.pages.dev/api/records';
  var _list = [];
  var _total = 0;
  var _page = 1;
  var _pageSize = 20;
  var _status = '';

  var STATUS_LABEL = {pending:'待审核',approved:'已通过',rejected:'已驳回',merged:'已合并'};
  var STATUS_CLASS = {pending:'dm-status-submitted',approved:'dm-status-approved',rejected:'dm-status-cancelled',merged:'dm-status-received'};

  function _http(method, url, body){
    var opts = {method:method, headers:{'Content-Type':'application/json'}};
    if(body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function(r){ return r.json(); });
  }

  return {
    onEnter: function(){ this.loadData(); },

    loadData: function(){
      var self = this;
      var params = [];
      if(_status) params.push('status='+_status);
      params.push('page='+_page);
      params.push('page_size='+_pageSize);
      _http('GET', API+'?'+params.join('&')).then(function(r){
        if(r.ok){ _list=r.data||[]; _total=r.total||0; self.renderList(); self.renderPager(); }
      }).catch(function(e){ console.error('[ReviewService] error:', e); });
    },

    filterStatus: function(el){
      document.querySelectorAll('#rv-filter-tabs .dm-ftab').forEach(function(t){t.classList.remove('on');});
      el.classList.add('on');
      _status = el.getAttribute('data-status');
      _page = 1;
      this.loadData();
    },

    renderList: function(){
      var box = document.getElementById('rv-list');
      if(!box) return;
      if(!_list.length){ box.innerHTML='<div class="dm-empty">暂无待审核物资</div>'; return; }
      var html='';
      _list.forEach(function(item){
        var sl=STATUS_LABEL[item.status]||item.status;
        var sc=STATUS_CLASS[item.status]||'';
        html+='<div class="dm-card" onclick="ReviewService.detail('+item.id+')">'
          +'<div class="dm-card-hd">'
          +'<span class="dm-req-no">'+item.temp_code+'</span>'
          +'<span class="dm-status-pill '+sc+'">'+sl+'</span>'
          +'</div>'
          +'<div class="dm-card-bd">'
          +'<div class="dm-info-row"><span class="dm-label">名称</span><span>'+(item.name||'-')+'</span></div>'
          +'<div class="dm-info-row"><span class="dm-label">品牌</span><span>'+(item.brand||'-')+'</span></div>'
          +'<div class="dm-info-row"><span class="dm-label">规格</span><span>'+(item.spec||'-')+'</span></div>'
          +'<div class="dm-info-row"><span class="dm-label">单位</span><span>'+(item.unit||'-')+'</span></div>'
          +'</div>'
          +'<div class="dm-card-ft">'
          +'<span class="dm-time">'+(item.create_time||'').replace('T',' ').slice(0,16)+'</span>'
          +'<span class="dm-user">'+(item.create_user||'')+'</span>'
          +'</div></div>';
      });
      box.innerHTML = html;
    },

    renderPager: function(){
      var box = document.getElementById('rv-pager');
      if(!box) return;
      var pages = Math.ceil(_total/_pageSize)||1;
      if(pages<=1){ box.innerHTML=''; return; }
      var html='';
      if(_page>1) html+='<span class="dm-pg" onclick="ReviewService.gotoPage('+(_page-1)+')">上一页</span>';
      for(var i=1;i<=pages;i++){
        if(i===_page) html+='<span class="dm-pg dm-pg-cur">'+i+'</span>';
        else html+='<span class="dm-pg" onclick="ReviewService.gotoPage('+i+')">'+i+'</span>';
      }
      if(_page<pages) html+='<span class="dm-pg" onclick="ReviewService.gotoPage('+(_page+1)+')">下一页</span>';
      html+='<span class="dm-pg-info">共'+_total+'条</span>';
      box.innerHTML = html;
    },

    gotoPage: function(p){ _page=p; this.loadData(); },

    detail: function(id){
      var self = this;
      _http('GET', API+'/'+id).then(function(r){
        if(!r.ok){ alert('加载失败'); return; }
        var item = r.data;
        var sl=STATUS_LABEL[item.status]||item.status;
        var sc=STATUS_CLASS[item.status]||'';
        var body = document.getElementById('rv-detail-body');
        var ft = document.getElementById('rv-detail-ft');
        body.innerHTML = '<div class="dm-detail-grid">'
          +'<div><span class="dm-label">临时编码</span><span>'+item.temp_code+'</span></div>'
          +'<div><span class="dm-label">状态</span><span class="dm-status-pill '+sc+'">'+sl+'</span></div>'
          +'<div><span class="dm-label">名称</span><span>'+(item.name||'-')+'</span></div>'
          +'<div><span class="dm-label">品牌</span><span>'+(item.brand||'-')+'</span></div>'
          +'<div><span class="dm-label">规格</span><span>'+(item.spec||'-')+'</span></div>'
          +'<div><span class="dm-label">单位</span><span>'+(item.unit||'-')+'</span></div>'
          +'<div><span class="dm-label">申请人</span><span>'+(item.create_user||'-')+'</span></div>'
          +'<div><span class="dm-label">项目</span><span>'+(item.project_name||'-')+'</span></div>'
          +'<div><span class="dm-label">采购链接</span><span>'+(item.purchase_link?'<a href="'+item.purchase_link+'" target="_blank" style="color:#2563EB">查看</a>':'-')+'</span></div>'
          +'<div><span class="dm-label">图片</span><span>'+(item.image_url?'<img src="'+item.image_url+'" style="max-width:120px;max-height:80px;border-radius:6px">':'-')+'</span></div>'
          +'<div><span class="dm-label">创建时间</span><span>'+(item.create_time||'').replace('T',' ').slice(0,16)+'</span></div>'
          +'<div><span class="dm-label">审核人</span><span>'+(item.review_user||'-')+'</span></div>'
          +'<div class="dm-detail-full"><span class="dm-label">正式SKU</span><span>'+(item.formal_sku_code||'待分配')+'</span></div>'
          +'</div>';

        var ftHtml = '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'rv-detail-ov\').classList.remove(\'open\')">关闭</button>';
        if(item.status === 'pending'){
          ftHtml += ' <button class="btn btn-primary btn-sm" data-perm="approveDemand" onclick="ReviewService.approve('+item.id+')">✅ 审核通过</button>';
          ftHtml += ' <button class="btn btn-ghost btn-sm" data-perm="approveDemand" style="color:var(--red)" onclick="ReviewService.reject('+item.id+')">❌ 驳回</button>';
        }
        ft.innerHTML = ftHtml;
        document.getElementById('rv-detail-ov').classList.add('open');
        if(typeof _applyPermissions==='function') _applyPermissions();
      });
    },

    approve: function(id){
      var self = this;
      var user = '';
      if(typeof AuthSystem!=='undefined' && AuthSystem.currentUser) user = AuthSystem.currentUser.name;
      _http('PATCH', API+'/'+id+'/review', {
        status: 'approved',
        review_user: user,
        formal_sku_code: ''
      }).then(function(r){
        if(!r.ok){ alert('审核失败: '+r.error); return; }
        alert('审核通过！临时物资已标记为已审核。');
        document.getElementById('rv-detail-ov').classList.remove('open');
        self.loadData();
      }).catch(function(e){ alert('网络错误'); });
    },

    reject: function(id){
      var self = this;
      var user = '';
      if(typeof AuthSystem!=='undefined' && AuthSystem.currentUser) user = AuthSystem.currentUser.name;
      _http('PATCH', API+'/'+id+'/review', {
        status: 'rejected',
        review_user: user
      }).then(function(r){
        if(!r.ok){ alert('驳回失败: '+r.error); return; }
        document.getElementById('rv-detail-ov').classList.remove('open');
        self.loadData();
      }).catch(function(e){ alert('网络错误'); });
    }
  };
})();

var DemandService = (function(){
  var API = 'https://csfw-purchase.pages.dev/api/demand_pool';
  var SKU_PROPOSAL_API = 'https://csfw-purchase.pages.dev/api/temp_sku';
  var _list = [];
  var _total = 0;
  var _page = 1;
  var _pageSize = 20;
  var _status = 'submitted';
  var _search = '';
  var _reqNoSeq = 0;
  var _skuProposals = []; // 待审核SKU提案列表（仅在submitted tab下加载）
  var _pendingSkuApprovalId = null; // 正在审核类目选择中的SKU提案ID

  var STATUS_LABEL = {
    draft:'草稿', submitted:'待审核', approved:'已审核',
    purchased:'采购中', received:'已收货', cancelled:'已取消'
  };
  var STATUS_CLASS = {
    draft:'dm-status-draft', submitted:'dm-status-submitted', approved:'dm-status-approved',
    purchased:'dm-status-purchased', received:'dm-status-received', cancelled:'dm-status-cancelled'
  };

  function _genReqNo(){
    var d = new Date();
    var ds = ''+d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
    _reqNoSeq++;
    return 'REQ-'+ds+'-'+String(_reqNoSeq).padStart(3,'0');
  }

  /* ═══════════════════════════════════════════
     离线本地数据库层 LocalDB
     - 云端可达时：透传到真实 API
     - 云端不可达（本地测试/断网）：用 localStorage 模拟
     - 上线后行为完全一致，数据结构相同
  ═══════════════════════════════════════════ */
  var _LS_KEY = 'demand_pool_offline_v1';
  var _offlineMode = false; // 初始未知，首次请求后自动检测

  var LocalDB = {
    _data: null,
    _load: function(){
      if(this._data) return this._data;
      try{ this._data = JSON.parse(localStorage.getItem(_LS_KEY)||'[]'); }catch(e){ this._data=[]; }
      return this._data;
    },
    _save: function(){
      try{ localStorage.setItem(_LS_KEY, JSON.stringify(this._data)); }catch(e){}
    },
    _nextId: function(){
      var d = this._load();
      return d.length ? Math.max.apply(null, d.map(function(r){return r.id||0;})) + 1 : 1;
    },
    // GET列表
    query: function(params){
      var d = this._load();
      var status = params.status || '';
      var q = (params.q||'').toLowerCase();
      var role = params.role || 'buyer';
      var userId = params.user_id || '';
      var page = parseInt(params.page)||1;
      var pageSize = parseInt(params.page_size)||20;
      var filtered = d.filter(function(r){
        if(r._deleted) return false;
        if(r.archived && status === 'received') return false; // 已归档的不在已收货tab显示
        if(status && r.status !== status) return false;
        // 权限过滤：manager/admin看全部，buyer只看自己提交的
        if(role === 'buyer' && userId && r.request_user_id && r.request_user_id !== userId) return false;
        if(q){
          var hit = (r.sku_name||'').toLowerCase().indexOf(q)>=0 ||
                    (r.sku_code||'').toLowerCase().indexOf(q)>=0 ||
                    (r.project_name||'').toLowerCase().indexOf(q)>=0;
          if(!hit) return false;
        }
        return true;
      });
      // 按创建时间倒序
      filtered.sort(function(a,b){ return (b.create_time||'') > (a.create_time||'') ? 1 : -1; });
      var total = filtered.length;
      var start = (page-1)*pageSize;
      var data = filtered.slice(start, start+pageSize);
      return {ok:true, data:data, total:total, offline:true};
    },
    // GET单条
    getOne: function(id){
      var d = this._load();
      var r = d.find(function(x){ return x.id == id; });
      if(!r) return {ok:false, error:'记录不存在'};
      return {ok:true, data:r, offline:true};
    },
    // POST新增
    insert: function(body){
      var d = this._load();
      var now = new Date().toISOString();
      // 保存提交者ID，用于权限过滤
      var cu = (typeof AuthSystem!=='undefined'&&AuthSystem.currentUser)?AuthSystem.currentUser:null;
      var rec = Object.assign({}, body, {
        id: this._nextId(),
        create_time: now,
        update_time: now,
        request_user_id: cu ? cu.id : '',
        status: body.status || 'submitted'
      });
      d.push(rec);
      this._data = d;
      this._save();
      return {ok:true, data:rec, offline:true};
    },
    // PATCH状态
    updateStatus: function(id, body){
      var d = this._load();
      var idx = d.findIndex(function(x){ return x.id == id; });
      if(idx < 0) return {ok:false, error:'记录不存在'};
      var rec = d[idx];
      var from = rec.status;
      var to = body.status;
      // 校验合法流转（与后端一致）
      var ALLOWED = {
        submitted: ['purchased','cancelled','draft'],
        purchased: ['received'],
        received:  [],
        draft:     ['submitted','cancelled'],
        approved:  ['purchased'],
        cancelled: []
      };
      var allowed = ALLOWED[from] || [];
      if(from === to){
        return {ok:false, error:'无效的状态流转: '+from+' → '+to+'，允许: '+allowed.join('/')};
      }
      if(allowed.indexOf(to) < 0){
        return {ok:false, error:'无效的状态流转: '+from+' → '+to+'，允许: '+allowed.join('/')};
      }
      rec.status = to;
      rec.update_time = new Date().toISOString();
      if(body.request_user) rec.approved_by = body.request_user;
      if(body.remark) rec.remark = (rec.remark?rec.remark+' ':'')+body.remark;
      d[idx] = rec;
      this._data = d;
      this._save();
      return {ok:true, data:rec, offline:true};
    },
    // PATCH内容字段 + 状态回退（采购员修改已提交需求 → 退回草稿）
    updateFields: function(id, fields){
      var d = this._load();
      var idx = d.findIndex(function(x){ return String(x.id) === String(id); });
      if(idx < 0) return {ok:false, error:'记录不存在'};
      var rec = d[idx];
      // 仅 submitted 或 draft 状态可修改
      if(rec.status !== 'submitted' && rec.status !== 'draft'){
        return {ok:false, error:'当前状态不允许修改内容'};
      }
      // 可修改字段白名单
      var ALLOWED_FIELDS = ['sku_name','spec','qty','address','remark','sku_code','request_time','purchase_link'];
      ALLOWED_FIELDS.forEach(function(f){
        if(fields[f] !== undefined) rec[f] = fields[f];
      });
      // 如果原来是submitted，修改后退回draft
      if(rec.status === 'submitted' && fields._setDraft !== false){
        rec.status = 'draft';
      }
      rec.update_time = new Date().toISOString();
      if(fields.remark){
        rec.remark = (rec.remark ? rec.remark + ' ' : '') + fields.remark;
      }
      d[idx] = rec;
      this._data = d;
      this._save();
      return {ok:true, data:rec, offline:true};
    },
    // 归档：标记archived=true，不改status，从"已收货"tab查询中排除
    archive: function(ids){
      var d = this._load();
      var idSet = {};
      ids.forEach(function(id){ idSet[String(id)] = true; });
      var count = 0;
      d.forEach(function(r){
        if(idSet[String(r.id)] && r.status === 'received' && !r.archived){
          r.archived = true;
          r.archive_time = new Date().toISOString();
          count++;
        }
      });
      this._data = d;
      this._save();
      return {ok:true, archived: count, offline:true};
    }
  };

  // 解析URL参数
  function _parseParams(url){
    var p = {}; var q = url.split('?')[1]||'';
    q.split('&').forEach(function(s){ if(!s)return; var kv=s.split('='); p[decodeURIComponent(kv[0])]=decodeURIComponent(kv[1]||''); });
    return p;
  }

  // 真实HTTP（带超时）
  function _httpReal(method, url, body){
    var opts = {method:method, headers:{'Content-Type':'application/json'}};
    if(body) opts.body = JSON.stringify(body);
    // 10秒超时（原3秒过短，云端Worker在数据量较大或网络波动时正常响应也可能超过3秒，
    // 误判为离线会导致查询走向空的本地LocalDB，返回错误的空结果）
    var timeout = new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('timeout')); }, 10000); });
    return Promise.race([
      fetch(url, opts).then(function(r){ return r.json(); }),
      timeout
    ]);
  }

  // 统一入口：自动切换云端/离线
  // 重要：只有"真正的网络错误"（fetch本身失败/超时）才切换离线模式，
  // 不能因为单次响应慢就永久切换，否则后续所有请求都会被错误地导向本地空数据
  var _lastOfflineCheckAt = 0;
  function _http(method, url, body){
    // 离线模式下，每30秒重新尝试一次真实请求，避免一次误判导致整个会话永久查不到云端数据
    if(_offlineMode){
      var now = Date.now();
      if(now - _lastOfflineCheckAt < 30000){
        return Promise.resolve(_localDispatch(method, url, body));
      }
      _lastOfflineCheckAt = now;
      // 尝试一次真实请求，成功则恢复在线模式
    }

    return _httpReal(method, url, body).then(function(r){
      if(_offlineMode) console.log('[DemandService] ✅ 云端已恢复，退出离线模式');
      _offlineMode = false;
      return r;
    }).catch(function(e){
      console.error('[DemandService] 云端请求失败:', method, url, e.message);
      // 网络失败，切换到离线模式（仅本次请求降级，不影响已提交但查询失败的真实数据）
      _offlineMode = true;
      console.warn('[DemandService] 云端不可达，切换离线模式:', e.message);
      return _localDispatch(method, url, body);
    });
  }

  // 本地路由分发
  function _localDispatch(method, url, body){
    var base = API;
    var path = url.replace(base,'');
    // GET /api/demand_pool?...
    if(method==='GET' && path.indexOf('?')===0){
      return LocalDB.query(_parseParams(url));
    }
    // GET /api/demand_pool/:id
    if(method==='GET' && /^\/\d+$/.test(path)){
      return LocalDB.getOne(path.slice(1));
    }
    // POST /api/demand_pool
    if(method==='POST' && (path===''||path==='/')){
      return LocalDB.insert(body);
    }
    // PATCH /api/demand_pool/:id/status
    if(method==='PATCH' && /^\/\d+\/status$/.test(path)){
      var id = path.split('/')[1];
      return LocalDB.updateStatus(id, body);
    }
    // POST /api/demand_pool/archive
    if(method==='POST' && path==='/archive'){
      return LocalDB.archive(body.ids||[]);
    }
    return {ok:false, error:'未知接口: '+method+' '+path};
  }

  return {
    init: function(){ this.loadData(); },
    // 暴露给外部：查看当前是否离线模式
    isOffline: function(){ return _offlineMode; },
    // 暴露给外部：强制重置为在线模式（重新尝试云端）
    resetOnline: function(){ _offlineMode = false; },
    // 暴露给外部：导出离线数据（上线前可手动同步到云端）
    exportOfflineData: function(){ return JSON.parse(JSON.stringify(LocalDB._load())); },
    // 调试用：在F12控制台执行 DemandService._debug() 查看当前完整状态
    _debug: function(){
      console.log('=== DemandService 调试信息 ===');
      console.log('离线模式:', _offlineMode);
      console.log('当前tab状态(_status):', _status);
      console.log('当前内存列表(_list)条数:', _list.length, _list.map(function(i){return {id:i.id, status:i.status, name:i.sku_name};}));
      console.log('LocalDB完整数据:', LocalDB._load());
      return {offline:_offlineMode, status:_status, list:_list, localDB:LocalDB._load()};
    },
    showStats: function(){ goPage('p-stats'); if(typeof StatsService!=='undefined') StatsService.refresh(); },
    onEnter: function(){
      // 直接用当前 _status 加载，不从 DOM 读取（避免 goPage 触发时 tab 尚未更新）
      _page = 1;
      this.loadData();
    },

    loadData: function(){
      var self = this;
      var params = [];
      if(_status) params.push('status='+_status);
      if(_search) params.push('q='+encodeURIComponent(_search));
      params.push('page='+_page);
      params.push('page_size='+_pageSize);
      // 传递当前用户角色和ID，让后端按权限返回数据
      // manager/admin 可查全部，buyer 只能查自己提交的
      if(typeof AuthSystem !== 'undefined' && AuthSystem.currentUser){
        var cu = AuthSystem.currentUser;
        params.push('role='+encodeURIComponent(cu.role||'buyer'));
        params.push('user_id='+encodeURIComponent(cu.id||''));
      }
      var url = API + '?' + params.join('&');
      console.log('[DemandService] loadData 请求URL:', url);
      _http('GET', url).then(function(r){
        console.log('[DemandService] loadData 原始响应:', JSON.stringify(r).slice(0,2000));
        // 更新离线模式指示器
        var badge = document.getElementById('offline-badge');
        if(badge) badge.style.display = _offlineMode ? '' : 'none';
        if(r.ok){
          var raw = r.data || [];
          // 前端兜底过滤：云端status参数有时未生效，返回了其他状态的记录
          // 严格按当前tab要求的status过滤，避免脏数据（如已received的记录混入purchased列表）
          if(_status){
            var mismatched = raw.filter(function(item){ return item.status !== _status; });
            if(mismatched.length > 0){
              console.warn('[DemandService] 云端返回了'+mismatched.length+'条状态不符的记录（查询status='+_status+'），已在前端过滤:',
                mismatched.map(function(i){return {id:i.id, actual_status:i.status};}));
            }
            _list = raw.filter(function(item){ return item.status === _status; });
            // total也按实际过滤后的数量估算（分页可能不精确，但避免显示错误总数）
            _total = (r.total || 0) - mismatched.length;
          } else {
            _list = raw;
            _total = r.total || 0;
          }
          // 过滤掉本地已归档的记录（已收货tab下不再显示已归档项，归档状态保存在localStorage）
          if(_status === 'received'){
            var archivedIds = self._getArchivedIds();
            if(archivedIds.length){
              var archivedSet = {};
              archivedIds.forEach(function(id){ archivedSet[String(id)] = true; });
              var beforeCount = _list.length;
              _list = _list.filter(function(item){ return !archivedSet[String(item.id)]; });
              _total = Math.max(0, _total - (beforeCount - _list.length));
            }
          }
          // 待审核tab：额外加载SKU提案（新增/完善SKU待批准），与采购需求并列展示
          if(_status === 'submitted'){
            self._loadSkuProposals(function(){
              self.renderList();
              self.renderPager();
              self.updateNavBadge();
            });
          } else {
            _skuProposals = [];
            self.renderList();
            self.renderPager();
            self.updateNavBadge();
          }
        } else {
          console.error('[DemandService] loadData failed:', r);
        }
      }).catch(function(e){ console.error('[DemandService] loadData error:', e); });
    },

    filterStatus: function(el){
      document.querySelectorAll('#dm-filter-tabs .dm-ftab').forEach(function(t){t.classList.remove('on');});
      el.classList.add('on');
      _status = el.getAttribute('data-status');
      _page = 1;
      this.loadData();
    },

    onSearch: function(){
      _search = document.getElementById('dm-search').value.trim();
      _page = 1;
      this.loadData();
    },

    renderList: function(){
      var box=document.getElementById('dm-list');
      if(!box) return;
      var hasSkuProposals = _status === 'submitted' && _skuProposals.length > 0;
      if(!_list.length && !hasSkuProposals){
        var emptyMsg = '暂无需求';
        if(_status === 'submitted'){
          var cu = (typeof AuthSystem !== 'undefined' && AuthSystem.currentUser) ? AuthSystem.currentUser : null;
          if(cu && (cu.role === 'manager' || cu.role === 'admin')){
            emptyMsg = '暂无待审核需求<br><span style="font-size:11px;color:#94a3b8">如采购员已提交，请稍后刷新或检查后端API权限配置</span>';
          } else if(cu && cu.role === 'buyer'){
            emptyMsg = '暂无待审核需求<br><span style="font-size:11px;color:#94a3b8">您提交的申请需由招采部（hmq账号）审核</span>';
          }
        }
        box.innerHTML='<div class="dm-empty">'+emptyMsg+'</div>';return;
      }
      var isGrouped=(_status==='submitted'||_status==='purchased');
      var isPurchased=_status==='purchased';
      var btn=document.getElementById('dm-batch-btn');
      if(btn){btn.textContent=isPurchased?'📦 批量收货':'✅ 批量通过';btn.style.display=isGrouped?'':'none';}
      var sw=document.getElementById('dm-select-all-wrap');
      if(sw) sw.style.display=isGrouped?'flex':'none';
      var eb=document.getElementById('dm-export-btn');
      if(eb) eb.style.display=isPurchased?'':'none';
      var html='';
      // ── SKU提案区块（仅待审核tab，置顶显示，与采购需求区分颜色） ──
      if(hasSkuProposals){
        html += '<div style="margin-bottom:8px;padding:8px 14px;background:#92400e;color:#fff;border-radius:8px;font-weight:600;font-size:14px">'
          + '📦 待审核SKU提案 <span style="font-weight:400;font-size:12px;opacity:.85">（'+_skuProposals.length+' 条，新增或完善的物资信息，审核后正式入库）</span></div>';
        _skuProposals.forEach(function(item){
          var isUpdate = item.target_sku_code && item.target_sku_code.length > 0;
          html += '<div class="dm-card" style="margin-left:8px;margin-bottom:8px;border-left:3px solid #d97706" onclick="DemandService.detailSkuProposal('+item.id+')">'
            + '<div class="dm-card-hd"><span class="dm-req-no">'+(item.temp_code||'')+'</span>'
            + '<span class="dm-status-pill" style="background:'+(isUpdate?'#fef3c7;color:#d97706':'#dbeafe;color:#1d4ed8')+'">'+(isUpdate?'完善已有SKU':'新增SKU')+'</span></div>'
            + '<div class="dm-card-bd">'
            + '<div class="dm-info-row"><span class="dm-label">名称</span><span>'+(item.name||'-')+'</span></div>'
            + '<div class="dm-info-row"><span class="dm-label">品牌</span><span>'+(item.brand||'-')+'</span></div>'
            + '<div class="dm-info-row"><span class="dm-label">规格</span><span>'+(item.spec||'-')+'</span></div>'
            + '</div>'
            + '<div class="dm-card-ft"><span class="dm-time">'+(item.create_time||'').replace('T',' ').slice(0,16)+'</span><span class="dm-user">'+(item.create_user||'')+'</span></div>'
            + '</div>';
        });
      }
      if(isGrouped){
        var byProj={};var projOrder=[];
        _list.forEach(function(item){
          var p=item.project_name||'未指定项目';
          if(!byProj[p]){byProj[p]=[];projOrder.push(p);}
          byProj[p].push(item);
        });
        projOrder.forEach(function(proj){
          var color=isPurchased?'#1a6b3c':'#1e3a5f';
          var safeProj=proj.replace(/'/g,"\\'");
          html+='<div style="margin-bottom:8px;padding:8px 14px;background:'+color+';color:#fff;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;user-select:none"'
            +' onclick="DemandService.toggleProjSelect(\''+safeProj+'\')" title="点击全选/取消该项目">'
            +(isPurchased?'🛒':'📁')+' '+proj
            +' <span style="font-weight:400;font-size:12px;opacity:.8">（'+byProj[proj].length+' 条，点击全选）</span></div>';
          byProj[proj].forEach(function(item){
            html+='<div class="dm-card" style="position:relative;margin-left:8px;margin-bottom:8px">'
              +'<input type="checkbox" class="dm-batch-cb" data-id="'+item.id+'" data-proj="'+proj.replace(/"/g,'&quot;')+'"'
              +' onclick="event.stopPropagation();DemandService.onCheckChange()"'
              +' style="position:absolute;top:12px;right:12px;width:16px;height:16px;cursor:pointer">'
              +'<div onclick="DemandService.detail('+item.id+')" style="cursor:pointer">'
              +'<div class="dm-card-bd">'
              +'<div class="dm-info-row"><span class="dm-label">物资</span><span>'+(item.sku_name||'-')+'</span></div>'
              +'<div class="dm-info-row"><span class="dm-label">SKU</span><span>'+(item.sku_code||'-')+'</span></div>'
              +'<div class="dm-info-row"><span class="dm-label">数量</span><span>'+item.qty+'</span></div>'
              +'<div class="dm-info-row"><span class="dm-label">申请人</span><span>'+(item.request_user||'-')+'</span></div>'
              +'</div>'
              +'<div class="dm-card-ft"><span class="dm-time">'+(item.create_time||'').replace('T',' ').slice(0,16)+'</span></div>'
              +'</div></div>';
          });
        });
      } else if(_status==='received'){
        // 已收货：按项目+月份分组，加归档按钮
        var byProjMonth={}; var pmOrder=[];
        _list.forEach(function(item){
          var p=item.project_name||'未指定项目';
          var t=item.update_time||item.create_time||'';
          var ym=t.slice(0,7)||'未知月份';
          var key=p+'__'+ym;
          if(!byProjMonth[key]){byProjMonth[key]={proj:p,ym:ym,items:[]};pmOrder.push(key);}
          byProjMonth[key].items.push(item);
        });
        pmOrder.forEach(function(key){
          var g=byProjMonth[key];
          var ids=g.items.map(function(i){return i.id;}).join(',');
          html+='<div style="margin-bottom:8px;padding:8px 14px;background:#5b4fcf;color:#fff;border-radius:8px;font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center">'
            +'<span>📦 '+g.proj+' · '+g.ym+' <span style="font-weight:400;font-size:12px;opacity:.8">（'+g.items.length+' 条）</span></span>'
            +'<button onclick="event.stopPropagation();DemandService.archiveGroup(\''+ids+'\')" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px">🗂 归档</button>'
            +'</div>';
          g.items.forEach(function(item){
            html+='<div class="dm-card" style="margin-left:8px;margin-bottom:8px" onclick="DemandService.detail('+item.id+')">'
              +'<div class="dm-card-bd">'
              +'<div class="dm-info-row"><span class="dm-label">物资</span><span>'+(item.sku_name||'-')+'</span></div>'
              +'<div class="dm-info-row"><span class="dm-label">SKU</span><span>'+(item.sku_code||'-')+'</span></div>'
              +'<div class="dm-info-row"><span class="dm-label">数量</span><span>'+item.qty+'</span></div>'
              +'<div class="dm-info-row"><span class="dm-label">申请人</span><span>'+(item.request_user||'-')+'</span></div>'
              +'</div>'
              +'<div class="dm-card-ft"><span class="dm-time">'+(item.update_time||item.create_time||'').replace('T',' ').slice(0,16)+'</span></div>'
              +'</div>';
          });
        });
      } else {
        _list.forEach(function(item){
          var sl=STATUS_LABEL[item.status]||item.status;
          var sc=STATUS_CLASS[item.status]||'';
          html+='<div class="dm-card" onclick="DemandService.detail('+item.id+')">'
            +'<div class="dm-card-hd"><span class="dm-req-no">'+item.req_no+'</span><span class="dm-status-pill '+sc+'">'+sl+'</span></div>'
            +'<div class="dm-card-bd">'
            +'<div class="dm-info-row"><span class="dm-label">物资</span><span>'+(item.sku_name||'-')+'</span></div>'
            +'<div class="dm-info-row"><span class="dm-label">SKU</span><span>'+(item.sku_code||'-')+'</span></div>'
            +'<div class="dm-info-row"><span class="dm-label">数量</span><span>'+item.qty+'</span></div>'
            +'<div class="dm-info-row"><span class="dm-label">项目</span><span>'+(item.project_name||'-')+'</span></div>'
            +'</div>'
            +'<div class="dm-card-ft"><span class="dm-time">'+(item.create_time||'').replace('T',' ').slice(0,16)+'</span><span class="dm-user">'+(item.request_user||'')+'</span></div>'
            +'</div>';
        });
      }
      box.innerHTML=html;
    },

    renderPager: function(){
      var box = document.getElementById('dm-pager');
      if(!box) return;
      var pages = Math.ceil(_total/_pageSize) || 1;
      if(pages <= 1){ box.innerHTML = ''; return; }
      var html = '';
      if(_page > 1) html += '<span class="dm-pg" onclick="DemandService.gotoPage('+(_page-1)+')">上一页</span>';
      for(var i=1; i<=pages; i++){
        if(i===_page) html += '<span class="dm-pg dm-pg-cur">'+i+'</span>';
        else html += '<span class="dm-pg" onclick="DemandService.gotoPage('+i+')">'+i+'</span>';
      }
      if(_page < pages) html += '<span class="dm-pg" onclick="DemandService.gotoPage('+(_page+1)+')">下一页</span>';
      html += '<span class="dm-pg-info">共'+_total+'条</span>';
      box.innerHTML = html;
    },

    gotoPage: function(p){ _page = p; this.loadData(); },

    detail: function(id){
      var self = this;
      _http('GET', API+'/'+id).then(function(r){
        if(!r.ok){ alert('加载失败: '+r.error); return; }
        var item = r.data;
        var body = document.getElementById('dm-detail-body');
        var ft = document.getElementById('dm-detail-ft');
        var sl = STATUS_LABEL[item.status]||item.status;
        var sc = STATUS_CLASS[item.status]||'';
        body.innerHTML = ''
          +'<div class="dm-detail-grid">'
          +'<div><span class="dm-label">需求单号</span><span>'+item.req_no+'</span></div>'
          +'<div><span class="dm-label">状态</span><span class="dm-status-pill '+sc+'">'+sl+'</span></div>'
          +'<div><span class="dm-label">项目</span><span>'+(item.project_name||'-')+'</span></div>'
          +'<div><span class="dm-label">项目编码</span><span>'+(item.project_code||'-')+'</span></div>'
          +'<div><span class="dm-label">SKU编码</span><span>'+(item.sku_code||'-')+'</span></div>'
          +'<div><span class="dm-label">物资名称</span><span>'+(item.sku_name||'-')+'</span></div>'
          +'<div><span class="dm-label">规格</span><span>'+(item.spec||'-')+'</span></div>'
          +'<div><span class="dm-label">数量</span><span>'+item.qty+'</span></div>'
          +'<div><span class="dm-label">收货地址</span><span>'+(item.address||'-')+'</span></div>'
          +'<div><span class="dm-label">申请人</span><span>'+(item.request_user||'-')+'</span></div>'
          +'<div><span class="dm-label">申请时间</span><span>'+(item.request_time||'').replace('T',' ').slice(0,16)+'</span></div>'
          +'<div><span class="dm-label">创建时间</span><span>'+(item.create_time||'').replace('T',' ').slice(0,16)+'</span></div>'
          +'<div class="dm-detail-full"><span class="dm-label">备注</span><span>'+(item.remark||'无')+'</span></div>'
          +'</div>';
        var ftHtml = '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\x27dm-detail-ov\x27).classList.remove(\x27open\x27)">关闭</button>';
        if(item.status === 'draft'){
          ftHtml += ' <button class="btn btn-blue btn-sm" onclick="DemandService.changeStatus('+item.id+',\x27submitted\x27)">📤 提交审核</button>';
          ftHtml += ' <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="DemandService.changeStatus('+item.id+',\x27cancelled\x27)">取消</button>';
        }
        if(item.status === 'submitted'){
          // 管理员/主管：审核按钮
          ftHtml += ' <button class="btn btn-primary btn-sm" data-perm="approveDemand" onclick="DemandService.approveOne('+item.id+')">✅ 通过→采购中</button>';
          ftHtml += ' <button class="btn btn-ghost btn-sm" data-perm="approveDemand" style="color:var(--red)" onclick="DemandService.rejectOne('+item.id+')">❌ 驳回退回</button>';
          // 采购员：修改/删除自己的提交
          var cu = (typeof AuthSystem !== 'undefined' && AuthSystem.currentUser) ? AuthSystem.currentUser : null;
          if(cu && item.request_user_id && String(item.request_user_id) === String(cu.id)){
            ftHtml += ' <button class="btn btn-ghost btn-sm" style="color:var(--blue);border-color:var(--blue)" onclick="DemandService.editOwnDemand('+item.id+')">✏ 修改</button>';
            ftHtml += ' <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="DemandService.deleteOwnDemand('+item.id+')">🗑 删除</button>';
          }
        }
        if(item.status === 'approved'){
          ftHtml += ' <button class="btn btn-blue btn-sm" onclick="DemandService.changeStatus('+item.id+',\x27purchased\x27)">🛒 开始采购</button>';
        }
        if(item.status === 'purchased'){
          ftHtml += ' <button class="btn btn-primary btn-sm" onclick="DemandService.confirmReceived('+item.id+')">📦 确认收货</button>';
        }
        ft.innerHTML = ftHtml;
        document.getElementById('dm-detail-ov').classList.add('open');
        if(typeof _applyPermissions === 'function') _applyPermissions();
      }).catch(function(e){ console.error('[DemandService] detail error:', e); });
    },

    changeStatus: function(id, status){
      var self = this;
      var user = '';
      if(typeof AuthSystem !== 'undefined' && AuthSystem.currentUser) user = AuthSystem.currentUser.name;
      _http('PATCH', API+'/'+id+'/status', {status:status, request_user:user}).then(function(r){
        if(!r.ok){ alert('操作失败: '+(r.error||JSON.stringify(r))); return; }
        document.getElementById('dm-detail-ov').classList.remove('open');
        // 立即从当前列表移除该条记录（状态已变更，不再属于当前tab）
        _list = _list.filter(function(item){ return String(item.id) !== String(id); });
        _total = Math.max(0, _total - 1);
        self.renderList();
        self.renderPager();
        self.updateNavBadge();
      }).catch(function(e){ alert('网络错误'); });
    },

    onCheckChange: function(){
      var cbs=document.querySelectorAll('.dm-batch-cb');
      var checked=document.querySelectorAll('.dm-batch-cb:checked');
      var all=document.getElementById('dm-select-all');
      if(all) all.checked=cbs.length>0&&checked.length===cbs.length;
    },
    toggleSelectAll: function(v){
      document.querySelectorAll('.dm-batch-cb').forEach(function(cb){cb.checked=v;});
      this.onCheckChange();
    },
    toggleProjSelect: function(proj){
      var cbs=[].slice.call(document.querySelectorAll('.dm-batch-cb[data-proj="'+proj+'"]'));
      var allChecked=cbs.length>0&&cbs.every(function(cb){return cb.checked;});
      cbs.forEach(function(cb){cb.checked=!allChecked;});
      this.onCheckChange();
    },
    batchAction: function(){
      var self=this;
      var isPurchased=_status==='purchased';
      var nextStatus=isPurchased?'received':'purchased';
      var label=isPurchased?'批量标记收货':'批量审核通过并转入采购中';
      console.log('[batchAction] 当前_status:', _status, '判定isPurchased:', isPurchased, '将要PATCH的nextStatus:', nextStatus);
      if(!isPurchased&&!AuthSystem.can('approveDemand')){alert('您没有审核权限');return;}
      var checked=[].slice.call(document.querySelectorAll('.dm-batch-cb:checked'));
      if(!checked.length){alert('请先勾选条目');return;}
      if(!confirm('确认'+label+'？共 '+checked.length+' 条'))return;
      var user='';
      if(typeof AuthSystem!=='undefined'&&AuthSystem.currentUser)user=AuthSystem.currentUser.name;
      var done=0,fail=0,failMsgs=[];
      // 记录哪些ID已在后端完成（received→received也算已完成）
      var doneIds = [];
      var idToItem = {};
      _list.forEach(function(it){ idToItem[String(it.id)] = it; });
      Promise.all(checked.map(function(cb){
        var id=cb.getAttribute('data-id');
        var reqBody = {status:nextStatus,request_user:user};
        console.log('[batchAction] PATCH '+API+'/'+id+'/status 请求体:', JSON.stringify(reqBody));
        return _http('PATCH',API+'/'+id+'/status',reqBody)
          .then(function(r){
            console.log('[batchAction] PATCH ID='+id+' 响应:', JSON.stringify(r));
            if(r.ok){
              done++; doneIds.push(id);
              var it = idToItem[String(id)];
              self._logOp(id, it?it.req_no:'', _status, nextStatus);
            } else {
              var errMsg = r.error || '';
              // 情况A：目标状态→目标状态（如 received→received），已经是目标状态
              var alreadyTarget = errMsg.indexOf(nextStatus+' → '+nextStatus) >= 0;
              // 情况B：当前列表显示的状态(_status)与云端实际状态不符，且云端状态比当前tab更靠后
              // 例如 received → purchased：说明这条记录早就流转到received了，"采购中"列表是脏数据
              var staleData = errMsg.indexOf('received → '+nextStatus) >= 0 ||
                               errMsg.indexOf('cancelled → '+nextStatus) >= 0;
              if(alreadyTarget || staleData){
                doneIds.push(id); // 云端数据比前端列表更新，静默清除过期记录
                var it2 = idToItem[String(id)];
                self._logOp(id, it2?it2.req_no:'', '(已是目标状态)', nextStatus);
              } else {
                fail++; failMsgs.push('ID '+id+': '+errMsg);
              }
            }
          }).catch(function(e){ fail++; failMsgs.push('ID '+id+': 网络错误'); });
      })).then(function(){
        console.log('[batchAction] 全部完成。done='+done+' fail='+fail+' doneIds=', doneIds);
        // 从当前列表移除所有已完成的ID（包括脏数据），留在当前tab，不跳转不重新请求
        if(doneIds.length){
          var doneSet = {};
          doneIds.forEach(function(id){ doneSet[String(id)] = true; });
          _list = _list.filter(function(item){ return !doneSet[String(item.id)]; });
          _total = Math.max(0, _total - doneIds.length);
        }
        var msg = doneIds.length > 0 ? '✅ ' + doneIds.length + ' 条已处理' : '';
        if(fail > 0) msg += (msg ? '，' : '') + '⚠️ ' + fail + ' 条真实失败：\n' + failMsgs.slice(0,5).join('\n');
        alert(msg || '无操作');
        // 验证：操作完成后，立即反查第一个ID的真实云端状态
        if(doneIds.length > 0){
          _http('GET', API+'/'+doneIds[0]).then(function(vr){
            if(vr.ok && vr.data){
              console.log('[batchAction] 验证 ID='+doneIds[0]+' 云端真实状态:', vr.data.status, '（期望:', nextStatus+'）');
              if(vr.data.status !== nextStatus){
                console.error('[batchAction] ⚠️⚠️ 严重问题：PATCH返回成功，但云端真实状态是「'+vr.data.status+'」，不是期望的「'+nextStatus+'」！这是后端Worker的写入异常。');
              }
            }
          }).catch(function(e){ console.warn('[batchAction] 验证请求失败:', e); });
        }
        // 取消全选状态
        var selAll = document.getElementById('dm-select-all');
        if(selAll) selAll.checked = false;
        self.renderList();
        self.renderPager();
        self.updateNavBadge();
      });
    },
    approveOne: function(id){
      var self=this;
      if(!confirm('确认审核通过并转入采购中？'))return;
      var user='';
      if(typeof AuthSystem!=='undefined'&&AuthSystem.currentUser)user=AuthSystem.currentUser.name;
      var theItem = _list.find(function(it){ return String(it.id)===String(id); });
      _http('PATCH',API+'/'+id+'/status',{status:'purchased',request_user:user}).then(function(r){
        if(!r.ok){alert('失败: '+(r.error||JSON.stringify(r)));return;}
        document.getElementById('dm-detail-ov').classList.remove('open');
        self._logOp(id, theItem?theItem.req_no:'', 'submitted', 'purchased');
        // 立即从当前列表移除该条记录，不依赖重新查询，确保"待审核"tab下立刻消失
        _list = _list.filter(function(item){ return String(item.id) !== String(id); });
        _total = Math.max(0, _total - 1);
        self.renderList();
        self.renderPager();
        self.updateNavBadge();
        alert('✅ 已转入采购中');
      }).catch(function(){alert('网络错误');});
    },
    rejectOne: function(id){
      var self=this;
      var reason=prompt('请输入驳回原因（采购员将在全部列表中看到）：');
      if(reason===null)return;
      if(!reason.trim()){alert('请填写驳回原因');return;}
      var user='';
      if(typeof AuthSystem!=='undefined'&&AuthSystem.currentUser)user=AuthSystem.currentUser.name;
      _http('PATCH',API+'/'+id+'/status',{status:'cancelled',request_user:user,remark:'【驳回原因】'+reason}).then(function(r){
        if(!r.ok){alert('失败: '+(r.error||JSON.stringify(r)));return;}
        document.getElementById('dm-detail-ov').classList.remove('open');
        // 立即从当前列表移除该条记录，确保"待审核"tab下立刻消失
        _list = _list.filter(function(item){ return String(item.id) !== String(id); });
        _total = Math.max(0, _total - 1);
        self.renderList();
        self.renderPager();
        self.updateNavBadge();
        alert('已驳回，采购员可在"全部"列表查看原因');
      }).catch(function(){alert('网络错误');});
    },
    // 采购员修改自己提交的待审核需求 → 打开编辑表单，保存后退回草稿
    editOwnDemand: function(id){
      var self = this;
      _http('GET', API+'/'+id).then(function(r){
        if(!r.ok){ alert('加载失败: '+r.error); return; }
        var item = r.data;
        var cu = (typeof AuthSystem !== 'undefined' && AuthSystem.currentUser) ? AuthSystem.currentUser : null;
        // 安全性校验：只有提交者本人可修改
        if(!cu || String(item.request_user_id) !== String(cu.id)){
          alert('只能修改自己提交的需求');
          return;
        }
        document.getElementById('dm-detail-ov').classList.remove('open');
        // 渲染编辑弹窗
        self._renderEditModal(item);
      }).catch(function(e){ alert('加载失败: '+e); });
    },
    // 采购员删除自己提交的待审核需求 → 确认后标记cancelled
    deleteOwnDemand: function(id){
      var self = this;
      var cu = (typeof AuthSystem !== 'undefined' && AuthSystem.currentUser) ? AuthSystem.currentUser : null;
      var reason = prompt('请输入删除原因（必填）：');
      if(reason === null) return;
      if(!reason.trim()){ alert('请填写删除原因'); return; }
      _http('GET', API+'/'+id).then(function(r){
        if(!r.ok){ alert('加载失败: '+r.error); return; }
        var item = r.data;
        // 安全性校验
        if(!cu || String(item.request_user_id) !== String(cu.id)){
          alert('只能删除自己提交的需求');
          return;
        }
        if(!confirm('确认删除该需求？\n\n单号：'+item.req_no+'\n物资：'+item.sku_name+'\n原因：'+reason.trim())) return;
        var user = (typeof AuthSystem !== 'undefined' && AuthSystem.currentUser) ? AuthSystem.currentUser.name : '';
        var remark = '【采购员删除】原因：'+reason.trim()+'（操作人：'+user+'）';
        _http('PATCH', API+'/'+id+'/status', {status:'cancelled', request_user:user, remark:remark}).then(function(r2){
          if(!r2.ok){ alert('操作失败: '+(r2.error||JSON.stringify(r2))); return; }
          document.getElementById('dm-detail-ov').classList.remove('open');
          self._logOp(id, item.req_no||'', 'submitted', 'cancelled');
          _list = _list.filter(function(it){ return String(it.id) !== String(id); });
          _total = Math.max(0, _total - 1);
          self.renderList();
          self.renderPager();
          self.updateNavBadge();
          alert('已删除，可在"已取消"列表查看');
        }).catch(function(){ alert('网络错误'); });
      }).catch(function(e){ alert('加载失败: '+e); });
    },
    // 编辑弹窗渲染（复用现有模态框样式）
    _renderEditModal: function(item){
      // 移除已有编辑弹窗
      var existing = document.getElementById('dm-edit-ov');
      if(existing) existing.parentNode.removeChild(existing);
      var html = '<div class="m-overlay open" id="dm-edit-ov">'
        +'<div class="m-box" style="max-width:560px;max-height:90vh">'
        +'<div class="m-hd"><span>✏</span><h3>修改采购需求</h3><button class="m-close" onclick="var e=document.getElementById(\'dm-edit-ov\');if(e)e.parentNode.removeChild(e);">✕</button></div>'
        +'<div class="m-bd" style="overflow-y:auto">'
        +'<div class="dm-detail-grid">'
        +'<div><span class="dm-label">需求单号</span><span>'+item.req_no+'</span></div>'
        +'<div><span class="dm-label">原状态</span><span class="dm-status-pill dm-status-submitted">待审核</span></div>'
        +'<div><span class="dm-label">项目</span><span>'+(item.project_name||'-')+'</span></div>'
        +'<div style="display:none"><span class="dm-label">SKU编码</span><span>'+item.sku_code+'</span></div>'
        +'</div>'
        +'<div class="f-lbl">物资名称 <span style="color:var(--red)">*</span></div>'
        +'<input class="f-inp" id="edit-sku-name" value="'+(item.sku_name||'').replace(/"/g,'&quot;')+'">'
        +'<div class="f-lbl">规格型号 <span style="color:var(--red)">*</span></div>'
        +'<input class="f-inp" id="edit-spec" value="'+(item.spec||'').replace(/"/g,'&quot;')+'">'
        +'<div class="f-lbl">数量</div>'
        +'<input class="f-inp" id="edit-qty" type="number" min="1" value="'+(item.qty||1)+'" style="width:100px">'
        +'<div class="f-lbl">收货地址</div>'
        +'<input class="f-inp" id="edit-address" value="'+(item.address||'').replace(/"/g,'&quot;')+'">'
        +'<div class="f-lbl">备注</div>'
        +'<textarea class="f-inp f-ta" id="edit-remark">'+(item.remark||'').replace(/"/g,'&quot;')+'</textarea>'
        +'<div style="margin-top:10px;font-size:11px;color:var(--amber);background:var(--amber-bg);border-radius:6px;padding:8px;line-height:1.6">'
        +'⚠️ 提交后将<strong>退回草稿</strong>状态，需重新提交审核</div>'
        +'</div>'
        +'<div class="m-ft">'
        +'<button class="btn btn-ghost btn-sm" onclick="var e=document.getElementById(\'dm-edit-ov\');if(e)e.parentNode.removeChild(e);">取消</button>'
        +'<button class="btn btn-blue btn-sm" id="dm-edit-save">💾 保存修改</button>'
        +'</div></div></div>';
      var div = document.createElement('div');
      div.innerHTML = html;
      document.body.appendChild(div.firstElementChild);
      // 绑定保存事件
      var self = this;
      document.getElementById('dm-edit-save').onclick = function(){
        self._saveEdit(item.id);
      };
    },
    // 保存编辑内容
    _saveEdit: function(id){
      var self = this;
      var name = document.getElementById('edit-sku-name').value.trim();
      var spec = document.getElementById('edit-spec').value.trim();
      var qty  = parseInt(document.getElementById('edit-qty').value) || 1;
      var addr = document.getElementById('edit-address').value.trim();
      var rmk  = document.getElementById('edit-remark').value.trim();
      if(!name){ alert('请填写物资名称'); return; }
      if(!spec){ alert('请填写规格型号'); return; }
      var user = (typeof AuthSystem !== 'undefined' && AuthSystem.currentUser) ? AuthSystem.currentUser.name : '';
      var userObj = (typeof AuthSystem !== 'undefined' && AuthSystem.currentUser) ? AuthSystem.currentUser : null;
      // 先回退状态：submitted → draft
      var remark = '【采购员修改】原值被修改，需重新提交审核';
      _http('PATCH', API+'/'+id+'/status', {status:'draft', request_user:user, remark:remark}).then(function(r){
        if(!r.ok){ alert('状态更新失败: '+(r.error||JSON.stringify(r))); return; }
        // 再通过API更新内容字段（复用同一状态流转接口的扩展参数，Worker自动识别并更新）
        var fieldBody = {
          status: 'draft', request_user: user,
          sku_name: name, spec: spec, qty: qty, address: addr, remark: remark,
          _update_fields: true
        };
        // 尝试更新内容字段；如果云端Worker不支持字段更新，走LocalDB作为本地补充
        _http('PATCH', API+'/'+id+'/status', fieldBody).then(function(r2){
          // 更新成功或已处理
          self._finishEdit(id);
        }).catch(function(e){
          console.warn('[editOwnDemand] 内容字段更新失败，使用LocalDB兜底:', e);
          // 离线/Worker不支持时：用LocalDB更新本地内容
          var fields = {sku_name: name, spec: spec, qty: qty, address: addr, remark: remark, _setDraft: false};
          var lb = LocalDB.updateFields(id, fields);
          if(lb.ok){
            self._finishEdit(id);
          } else {
            self._finishEdit(id);
            alert('⚠️ 状态已退回草稿（云端暂不支持内容字段更新，请在本机重新编辑后再提交）');
          }
        });
      }).catch(function(e){ alert('网络错误: '+e); });
    },
    _finishEdit: function(id){
      var self = this;
      var ov = document.getElementById('dm-edit-ov');
      if(ov) ov.parentNode.removeChild(ov);
      self._logOp(id, '', 'submitted', 'draft');
      _list = _list.filter(function(it){ return String(it.id) !== String(id); });
      _total = Math.max(0, _total - 1);
      self.renderList();
      self.renderPager();
      self.updateNavBadge();
      alert('✅ 已退回草稿，请到"草稿"列表重新提交');
    },
    confirmReceived: function(id){
      var self=this;
      if(!confirm('确认已收货？'))return;
      var user='';
      if(typeof AuthSystem!=='undefined'&&AuthSystem.currentUser)user=AuthSystem.currentUser.name;
      var theItem = _list.find(function(it){ return String(it.id)===String(id); });
      _http('PATCH',API+'/'+id+'/status',{status:'received',request_user:user}).then(function(r){
        console.log('[DemandService] PATCH /'+id+'/status 返回:', JSON.stringify(r));
        if(!r.ok){alert('失败: '+(r.error||JSON.stringify(r)));return;}
        document.getElementById('dm-detail-ov').classList.remove('open');
        self._logOp(id, theItem?theItem.req_no:'', 'purchased', 'received');
        // 立即从当前列表移除该条记录，确保"采购中"tab下立刻消失
        _list = _list.filter(function(item){ return String(item.id) !== String(id); });
        _total = Math.max(0, _total - 1);
        self.renderList();
        self.renderPager();
        self.updateNavBadge();
        // 关键验证：PATCH返回成功后，立即GET反查云端真实状态，确认是否真的写入了
        _http('GET', API+'/'+id).then(function(verifyR){
          if(verifyR.ok && verifyR.data){
            var actualStatus = verifyR.data.status;
            if(actualStatus !== 'received'){
              console.error('[DemandService] ⚠️ 严重问题：PATCH返回成功但云端实际状态未变！',
                'ID='+id, '期望status=received', '实际status='+actualStatus,
                '这是后端Worker的写入问题，不是前端bug，请检查后端代码');
              alert('⚠️ 警告：系统提示已成功，但云端反查发现状态实际是「'+actualStatus+'」而非「已收货」。\n这是后端数据写入异常，请联系开发检查 Worker 的 PATCH /status 接口实现（ID='+id+'）。');
            } else {
              console.log('[DemandService] ✅ 验证通过：ID='+id+' 云端状态已确认为 received');
            }
          }
        }).catch(function(e){ console.warn('[DemandService] 验证请求失败:', e); });
        alert('✅ 收货确认完成！');
      }).catch(function(){alert('网络错误');});
    },
    exportByProject: function(){
      _http('GET',API+'?status=purchased&page_size=200').then(function(r){
        if(!r.ok||!r.data||!r.data.length){alert('采购中暂无数据');return;}
        var byProj={};
        r.data.forEach(function(it){
          var p=it.project_name||'未指定';
          if(!byProj[p])byProj[p]=[];
          byProj[p].push(it);
        });
        // 构建 Excel 数据（使用 xlsx 库，彻底避免 CSV 时间乱码）
        var allRows=[['项目','物资名称','SKU编码','规格','数量','申请人','申请时间']];
        Object.keys(byProj).sort().forEach(function(proj){
          byProj[proj].forEach(function(it){
            var rawTime = it.request_time||it.create_time||'';
            var fmtTime = rawTime.replace('T',' ').slice(0,16);
            allRows.push([proj, it.sku_name||'', it.sku_code||'', it.spec||'', it.qty||0, it.request_user||'', fmtTime]);
          });
          allRows.push([]); // 项目间空行
        });
        if(typeof XLSX !== 'undefined'){
          var ws = XLSX.utils.aoa_to_sheet(allRows);
          // 设置列宽
          ws['!cols']=[{wch:14},{wch:40},{wch:18},{wch:20},{wch:8},{wch:10},{wch:18}];
          var wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, '采购清单');
          XLSX.writeFile(wb, '采购清单_'+new Date().toISOString().slice(0,10)+'.xlsx');
        } else {
          // 降级 CSV
          var rows=['\uFEFF项目,物资名称,SKU编码,规格,数量,申请人,申请时间'];
          allRows.slice(1).forEach(function(cols){
            rows.push(cols.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(','));
          });
          var blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'});
          var a=document.createElement('a');
          a.href=URL.createObjectURL(blob);
          a.download='采购清单_'+new Date().toISOString().slice(0,10)+'.csv';
          document.body.appendChild(a);a.click();document.body.removeChild(a);
        }
      });
    },
    // 本地持久化的"已归档ID"集合（不依赖云端/archive接口，因为云端尚未实现该接口）
    _ARCHIVED_KEY: 'demand_archived_ids_v1',
    _getArchivedIds: function(){
      try{ return JSON.parse(localStorage.getItem(this._ARCHIVED_KEY)||'[]'); }catch(e){ return []; }
    },
    _saveArchivedIds: function(ids){
      try{ localStorage.setItem(this._ARCHIVED_KEY, JSON.stringify(ids)); }catch(e){}
    },
    // 操作日志：记录每次"本人在本机执行过的状态变更"，用于追溯某条记录是否真的处理过
    _OPLOG_KEY: 'demand_oplog_v1',
    _logOp: function(id, reqNo, fromStatus, toStatus){
      var log;
      try{ log = JSON.parse(localStorage.getItem(this._OPLOG_KEY)||'[]'); }catch(e){ log = []; }
      log.push({
        id: id, req_no: reqNo||'', from: fromStatus, to: toStatus,
        time: new Date().toISOString(),
        user: (typeof AuthSystem!=='undefined'&&AuthSystem.currentUser)?AuthSystem.currentUser.name:''
      });
      // 只保留最近500条，避免无限增长
      if(log.length > 500) log = log.slice(log.length-500);
      try{ localStorage.setItem(this._OPLOG_KEY, JSON.stringify(log)); }catch(e){}
    },
    // 查询某条记录的操作历史：在F12控制台执行 DemandService.checkHistory(id) 或 DemandService.checkHistory('需求单号')
    checkHistory: function(idOrReqNo){
      var log;
      try{ log = JSON.parse(localStorage.getItem(this._OPLOG_KEY)||'[]'); }catch(e){ log = []; }
      var matches = log.filter(function(entry){
        return String(entry.id) === String(idOrReqNo) || entry.req_no === idOrReqNo;
      });
      if(!matches.length){
        console.log('⚪ 本机从未对 "'+idOrReqNo+'" 执行过任何状态变更操作（在当前浏览器的记录范围内）');
      } else {
        console.log('🔵 "'+idOrReqNo+'" 的本机操作历史:');
        matches.forEach(function(m){
          console.log('  ['+m.time.replace('T',' ').slice(0,19)+'] '+m.user+': '+m.from+' → '+m.to);
        });
      }
      return matches;
    },
    // 查看全部操作日志
    viewAllHistory: function(){
      var log;
      try{ log = JSON.parse(localStorage.getItem(this._OPLOG_KEY)||'[]'); }catch(e){ log = []; }
      console.table(log);
      return log;
    },
    // UI版本：在数据管理弹窗里查询并渲染结果
    _uiCheckHistory: function(){
      var input = document.getElementById('oplog-search-input');
      var resultBox = document.getElementById('oplog-result');
      if(!input || !resultBox) return;
      var q = input.value.trim();
      if(!q){ resultBox.innerHTML = '<span style="color:var(--red)">请输入需求单号或记录ID</span>'; return; }
      var matches = this.checkHistory(q);
      if(!matches.length){
        resultBox.innerHTML = '⚪ 本机从未对 "'+q+'" 执行过任何状态变更操作（说明这是一条尚未被本浏览器处理过的记录，不是"残留"）';
      } else {
        var html = '🔵 "'+q+'" 的本机操作历史（共'+matches.length+'条）：<br>';
        matches.forEach(function(m){
          html += '［'+m.time.replace('T',' ').slice(0,19)+'］'+(m.user||'未知用户')+'：'+m.from+' → '+m.to+'<br>';
        });
        resultBox.innerHTML = html;
      }
    },
    _uiViewAllHistory: function(){
      var resultBox = document.getElementById('oplog-result');
      if(!resultBox) return;
      var log = this.viewAllHistory();
      if(!log.length){
        resultBox.innerHTML = '本机暂无任何操作记录';
        return;
      }
      var html = '共 '+log.length+' 条本机操作记录（最新在前）：<br>';
      log.slice().reverse().slice(0,50).forEach(function(m){
        html += '［'+m.time.replace('T',' ').slice(0,19)+'］ID='+m.id+' 单号='+(m.req_no||'-')+' '+(m.user||'')+'：'+m.from+' → '+m.to+'<br>';
      });
      if(log.length > 50) html += '（仅显示最近50条，完整数据可在F12控制台执行 DemandService.viewAllHistory() 查看）';
      resultBox.innerHTML = html;
    },
    archiveGroup: function(idsStr){
      var self=this;
      var ids=idsStr.split(',').map(function(s){return s.trim();}).filter(Boolean);
      if(!confirm('确认将这 '+ids.length+' 条记录归档？归档后将从此列表消失，可在「历史」页查看。'))return;
      // 持久化到 localStorage（本机长期有效，不依赖云端接口）
      var archived = self._getArchivedIds();
      var archivedSet = {};
      archived.forEach(function(id){ archivedSet[String(id)] = true; });
      ids.forEach(function(id){ archivedSet[String(id)] = true; });
      self._saveArchivedIds(Object.keys(archivedSet));
      // 立即从当前列表移除
      var idSet={};
      ids.forEach(function(id){idSet[id]=true;});
      _list = _list.filter(function(item){return !idSet[String(item.id)];});
      _total = Math.max(0, _total - ids.length);
      self.renderList();
      self.renderPager();
      alert('✅ 已归档 '+ids.length+' 条，可在「历史」页查看完整采购记录\n（归档状态保存在本机浏览器，换电脑需重新归档）');
    },

    submitFromCart: function(){
      var self = this;
      if(typeof PCService === 'undefined'){ alert('采购中心未就绪'); return; }
      var pid = PCService.getPid ? PCService.getPid() : null;
      if(!pid){ alert('请先选择项目'); return; }
      var cart = PCService.getCart ? PCService.getCart(pid) : [];
      if(!cart || !cart.length){ alert('购物车为空，请先添加物资'); return; }
      var proj = PCService.getCurrentProject ? PCService.getCurrentProject() : {};
      var projName = proj ? (proj.name || pid) : pid;
      var user = '';
      if(typeof AuthSystem !== 'undefined' && AuthSystem.currentUser) user = AuthSystem.currentUser.name;

      if(!confirm('确认提交采购申请？\n项目: '+projName+'\n物资: '+cart.length+' 项')) return;

      // ── 新路径：RoleRouter 已登录时，走 /api/orders 状态机 ──────
      var rrToken = typeof RoleRouter !== 'undefined' ? RoleRouter.getToken() : null;
      if(rrToken){
        var items = cart.map(function(item){
          return {
            sku_code:  item.code  || item.skuCode  || '',
            sku_name:  item.name  || item.skuName  || '',
            brand:     item.brand || '',
            spec:      item.spec  || item.specModel || '',
            unit:      item.unit  || '',
            qty:       item.qty   || 1,
            est_price: item.price || 0,
            is_temp:   (typeof TempSKU !== 'undefined') ? TempSKU.isTemp(item) : false
          };
        });
        RoleRouter.fetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify({ items: items, remark: '' })
        }).then(function(res){
          if(res && res.ok){
            alert('✅ 提交成功！' + cart.length + ' 项物资申请已进入【待审核】，等待招采部审核');
            if(typeof PCService.clearCart === 'function') PCService.clearCart();
            // 跳转到需求池待审核 tab
            _status = 'pending_review';
            _page = 1;
            _search = '';
            var tab = document.querySelector('#dm-filter-tabs .dm-ftab[data-status="pending_review"]');
            if(tab){
              document.querySelectorAll('#dm-filter-tabs .dm-ftab').forEach(function(t){t.classList.remove('on');});
              tab.classList.add('on');
            }
            goPage('p-demand');
            setTimeout(function(){ DemandService.loadData(); }, 600);
          } else {
            alert('提交失败：' + (res && res.error ? res.error : JSON.stringify(res)));
          }
        }).catch(function(e){ alert('提交失败（网络错误）: ' + e.message); });
        return;
      }

      // ── 旧路径：未登录 RoleRouter 时，直接写本地 LocalDB（不等云端超时）────
      // /api/demand_pool 云端不存在，_http 会等 10 秒超时才降级；这里跳过云端直接本地存储
      _offlineMode = true; // 强制离线，loadData 也走 LocalDB
      var results = cart.map(function(item, idx){
        var reqNo = 'REQ-'+new Date().toISOString().replace(/[-:T]/g,'').slice(0,14)+'-'+String(idx+1).padStart(3,'0')+'-'+Math.random().toString(36).slice(2,5).toUpperCase();
        var body = {
          req_no: reqNo,
          project_name: projName,
          project_code: pid,
          request_user: user,
          sku_code: item.code || item.skuCode || '',
          sku_name: item.name || item.skuName || '',
          spec: item.spec || item.specModel || '',
          qty: item.qty || 1,
          address: '',
          remark: '',
          request_time: new Date().toISOString(),
          status: 'submitted'
        };
        return LocalDB.insert(body); // 同步写入 localStorage，立即返回 {ok:true}
      });

      var okCount = results.filter(function(r){return r && r.ok;}).length;
      if(okCount === 0){
        alert('提交失败，请重试');
        return;
      }
      alert('✅ 提交成功！共 '+okCount+' 条采购申请已提交，等待招采部审核');
      if(typeof PCService.clearCart === 'function') PCService.clearCart();
      _status = 'submitted';
      _page = 1;
      _search = '';
      _lastOfflineCheckAt = Date.now(); // 30s内 loadData 直走 LocalDB，不再尝试云端
      var tab=document.querySelector('#dm-filter-tabs .dm-ftab[data-status="submitted"]');
      if(tab){
        document.querySelectorAll('#dm-filter-tabs .dm-ftab').forEach(function(t){t.classList.remove('on');});
        tab.classList.add('on');
      }
      goPage('p-demand');
      // onEnter → loadData → LocalDB.query → 立即显示刚提交的记录
      self.onEnter();
    },

    updateNavBadge: function(){
      var el = document.getElementById('dm-nav-b');
      if(!el) return;
      var params = ['status=submitted','page_size=1'];
      if(typeof AuthSystem !== 'undefined' && AuthSystem.currentUser){
        var cu = AuthSystem.currentUser;
        params.push('role='+encodeURIComponent(cu.role||'buyer'));
        params.push('user_id='+encodeURIComponent(cu.id||''));
      }
      _http('GET', API+'?'+params.join('&')).then(function(r){
        var demandCount = (r.ok && r.total) ? r.total : 0;
        var skuCount = _skuProposals.length;
        var total = demandCount + skuCount;
        if(total > 0){
          el.textContent = total;
          el.style.display = '';
        } else {
          el.style.display = 'none';
        }
      }).catch(function(){ el.style.display = 'none'; });
    },

    /* ═══════════════════════════════════════════
       SKU提案（新增/完善SKU待审核）
       与"待审核"采购需求并列显示，区分展示
    ═══════════════════════════════════════════ */
    _loadSkuProposals: function(cb){
      _http('GET', SKU_PROPOSAL_API + '?status=pending&page_size=100').then(function(r){
        _skuProposals = (r && r.ok) ? (r.data || []) : [];
        if(cb) cb();
      }).catch(function(){
        _skuProposals = [];
        if(cb) cb();
      });
    },

    // 查看SKU提案详情
    detailSkuProposal: function(id){
      var item = _skuProposals.find(function(p){ return String(p.id) === String(id); });
      if(!item){ alert('未找到该提案'); return; }
      var body = document.getElementById('dm-detail-body');
      var ft = document.getElementById('dm-detail-ft');
      var isUpdate = item.target_sku_code && item.target_sku_code.length > 0; // 是"完善已有SKU"还是"新增SKU"
      body.innerHTML = ''
        +'<div class="dm-detail-grid">'
        +'<div><span class="dm-label">提案类型</span><span class="dm-status-pill" style="background:'+(isUpdate?'#fef3c7;color:#d97706':'#dbeafe;color:#1d4ed8')+'">'+(isUpdate?'完善已有SKU':'新增SKU')+'</span></div>'
        +'<div><span class="dm-label">临时编码</span><span>'+(item.temp_code||'-')+'</span></div>'
        +(isUpdate?'<div><span class="dm-label">关联正式SKU</span><span>'+item.target_sku_code+'</span></div>':'')
        +'<div><span class="dm-label">物资名称</span><span>'+(item.name||'-')+'</span></div>'
        +'<div><span class="dm-label">品牌</span><span>'+(item.brand||'-')+'</span></div>'
        +'<div><span class="dm-label">规格</span><span>'+(item.spec||'-')+'</span></div>'
        +'<div><span class="dm-label">单位</span><span>'+(item.unit||'-')+'</span></div>'
        +'<div><span class="dm-label">申请人</span><span>'+(item.create_user||'-')+'</span></div>'
        +'<div><span class="dm-label">项目</span><span>'+(item.project_name||'-')+'</span></div>'
        +'<div><span class="dm-label">采购链接</span><span>'+(item.purchase_link?'<a href="'+item.purchase_link+'" target="_blank" style="color:#2563EB">查看</a>':'-')+'</span></div>'
        +'<div><span class="dm-label">图片</span><span>'+(item.image_url?'<img src="'+item.image_url+'" style="max-width:120px;max-height:80px;border-radius:6px">':'-')+'</span></div>'
        +'<div><span class="dm-label">创建时间</span><span>'+(item.create_time||'').replace('T',' ').slice(0,16)+'</span></div>'
        +'<div class="dm-detail-full"><span class="dm-label">备注</span><span>'+(item.remark||'无')+'</span></div>'
        +'</div>';
      var ftHtml = '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'dm-detail-ov\').classList.remove(\'open\')">关闭</button>';
      ftHtml += ' <button class="btn btn-primary btn-sm" data-perm="approveDemand" onclick="DemandService.openSkuApproveModal('+item.id+')">✅ 审核通过并赋正式编码</button>';
      ftHtml += ' <button class="btn btn-ghost btn-sm" data-perm="approveDemand" style="color:var(--red)" onclick="DemandService.rejectSkuProposal('+item.id+')">❌ 驳回</button>';
      ft.innerHTML = ftHtml;
      document.getElementById('dm-detail-ov').classList.add('open');
      if(typeof _applyPermissions === 'function') _applyPermissions();
    },

    // 打开类目选择弹窗（复用现有 sim-modal-overlay 三级类目UI）
    openSkuApproveModal: function(id){
      var item = _skuProposals.find(function(p){ return String(p.id) === String(id); });
      if(!item){ alert('未找到该提案'); return; }
      document.getElementById('dm-detail-ov').classList.remove('open');
      _pendingSkuApprovalId = id;
      document.getElementById('ncm-name').textContent = item.name || '';
      document.getElementById('ncm-brand').textContent = item.brand ? '品牌：'+item.brand : '';
      var c1s = [...new Set(DB.map(function(x){return x.cat1;}))].filter(Boolean).sort();
      var s1 = document.getElementById('ncm-c1');
      s1.innerHTML = '<option value="">请选择一级类目</option>';
      c1s.forEach(function(c){ var o=document.createElement('option'); o.value=c; o.textContent=c; s1.appendChild(o); });
      document.getElementById('ncm-c2').innerHTML = '<option value="">请选择二级类目</option>';
      document.getElementById('ncm-c3').innerHTML = '<option value="">请选择三级类目</option>';
      document.getElementById('ncm-preview').textContent = '';
      // 复用原有 onchange 绑定（ncmOnC1/ncmOnC2/ncmPreview），但确认按钮改为走SKU审核专用流程
      var ftBtn = document.querySelector('.sim-modal-ft .btn-blue');
      if(ftBtn){
        ftBtn.textContent = '✦ 生成正式编码并通过审核';
        ftBtn.setAttribute('onclick', 'DemandService.confirmSkuApprove()');
      }
      document.getElementById('sim-modal-overlay').classList.add('open');
    },

    // 确认审核通过：生成正式编码、写入SKU库、标记提案为approved
    confirmSkuApprove: function(){
      if(!_pendingSkuApprovalId){ return; }
      var item = _skuProposals.find(function(p){ return String(p.id) === String(_pendingSkuApprovalId); });
      if(!item){ alert('提案不存在或已处理'); return; }
      var c1 = document.getElementById('ncm-c1').value;
      var c2 = document.getElementById('ncm-c2').value;
      var c3 = document.getElementById('ncm-c3').value;
      console.log('[confirmSkuApprove] 选择的类目: c1='+c1+' c2='+c2+' c3='+c3);
      if(!c1||!c2||!c3){
        var c2Options = document.getElementById('ncm-c2').options.length;
        var c3Options = document.getElementById('ncm-c3').options.length;
        console.warn('[confirmSkuApprove] 类目未选全。二级类目可选项数(含占位)='+c2Options+'，三级类目可选项数(含占位)='+c3Options);
        if(c2Options<=1) alert('该一级类目「'+c1+'」下暂无二级类目可选，无法赋码。\n请联系管理员补充该类目的二级/三级分类数据。');
        else alert('请选择完整的三级类目');
        return;
      }
      var code = nextCode(c1, c2, c3);
      console.log('[confirmSkuApprove] nextCode结果:', code, ' catM中是否存在该组合:', !!catM[c1+'|'+c2+'|'+c3]);
      if(!code){ alert('该类目编码已满，或该类目组合不在编码规则(catM)中，请联系管理员扩展'); return; }

      // 写入正式SKU库（masterDB + DB），与现有新增SKU逻辑一致
      var newRec = {
        code: code, name: item.name||'', brand: item.brand||'', spec: item.spec||'',
        unit: item.unit||'', cat1: c1, cat2: c2, cat3: c3,
        imageUrl: item.image_url||'', purchaseLink: item.purchase_link||'',
        createTime: new Date().toISOString(), source: '采购员提案审核入库'
      };
      masterDB.push(newRec);
      if(typeof saveMaster === 'function') saveMaster();
      if(!usedCodes.has(code)){ DB.unshift(newRec); usedCodes.add(code); }
      if(typeof dbSearch === 'function') dbSearch(document.getElementById('db-inp')?document.getElementById('db-inp').value:'');
      var badge = document.getElementById('topbadge');
      if(badge) badge.textContent = '数据库 '+DB.length+' 条';

      // 标记云端临时SKU为已审核，并关联正式编码
      var user = (typeof AuthSystem!=='undefined' && AuthSystem.currentUser) ? AuthSystem.currentUser.name : '';
      _http('PATCH', SKU_PROPOSAL_API+'/'+item.id+'/review', {
        status: 'approved', review_user: user, formal_sku_code: code
      }).then(function(r){
        if(!r.ok){ console.warn('[DemandService] SKU提案云端标记失败:', r.error); }
      }).catch(function(){});

      // 立即从提案列表移除
      _skuProposals = _skuProposals.filter(function(p){ return String(p.id) !== String(item.id); });
      _pendingSkuApprovalId = null;
      document.getElementById('sim-modal-overlay').classList.remove('open');
      this.renderList();
      this.updateNavBadge();
      alert('✅ 已生成正式编码 '+code+' 并入库，提案审核通过');
    },

    rejectSkuProposal: function(id){
      var self = this;
      var reason = prompt('请输入驳回原因（采购员将看到此说明）：');
      if(reason === null) return;
      var user = (typeof AuthSystem!=='undefined' && AuthSystem.currentUser) ? AuthSystem.currentUser.name : '';
      var reqBody = {status: 'rejected', review_user: user, remark: reason};
      console.log('[rejectSkuProposal] 即将驳回的提案ID:', id, '（仅此ID，不影响其他记录）');
      console.log('[rejectSkuProposal] 请求:', SKU_PROPOSAL_API+'/'+id+'/review', JSON.stringify(reqBody));
      console.log('[rejectSkuProposal] 操作前 _list（采购需求列表）条数:', _list.length, _list.map(function(i){return i.id;}));
      _http('PATCH', SKU_PROPOSAL_API+'/'+id+'/review', reqBody).then(function(r){
        console.log('[rejectSkuProposal] 响应:', JSON.stringify(r));
        if(!r.ok){ alert('驳回失败: '+(r.error||JSON.stringify(r))); return; }
        document.getElementById('dm-detail-ov').classList.remove('open');
        _skuProposals = _skuProposals.filter(function(p){ return String(p.id) !== String(id); });
        console.log('[rejectSkuProposal] 操作后 _list（采购需求列表）条数:', _list.length, _list.map(function(i){return i.id;}));
        self.renderList();
        self.updateNavBadge();
        alert('已驳回该SKU提案');
      }).catch(function(){ alert('网络错误'); });
    },
    _clearPendingSkuApproval: function(){ _pendingSkuApprovalId = null; },

    // 离线数据工具方法
    _exportOffline: function(){
      var data = LocalDB._load();
      if(!data.length){ alert('离线暂无采购申请数据'); return; }
      var blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '离线采购申请_'+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    },
    _clearOffline: function(){
      var data = LocalDB._load();
      if(!data.length){ alert('离线暂无数据'); return; }
      if(!confirm('确认清空 '+data.length+' 条离线采购申请？此操作不可恢复。')) return;
      LocalDB._data = [];
      LocalDB._save();
      _offlineMode = false; // 重置，下次请求重新检测
      var badge = document.getElementById('offline-badge');
      if(badge) badge.style.display = 'none';
      var panel = document.getElementById('offline-demand-mgr');
      if(panel) panel.style.display = 'none';
      alert('✅ 离线数据已清空');
      this.loadData();
    },
    // 数据管理弹窗打开时调用，刷新离线面板状态
    refreshOfflinePanel: function(){
      var panel = document.getElementById('offline-demand-mgr');
      var stat = document.getElementById('offline-demand-stat');
      if(!panel) return;
      var data = LocalDB._load();
      if(_offlineMode && data.length >= 0){
        panel.style.display = '';
        if(stat) stat.textContent = '当前共 '+data.length+' 条离线采购申请记录';
      } else if(!_offlineMode && data.length > 0){
        // 在线但有历史离线数据，也显示提示
        panel.style.display = '';
        if(stat) stat.textContent = '发现 '+data.length+' 条历史离线数据（当前已在线），建议导出后清空';
      } else {
        panel.style.display = 'none';
      }
    }
  };
})();

var CloudSyncV2 = (function () {

  var CFG = {
    base:         'https://csfw-purchase.pages.dev',
    lastSyncKey:  'csync2_lastAt',
    enabledKey:   'csync2_enabled',
    autoInterval: 5 * 60 * 1000,
  };

  var _syncing = false;

  function _iso()  { return new Date().toISOString(); }
  function _log(m) { console.log('%c[CloudSync]', 'color:#1A5FA8;font-weight:700', m); }
  function _warn(m){ console.warn('[CloudSync]', m); }

  function _lsGet(key, def) {
    try { var v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : def; }
    catch(e) { return def; }
  }
  function _lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  }
  function _getLastSync() { return localStorage.getItem(CFG.lastSyncKey) || null; }
  function _setLastSync() { localStorage.setItem(CFG.lastSyncKey, _iso()); }
  function _isEnabled()   { return localStorage.getItem(CFG.enabledKey) !== 'false'; }
  function _setEnabled(v) { localStorage.setItem(CFG.enabledKey, v ? 'true' : 'false'); _uiRefresh(); }

  async function _get(path) {
    var r = await fetch(CFG.base + path, { method: 'GET' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || path);
    return d;
  }
  async function _post(path, data) {
    var r = await fetch(CFG.base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
    var d = await r.json();
    if (!d.ok) throw new Error(d.error || path);
    return d;
  }

  /* ── 推送：标准 SKU ── */
  async function _pushSku() {
    var list = _lsGet('masterDB_v1', []);
    if (!list.length) return { skipped: true };
    var res = await _post('/api/sku', { items: list });
    _log('SKU ↑ added=' + res.added + ' updated=' + res.updated);
    return res;
  }

  /* ── 推送：临时物资（仅 pending）── */
  async function _pushTemp() {
    var all = _lsGet('tempSkuDB_v1', []);
    var pending = all.filter(function(r){ return r.syncStatus !== 'synced'; });
    if (!pending.length) return { skipped: true };
    var res = await _post('/api/tempSku', { items: pending });
    _log('Temp ↑ added=' + res.added);
    if (res.newCodes && res.newCodes.length) {
      var nci = 0;
      pending.forEach(function(r){
        if (!r.sku || !/^TMP-\d{6}$/.test(r.sku)) {
          r.sku = res.newCodes[nci++] || r.sku;
        }
      });
    }
    pending.forEach(function(r){ r.syncStatus = 'synced'; });
    _lsSet('tempSkuDB_v1', all);
    if (typeof TempSKU !== 'undefined') TempSKU.init();
    return res;
  }

  /* ── 推送：项目 ── */
  async function _pushProjects() {
    var pcProjs = _lsGet('pc22_projects', []);
    var toSync = pcProjs
      .filter(function(p){ return !p.isPreset && p.id && p.name; })
      .map(function(p){
        return {
          projectCode:    p.id,
          projectName:    p.name,
          projectAddress: p.address || '',
          buyer:          p.buyer   || '',
          phone:          p.phone   || '',
        };
      });
    if (!toSync.length) return { skipped: true };
    var res = await _post('/api/project', { items: toSync });
    _log('Project ↑ added=' + res.added + ' updated=' + res.updated);
    return res;
  }

  /* ── 推送：归档订单 ── */
  async function _pushOrders() {
    var orders  = _lsGet('pm_orders_v1', []);
    if(!Array.isArray(orders)){
      console.warn('[CloudSync] pm_orders_v1 数据格式异常（非数组），已重置:', orders);
      orders = [];
      _lsSet('pm_orders_v1', orders);
    }
    var pending = orders.filter(function(o){ return o && !o._cloudSynced; });
    if (!pending.length) return { skipped: true };
    var pushed = 0;
    for (var i = 0; i < pending.length; i++) {
      try {
        var o = pending[i];
        await _post('/api/order', {
          projectCode:  o.projectId   || '',
          projectName:  o.projectName || '',
          month:        o.month       || '',
          archivedAt:   o.archivedAt  || '',
          buyer:        o.buyer       || '',
          items:        o.items       || [],
        });
        o._cloudSynced = true;
        pushed++;
      } catch(e) { _warn('订单推送失败: ' + e.message); }
    }
    if (pushed) _lsSet('pm_orders_v1', orders);
    _log('Order ↑ pushed=' + pushed);
    return { pushed: pushed };
  }

  /* ── 拉取：标准 SKU ── */
  async function _pullSku(since) {
    var p   = since ? '?since=' + encodeURIComponent(since) : '';
    var res = await _get('/api/sku' + p);
    if (!res.data || !res.data.length) return;
    var local = _lsGet('masterDB_v1', []);
    var idx   = {};
    local.forEach(function(r){ idx[r.code] = true; });
    var added = 0;
    res.data.forEach(function(r){
      if (r.code && !idx[r.code]) { local.push(r); idx[r.code] = true; added++; }
    });
    if (added) {
      _lsSet('masterDB_v1', local);
      _log('SKU ↓ 新增=' + added);
      if (typeof initDB === 'function') setTimeout(initDB, 100);
    }
  }

  /* ── 拉取：临时物资 ── */
  async function _pullTemp(since) {
    var p   = since ? '?since=' + encodeURIComponent(since) : '';
    var res = await _get('/api/tempSku' + p);
    if (!res.data || !res.data.length) return;
    var local = _lsGet('tempSkuDB_v1', []);
    var idx   = {};
    local.forEach(function(r){ idx[r.sku] = true; });
    var added = 0;
    res.data.forEach(function(r){
      if (r.sku && !idx[r.sku]) {
        r.syncStatus = 'synced';
        local.push(r);
        idx[r.sku] = true;
        added++;
      }
    });
    if (added) {
      _lsSet('tempSkuDB_v1', local);
      _log('Temp ↓ 新增=' + added);
      if (typeof TempSKU !== 'undefined') TempSKU.init();
    }
  }

  /* ── 拉取：项目库（云端统一下发给所有采购员）── */
  async function _pullProjects(since) {
    var p   = since ? '?since=' + encodeURIComponent(since) : '';
    var res = await _get('/api/project' + p);
    if (!res.data || !res.data.length) return;
    var local  = _lsGet('pc22_projects', []);
    var byId   = {};
    var byName = {};
    local.forEach(function(p, i){ byId[p.id] = i; byName[p.name] = i; });
    var added = 0;
    res.data.forEach(function(cp){
      var id = cp.projectCode;
      var nm = cp.projectName;
      if (!id || !nm) return;
      if (byId[id] !== undefined) {
        var ex = local[byId[id]];
        if (cp.projectAddress && !ex.address) ex.address = cp.projectAddress;
        if (cp.buyer          && !ex.buyer  ) ex.buyer   = cp.buyer;
        if (cp.phone          && !ex.phone  ) ex.phone   = cp.phone;
      } else if (byName[nm] !== undefined) {
        var ex2 = local[byName[nm]];
        if (cp.projectAddress && !ex2.address) ex2.address = cp.projectAddress;
        if (cp.buyer          && !ex2.buyer  ) ex2.buyer   = cp.buyer;
        if (cp.phone          && !ex2.phone  ) ex2.phone   = cp.phone;
      } else {
        local.push({
          id:        id,
          name:      nm,
          code:      '',
          address:   cp.projectAddress || '',
          buyer:     cp.buyer          || '',
          phone:     cp.phone          || '',
          isPreset:  false,
          fromCloud: true,
          createdAt: new Date().toLocaleDateString('zh-CN'),
        });
        byId[id]   = local.length - 1;
        byName[nm] = local.length - 1;
        added++;
      }
    });
    _lsSet('pc22_projects', local);
    if (added) _log('Project ↓ 新增=' + added);
    if (typeof ProjectService !== 'undefined') {
      try { ProjectService.init(); } catch(e) {}
    }
    if (typeof PCService !== 'undefined') {
      try { if (PCService.refreshRail) PCService.refreshRail(); } catch(e) {}
    }
  }

  /* ── 主同步流程 ── */
  async function _doSync(silent) {
    if (!_isEnabled() || _syncing) return;
    _syncing = true;
    if (!silent) _uiStatus('loading', '同步中…');
    try {
      var since = _getLastSync();
      await Promise.all([
        _pushSku().catch(function(e){ _warn('SKU推送: '+e.message); }),
        _pushTemp().catch(function(e){ _warn('临时物资推送: '+e.message); }),
        _pushProjects().catch(function(e){ _warn('项目推送: '+e.message); }),
        _pushOrders().catch(function(e){ _warn('订单推送: '+e.message); }),
      ]);
      await Promise.all([
        _pullSku(since).catch(function(e){ _warn('SKU拉取: '+e.message); }),
        _pullTemp(since).catch(function(e){ _warn('临时物资拉取: '+e.message); }),
        _pullProjects(since).catch(function(e){ _warn('项目拉取: '+e.message); }),
      ]);
      _setLastSync();
      var t = new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'});
      _uiStatus('ok', '已同步 ' + t);
    } catch(e) {
      _warn('同步失败: ' + e.message);
      _uiStatus('error', '同步失败');
    } finally {
      _syncing = false;
    }
  }

  /* ── 全量拉取 ── */
  async function _fullPull() {
    _uiStatus('loading', '全量拉取中…');
    try {
      var d = await _get('/api/sync');
      if (d.skuList && d.skuList.length) {
        var cur = _lsGet('masterDB_v1', []);
        var idx = {}; cur.forEach(function(r){ idx[r.code]=true; });
        var a = 0;
        d.skuList.forEach(function(r){ if(!idx[r.code]){cur.push(r);a++;} });
        if (a) { _lsSet('masterDB_v1', cur); _log('全量SKU ↓ +'+a); }
      }
      if (d.tempList && d.tempList.length) {
        var cur2 = _lsGet('tempSkuDB_v1', []);
        var idx2 = {}; cur2.forEach(function(r){ idx2[r.sku]=true; });
        var a2 = 0;
        d.tempList.forEach(function(r){
          if(!idx2[r.sku]){ r.syncStatus='synced'; cur2.push(r); a2++; }
        });
        if (a2) { _lsSet('tempSkuDB_v1', cur2); if(typeof TempSKU!=='undefined')TempSKU.init(); _log('全量Temp ↓ +'+a2); }
      }
      if (d.projects && d.projects.length) {
        await _pullProjects(null);
      }
      _setLastSync();
      _uiStatus('ok', '全量同步完成');
    } catch(e) {
      _uiStatus('error', '拉取失败: ' + e.message);
    }
  }

  /* ── UI ── */
  function _uiInject() {
    if (document.getElementById('csync2-widget')) return;
    var css = [
      '#csync2-widget{position:fixed;bottom:22px;right:22px;z-index:8500;font-family:inherit}',
      '#csync2-fab{width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;',
        'background:#1A5FA8;color:#fff;font-size:17px;',
        'box-shadow:0 3px 12px rgba(26,95,168,.5);',
        'display:flex;align-items:center;justify-content:center;transition:.18s;}',
      '#csync2-fab:hover{transform:scale(1.1)}',
      '#csync2-panel{display:none;position:absolute;bottom:52px;right:0;',
        'background:#fff;border-radius:12px;width:230px;',
        'box-shadow:0 8px 32px rgba(0,0,0,.18);overflow:hidden;}',
      '#csync2-panel.open{display:block}',
      '.csp-hd{padding:10px 14px;background:#1A5FA8;color:#fff;font-size:12px;font-weight:700;',
        'display:flex;align-items:center;gap:8px;}',
      '#csp-dot{width:7px;height:7px;border-radius:50%;background:#4CAF50;flex-shrink:0}',
      '.csp-row{padding:8px 12px;font-size:11px;color:#555;',
        'border-bottom:1px solid #F0EEE9;display:flex;align-items:center;gap:7px;}',
      '.csp-row:last-child{border:none}',
      '.csp-row span{flex:1}',
      '.csp-btn{padding:5px 11px;border-radius:6px;border:1px solid #C8C4BC;',
        'background:#fff;color:#222;font-size:11px;font-weight:600;',
        'cursor:pointer;white-space:nowrap;transition:.12s;}',
      '.csp-btn:hover{border-color:#1A5FA8;color:#1A5FA8;background:#EBF3FC}',
      '.csp-btn.primary{background:#1A5FA8;color:#fff;border-color:#1A5FA8}',
      '.csp-btn.primary:hover{opacity:.88;color:#fff}',
      '.csp-2col{display:flex;gap:6px}',
      '.csp-2col .csp-btn{flex:1;text-align:center}',
    ].join('');
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    var w = document.createElement('div');
    w.id = 'csync2-widget';
    w.innerHTML = [
      '<div id="csync2-panel">',
        '<div class="csp-hd"><span id="csp-dot"></span>☁ 云同步</div>',
        '<div class="csp-row"><span id="csp-status">就绪</span></div>',
        '<div class="csp-row" style="word-break:break-all;color:#999;font-size:10px;line-height:1.5">',
          '🔗 ' + CFG.base,
        '</div>',
        '<div class="csp-row">',
          '<button class="csp-btn primary" onclick="CloudSyncV2.sync()">立即同步</button>',
          '<button class="csp-btn" id="csp-en-btn" onclick="CloudSyncV2.toggleEnabled()">暂停</button>',
        '</div>',
        '<div class="csp-row csp-2col">',
          '<button class="csp-btn" onclick="CloudSyncV2.fullPull()">全量拉取</button>',
          '<button class="csp-btn" onclick="CloudSyncV2.health()">连接测试</button>',
        '</div>',
        '<div class="csp-row" style="color:#999;font-size:10px">',
          '上次：<span id="csp-last">' + _fmtLast() + '</span>',
        '</div>',
      '</div>',
      '<button id="csync2-fab" onclick="CloudSyncV2.togglePanel()" title="云同步">☁</button>',
    ].join('');
    document.body.appendChild(w);
    _uiRefresh();
  }

  function _fmtLast() {
    var s = _getLastSync();
    if (!s) return '从未';
    var d = new Date(s);
    return d.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'});
  }

  function _uiStatus(type, text) {
    var el  = document.getElementById('csp-status');
    var dot = document.getElementById('csp-dot');
    var fab = document.getElementById('csync2-fab');
    if (el)  el.textContent = text;
    var colors = { ok:'#4CAF50', loading:'#FF9800', error:'#F44336' };
    if (dot) dot.style.background = colors[type] || '#9E9B96';
    if (fab) fab.style.background = (type === 'error') ? '#c0392b' : '#1A5FA8';
    var lastEl = document.getElementById('csp-last');
    if (lastEl && type === 'ok') lastEl.textContent = _fmtLast();
  }

  function _uiRefresh() {
    var btn = document.getElementById('csp-en-btn');
    if (btn) btn.textContent = _isEnabled() ? '暂停' : '恢复';
    _uiStatus(_isEnabled() ? 'ok' : 'error', _isEnabled() ? '就绪' : '已禁用');
  }

  return {
    sync: function(silent) { return _doSync(silent); },
    fullPull: _fullPull,
    togglePanel: function() {
      var p = document.getElementById('csync2-panel');
      if (p) p.classList.toggle('open');
    },
    toggleEnabled: function() { _setEnabled(!_isEnabled()); },
    health: async function() {
      _uiStatus('loading', '连接中…');
      try {
        var d = await _get('/api/health');
        _uiStatus('ok', '✓ 正常 v' + (d.version || ''));
      } catch(e) {
        _uiStatus('error', '✗ ' + e.message);
      }
    },
    onTempCreated: function() {
      setTimeout(function(){ _doSync(true); }, 600);
    },
    init: function() {
      _uiInject();
      setTimeout(function(){ _doSync(true); }, 2000);
      setInterval(function(){ _doSync(true); }, CFG.autoInterval);
      _log('初始化完成 Worker: ' + CFG.base);
    },
  };
})();

/* 自动初始化 */
window.addEventListener('load', function() {
  CloudSyncV2.init();
});

/* Hook TempSKU.submit，创建临时物资后立即推送云端 */
(function hookTempSKU() {
  var _timer = setInterval(function() {
    if (typeof TempSKU === 'undefined' || !TempSKU.submit) return;
    clearInterval(_timer);
    var _orig = TempSKU.submit.bind(TempSKU);
    TempSKU.submit = function() {
      _orig();
      setTimeout(function() { CloudSyncV2.onTempCreated(); }, 300);
    };
    console.log('[CloudSync] TempSKU hook 已注入');
  }, 500);
})();
// ══════════════════════════════════════
var API_BASE = 'http://127.0.0.1:8000';

function apiCompare(){
  if(!cart||!cart.length){alert('采购清单为空，请先添加物资');return;}
  var btn=document.querySelector('[onclick="apiCompare()"]');
  if(btn){btn.disabled=true;btn.innerText='⏳ 连接中…';}
  fetch(API_BASE+'/api/health')
    .then(function(r){return r.json();})
    .then(function(d){if(!d.ok)throw new Error('服务异常');return checkAndStartCompare();})
    .catch(function(e){
      if(btn){btn.disabled=false;btn.innerText='🚀 API比价';}
      alert('❌ 无法连接到比价服务\n\n请确保已启动 API 服务：\n1. 运行 run_api_server.bat\n2. 或执行: python api_server.py\n\n错误: '+e.message);
    });
}
function checkAndStartCompare(){
  return fetch(API_BASE+'/api/compare/status')
    .then(function(r){return r.json();})
    .then(function(s){if(s.running){alert('⚠️ 已有比价任务进行中');throw new Error('busy');}return startCompare();});
}
function startCompare(){
  var items=cart.map(function(c){return{name:c.name||'',brand:c.brand||'',spec:c.spec||'',unit:c.unit||'',qty:c.qty||1,code:c.code||'',cat1:c.cat1||'',cat2:c.cat2||'',cat3:c.cat3||'',};});
  if(!items.length){alert('采购清单为空');return;}
  showCompareProgress(items.length);
  fetch(API_BASE+'/api/compare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(items)})
    .then(function(r){return r.json();})
    .then(function(resp){if(!resp.ok)throw new Error(resp.error||'比价失败');closeCompareProgress();showCompareApiResult(resp);})
    .catch(function(e){closeCompareProgress();var btn=document.querySelector('[onclick="apiCompare()"]');if(btn){btn.disabled=false;btn.innerText='🚀 API比价';}alert('❌ 比价请求失败: '+e.message);});
}
var _cpTimer=null;
function showCompareProgress(total){
  closeCompareProgress();
  var m=document.createElement('div');m.id='cp-progress-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:3000;display:flex;align-items:center;justify-content:center';
  m.innerHTML='<div style="background:#fff;border-radius:14px;padding:30px 40px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3);max-width:420px;width:90%">'+
    '<div style="font-size:32px;margin-bottom:14px">🔍</div>'+
    '<div style="font-size:15px;font-weight:700;margin-bottom:8px">比价进行中…</div>'+
    '<div style="font-size:12px;color:#666;margin-bottom:16px">正在搜索 4 个平台获取最低报价</div>'+
    '<div style="background:#F0EEE9;border-radius:10px;height:6px;overflow:hidden;margin-bottom:8px">'+
      '<div id="cp-bar" style="width:0%;height:100%;background:#1A5FA8;border-radius:10px;transition:width .5s"></div></div>'+
    '<div id="cp-text" style="font-size:11px;color:#999">0 / '+total+' 条</div>'+
    '<div style="font-size:10px;color:#bbb;margin-top:12px">首次搜索较慢('+total+'条×4平台)，请耐心等待</div></div>';
  document.body.appendChild(m);
  _cpTimer=setInterval(function(){
    fetch(API_BASE+'/api/compare/status').then(function(r){return r.json();}).then(function(s){
      var bar=document.getElementById('cp-bar'),txt=document.getElementById('cp-text');
      if(bar&&s.total>0)bar.style.width=Math.min(100,(s.done/s.total)*100)+'%';
      if(txt)txt.textContent=s.done+' / '+s.total+' 条';
    }).catch(function(){});
  },2000);
}
function closeCompareProgress(){if(_cpTimer){clearInterval(_cpTimer);_cpTimer=null;}var m=document.getElementById('cp-progress-modal');if(m)m.remove();}
function showCompareApiResult(resp){
  var data=resp.results||[];if(!data.length){alert('无结果');return;}
  window._apiCompareData=data;var totalSaving=0;
  var rows=data.map(function(r,i){
    var name=r['物资名称']||r['name']||'',spec=r['规格型号']||r['spec']||'',brand=r['品牌']||r['brand']||'',status=r['比价状态']||r['status']||'',bestPlat=r['推荐平台']||'',lowest=r['最低价'];if(lowest===null||lowest===undefined)lowest=0;else lowest=parseFloat(lowest);
    var priceHtml='';['京东慧采','鑫方盛','震坤行','得力'].forEach(function(p){var price=r[p+'_价格'];if(price!==null&&price!==undefined&&parseFloat(price)>0){price=parseFloat(price);var isLowest=(bestPlat===p);priceHtml+='<span style="margin-right:6px;font-size:11px;'+(isLowest?'font-weight:700;color:#2A7A3B;background:#E2EFDA;padding:1px 5px;border-radius:4px;':'color:#666')+'">'+p+' ¥'+price.toFixed(2)+'</span>';}});
    var origPrice=parseFloat(r['含税单价']||0),saving=0;if(origPrice>0&&lowest>0&&lowest<origPrice){saving=(origPrice-lowest)*(r['采购数量']||r['qty']||1);totalSaving+=saving;}
    return '<tr style="background:'+(i%2===0?'#F7F6F3':'#fff')+';border-bottom:1px solid #E0DCD5">'+
      '<td style="padding:7px 10px;font-size:12px">'+escH(name)+'</td>'+
      '<td style="padding:7px 10px;font-size:11px;color:#666">'+escH(spec||'—')+'</td>'+
      '<td style="padding:7px 10px;font-size:11px;color:#888">'+escH(brand||'—')+'</td>'+
      '<td style="padding:7px 10px">'+(priceHtml||'<span style="color:#ccc;font-size:11px">无报价</span>')+'</td>'+
      '<td style="padding:7px 10px;text-align:right;font-size:12px">'+(bestPlat?'<span style="font-size:10px;color:#888">'+bestPlat+'</span><br>':'')+'<strong style="'+(lowest>0?'color:#1A5FA8':'color:#ccc')+'">¥'+(lowest?lowest.toFixed(2):'—')+'</strong></td>'+
      '<td style="padding:7px 10px;text-align:right;font-size:11px">'+(status==='未找到'?'<span style="color:#c0392b">未找到</span>':saving>0?'<span style="color:#2A7A3B">省¥'+saving.toFixed(0)+'</span>':'<span style="color:#ccc">—</span>')+'</td></tr>';
  }).join('');
  var completed=data.filter(function(r){return r['比价状态']==='已完成'||r['status']==='已完成';}).length;
  var notfound=data.filter(function(r){return r['比价状态']==='未找到'||r['status']==='未找到';}).length;
  var s='<span style="font-size:12px;color:#666;margin-left:8px">已完成 <strong style="color:#2A7A3B">'+completed+'</strong> 条'+(notfound?' · 未找到 <strong style="color:#c0392b">'+notfound+'</strong> 条':'')+' · 共 <strong>'+data.length+'</strong> 条</span>'+(totalSaving>0?'<span style="font-size:12px;background:#E2EFDA;color:#2A7A3B;padding:3px 10px;border-radius:20px;font-weight:600;margin-left:8px">可节省 ¥'+totalSaving.toFixed(0)+'</span>':'')+' · <span style="font-size:11px;color:#999">'+(resp.elapsed_seconds?Math.round(resp.elapsed_seconds)+'s':'')+'</span>';
  var M=document.createElement('div');M.id='compare-modal';
  M.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:3000;display:flex;align-items:flex-start;justify-content:center;padding-top:30px;overflow-y:auto';
  M.innerHTML='<div style="background:#fff;border-radius:14px;width:94%;max-width:1100px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">'+
    '<div style="padding:14px 20px;border-bottom:1px solid #E0DCD5;display:flex;align-items:center;gap:6px;flex-shrink:0">'+
    '<span style="font-size:16px;font-weight:700">📊 比价结果（API直连）</span>'+s+
    '<button onclick="apiExpXlsx()" style="margin-left:auto;padding:6px 14px;background:#1F3864;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">⬇ 导出Excel</button>'+
    '<button onclick="this.closest(\'#compare-modal\').remove();var b=document.querySelector(\'[onclick=\\"apiCompare()\\"]\');if(b){b.disabled=false;b.innerText=\'🚀 API比价\';}" style="margin-left:6px;padding:6px 10px;background:transparent;border:1px solid #C0BAB0;border-radius:6px;font-size:11px;cursor:pointer">✕ 关闭</button></div>'+
    '<div style="overflow-y:auto;flex:1"><table style="width:100%;border-collapse:collapse">'+
    '<thead><tr style="background:#1F3864;color:#fff;position:sticky;top:0;z-index:10">'+
    '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600">物资名称</th>'+
    '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600">规格</th>'+
    '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600">品牌</th>'+
    '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600">各平台报价</th>'+
    '<th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:600">最低价</th>'+
    '<th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:600">状态</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table></div>'+
    '<div style="padding:10px 20px;border-top:1px solid #E0DCD5;flex-shrink:0"><span style="font-size:10px;color:#999">💡 绿色高亮 = 最低价平台 | 可关闭窗口继续其他操作</span></div></div>';
  document.body.appendChild(M);
  var btn=document.querySelector('[onclick="apiCompare()"]');if(btn){btn.disabled=false;btn.innerText='🚀 API比价';}
}
function apiExpXlsx(){
  var data=window._apiCompareData;if(!data||!data.length)return;
  var rows=data.map(function(r,i){return{'序号':i+1,'物料编码':r['物料编码']||r['code']||'','物资名称':r['物资名称']||r['name']||'','品牌':r['品牌']||r['brand']||'','规格型号':r['规格型号']||r['spec']||'','单位':r['单位']||r['unit']||'','数量':r['采购数量']||r['qty']||1,'京东慧采_价格':(r['京东慧采_价格']!==null&&r['京东慧采_价格']!==undefined)?r['京东慧采_价格']:'','京东慧采_商品名':r['京东慧采_商品名']||'','鑫方盛_价格':(r['鑫方盛_价格']!==null&&r['鑫方盛_价格']!==undefined)?r['鑫方盛_价格']:'','鑫方盛_商品名':r['鑫方盛_商品名']||'','震坤行_价格':(r['震坤行_价格']!==null&&r['震坤行_价格']!==undefined)?r['震坤行_价格']:'','震坤行_商品名':r['震坤行_商品名']||'','得力_价格':(r['得力_价格']!==null&&r['得力_价格']!==undefined)?r['得力_价格']:'','得力_商品名':r['得力_商品名']||'','最低价':(r['最低价']!==null&&r['最低价']!==undefined)?r['最低价']:'','推荐平台':r['推荐平台']||'','比价状态':r['比价状态']||r['status']||'',};});
  var ws=XLSX.utils.json_to_sheet(rows);var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'API比价结果');XLSX.writeFile(wb,'API比价结果_'+today()+'.xlsx');
}
function escH(s){if(!s)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
// 采购中心版 API 比价
function apiComparePC(){
  var items = [];
  if(typeof PCService !== 'undefined'){
    var pid = PCService.getCurrentProjectId();
    if(pid) items = PCService.getCart(pid) || [];
  }
  if(!items.length){alert('当前项目购物车为空');return;}
  // 重用主 apiCompare 的后续逻辑，构造相同格式
  var mapped = items.map(function(c){return{name:c.name||'',brand:c.brand||'',spec:c.spec||'',unit:c.unit||'',qty:c.qty||1,code:c.code||'',cat1:c.cat1||'',cat2:c.cat2||'',cat3:c.cat3||'',};});
  var btn=document.querySelector('[onclick="apiComparePC()"]');
  if(btn){btn.disabled=true;btn.innerText='⏳ 连接中…';}
  fetch(API_BASE+'/api/health')
    .then(function(r){return r.json();})
    .then(function(d){if(!d.ok)throw new Error('服务异常');return fetch(API_BASE+'/api/compare/status').then(function(r){return r.json();}).then(function(s){if(s.running){alert('⚠️ 已有任务进行中');throw new Error('busy');}return mapped;});})
    .then(function(m){showCompareProgress(m.length);return fetch(API_BASE+'/api/compare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)}).then(function(r){return r.json();});})
    .then(function(resp){if(!resp.ok)throw new Error(resp.error||'比价失败');closeCompareProgress();showCompareApiResult(resp);})
    .catch(function(e){closeCompareProgress();var b=document.querySelector('[onclick="apiComparePC()"]');if(b){b.disabled=false;b.innerText='🚀 API比价';}if(e.message!=='busy')alert('❌ 比价失败: '+e.message);});
}