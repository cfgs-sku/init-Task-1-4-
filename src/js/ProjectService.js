// ══════════════════════════════════
// ProjectService.js — 采购项目 & 地址管理
// ══════════════════════════════════

// localStorage key 常量（采购中心共用）
var _K = {
  PROJ:'pc22_projects', CARTS:'pc22_carts', ADDR:'pc22_addresses',
  CUST:'pc22_custom',   PO:'pc22_po',       POSEQ:'pc22_po_seq'
};

// ───────────────────────────────────────────────────
// ProjectService
// ───────────────────────────────────────────────────
var ProjectService = (function(){
  var list = [];

  function _save(){ try{ localStorage.setItem(_K.PROJ, JSON.stringify(list)); }catch(e){} }

  function _load(){
    try{
      var raw = localStorage.getItem(_K.PROJ);
      if(raw){ list = JSON.parse(raw); }
    }catch(e){}
  }

  function _safeId(name){
    var hex = '';
    for(var i=0; i<name.length && i<8; i++){
      hex += name.charCodeAt(i).toString(16);
    }
    return 'preset22_' + hex;
  }

  function _syncPreset(){
    if(typeof PRESET_ORDERS === 'undefined') return;
    var changed = false;
    var names = Object.keys(PRESET_ORDERS);
    for(var i=0; i<names.length; i++){
      var name = names[i];
      var exists = false;
      for(var j=0; j<list.length; j++){
        if(list[j].name === name){ exists = true; break; }
      }
      if(!exists){
        var items = PRESET_ORDERS[name][0].items;
        list.push({
          id: _safeId(name),
          name: name,
          code: '',
          isPreset: true,
          createdAt: '2025年历史数据',
          orderCount: items.length
        });
        changed = true;
      }
    }
    if(changed) _save();
  }

  function _fixBrokenIds(){
    var changed = false;
    for(var i=0; i<list.length; i++){
      var p = list[i];
      if(p.isPreset && (!p.id || p.id === 'preset22_')){
        p.id = _safeId(p.name);
        changed = true;
      }
    }
    if(changed) _save();
  }

  return {
    init: function(){
      _load();
      _fixBrokenIds();
      _syncPreset();
    },
    all: function(){ return list; },
    get: function(id){
      for(var i=0; i<list.length; i++){
        if(list[i].id === id) return list[i];
      }
      return null;
    },
    getByName: function(name){
      for(var i=0; i<list.length; i++){
        if(list[i].name === name) return list[i];
      }
      return null;
    },
    getHistoryOrders: function(projId){
      var proj = this.get(projId);
      if(!proj) return [];
      var result = [];
      if(typeof PRESET_ORDERS !== 'undefined' && PRESET_ORDERS[proj.name]){
        var po = PRESET_ORDERS[proj.name];
        for(var i=0; i<po.length; i++) result.push(po[i]);
      }
      if(typeof projectOrders !== 'undefined' && typeof projectList !== 'undefined'){
        var pm = null;
        for(var j=0; j<projectList.length; j++){
          if(projectList[j].name === proj.name){ pm = projectList[j]; break; }
        }
        if(pm && projectOrders[pm.id]){
          var orders = projectOrders[pm.id];
          for(var k=0; k<orders.length; k++) result.push(orders[k]);
        }
      }
      return result;
    },
    create: function(name, code){
      if(!(name = name.trim())){ alert('请填写项目名称'); return null; }
      var p = {
        id: 'pc22_' + Date.now(),
        name: name,
        code: (code||'').trim(),
        isPreset: false,
        createdAt: new Date().toLocaleDateString('zh-CN')
      };
      list.unshift(p);
      _save();
      return p;
    },
    remove: function(id){
      if(!confirm('删除项目将同时清除其购物车与地址，确认？')) return false;
      var newList = [];
      for(var i=0; i<list.length; i++){
        if(list[i].id !== id) newList.push(list[i]);
      }
      list = newList;
      _save();
      try{
        var carts = JSON.parse(localStorage.getItem(_K.CARTS)||'{}');
        delete carts[id];
        localStorage.setItem(_K.CARTS, JSON.stringify(carts));
        var addrs = JSON.parse(localStorage.getItem(_K.ADDR)||'{}');
        delete addrs[id];
        localStorage.setItem(_K.ADDR, JSON.stringify(addrs));
      }catch(e){}
      return true;
    }
  };
})();
