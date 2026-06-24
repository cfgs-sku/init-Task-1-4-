// AuthSystem.js — 临时物资(TempSKU) + 数据管理(DataMgr) + 权限系统(AuthSystem) + 飞书同步(FeishuSync)
var TempSKU = (function(){
  var _KEY = 'tempSkuDB_v1';
  var _db  = [];   // 临时物资库
  var _seq = 0;    // 当前最大序号
  var _ctx = null; // 'cart'(采购清单页) | 'pc'(采购中心)

  // ── 存取
  function _save(){
    try{ localStorage.setItem(_KEY, JSON.stringify(_db)); }catch(e){}
  }
  function _load(){
    try{
      var r = localStorage.getItem(_KEY);
      if(r){
        _db = JSON.parse(r);
        for(var i=0;i<_db.length;i++){
          var m = (_db[i].sku||'').match(/TEMP-\d{4}(\d+)/)||(_db[i].sku||'').match(/TMP-(\d+)/);
          if(m) _seq = Math.max(_seq, parseInt(m[1]));
        }
      }
    }catch(e){}
  }

  // ── 生成编码
  function _nextCode(){
    // 确保不与现有正式SKU冲突（TMP前缀天然隔离）
    _seq++;
    var _yr=new Date().getFullYear(); return 'TEMP-'+_yr+String(_seq).padStart(4,'0');
  }

  // ── 刷新预览编码
  function _refreshPreview(){
    var el = document.getElementById('tmp-code-preview-val');
    if(el) var _yr=new Date().getFullYear(); el.textContent='TEMP-'+_yr+String(_seq+1).padStart(4,'0');
  }

  // ── 状态标签HTML
  function tmpTagHtml(){ return '<span class="tmp-tag">🟡 临时非标</span>'; }
  function stdTagHtml(){ return '<span class="std-tag">🟢 标准SKU</span>'; }

  // ── 公开API
  return {
    init: _load,

    // 打开弹窗（prefill = 搜索词预填）
    openModal: function(prefill, ctx){
      _ctx = ctx || 'pc';
      _load(); // 刷新序号
      _refreshPreview();
      var nameEl = document.getElementById('tmp-name');
      if(nameEl){ nameEl.value = prefill || ''; }
      // 清空其他字段
      ['tmp-spec','tmp-unit','tmp-link','tmp-img','tmp-remark'].forEach(function(id){
        var el = document.getElementById(id); if(el) el.value='';
      });
      var qEl = document.getElementById('tmp-qty'); if(qEl) qEl.value='1';
      // 清除错误状态
      document.querySelectorAll('.tmp-inp.error').forEach(function(el){ el.classList.remove('error'); });
      var ov = document.getElementById('tmp-modal-overlay');
      if(ov) ov.classList.add('open');
      setTimeout(function(){ if(nameEl) nameEl.focus(); },100);
    },

    closeModal: function(){
      var ov = document.getElementById('tmp-modal-overlay');
      if(ov) ov.classList.remove('open');
    },

    submit: function(){
      // 验证必填
      var name  = (document.getElementById('tmp-name').value||'').trim();
      var spec  = (document.getElementById('tmp-spec').value||'').trim();
      var unit  = (document.getElementById('tmp-unit').value||'').trim();
      var qty   = parseInt(document.getElementById('tmp-qty').value)||1;
      var link  = (document.getElementById('tmp-link').value||'').trim();
      var img   = (document.getElementById('tmp-img').value||'').trim();
      var remark= (document.getElementById('tmp-remark').value||'').trim();
      var ok = true;
      if(!name){ document.getElementById('tmp-name').classList.add('error'); ok=false; }
      if(!spec){ document.getElementById('tmp-spec').classList.add('error'); ok=false; }
      if(!unit){ document.getElementById('tmp-unit').classList.add('error'); ok=false; }
      if(!ok){ alert('请填写必填项（物资名称、规格型号、单位）'); return; }

      var code = _nextCode();
      var now  = (function(){
        var d = new Date();
        return d.getFullYear()+'-'
          +String(d.getMonth()+1).padStart(2,'0')+'-'
          +String(d.getDate()).padStart(2,'0')+' '
          +String(d.getHours()).padStart(2,'0')+':'
          +String(d.getMinutes()).padStart(2,'0');
      })();
      // 获取创建人（AuthSystem）
      var creatorName = '';
      if(typeof AuthSystem!=='undefined' && AuthSystem.current()){
        creatorName = AuthSystem.current().name || '';
      }
      // 获取当前项目名称（优先采购中心，其次旧系统）
      var projName = '';
      if(typeof PCService!=='undefined' && PCService.getPid()){
        var _p = PCService.getCurrentProject();
        if(_p) projName = _p.name || '';
      }
      if(!projName && typeof currentProject!=='undefined' && currentProject){
        projName = currentProject.name || '';
      }
      var rec  = {
        sku: code, name: name, spec: spec, unit: unit,
        isTemp: true, purchaseLink: link, imageUrl: img,
        remark: remark,
        project:    projName,
        creator:    creatorName,
        createTime: now,
        syncStatus: 'pending'  // 预留Cloudflare Worker字段
      };
      _db.push(rec);
      _save();
      // 同步写入 D1 临时物资审核池
      (function(){
        try{
          fetch('https://csfw-purchase.pages.dev/api/temp_sku',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              name:name, spec:spec, brand:(document.getElementById('tmp-brand')||{}).value||'',
              unit:unit, image_url:img, purchase_link:link,
              create_user:creatorName, project_name:projName
            })
          }).then(function(r){return r.json();}).then(function(d){
            if(d.ok) console.log('[采购系统监控] 临时物资已同步D1:',d.data.temp_code);
            else console.warn('[采购系统监控] D1同步失败:',d.error);
          }).catch(function(e){console.warn('[采购系统监控] D1同步异常:',e);});
        }catch(e){}
      })();

      // 加入对应购物车
      this.addToCart(rec, qty);
      this.closeModal();
    },

    addToCart: function(rec, qty){
      var item = {
        id: 'tmp_' + Date.now(),
        purchaseType: 'temp',
        isTemp: true,
        name:  rec.name,
        code:  rec.sku,
        brand: '',
        spec:  rec.spec,
        unit:  rec.unit,
        cat1:  '临时物资', cat2:'', cat3:'',
        qty:   qty || 1,
        price: 0,
        isNew: false,
        purchaseLink: rec.purchaseLink || '',
        remark: rec.remark || ''
      };
      // 加入采购中心购物车
      if(typeof PCService !== 'undefined' && PCService.getPid()){
        PCService.addItem(item);
      }
      // 同时加入旧版采购清单购物车
      if(typeof cart !== 'undefined'){
        cart.push({
          id: item.id+'_cart', purchaseType:'temp', isTemp:true,
          name:item.name, code:item.code, brand:'', spec:item.spec,
          unit:item.unit, cat1:'临时物资', cat2:'', cat3:'',
          qty:item.qty, price:0, isNew:false
        });
        if(typeof renderCart==='function') renderCart();
        if(typeof updateCartStats==='function') updateCartStats();
      }
      // 通知
      var msg = '✅ 临时物资已创建：' + rec.name + '（' + rec.sku + '）已加入购物车';
      if(typeof showMatchToast==='function'){
        showMatchToast(msg, 'green');
      } else {
        // 轻量提示
        var t = document.createElement('div');
        t.style.cssText='position:fixed;bottom:22px;right:22px;padding:9px 16px;border-radius:8px;font-size:12px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.18);color:#fff;background:var(--green);transition:opacity .3s';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(function(){ t.style.opacity='0'; setTimeout(function(){ t.remove();},350); },3000);
      }
    },

    // 获取临时物资库（供导出等使用）
    getDB: function(){ return _db; },

    // 按sku获取临时物资
    getBySku: function(sku){
      for(var i=0;i<_db.length;i++) if(_db[i].sku===sku) return _db[i];
      return null;
    },

    // 判断购物车条目是否临时物资
    isTemp: function(item){
      return !!(item && (item.isTemp || item.purchaseType==='temp' || /^TMP-/.test(item.code||'')));
    },

    // 生成状态标签
    tagHtml: function(item){
      return this.isTemp(item) ? tmpTagHtml() : stdTagHtml();
    }
  };
})();

