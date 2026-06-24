// ══════════════════════════════════
// ApiService.js — 云端数据加载 & 本地缓存
// 物资数据库 + 采购历史从 Cloudflare Worker 异步加载
// ══════════════════════════════════

var _REC=[],_SEQ={},_CAT={};
var HIST_PROJ={},HIST_RECORDS=[],HIST_MAX_AMOUNT=1;
var API_BASE='https://csfw-purchase.pages.dev';

function _cg(k){try{var v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch(e){return null;}}
function _cs(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}

function loadCloudData(cb){
  var r=_cg('cr');var c=_cg('cc');var s=_cg('cs');
  if(r&&r.length){_REC=r;if(c)_CAT=c;if(s)_SEQ=s;if(cb)cb();return;}
  var d={r:0,c:0,s:0};
  function chk(){if(d.r&&d.c&&d.s){_cs('cr',_REC);_cs('cc',_CAT);_cs('cs',_SEQ);if(cb)cb();}}
  var x=new XMLHttpRequest();x.open('GET','https://csfw-purchase.pages.dev/api/records',1);
  x.onload=function(){if(x.status==200)try{_REC=JSON.parse(x.responseText)}catch(e){}d.r=1;chk();};
  x.onerror=function(){d.r=1;chk();};x.send();
  var x2=new XMLHttpRequest();x2.open('GET','https://csfw-purchase.pages.dev/api/cat',1);
  x2.onload=function(){if(x2.status==200)try{_CAT=JSON.parse(x2.responseText)}catch(e){}d.c=1;chk();};
  x2.onerror=function(){d.c=1;chk();};x2.send();
  var x3=new XMLHttpRequest();x3.open('GET','https://csfw-purchase.pages.dev/api/seq',1);
  x3.onload=function(){if(x3.status==200)try{_SEQ=JSON.parse(x3.responseText)}catch(e){}d.s=1;chk();};
  x3.onerror=function(){d.s=1;chk();};x3.send();
}

function loadHistoryData(cb){
  var h=_cg('ch');
  if(h&&Object.keys(h).length){HIST_PROJ=h;rebuildHR();if(cb)cb();return;}
  var x=new XMLHttpRequest();x.open('GET','https://csfw-purchase.pages.dev/api/hist_proj',1);
  x.onload=function(){
    if(x.status==200)try{HIST_PROJ=JSON.parse(x.responseText);_cs('ch',HIST_PROJ);rebuildHR();if(cb)cb();if(typeof DB_STORE!=='undefined'){DB_STORE.importHistProj(HIST_PROJ).then(function(n){if(n)console.log('[DB_STORE] HIST_PROJ 已写入 IndexedDB: '+n+' 条');}).catch(function(){});}}catch(e){}
  };
  x.onerror=function(){};x.send();
}

function rebuildHR(){
  HIST_RECORDS=[];
  Object.keys(HIST_PROJ).forEach(function(p){
    Object.keys(HIST_PROJ[p]).forEach(function(m){
      HIST_PROJ[p][m].items.forEach(function(it){
        HIST_RECORDS.push({
          '物资名称':it.n||'','参考品牌':it.b||'','规格参数':it.s||'','单位':it.u||'',
          '数量':it.q||0,'单价（元）':it.p||0,'小计（元）':it.sub||0,
          '赋码状态':'','proj':p,'month':m,'platform':it.pt||'','url':it.url||''
        });
      });
    });
  });
  (function(){var mx=0;HIST_RECORDS.forEach(function(r){var v=Number(r['小计（元）'])||0;if(v>mx)mx=v;});HIST_MAX_AMOUNT=mx||1;})();
}