// 立即初始化
TempSKU.init();

// ════════════════════════════════════════════════════
//  DataMgr — 数据导入/导出模块
// ════════════════════════════════════════════════════
var DataMgr = (function(){

  var VERSION = '1.0';

  function _status(msg, isErr){
    var el = document.getElementById('dm-status');
    if(!el) return;
    el.textContent = msg;
    el.style.color = isErr ? 'var(--red)' : 'var(--green)';
    if(msg) setTimeout(function(){ el.textContent=''; }, 4000);
  }

  function _today(){
    var d = new Date();
    return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  }

  function _download(obj, filename){
    var blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  }

  function _readFile(input, cb){
    var file = input.files[0]; if(!file) return;
    var reader = new FileReader();
    reader.onload = function(e){
      try { cb(JSON.parse(e.target.result)); }
      catch(err){ _status('文件格式错误：' + err.message, true); }
      input.value = '';
    };
    reader.readAsText(file, 'utf-8');
  }

  // ── 读取 masterDB（localStorage 里用户自定义的 SKU）
  function _getMasterDB(){
    try { return JSON.parse(localStorage.getItem('masterDB_v1') || '[]'); }
    catch(e){ return []; }
  }

  // ── 读取采购中心数据
  function _getPCData(){
    var keys = ['pc22_projects','pc22_carts','pc22_addresses','pc22_custom'];
    var out = {};
    keys.forEach(function(k){
      try{ out[k] = JSON.parse(localStorage.getItem(k) || (k.includes('projects')||k.includes('custom')?'[]':'{}')); }
      catch(e){ out[k] = (k.includes('projects')||k.includes('custom')) ? [] : {}; }
    });
    return out;
  }

  return {

    // ──────────────────────────────────────────
    // 管理员：导出 SKU 库（内置 + 自定义）
    // 发给采购专员后导入，专员3秒同步完毕
    // ──────────────────────────────────────────
    exportSKU: function(){
      var customDB = _getMasterDB();
      // 内置 DB 太大不导出（已内嵌在 HTML 里），只导出自定义新增的
      var pkg = {
        type: 'sku_sync',
        version: VERSION,
        exportTime: new Date().toLocaleString('zh-CN'),
        exportBy: '管理员',
        // 统计信息
        builtinCount: typeof DB !== 'undefined' ? DB.length : 0,
        customCount: customDB.length,
        // 数据
        customDB: customDB,
        // 编码序列（让专员的新编码不和管理员冲突）
        seqSnapshot: (function(){
          try{ return JSON.parse(localStorage.getItem('seqTable_v1')||'{}'); }catch(e){return {};}
        })()
      };
      _download(pkg, 'SKU库同步包_' + _today() + '.json');
      _status('✓ SKU库已导出，发给采购专员导入');
    },

    // ──────────────────────────────────────────
    // 专员：导入 SKU 库（收到管理员发的文件）
    // ──────────────────────────────────────────
    importSKU: function(){
      document.getElementById('dm-sku-file').click();
    },

    doImportSKU: function(input){
      _readFile(input, function(pkg){
        if(pkg.type !== 'sku_sync'){
          _status('文件类型不对，请使用管理员导出的SKU库同步包', true); return;
        }
        // 导入自定义SKU（合并，不覆盖本地已有的）
        var local = _getMasterDB();
        var localCodes = new Set(local.map(function(r){ return r.code; }));
        var newItems = (pkg.customDB||[]).filter(function(r){ return !localCodes.has(r.code); });
        var merged = local.concat(newItems);
        localStorage.setItem('masterDB_v1', JSON.stringify(merged));

        // 同步编码序列（取两边的最大值，避免冲突）
        if(pkg.seqSnapshot){
          try{
            var localSeq = JSON.parse(localStorage.getItem('seqTable_v1')||'{}');
            Object.keys(pkg.seqSnapshot).forEach(function(k){
              if(!localSeq[k] || pkg.seqSnapshot[k] > localSeq[k]){
                localSeq[k] = pkg.seqSnapshot[k];
              }
            });
            localStorage.setItem('seqTable_v1', JSON.stringify(localSeq));
          }catch(e){}
        }

        var msg = '✓ SKU库已同步！新增 ' + newItems.length + ' 条，共 '
          + ((typeof DB!=='undefined'?DB.length:0) + merged.length) + ' 条可用';
        _status(msg);
        if(typeof AuthSystem!=='undefined'&&AuthSystem.current())
          AuthSystem.log('导入SKU库',msg);
        alert(msg + '\n（导出时间：' + pkg.exportTime + '）');
      });
    },

    // ──────────────────────────────────────────
    // 专员：导出个人数据（备份 / 换电脑用）
    // ──────────────────────────────────────────
    exportMyData: function(){
      var pcData = _getPCData();
      var pkg = {
        type: 'my_data',
        version: VERSION,
        exportTime: new Date().toLocaleString('zh-CN'),
        // 采购中心：项目/购物车/地址/定制申请
        pc_projects: pcData['pc22_projects'],
        pc_carts:    pcData['pc22_carts'],
        pc_addresses:pcData['pc22_addresses'],
        pc_custom:   pcData['pc22_custom'],
        // 旧系统：项目和订单
        pm_projects: (function(){ try{return JSON.parse(localStorage.getItem('pm_projects_v1')||'[]');}catch(e){return[];} })(),
        pm_orders:   (function(){ try{return JSON.parse(localStorage.getItem('pm_orders_v1')||'[]');}catch(e){return[];} })(),
        // 自定义 SKU
        customDB:    _getMasterDB(),
        // 临时物资库
        tempSkuDB:   (function(){ try{return JSON.parse(localStorage.getItem('tempSkuDB_v1')||'[]');}catch(e){return[];} })()
      };
      _download(pkg, '我的采购数据备份_' + _today() + '.json');
      _status('✓ 个人数据已导出（共 '
        + (pkg.pc_projects||[]).length + ' 个采购中心项目，'
        + (pkg.customDB||[]).length + ' 条自定义SKU）');
    },

    // ──────────────────────────────────────────
    // 专员：恢复个人数据（换电脑后）
    // ──────────────────────────────────────────
    importMyData: function(){
      document.getElementById('dm-my-file').click();
    },

    doImportMyData: function(input){
      _readFile(input, function(pkg){
        if(pkg.type !== 'my_data'){
          _status('文件类型不对，请使用「导出我的数据」生成的备份文件', true); return;
        }
        if(!confirm('恢复数据将覆盖当前的项目、购物车和地址，确认继续？')) return;

        if(pkg.pc_projects)  localStorage.setItem('pc22_projects',  JSON.stringify(pkg.pc_projects));
        if(pkg.pc_carts)     localStorage.setItem('pc22_carts',     JSON.stringify(pkg.pc_carts));
        if(pkg.pc_addresses) localStorage.setItem('pc22_addresses', JSON.stringify(pkg.pc_addresses));
        if(pkg.pc_custom)    localStorage.setItem('pc22_custom',    JSON.stringify(pkg.pc_custom));
        if(pkg.pm_projects)  localStorage.setItem('pm_projects_v1', JSON.stringify(pkg.pm_projects));
        if(pkg.pm_orders)    localStorage.setItem('pm_orders_v1',   JSON.stringify(pkg.pm_orders));
        if(pkg.customDB && pkg.customDB.length){
          localStorage.setItem('masterDB_v1', JSON.stringify(pkg.customDB));
        }
        // 恢复临时物资库
        if(pkg.tempSkuDB && pkg.tempSkuDB.length){
          localStorage.setItem('tempSkuDB_v1', JSON.stringify(pkg.tempSkuDB));
        }

        _status('✓ 数据已恢复！刷新页面后生效');
        setTimeout(function(){ location.reload(); }, 1500);
      });
    },

    // ──────────────────────────────────────────
    // 管理员：导出完整数据包
    // ──────────────────────────────────────────
    exportAllForAdmin: function(){
      var pcData = _getPCData();
      var pkg = {
        type: 'admin_full',
        version: VERSION,
        exportTime: new Date().toLocaleString('zh-CN'),
        customDB:    _getMasterDB(),
        pc_projects: pcData['pc22_projects'],
        pc_carts:    pcData['pc22_carts'],
        pc_addresses:pcData['pc22_addresses'],
        pc_custom:   pcData['pc22_custom'],
        pm_projects: (function(){ try{return JSON.parse(localStorage.getItem('pm_projects_v1')||'[]');}catch(e){return[];} })(),
        pm_orders:   (function(){ try{return JSON.parse(localStorage.getItem('pm_orders_v1')||'[]');}catch(e){return[];} })(),
        seqSnapshot: (function(){ try{return JSON.parse(localStorage.getItem('seqTable_v1')||'{}');}catch(e){return {};} })()
      };
      _download(pkg, '完整数据包_管理员_' + _today() + '.json');
      _status('✓ 完整数据包已导出');
    },

    // ──────────────────────────────────────────
    // 管理员：合并专员发回的数据
    // 只新增，不覆盖管理员这边已有的记录
    // ──────────────────────────────────────────


    // ──────────────────────────────────────────
    // 采购员/主管：导出数据库贡献
    // 包含：新增SKU + 图片/链接 + 编码序列
    // ──────────────────────────────────────────
    exportDBContrib: function(){
      var user = (typeof AuthSystem!=='undefined') ? AuthSystem.current() : null;
      var customDB = _getMasterDB();
      var dbLinks  = {};
      var seqSnap  = {};
      try{ dbLinks = JSON.parse(localStorage.getItem('db_links_v1')||'{}'); }catch(e){}
      try{ seqSnap = JSON.parse(localStorage.getItem('seqTable_v1')||'{}'); }catch(e){}

      // 统计图片数量
      var imgCount  = Object.keys(dbLinks).filter(function(k){ return !!(dbLinks[k]&&dbLinks[k].img); }).length;
      var linkCount = Object.keys(dbLinks).filter(function(k){
        return !!(dbLinks[k]&&dbLinks[k].links&&Object.keys(dbLinks[k].links).length);
      }).length;

      var pkg = {
        type:        'db_contrib',
        version:     VERSION,
        exportTime:  new Date().toLocaleString('zh-CN'),
        contributor: user ? { id:user.id, name:user.name, dept:user.dept, role:user.role } : { id:'unknown', name:'未知用户' },
        stats: {
          skuCount:  customDB.length,
          imgCount:  imgCount,
          linkCount: linkCount
        },
        customDB: customDB,
        dbLinks:  dbLinks,
        seqSnapshot: seqSnap
      };

      var fname = 'DB贡献_' + (user ? user.name : '用户') + '_' + _today() + '.json';
      _download(pkg, fname);

      var msg = '✓ 已导出数据库贡献：' + customDB.length + '条自定义SKU，'
        + imgCount + '张图片，' + linkCount + '条链接';
      _status(msg);
      if(typeof AuthSystem!=='undefined'&&AuthSystem.current())
        AuthSystem.log('导出DB贡献', msg);
    },

    // ──────────────────────────────────────────
    // 管理员：合并专员的数据库贡献
    // ──────────────────────────────────────────
    importDBContrib: function(){
      document.getElementById('dm-contrib-file').click();
    },

    doImportDBContrib: function(input){
      _readFile(input, function(pkg){
        // 兼容旧格式
        if(pkg.type !== 'db_contrib' && pkg.type !== 'my_data' && pkg.type !== 'img_links'){
          _status('格式不对，请使用「导出数据库贡献」生成的文件', true); return;
        }

        var contrib = pkg.contributor || { name:'未知用户' };
        var addedSKU=0, updatedSKU=0, addedImg=0, addedLink=0;

        // ── 1. 合并自定义SKU
        if(pkg.customDB && pkg.customDB.length){
          var localDB = _getMasterDB();
          var localMap = {};
          localDB.forEach(function(r){ localMap[r.code] = r; });

          pkg.customDB.forEach(function(r){
            if(!localMap[r.code]){
              // 新增：标注贡献者
              var newR = Object.assign({}, r);
              newR._contrib = contrib.name;
              newR._contribTime = pkg.exportTime;
              localDB.push(newR);
              localMap[r.code] = newR;
              addedSKU++;
            } else {
              // 已存在：补充缺失字段（不覆盖已有信息）
              var local = localMap[r.code];
              var patched = false;
              if(!local.spec  && r.spec)  { local.spec  = r.spec;  patched=true; }
              if(!local.brand && r.brand) { local.brand = r.brand; patched=true; }
              if(!local.unit  && r.unit)  { local.unit  = r.unit;  patched=true; }
              if(patched) updatedSKU++;
            }
          });
          localStorage.setItem('masterDB_v1', JSON.stringify(localDB));
        }

        // ── 2. 合并图片/链接（db_links_v1）
        var incoming = pkg.dbLinks || (pkg.type==='img_links' ? pkg.data : {}) || {};
        if(Object.keys(incoming).length){
          var localLinks = {};
          try{ localLinks = JSON.parse(localStorage.getItem('db_links_v1')||'{}'); }catch(e){}

          Object.keys(incoming).forEach(function(code){
            var src = incoming[code]; if(!src) return;
            if(!localLinks[code]) localLinks[code] = { img:'', links:{} };

            // 图片：本地没有才写入
            if(src.img && !localLinks[code].img){
              localLinks[code].img = src.img;
              addedImg++;
            }
            // 链接：各平台独立合并
            if(src.links && typeof src.links==='object'){
              if(!localLinks[code].links) localLinks[code].links = {};
              Object.keys(src.links).forEach(function(plat){
                if(!localLinks[code].links[plat] && src.links[plat]){
                  localLinks[code].links[plat] = src.links[plat];
                  addedLink++;
                }
              });
            }
            // 补充规格/品牌
            if(src.spec  && !localLinks[code].spec)  localLinks[code].spec  = src.spec;
            if(src.brand && !localLinks[code].brand) localLinks[code].brand = src.brand;
            if(src.unit  && !localLinks[code].unit)  localLinks[code].unit  = src.unit;
          });
          localStorage.setItem('db_links_v1', JSON.stringify(localLinks));
          if(typeof loadDBLinks==='function') loadDBLinks();
        }

        // ── 3. 同步编码序列（取最大值）
        if(pkg.seqSnapshot && Object.keys(pkg.seqSnapshot).length){
          try{
            var localSeq = JSON.parse(localStorage.getItem('seqTable_v1')||'{}');
            Object.keys(pkg.seqSnapshot).forEach(function(k){
              if(!localSeq[k] || pkg.seqSnapshot[k] > localSeq[k])
                localSeq[k] = pkg.seqSnapshot[k];
            });
            localStorage.setItem('seqTable_v1', JSON.stringify(localSeq));
          }catch(e){}
        }

        var msg = '✓ 合并完成！'
          + '（来自：' + contrib.name + ' / ' + (pkg.exportTime||'') + '）\n'
          + '  新增SKU：' + addedSKU + ' 条 | 补充字段：' + updatedSKU + ' 条\n'
          + '  新增图片：' + addedImg + ' 张 | 新增链接：' + addedLink + ' 条';

        _status('✓ 合并完成 ' + contrib.name + ' 的贡献');
        if(typeof AuthSystem!=='undefined'&&AuthSystem.current())
          AuthSystem.log('合并DB贡献', '来自 '+contrib.name+'：新增SKU '+addedSKU+' 条，图片 '+addedImg+' 张，链接 '+addedLink+' 条');
        alert(msg);
      });
    },

    // ──────────────────────────────────────────
    // 导出图片/链接数据（给其他版本合并用）
    // ──────────────────────────────────────────
    exportImgData: function(){
      var raw = '';
      try{ raw = localStorage.getItem('db_links_v1') || '{}'; }catch(e){}
      var links = {};
      try{ links = JSON.parse(raw); }catch(e){}
      var keys = Object.keys(links);
      if(!keys.length){ _status('当前没有图片/链接数据可导出', true); return; }

      // 统计有图片的条目
      var withImg = keys.filter(function(k){ return !!(links[k] && links[k].img); }).length;
      var withLink = keys.filter(function(k){
        return !!(links[k] && links[k].links && Object.keys(links[k].links).length);
      }).length;

      var pkg = {
        type: 'img_links',
        version: '1.0',
        exportTime: new Date().toLocaleString('zh-CN'),
        totalCodes: keys.length,
        withImg: withImg,
        withLink: withLink,
        data: links
      };
      _download(pkg, 'SKU图片数据_' + _today() + '.json');
      _status('✓ 已导出 ' + keys.length + ' 条（含图片' + withImg + '条）');
    },

    // ──────────────────────────────────────────
    // 导入图片/链接数据（合并，不覆盖已有图片）
    // ──────────────────────────────────────────
    importImgData: function(){
      document.getElementById('dm-img-file').click();
    },

    doImportImgData: function(input){
      _readFile(input, function(pkg){
        if(pkg.type !== 'img_links' && !pkg.data){
          // 兼容：直接是 db_links 的 JSON 对象（无 type 包装）
          if(typeof pkg === 'object' && !Array.isArray(pkg)){
            pkg = { data: pkg };
          } else {
            _status('文件格式不对，请使用「导出图片数据」生成的文件', true);
            return;
          }
        }
        var incoming = pkg.data || {};
        var local = {};
        try{ local = JSON.parse(localStorage.getItem('db_links_v1') || '{}'); }catch(e){}

        var addedImg = 0, addedLink = 0, skipped = 0;

        Object.keys(incoming).forEach(function(code){
          var src = incoming[code];
          if(!src) return;
          if(!local[code]) local[code] = { img:'', links:{} };

          // 图片：只在本地没有图片时才写入
          if(src.img && !local[code].img){
            local[code].img = src.img;
            addedImg++;
          } else if(src.img && local[code].img){
            skipped++;
          }

          // 链接：合并（本地没有该平台链接才写入）
          if(src.links && typeof src.links === 'object'){
            if(!local[code].links) local[code].links = {};
            Object.keys(src.links).forEach(function(plat){
              if(!local[code].links[plat] && src.links[plat]){
                local[code].links[plat] = src.links[plat];
                addedLink++;
              }
            });
          }

          // 规格/品牌（如果本地缺失则补充）
          if(src.spec && !local[code].spec) local[code].spec = src.spec;
          if(src.brand && !local[code].brand) local[code].brand = src.brand;
          if(src.unit && !local[code].unit) local[code].unit = src.unit;
        });

        try{
          localStorage.setItem('db_links_v1', JSON.stringify(local));
          // 触发运行时重载（如果页面 loadDBLinks 函数存在）
          if(typeof loadDBLinks === 'function') loadDBLinks();
          if(typeof mergeLinksToRecords === 'function') mergeLinksToRecords();
        }catch(e){
          _status('存储失败（可能空间不足）：' + e.message, true); return;
        }

        var msg = '✓ 导入完成！新增图片 ' + addedImg + ' 张，新增链接 ' + addedLink
          + ' 条，已跳过(本地已有图片) ' + skipped + ' 条';
        _status(msg);
        alert(msg + (pkg.exportTime ? '\n（来源导出时间：' + pkg.exportTime + '）' : ''));
      });
    },

    importMergeData: function(){
      document.getElementById('dm-merge-file').click();
    },

    doMergeData: function(input){
      _readFile(input, function(pkg){
        if(pkg.type !== 'my_data' && pkg.type !== 'admin_full'){
          _status('格式不对，请使用专员导出的「我的采购数据备份」文件', true); return;
        }
        var addedProj=0, addedCustom=0, addedOrders=0;

        // 合并采购中心项目（按 id 去重）
        if(pkg.pc_projects && pkg.pc_projects.length){
          var local = [];
          try{ local=JSON.parse(localStorage.getItem('pc22_projects')||'[]'); }catch(e){}
          var localIds = new Set(local.map(function(p){ return p.id; }));
          pkg.pc_projects.forEach(function(p){
            if(!localIds.has(p.id)){ local.push(p); addedProj++; }
          });
          localStorage.setItem('pc22_projects', JSON.stringify(local));
        }

        // 合并自定义 SKU（按 code 去重）
        if(pkg.customDB && pkg.customDB.length){
          var localDB = _getMasterDB();
          var localCodes = new Set(localDB.map(function(r){ return r.code; }));
          pkg.customDB.forEach(function(r){
            if(!localCodes.has(r.code)){ localDB.push(r); addedCustom++; }
          });
          localStorage.setItem('masterDB_v1', JSON.stringify(localDB));
        }

        // 合并旧系统订单
        if(pkg.pm_orders && pkg.pm_orders.length){
          var localOrders = [];
          try{ localOrders=JSON.parse(localStorage.getItem('pm_orders_v1')||'[]'); }catch(e){}
          var localOrderIds = new Set(localOrders.map(function(o){ return o.id||o.poNo; }));
          pkg.pm_orders.forEach(function(o){
            if(!localOrderIds.has(o.id||o.poNo)){ localOrders.push(o); addedOrders++; }
          });
          localStorage.setItem('pm_orders_v1', JSON.stringify(localOrders));
        }

        var msg = '✓ 合并完成！新增 '
          + addedProj + ' 个项目、'
          + addedCustom + ' 条自定义SKU、'
          + addedOrders + ' 条订单记录';
        _status(msg);
        alert(msg);
      });
    }

  };
})();


// ═══════════════════════════════════════════════════════════════
//  登录后检查是否已选择项目：未选择则弹窗提醒
//  原因：采购中心加购物车的SKU若未关联项目，将不会显示在采购中心列表里
// ═══════════════════════════════════════════════════════════════
function _checkProjectSelected(){
  setTimeout(function(){
    var hasProject = (typeof PCService !== 'undefined' && PCService.getPid && PCService.getPid());
    if(!hasProject){
      if(confirm('您还未选择采购项目。\n\n请先选择或创建一个项目，否则添加到购物车的物资将不会显示在「采购中心」。\n\n是否现在选择项目？')){
        if(typeof showProjectModal === 'function') showProjectModal();
      }
    }
  }, 400); // 延迟确保页面DOM和PCService已就绪
}

// ═══════════════════════════════════════════════════════════════
//  AuthSystem — 授权登录 + 操作日志
//  城服公司 / 开发：刘宾
// ═══════════════════════════════════════════════════════════════

var AuthSystem = (function(){

  // ── 内置账户（与 Cloudflare D1 保持同步，管理员可通过界面新增）
  var BUILTIN_USERS = [
    { id:'admin', name:'刘宾',   role:'admin',   dept:'城服公司', pwd:'csfw2024admin' },
    { id:'hmq',   name:'何梦琪', role:'manager', dept:'招采部',   pwd:'hmq' },
    { id:'wxy',   name:'王籽媛', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'pmy',   name:'柏梦园', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'cjj',   name:'崔晶晶', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'ly',    name:'李玉',   role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'wxn',   name:'魏雪宁', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'dyq',   name:'段娇奇', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'lyj',   name:'李雨晴', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'zrf',   name:'张若菲', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'bjl',   name:'薄佳乐', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'zyn',   name:'赵一诺', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'wzh',   name:'王兆辉', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'zww',   name:'赵微微', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'sy',    name:'苏颖',   role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'wnn',   name:'王宁宁', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'chs',   name:'池胜洋', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'ds',    name:'杜淼',   role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'lqj',   name:'卢晴晴', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'czh',   name:'崔梓涵', role:'buyer',   dept:'采购部',   pwd:'123456' },
    { id:'wjm',   name:'王嘉铭', role:'buyer',   dept:'采购部',   pwd:'123456' },
  ];

  var ROLE_LABEL = { admin:'管理员', manager:'主管', hmq:'招采主管', buyer:'采购专员', viewer:'只读' };
  var ROLE_PERMS = {
    admin:   { editDB:true,  addSKU:true,  delSKU:true,  viewLog:true,  manageUser:true,  submitDemand:true,  approveDemand:true },
    manager: { editDB:true,  addSKU:true,  delSKU:true,  viewLog:true,  manageUser:false, submitDemand:true,  approveDemand:true },
    hmq:     { editDB:true,  addSKU:true,  delSKU:true,  viewLog:true,  manageUser:false, submitDemand:false, approveDemand:true },
    buyer:   { editDB:false, addSKU:false, delSKU:false, viewLog:false, manageUser:false, submitDemand:true,  approveDemand:false },
    viewer:  { editDB:false, addSKU:false, delSKU:false, viewLog:false, manageUser:false, submitDemand:false, approveDemand:false },
  };

  var _cur = null;  // 当前登录用户

  // ── 持久化
  function _saveUsers(users){
    try{ localStorage.setItem('auth_users_v1', JSON.stringify(users)); }catch(e){}
  }
  function _loadUsers(){
    try{
      var raw = localStorage.getItem('auth_users_v1');
      if(raw) return JSON.parse(raw);
    }catch(e){}
    return [];
  }
  function _saveSession(user){
    try{ localStorage.setItem('auth_session_v1', JSON.stringify({id:user.id,name:user.name,role:user.role,dept:user.dept,loginAt:new Date().toISOString()})); }catch(e){}
  }
  function _clearSession(){
    try{ localStorage.removeItem('auth_session_v1'); }catch(e){}
  }
  function _loadSession(){
    try{ var r=localStorage.getItem('auth_session_v1'); return r?JSON.parse(r):null; }catch(e){ return null; }
  }

  // ── 合并账户列表（内置 + 自定义）
  function _allUsers(){
    var custom = _loadUsers();
    // localStorage 里的账户优先（可覆盖内置密码，实现密码修改）
    var ids = new Set(custom.map(function(u){ return u.id; }));
    var merged = custom.slice();
    // 内置账户：只在 localStorage 里没有时才加入（避免覆盖已修改的密码）
    BUILTIN_USERS.forEach(function(u){ if(!ids.has(u.id)) merged.unshift(u); });
    return merged;
  }

  // ── 日志
  var LOG_KEY = 'op_log_v1';
  var _logCache = null;

  function _log(action, detail){
    if(!_cur) return;
    try{
      if(!_logCache){
        var raw = localStorage.getItem(LOG_KEY);
        _logCache = raw ? JSON.parse(raw) : [];
      }
      _logCache.unshift({
        ts:   new Date().toISOString(),
        time: new Date().toLocaleString('zh-CN'),
        uid:  _cur.id,
        name: _cur.name,
        role: _cur.role,
        dept: _cur.dept||'',
        action: action,
        detail: detail||''
      });
      if(_logCache.length > 2000) _logCache = _logCache.slice(0,2000);
      localStorage.setItem(LOG_KEY, JSON.stringify(_logCache));
    }catch(e){}
  }

  // ── 登录弹窗渲染
  function _renderLoginModal(){
    var existing = document.getElementById('auth-login-overlay');
    if(existing) existing.remove();
    var html = '<div id="auth-login-overlay" style="position:fixed;inset:0;background:rgba(15,20,40,.85);'
      + 'z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)">'
      + '<div style="background:#fff;border-radius:14px;padding:36px 32px;width:380px;'
      +   'box-shadow:0 24px 80px rgba(0,0,0,.4);text-align:center">'
      +   '<div style="font-size:28px;margin-bottom:4px">📦</div>'
      +   '<div style="font-size:18px;font-weight:800;color:#1F3864;margin-bottom:2px">物资采购管理系统</div>'
      +   '<div style="font-size:11px;color:#aaa;margin-bottom:24px">城服公司 · SKU25 · 2026.06.02</div>'
      +   '<div style="text-align:left;margin-bottom:12px">'
      +     '<label style="font-size:11px;font-weight:700;color:#666;display:block;margin-bottom:4px">账号</label>'
      +     '<input id="auth-uid" type="text" placeholder="输入账号 ID" autocomplete="username" '
      +       'style="width:100%;box-sizing:border-box;padding:10px 12px;font-size:13px;border:1.5px solid #ddd;border-radius:8px;outline:none" '
      +       'onkeydown="if(event.key===\'Enter\')document.getElementById(\'auth-pwd\').focus()">'
      +   '</div>'
      +   '<div style="text-align:left;margin-bottom:20px">'
      +     '<label style="font-size:11px;font-weight:700;color:#666;display:block;margin-bottom:4px">密码</label>'
      +     '<input id="auth-pwd" type="password" placeholder="输入密码" autocomplete="current-password" '
      +       'style="width:100%;box-sizing:border-box;padding:10px 12px;font-size:13px;border:1.5px solid #ddd;border-radius:8px;outline:none" '
      +       'onkeydown="if(event.key===\'Enter\')AuthSystem.doLogin()">'
      +   '</div>'
      +   '<div id="auth-err" style="font-size:12px;color:#e53e3e;min-height:18px;margin-bottom:12px"></div>'
      +   '<button onclick="AuthSystem.doLogin()" '
      +     'style="width:100%;padding:12px;background:#1F3864;color:#fff;border:none;border-radius:8px;'
      +     'font-size:14px;font-weight:700;cursor:pointer;transition:.15s" '
      +     'onmouseover="this.style.background=\'#2a4d8a\'" onmouseout="this.style.background=\'#1F3864\'">登 录</button>'
      +   '<div style="font-size:10px;color:#bbb;margin-top:20px">如忘记密码请联系系统管理员重置</div>'
      + '</div>'
      + '</div>';
    document.body.insertAdjacentHTML('beforeend', html);
    setTimeout(function(){ var el=document.getElementById('auth-uid'); if(el)el.focus(); }, 100);
  }

  // ── 顶栏用户信息条
  function _renderTopbarUser(){
    var existing = document.getElementById('auth-topbar-user');
    if(existing) existing.remove();
    if(!_cur) return;
    var bar = document.createElement('div');
    bar.id = 'auth-topbar-user';
    bar.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:auto;flex-shrink:0;padding:0 6px';
    bar.innerHTML = '<div style="position:relative;display:inline-block" id="auth-user-menu-wrap">'
      + '<button onclick="AuthSystem.toggleUserMenu()" '
        + 'style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);'
        + 'color:#fff;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer;white-space:nowrap">'
        + '👤 ' + _cur.name + ' ▾</button>'
      + '<div id="auth-user-menu" style="display:none;position:absolute;right:0;top:110%;'
        + 'background:#fff;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.22);'
        + 'min-width:130px;z-index:9999;overflow:hidden;border:1px solid #eee">'
        + '<div style="padding:8px 12px;font-size:11px;color:#aaa;border-bottom:1px solid #f0f0f0">'
          + _cur.dept + ' · ' + (ROLE_LABEL[_cur.role]||_cur.role)
        + '</div>'
        + '<button onclick="AuthSystem.showChangePwd();AuthSystem.closeUserMenu()" '
          + 'style="width:100%;padding:9px 14px;text-align:left;background:none;border:none;'
          + 'font-size:12px;cursor:pointer;color:#333" '
          + 'onmouseover="this.style.background=\'#f5f7ff\'" onmouseout="this.style.background=\'none\'">🔑 修改密码</button>'
        + (_cur.role==='admin'||_cur.role==='manager'
          ? '<button onclick="AuthSystem.showLog();AuthSystem.closeUserMenu()" '
            + 'style="width:100%;padding:9px 14px;text-align:left;background:none;border:none;'
            + 'font-size:12px;cursor:pointer;color:#333" '
            + 'onmouseover="this.style.background=\'#f5f7ff\'" onmouseout="this.style.background=\'none\'">📋 操作日志</button>' : '')
        + (_cur.role==='admin'
          ? '<button onclick="AuthSystem.showUserMgr();AuthSystem.closeUserMenu()" '
            + 'style="width:100%;padding:9px 14px;text-align:left;background:none;border:none;'
            + 'font-size:12px;cursor:pointer;color:#333" '
            + 'onmouseover="this.style.background=\'#f5f7ff\'" onmouseout="this.style.background=\'none\'">👥 账户管理</button>' : '')
        + '<div style="border-top:1px solid #f0f0f0">'
        + '<button onclick="AuthSystem.logout()" '
          + 'style="width:100%;padding:9px 14px;text-align:left;background:none;border:none;'
          + 'font-size:12px;cursor:pointer;color:#e53e3e;font-weight:700" '
          + 'onmouseover="this.style.background=\'#fff5f5\'" onmouseout="this.style.background=\'none\'">🚪 退出登录</button>'
        + '</div>'
      + '</div>'
      + '</div>';
    // 插到 topbar 末尾（topbadge 前）
    var badge = document.getElementById('topbadge');
    if(badge && badge.parentNode) badge.parentNode.insertBefore(bar, badge);
    else document.querySelector('.topbar').appendChild(bar);
  }

  // ── 权限遮罩（非管理员/主管时隐藏编辑按钮）
  function _applyPermissions(){
    if(!_cur) return;
    var perm = ROLE_PERMS[_cur.role] || ROLE_PERMS.viewer;
    // 数据库编辑按钮
    var editBtns = document.querySelectorAll('[data-perm="editDB"],[data-perm="addSKU"],[data-perm="delSKU"],[data-perm="submitDemand"],[data-perm="approveDemand"]');
    editBtns.forEach(function(el){
      var p = el.getAttribute('data-perm');
      el.style.display = perm[p] ? '' : 'none';
    });
    // 赋码/新增按钮（用 CSS class 标记）
    if(!perm.addSKU){
      var style = document.getElementById('auth-perm-style') || document.createElement('style');
      style.id = 'auth-perm-style';
      style.textContent = '.btn-new-sku,.new-code-btn,[data-perm="addSKU"]{display:none!important}';
      document.head.appendChild(style);
    }
  }

  return {

    // 初始化：检查 session
    init: function(){
      var sess = _loadSession();
      if(sess){
        // 验证 session 仍然有效（12小时内）
        var loginAt = new Date(sess.loginAt||0);
        var diff = Date.now() - loginAt.getTime();
        if(diff < 12*60*60*1000){
          // 刷新 dept/name 为最新账户数据（防止旧session显示旧部门名）
          var freshUser = _allUsers().find(function(u){ return u.id===sess.id; });
          if(freshUser){
            sess.name = freshUser.name;
            sess.dept = freshUser.dept;
            sess.role = freshUser.role;
            _saveSession(sess);
          }
          _cur = sess;
          _renderTopbarUser();
          _applyPermissions();
          _checkProjectSelected();
          return;
        }
        _clearSession();
      }
      // 未登录 → 显示登录弹窗
      _renderLoginModal();
    },

    doLogin: function(){
      var uid = (document.getElementById('auth-uid').value||'').trim();
      var pwd = document.getElementById('auth-pwd').value||'';
      var err = document.getElementById('auth-err');
      if(!uid||!pwd){ err.textContent='请输入账号和密码'; return; }

      // 优先 D1 云端登录
      fetch('https://csfw-purchase.pages.dev/api/login',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username:uid, password:pwd})
      }).then(function(r){return r.json();}).then(function(d){
        if(d.ok){
          var data = d.data || d;
          var u = data.user || data;
          _cur = {id:u.id||u.username, name:u.name||u.username, role:u.role, dept:u.project_id||'', loginAt:Date.now(), mustChangePwd:false};
          _saveSession(_cur);
          _log('登录', '云端登录成功');
          var ov = document.getElementById('auth-login-overlay');
          if(ov) ov.remove();
          _renderTopbarUser();
          _applyPermissions();
          _checkProjectSelected();
          if(_cur.mustChangePwd){
            setTimeout(function(){
              if(confirm('首次登录需修改密码，是否现在修改？')){
                document.getElementById('us-chpwd-ov').classList.add('open');
              }
            }, 500);
          }
        } else {
          // D1验证失败，回退本地验证
          _doLocalLogin(uid, pwd, err);
        }
      }).catch(function(e){
        // 网络异常，回退本地验证
        _doLocalLogin(uid, pwd, err);
      });
    },

    // 本地回退登录（D1不可用时）
    _doLocalLogin: function(uid, pwd, err){
      var users = _allUsers();
      var user  = users.find(function(u){ return u.id===uid && u.pwd===pwd; });
      if(!user){
        err.textContent = '账号或密码错误，请联系系统管理员';
        document.getElementById('auth-pwd').value='';
        return;
      }
      _cur = { id:user.id, name:user.name, role:user.role, dept:user.dept };
      _saveSession(_cur);
      _log('登录', '本地登录成功（离线模式）');
      var ov = document.getElementById('auth-login-overlay');
      if(ov) ov.remove();
      _renderTopbarUser();
      _applyPermissions();
      _checkProjectSelected();
    },

    logout: function(){
      if(_cur) _log('退出', '退出系统');
      _clearSession();
      _cur = null;
      _logCache = null;
      location.reload();
    },

    // 当前用户（两种调用方式兼容）
    current: function(){ return _cur; },
    get currentUser(){ return _cur; },

    // 权限检查
    can: function(perm){
      if(!_cur) return false;
      return !!(ROLE_PERMS[_cur.role]||{})[perm];
    },

    // ── 记录操作日志（供其他模块调用）
    log: function(action, detail){ _log(action, detail); },

    // ── 操作日志弹窗
    showLog: function(){
      if(!this.can('viewLog')){ alert('权限不足'); return; }
      try{ _logCache = JSON.parse(localStorage.getItem(LOG_KEY)||'[]'); }catch(e){ _logCache=[]; }
      var logs = _logCache;
      var existing = document.getElementById('auth-log-overlay');
      if(existing) existing.remove();

      var rows = logs.slice(0,200).map(function(l,i){
        var actionColor = l.action.includes('修改')||l.action.includes('删除')||l.action.includes('新增')
          ? '#c05000' : l.action.includes('登录')||l.action.includes('退出') ? '#666' : '#1F3864';
        return '<tr style="background:'+(i%2===0?'#fafafa':'#fff')+'">'
          + '<td style="padding:5px 10px;font-size:11px;color:#999;white-space:nowrap">'+(l.time||l.ts)+'</td>'
          + '<td style="padding:5px 10px;font-size:12px;font-weight:700">'+(l.name||l.uid)+'</td>'
          + '<td style="padding:5px 10px;font-size:11px;color:#666">'+(l.dept||'')+'</td>'
          + '<td style="padding:5px 10px;font-size:11px;font-weight:600;color:'+actionColor+'">'+(l.action||'')+'</td>'
          + '<td style="padding:5px 10px;font-size:11px;color:#555;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+((l.detail||'').replace(/"/g,'&quot;'))+'">'+(l.detail||'')+'</td>'
          + '</tr>';
      }).join('');

      var html = '<div id="auth-log-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);'
        + 'z-index:8000;display:flex;align-items:center;justify-content:center">'
        + '<div style="background:#fff;border-radius:12px;width:820px;max-width:96vw;max-height:85vh;'
        +   'display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
        +   '<div style="padding:16px 20px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:10px">'
        +     '<span style="font-size:18px">📋</span>'
        +     '<span style="font-size:15px;font-weight:700">操作日志</span>'
        +     '<span style="font-size:11px;color:#aaa;margin-left:4px">最近 '+logs.length+' 条</span>'
        +     '<button onclick="AuthSystem.exportLog()" style="margin-left:auto;padding:4px 12px;background:#1F3864;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer">⬇ 导出</button>'
        +     '<button onclick="document.getElementById(\'auth-log-overlay\').remove()" '
        +       'style="background:none;border:none;font-size:20px;cursor:pointer;color:#aaa;margin-left:8px">✕</button>'
        +   '</div>'
        +   '<div style="overflow:auto;flex:1">'
        +     '<table style="width:100%;border-collapse:collapse">'
        +       '<thead><tr style="background:#f5f5f5">'
        +         '<th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;color:#999;white-space:nowrap">时间</th>'
        +         '<th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;color:#999">操作人</th>'
        +         '<th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;color:#999">部门</th>'
        +         '<th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;color:#999">操作</th>'
        +         '<th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;color:#999">详情</th>'
        +       '</tr></thead>'
        +       '<tbody>'+rows+'</tbody>'
        +     '</table>'
        +   '</div>'
        + '</div></div>';
      document.body.insertAdjacentHTML('beforeend', html);
    },

    // 导出日志 Excel
    exportLog: function(){
      try{
        var logs = _logCache || JSON.parse(localStorage.getItem(LOG_KEY)||'[]');
        if(!logs.length){ alert('暂无日志'); return; }
        var rows = logs.map(function(l){
          return {'时间':l.time||l.ts,'操作人':l.name||l.uid,'部门':l.dept||'','角色':ROLE_LABEL[l.role]||l.role||'','操作':l.action||'','详情':l.detail||''};
        });
        if(typeof xlsxOut==='function') xlsxOut(rows,'操作日志','操作日志_'+(new Date().toISOString().slice(0,10))+'.xlsx');
      }catch(e){ alert('导出失败：'+e.message); }
    },


    toggleUserMenu: function(){
      var m = document.getElementById('auth-user-menu');
      if(!m) return;
      var isOpen = m.style.display !== 'none';
      m.style.display = isOpen ? 'none' : 'block';
      if(!isOpen){
        // 点其他地方关闭
        var close = function(e){
          var wrap = document.getElementById('auth-user-menu-wrap');
          if(wrap && !wrap.contains(e.target)){
            m.style.display='none';
            document.removeEventListener('click', close);
          }
        };
        setTimeout(function(){ document.addEventListener('click', close); }, 10);
      }
    },

    closeUserMenu: function(){
      var m = document.getElementById('auth-user-menu');
      if(m) m.style.display = 'none';
    },

    // ── 修改密码弹窗（所有用户都可以用）
    showChangePwd: function(){
      var existing = document.getElementById('auth-changepwd-overlay');
      if(existing) existing.remove();
      var html = '<div id="auth-changepwd-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);'
        + 'z-index:9500;display:flex;align-items:center;justify-content:center">'
        + '<div style="background:#fff;border-radius:12px;padding:28px 28px 20px;width:340px;box-shadow:0 20px 60px rgba(0,0,0,.35)">'
        +   '<div style="font-size:15px;font-weight:800;color:#1F3864;margin-bottom:4px">🔑 修改密码</div>'
        +   '<div style="font-size:11px;color:#aaa;margin-bottom:20px">当前账号：' + (_cur ? _cur.name + '（' + _cur.id + '）' : '') + '</div>'
        +   '<div style="margin-bottom:12px">'
        +     '<label style="font-size:11px;font-weight:700;color:#666;display:block;margin-bottom:4px">当前密码</label>'
        +     '<input id="cp-old" type="password" placeholder="输入当前密码" '
        +       'style="width:100%;box-sizing:border-box;padding:9px 11px;font-size:13px;border:1.5px solid #ddd;border-radius:7px;outline:none">'
        +   '</div>'
        +   '<div style="margin-bottom:12px">'
        +     '<label style="font-size:11px;font-weight:700;color:#666;display:block;margin-bottom:4px">新密码</label>'
        +     '<input id="cp-new1" type="password" placeholder="输入新密码（至少6位）" '
        +       'style="width:100%;box-sizing:border-box;padding:9px 11px;font-size:13px;border:1.5px solid #ddd;border-radius:7px;outline:none">'
        +   '</div>'
        +   '<div style="margin-bottom:18px">'
        +     '<label style="font-size:11px;font-weight:700;color:#666;display:block;margin-bottom:4px">确认新密码</label>'
        +     '<input id="cp-new2" type="password" placeholder="再次输入新密码" '
        +       'onkeydown="if(event.key===\'Enter\')AuthSystem.doChangePwd()" '
        +       'style="width:100%;box-sizing:border-box;padding:9px 11px;font-size:13px;border:1.5px solid #ddd;border-radius:7px;outline:none">'
        +   '</div>'
        +   '<div id="cp-err" style="font-size:12px;color:#e53e3e;min-height:16px;margin-bottom:12px"></div>'
        +   '<div style="display:flex;gap:8px;justify-content:flex-end">'
        +     '<button onclick="document.getElementById(\'auth-changepwd-overlay\').remove()" '
        +       'style="padding:8px 16px;background:#f5f5f5;color:#555;border:none;border-radius:7px;font-size:13px;cursor:pointer">取消</button>'
        +     '<button onclick="AuthSystem.doChangePwd()" '
        +       'style="padding:8px 20px;background:#1F3864;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer">确认修改</button>'
        +   '</div>'
        + '</div></div>';
      document.body.insertAdjacentHTML('beforeend', html);
      setTimeout(function(){ var el=document.getElementById('cp-old'); if(el)el.focus(); }, 80);
    },

    doChangePwd: function(){
      if(!_cur){ alert('未登录'); return; }
      var oldPwd = document.getElementById('cp-old').value || '';
      var new1   = document.getElementById('cp-new1').value || '';
      var new2   = document.getElementById('cp-new2').value || '';
      var err    = document.getElementById('cp-err');

      if(!oldPwd || !new1 || !new2){ err.textContent = '请填写所有字段'; return; }
      if(new1.length < 6){ err.textContent = '新密码至少需要6位'; return; }
      if(new1 !== new2){ err.textContent = '两次输入的新密码不一致'; return; }

      // 验证当前密码
      var users = _allUsers();
      var user = users.find(function(u){ return u.id === _cur.id && u.pwd === oldPwd; });
      if(!user){ err.textContent = '当前密码不正确'; return; }
      if(new1 === oldPwd){ err.textContent = '新密码不能与当前密码相同'; return; }

      // 内置账户：存到 localStorage 的自定义账户列表
      var customUsers = _loadUsers();
      var found = customUsers.find(function(u){ return u.id === _cur.id; });
      if(found){
        found.pwd = new1;
      } else {
        // 是内置账户（如 admin），创建一条自定义记录覆盖密码
        var overrideUser = Object.assign({}, user, { pwd: new1 });
        customUsers.unshift(overrideUser);
      }
      _saveUsers(customUsers);
      _log('修改密码', '用户 ' + _cur.name + ' 修改了登录密码');

      var ov = document.getElementById('auth-changepwd-overlay');
      if(ov) ov.remove();
      alert('✅ 密码已修改成功！下次登录请使用新密码。');
    },


    // ── 生成含账户的发布版 HTML（管理员使用）
    exportWithUsers: function(){
      if(!this.can('manageUser')){ alert('权限不足'); return; }
      var users = _allUsers();
      var usersJson = JSON.stringify(users);
      var newBuiltin = 'var BUILTIN_USERS = ' + usersJson + ';';

      // 取当前页面 HTML，替换 BUILTIN_USERS 定义
      var html = document.documentElement.outerHTML;
      // 用正则替换（不含特殊字符的简单匹配）
      var marker = 'var BUILTIN_USERS = [';
      var i1 = html.indexOf(marker);
      var i2 = html.indexOf('];', i1) + 2;
      if(i1 < 0){ alert('替换失败，联系刘宾'); return; }
      var updated = html.slice(0, i1) + newBuiltin + html.slice(i2);

      var blob = new Blob([updated], { type: 'text/html;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '采购管理系统SKU24_发布版_' + new Date().toISOString().slice(0,10) + '.html';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);

      _log('导出发布版', '含 '+users.length+' 个账户');
      alert('已生成发布版！含 '+users.length+' 个账户：\n'
        + users.map(function(u){ return u.name+'（'+u.id+'）'; }).join('、')
        + '\n\n把这个HTML发给采购员，打开即可直接登录。');
    },

    resetPwd: function(uid, uname){
      if(!this.can('manageUser')){ alert('权限不足'); return; }
      if(!confirm('确认将 ' + uname + '（' + uid + '）的密码重置为账号ID「' + uid + '」？')) return;
      var customUsers = _loadUsers();
      var found = customUsers.find(function(u){ return u.id===uid; });
      if(found){ found.pwd = uid; }
      else {
        var bu = _allUsers().find(function(u){ return u.id===uid; });
        if(bu) customUsers.unshift(Object.assign({},bu,{pwd:uid}));
      }
      _saveUsers(customUsers);
      _log('重置密码','管理员将 '+uname+'（'+uid+'）的密码重置为账号ID');
      alert('✅ 已将 '+uname+' 的密码重置为「'+uid+'」，请告知本人。');
    },
    // ── 账户管理弹窗（仅管理员）
    showUserMgr: function(){
      if(!this.can('manageUser')){ alert('权限不足'); return; }
      var existing = document.getElementById('auth-usermgr-overlay');
      if(existing) existing.remove();
      this._renderUserMgr();
    },

    _renderUserMgr: function(){
      var users = _allUsers();
      var rows = users.map(function(u){
        var isBuiltin = BUILTIN_USERS.some(function(b){ return b.id===u.id; });
        return '<tr>'
          + '<td style="padding:8px 10px;font-size:12px;font-family:monospace">'+u.id+'</td>'
          + '<td style="padding:8px 10px;font-size:13px;font-weight:700">'+u.name+'</td>'
          + '<td style="padding:8px 10px;font-size:12px;color:#666">'+u.dept+'</td>'
          + '<td style="padding:8px 10px"><span style="font-size:10px;padding:2px 8px;border-radius:9px;font-weight:700;'
          +   (u.role==='admin'?'background:#1F3864;color:#fff':u.role==='manager'?'background:#2a7;color:#fff':u.role==='buyer'?'background:#e8f0fe;color:#1F3864':'background:#eee;color:#888')
          +   '">'+ROLE_LABEL[u.role]+'</span></td>'
          + '<td style="padding:8px 10px">'
          + (isBuiltin ? '<span style="font-size:10px;color:#aaa">内置账户</span>'
            : '<button onclick="AuthSystem.resetPwd(\''+ u.id +'\',\''+u.name+'\')"'
              + ' style="font-size:11px;padding:2px 8px;border:1px solid #bee3f8;'
              + 'border-radius:5px;background:#fff;color:#2b6cb0;cursor:pointer;margin-right:4px">重置密码</button>'
            + '<button onclick="AuthSystem.delUser(\''+u.id+'\')"'
              + ' style="font-size:11px;padding:2px 8px;border:1px solid #fca;'
              + 'border-radius:5px;background:#fff;color:#e53e3e;cursor:pointer">删除</button>')
          + '</td>'
          + '</tr>';
      }).join('');

      var html = '<div id="auth-usermgr-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);'
        + 'z-index:8001;display:flex;align-items:center;justify-content:center">'
        + '<div style="background:#fff;border-radius:12px;width:660px;max-width:96vw;max-height:85vh;'
        +   'display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
        +   '<div style="padding:16px 20px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:10px">'
        +     '<span style="font-size:18px">👥</span>'
        +     '<span style="font-size:15px;font-weight:700">账户管理</span>'
        +     '<button onclick="document.getElementById(\'auth-usermgr-overlay\').remove()" '
        +       'style="margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:#aaa">✕</button>'
        +   '</div>'
        +   '<div style="overflow:auto;flex:1">'
        +     '<table style="width:100%;border-collapse:collapse">'
        +       '<thead><tr style="background:#f5f5f5">'
        +         '<th style="padding:7px 10px;font-size:10px;font-weight:700;color:#999;text-align:left">账号ID</th>'
        +         '<th style="padding:7px 10px;font-size:10px;font-weight:700;color:#999;text-align:left">姓名</th>'
        +         '<th style="padding:7px 10px;font-size:10px;font-weight:700;color:#999;text-align:left">部门</th>'
        +         '<th style="padding:7px 10px;font-size:10px;font-weight:700;color:#999;text-align:left">角色</th>'
        +         '<th style="padding:7px 10px;font-size:10px;font-weight:700;color:#999;text-align:left">操作</th>'
        +       '</tr></thead>'
        +       '<tbody>'+rows+'</tbody>'
        +     '</table>'
        +   '</div>'
        +   '<div style="padding:14px 20px;border-top:1px solid #eee;background:#fafafa;border-radius:0 0 12px 12px">'
        +     '<div style="font-size:12px;font-weight:700;color:#1F3864;margin-bottom:10px">➕ 新增账户</div>'
        +     '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:8px;align-items:end">'
        +       '<div><label style="font-size:10px;font-weight:700;color:#888;display:block;margin-bottom:3px">账号ID</label>'
        +         '<input id="nu-id"   type="text" placeholder="如：zhang_san" style="width:100%;box-sizing:border-box;padding:7px 9px;font-size:12px;border:1.5px solid #ddd;border-radius:7px;outline:none"></div>'
        +       '<div><label style="font-size:10px;font-weight:700;color:#888;display:block;margin-bottom:3px">姓名</label>'
        +         '<input id="nu-name" type="text" placeholder="张三" style="width:100%;box-sizing:border-box;padding:7px 9px;font-size:12px;border:1.5px solid #ddd;border-radius:7px;outline:none"></div>'
        +       '<div><label style="font-size:10px;font-weight:700;color:#888;display:block;margin-bottom:3px">部门</label>'
        +         '<input id="nu-dept" type="text" placeholder="采购部" style="width:100%;box-sizing:border-box;padding:7px 9px;font-size:12px;border:1.5px solid #ddd;border-radius:7px;outline:none"></div>'
        +       '<div><label style="font-size:10px;font-weight:700;color:#888;display:block;margin-bottom:3px">角色</label>'
        +         '<select id="nu-role" style="width:100%;padding:7px 9px;font-size:12px;border:1.5px solid #ddd;border-radius:7px;outline:none;background:#fff">'
        +           '<option value="buyer">采购专员</option>'
        +           '<option value="manager">主管</option>'
        +           '<option value="viewer">只读</option>'
        +         '</select></div>'
        +       '<button onclick="AuthSystem.addUser()" style="padding:7px 14px;background:#1F3864;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">创建</button>'
        +     '</div>'
        +     '<div id="nu-err" style="font-size:11px;color:#e53e3e;margin-top:6px;min-height:16px"></div>'
        +     '<div style="font-size:10px;color:#aaa;margin-top:4px">初始密码 = 账号ID，首次登录后请提醒用户更改</div>'
        +   '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee;display:flex;gap:8px;align-items:center">'
        +     '<button onclick="AuthSystem.exportWithUsers()" style="padding:6px 14px;background:#2a7a3b;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer">📦 生成含账户的发布版</button>'
        +     '<span style="font-size:11px;color:#999">把所有账户内置进HTML，发给采购员直接能登录</span>'
        +   '</div>'
        +   '</div>'
        + '</div></div>';
      document.body.insertAdjacentHTML('beforeend', html);
    },

    addUser: function(){
      var id   = (document.getElementById('nu-id').value||'').trim().replace(/\s+/g,'_');
      var name = (document.getElementById('nu-name').value||'').trim();
      var dept = (document.getElementById('nu-dept').value||'').trim();
      var role = document.getElementById('nu-role').value;
      var err  = document.getElementById('nu-err');
      if(!id||!name){ err.textContent='账号ID和姓名为必填'; return; }
      var users = _loadUsers();
      if(_allUsers().some(function(u){ return u.id===id; })){ err.textContent='账号ID已存在'; return; }
      var newUser = { id:id, name:name, dept:dept||'未设置', role:role, pwd:id };
      users.push(newUser);
      _saveUsers(users);
      _log('新增账户', '新增用户 '+name+'（'+id+'），角色：'+ROLE_LABEL[role]);
      var ov = document.getElementById('auth-usermgr-overlay');
      if(ov) ov.remove();
      this._renderUserMgr();
    },

    delUser: function(id){
      if(!confirm('确认删除账户 '+id+' ？')) return;
      var users = _loadUsers().filter(function(u){ return u.id!==id; });
      _saveUsers(users);
      _log('删除账户', '删除用户 '+id);
      var ov = document.getElementById('auth-usermgr-overlay');
      if(ov) ov.remove();
      this._renderUserMgr();
    }
  };
})();


// FeishuSync/GitHub同步已移除，由 CloudSyncV2（Cloudflare Worker）替代
var FeishuSync = (function(){
  // GitHub同步已移除，由右下角 CloudSyncV2 (Cloudflare Worker) 替代
  return {
    init:       function(){},
    push:       function(){ alert('GitHub同步已停用，请使用右下角「☁」云同步按钮'); },
    pull:       function(){ alert('GitHub同步已停用，请使用右下角「☁」云同步按钮'); },
    showConfig: function(){ alert('GitHub同步已停用，请使用右下角「☁」云同步按钮'); },
    testAndSave:function(){},
  };
})();

