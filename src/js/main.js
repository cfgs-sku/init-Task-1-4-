// main.js — 核心业务逻辑入口
// 包含: AppState 全局状态、initDB、goPage、SKU搜索、购物车、历史、Excel导出等
// 兜底：embed-data.js 未加载成功时给空默认值，避免引用报错、绝不阻塞启动
if(typeof ORDER_ITEMS==='undefined') window.ORDER_ITEMS=[];
if(typeof ORDER_PATCHES==='undefined') window.ORDER_PATCHES={};
if(typeof PRESET_ORDERS==='undefined') window.PRESET_ORDERS={};
// ══════════════════════════════════
// 核心状态
// ══════════════════════════════════
var DB=[],seqT={},catM={},usedCodes=new Set(),dbReady=false;
var masterDB=[];
var cart=[];
var matchResults=[],curMT='all';
var dbFilter1='',dbFilterABC='',dbQuery='';
var dbFiltered=[];
var dbPage=1, dbPageSize=300; // 物资库分页：每页300条，避免单次渲染过多DOM
var qsItems=[],qsFocusIdx=-1,qsSel=null,qsTimer=null;

// ══ 启动 ══
function setP(p,m){document.getElementById('bfill').style.width=p+'%';document.getElementById('bmsg').textContent=m;}
function initDB(){
  // 尝试从缓存或云端加载
  if(_REC.length===0){
    var cr=_cg('cr');var cc=_cg('cc');var cs=_cg('cs');
    if(cr&&cr.length>0){_REC=cr;if(cc)_CAT=cc;if(cs)_SEQ=cs;}
    else{
      setP(3,'连接云端数据库…');
      loadCloudData(function(){ initDB(); });
      return;
    }
  }

setP(8,'读取编码库…');
  setTimeout(function(){
    Object.assign(seqT,_SEQ);Object.assign(catM,_CAT);
    setP(22,'建立索引…');
    setTimeout(function(){
      var i=0;
      function chunk(){
        var end=Math.min(i+400,_REC.length);
        for(;i<end;i++){DB.push(_REC[i]);usedCodes.add(_REC[i].code);}
        setP(22+Math.round(i/_REC.length*60),'加载 '+i+'/'+_REC.length+'…');
        if(i<_REC.length){setTimeout(chunk,0);}else{loadLocal();}
      }
      chunk();
    },0);
  },0);
}
// 强制重新从云端拉取最新数据库（清空本地缓存的cr/cc/cs，解决多设备数据不一致问题）
// 仅admin/manager可见，谨慎使用：会丢弃本设备未同步到云端的本地改动
function forceSyncCloudDB(){
  if(typeof AuthSystem!=='undefined' && !AuthSystem.can('editDB')){ alert('权限不足'); return; }
  if(!confirm('确认强制同步云端最新数据库？\n\n此操作会：\n1. 清空本机缓存的SKU基础库\n2. 重新从云端拉取最新数据\n\n注意：如果本机有尚未同步到云端的自定义SKU/链接修改，建议先点「⬇ 导出数据库」备份，再执行此操作。\n\n是否继续？')) return;
  try{
    localStorage.removeItem('cr'); // 清核心SKU库缓存
    localStorage.removeItem('cc'); // 清类目缓存
    localStorage.removeItem('cs'); // 清序号缓存
  }catch(e){}
  alert('缓存已清空，页面将重新加载并从云端拉取最新数据');
  location.reload();
}

function loadLocal(){
  setP(84,'加载本地数据…');
  setTimeout(function(){
    try{
      var raw=localStorage.getItem('masterDB_v1');
      if(raw){
        masterDB=JSON.parse(raw);
        masterDB.forEach(function(r){
          if(!usedCodes.has(r.code)){DB.unshift(r);usedCodes.add(r.code);}
          var m=r.code.match(/^CSFW-([A-Z]{2})(\d{2})(\d{2})(\d{3,5})$/);
          if(m){var sk=m[1]+'|'+m[2]+'|'+m[3];seqT[sk]=Math.max(seqT[sk]||0,parseInt(m[4]));}
        });
      }
    }catch(e){}
    loadDBLinks();
    autoFillMasterDBFromOrders();
    setP(100,'就绪 ✓');
    setTimeout(function(){
      document.getElementById('boot').classList.add('fade');
      setTimeout(function(){document.getElementById('boot').style.display='none';},500);
    },300);
    document.getElementById('topbadge').textContent='数据库 '+DB.length+' 条';
    autoFillDBFromOrders();
    
    setTimeout(function(){loadHistoryData();},200);
    initCats();
    var dbInp = document.getElementById('db-inp');
    if(dbInp) dbInp.value = '';
    // 浏览器自动填充在 load 后触发，用 setTimeout 兜底再清一次
    setTimeout(function(){ var el=document.getElementById('db-inp'); if(el&&el.value){ el.value=''; dbSearch(''); } }, 200);
    dbSearch('');
    updateCartStats();
    // 采购中心模块初始化（DB就绪后）
    if(typeof PCService!=='undefined'){
      setTimeout(function(){
        PCService.initSearch();
        // 如果当前在采购中心页面则重渲
        if(document.getElementById('p-procure')&&
           document.getElementById('p-procure').classList.contains('on')){
          PCService.onEnter();
        }
      },50);
    }
  },0);
}
function saveMaster(){
  try{localStorage.setItem('masterDB_v1',JSON.stringify(masterDB));}
  catch(e){alert('存储空间不足，请先导出数据库备份');}
  // 操作日志
  if(typeof AuthSystem!=='undefined' && AuthSystem.current())
    AuthSystem.log('修改SKU库','保存自定义SKU库（共'+masterDB.length+'条）');
}

// ══ 导航 ══
function goPage(id){
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('on');});
  document.querySelectorAll('.nav-tab').forEach(function(t){t.classList.remove('on');});
  var pageEl = document.getElementById(id);
  if(!pageEl){ console.warn('[goPage] 页面不存在:', id); return; }
  pageEl.classList.add('on');
  var tid='tab-'+id.replace('p-','');
  var tel=document.getElementById(tid);if(tel)tel.classList.add('on');
  if(id==='p-db')renderDBTable();
  if(id==='p-history'){renderProjList('');renderMonthList();renderHistDetail();}
}

// ══ 类目初始化 ══
function initCats(){
  var c1s=[...new Set(DB.map(function(r){return r.cat1;}))].filter(Boolean).sort();
  var s=document.getElementById('nf-c1');
  c1s.forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;s.appendChild(o);});
}
function onC1(){
  var v=document.getElementById('nf-c1').value;
  var s2=document.getElementById('nf-c2');s2.innerHTML='<option value="">请选择</option>';
  document.getElementById('nf-c3').innerHTML='<option value="">请选择</option>';
  if(!v)return;
  [...new Set(DB.filter(function(r){return r.cat1===v;}).map(function(r){return r.cat2;}))].sort()
    .forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;s2.appendChild(o);});
}
function onC2(){
  var v1=document.getElementById('nf-c1').value,v2=document.getElementById('nf-c2').value;
  var s3=document.getElementById('nf-c3');s3.innerHTML='<option value="">请选择</option>';
  if(!v1||!v2)return;
  [...new Set(DB.filter(function(r){return r.cat1===v1&&r.cat2===v2;}).map(function(r){return r.cat3;}))].sort()
    .forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;s3.appendChild(o);});
}

// ══ 相似度 ══
function sim(a,b){
  if(!a||!b)return 0;
  a=String(a).toLowerCase();b=String(b).toLowerCase();
  if(a===b)return 1;
  if(a.indexOf(b)>=0||b.indexOf(a)>=0)return 0.88;
  var wa=a.match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]+/g)||[];
  var wb=b.match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]+/g)||[];
  if(wa.length&&wb.length){
    var sa=new Set(wa),sb=new Set(wb);
    var c=[...sa].filter(function(w){return sb.has(w);}).length;
    if(c)return Math.min(c/Math.max(sa.size,sb.size)+0.08,1);
  }
  var ca=new Set(a.split('')),cb=new Set(b.split(''));
  return[...ca].filter(function(x){return cb.has(x);}).length/Math.max(ca.size,cb.size);
}
function findTop(name,brand,n){
  var res=[];
  for(var i=0;i<DB.length;i++){
    var r=DB[i];
    var s=sim(name,r.name)*0.75+(brand&&r.brand?sim(brand,r.brand)*0.25:0);
    if(s>=0.28)res.push({r:r,s:Math.min(s,1)});
  }
  return res.sort(function(a,b){return b.s-a.s;}).slice(0,n||6);
}

// ══ 赋码 ══
var codeRE=/^CSFW-[A-Z]{2}\d{2}\d{2}\d{3,5}$/;
function nextCode(c1,c2,c3){
  var ck=c1+'|'+c2+'|'+c3,sk=catM[ck];
  if(!sk)return null;
  var p=sk.split('|'),l=p[0],m=p[1],s=p[2];
  var cur=seqT[sk]||0,digits=cur>=9999?6:cur>=999?5:4;
  for(var seq=cur+1;seq<Math.pow(10,digits);seq++){
    var code='CSFW-'+l+m+s+String(seq).padStart(digits,'0');
    if(!usedCodes.has(code)){seqT[sk]=seq;usedCodes.add(code);return code;}
  }
  return null;
}

// ══════════════════════════════════
// 数据库页搜索
// ══════════════════════════════════
function hl(text,q){
  if(!q||!text)return String(text);
  var re=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  return String(text).replace(re,'<span class="hl">$1</span>');
}

function setF1(el,v){
  document.querySelectorAll('.filter-chip').forEach(function(c){c.classList.remove('on');});
  el.classList.add('on');dbFilter1=v;dbSearch(document.getElementById('db-inp').value);
}
function setFABC(el,v){
  document.querySelectorAll('.filter-abc').forEach(function(c){c.classList.remove('on');});
  el.classList.add('on');dbFilterABC=v;dbSearch(document.getElementById('db-inp').value);
}
function clearDBSearch(){
  document.getElementById('db-inp').value='';
  document.getElementById('db-clr').className='db-search-clear';
  dbSearch('');
}
function dbSearch(q){
  q=(q||'').trim();dbQuery=q;
  document.getElementById('db-clr').className='db-search-clear'+(q?' on':'');
  var ql=q.toLowerCase();
  dbFiltered=DB.filter(function(r){
    if(dbFilter1&&r.cat1!==dbFilter1)return false;
    if(dbFilterABC&&r.abc!==dbFilterABC)return false;
    if(!ql)return true;
    return(r.name&&r.name.toLowerCase().indexOf(ql)>=0)||
           (r.code&&r.code.toLowerCase().indexOf(ql)>=0)||
           (r.brand&&r.brand.toLowerCase().indexOf(ql)>=0)||
           (r.spec&&r.spec.toLowerCase().indexOf(ql)>=0)||
           (r.cat2&&r.cat2.toLowerCase().indexOf(ql)>=0);
  });
  dbPage=1; // 每次搜索/筛选重置到第一页
  renderDBTable();
}
function dbGotoPage(p){
  var totalPages=Math.max(1,Math.ceil(dbFiltered.length/dbPageSize));
  dbPage=Math.min(Math.max(1,p),totalPages);
  renderDBTable();
  var wrap=document.querySelector('.db-table-wrap');
  if(wrap) wrap.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderDBPager(){
  var box=document.getElementById('db-pager');
  if(!box) return;
  var totalPages=Math.ceil(dbFiltered.length/dbPageSize)||1;
  if(totalPages<=1){ box.innerHTML=''; return; }
  var html='';
  if(dbPage>1) html+='<span class="dm-pg" onclick="dbGotoPage('+(dbPage-1)+')">上一页</span>';
  // 页码过多时仅显示当前页附近 + 首尾，避免页码列表过长
  var pages=[];
  for(var i=1;i<=totalPages;i++){
    if(i===1||i===totalPages||Math.abs(i-dbPage)<=2) pages.push(i);
  }
  var lastShown=0;
  pages.forEach(function(i){
    if(lastShown && i-lastShown>1) html+='<span style="padding:0 4px;color:var(--t3)">…</span>';
    if(i===dbPage) html+='<span class="dm-pg dm-pg-cur">'+i+'</span>';
    else html+='<span class="dm-pg" onclick="dbGotoPage('+i+')">'+i+'</span>';
    lastShown=i;
  });
  if(dbPage<totalPages) html+='<span class="dm-pg" onclick="dbGotoPage('+(dbPage+1)+')">下一页</span>';
  html+='<span class="dm-pg-info">共'+dbFiltered.length+'条，第'+dbPage+'/'+totalPages+'页</span>';
  box.innerHTML=html;
}
function renderDBTable(){
  var tbody=document.getElementById('db-tbody');
  var totalPages=Math.ceil(dbFiltered.length/dbPageSize)||1;
  if(dbPage>totalPages) dbPage=totalPages;
  if(dbPage<1) dbPage=1;
  var start=(dbPage-1)*dbPageSize;
  var show=dbFiltered.slice(start,start+dbPageSize);
  var infoEl=document.getElementById('db-result-info');
  if(infoEl) infoEl.textContent='共 '+dbFiltered.length+' 条'+(totalPages>1?'（第'+dbPage+'/'+totalPages+'页）':'');
  if(!show.length){
    tbody.innerHTML='<tr><td colspan="9" style="padding:50px;text-align:center;color:var(--t3)">'
      +'<div style="font-size:28px;margin-bottom:8px">🔍</div>'
      +'未找到匹配物资'
      +((typeof AuthSystem!=='undefined' && AuthSystem.can('addSKU'))
        ? '<div style="margin-top:12px"><button class="btn btn-blue btn-sm" onclick="openNewSkuModal(\''+dbQuery.replace(/'/g,"\\'")+'\')">＋ 新增「'+(dbQuery||'该物资')+'」并赋码</button></div>'
        : '<div style="margin-top:6px;font-size:11px">可前往「采购清单」添加新物资并赋码</div>')
      +'</td></tr>';
    renderDBPager();
    return;
  }
  var q=dbQuery;
  var abcCls={A:'tA',B:'tB',C:'tC'};
  var inMSet=new Set(masterDB.map(function(r){return r.code;}));
  tbody.innerHTML=show.map(function(r,localI){
    var i=start+localI; // 全局索引（在dbFiltered中的真实位置），分页后编辑函数仍能正确定位
    var isMaster=inMSet.has(r.code);
    // 图片列
    var imgHtml=r.img
      ?'<img class="img-thumb" src="'+r.img+'" title="点击放大" onclick="previewImg(\''+r.img.replace(/'/g,"\\'")+'\')" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">'
        +'<div class="img-placeholder" style="display:none" onclick="openLinkEditor(\''+i+'\')" title="添加图片">📷</div>'
      :'<div class="img-placeholder" onclick="openLinkEditor(\''+i+'\')" title="添加图片/链接">📷</div>';
    // 链接列
    var links=r.links||{};
    // 从订单库自动补充平台链接
    var _om=searchOrderItems(r.name||'');
    _om.forEach(function(m){if(!links[m.pt])links[m.pt]=m.url;});
    var PLATS=[
      {k:'鑫方盛',cls:'pl-xfs',ico:'⭕'},
      {k:'得力',  cls:'pl-dl', ico:'🔵'},
      {k:'震坤行',cls:'pl-zkh',ico:'🟠'},
      {k:'京东',  cls:'pl-jd', ico:'🔴'},
      {k:'淘宝',  cls:'pl-tb', ico:'🟣'},
    ];
    var linkHtml='<div class="link-cell">';
    PLATS.forEach(function(p){
      var url=links[p.k];
      if(url) linkHtml+='<a class="plat-link '+p.cls+'" href="'+url+'" target="_blank" title="在'+p.k+'查看商品">'+p.ico+' '+p.k+'</a>';
    });
    linkHtml+='<span class="plat-link pl-add" onclick="openLinkEditor(\''+i+'\')" title="维护该物资的购买地址（各平台链接）">🛒 购买地址</span>';
    linkHtml+='</div>';
    return '<tr>'+
      '<td style="color:var(--t3);font-size:11px;text-align:center">'+(i+1)+'</td>'+
      '<td style="padding:6px 8px">'+imgHtml+'</td>'+
      '<td><span class="mono">'+hl(r.code,q)+'</span>'+(isMaster?' <span class="tag tag-db" style="font-size:9px">自存</span>':'')+'</td>'+
      '<td style="font-weight:600;font-size:12px">'+hl(r.name,q)+'</td>'+
      '<td><span class="tag '+(abcCls[r.abc]||'tB')+'\">'+(r.abc||'B')+'</span></td>'+
      '<td style="font-size:11px;color:var(--t2)">'+hl((r.brand||'—').slice(0,14),q)+'</td>'+
      '<td style="font-size:11px;color:var(--t3)">'+(r.cat1||'—')+'</td>'+
      '<td style="position:relative">'+
      '<span class="spec-text" title="'+(r.spec||'')+'">'+hl((r.spec||'—').slice(0,36),q)+'</span>'+
      '<button class="spec-edit-btn" onclick="openSpecEdit(event,'+i+')" title="编辑规格型号">✏</button>'+
      '</td>'+
      '<td style="font-size:11px">'+(r.unit||'—')+'</td>'+
      '<td>'+linkHtml+'</td>'+
      '<td style="display:flex;gap:3px;padding:6px 8px;flex-wrap:wrap">'+
      '<button class="btn btn-ghost btn-xs" style="white-space:nowrap" onclick="addDBToCart('+i+',this)">+ 购物车</button>'+
      ((typeof AuthSystem!=='undefined' && AuthSystem.can('delSKU'))?'<button class="btn btn-ghost btn-xs" style="white-space:nowrap;color:var(--red)" onclick="deleteSkuRow('+i+')" title="删除该SKU">🗑 删除</button>':'')+
    '</td>'+
    '</tr>';
  }).join('');
  renderDBPager();
}
function addDBToCart(i,btn){
  var r=dbFiltered[i];if(!r)return;
  // 类目为空时也从原始DB记录补一次
  var cat1=r.cat1||'',cat2=r.cat2||'',cat3=r.cat3||'';
  if(!cat1&&r.code){
    var fr=DB.find(function(x){return x.code===r.code;});
    if(fr){cat1=fr.cat1||'';cat2=fr.cat2||'';cat3=fr.cat3||'';}
  }
  var cartItem = {id:'i'+Date.now(),name:r.name,code:r.code,
    brand:r.brand||'',spec:r.spec||'',unit:r.unit||'',
    cat1:cat1,cat2:cat2,cat3:cat3,qty:1,price:0,isNew:false};
  cart.push(Object.assign({},cartItem,{id:Date.now()+Math.random()}));
  renderCart();
  // 同步加入采购中心当前项目的购物车
  if(typeof PCService!=='undefined' && PCService.getPid()){
    PCService.addItem(cartItem);
  }
  btn.textContent='✓已加';btn.style.color='var(--green)';btn.disabled=true;
}

// ══════════════════════════════════
// 采购清单搜索联想
// ══════════════════════════════════
document.getElementById('qs-inp').addEventListener('input',function(){
  var v=this.value;
  document.getElementById('qs-clr').className='qs-clear'+(v?' on':'');
  if(qsTimer)clearTimeout(qsTimer);
  if(!v.trim()){closeQS();return;}
  qsTimer=setTimeout(function(){doQS(v);},120);
});
document.getElementById('qs-inp').addEventListener('keydown',function(e){
  if(!document.getElementById('qs-drop').classList.contains('open'))return;
  if(e.key==='ArrowDown'){e.preventDefault();moveQS(1);}
  else if(e.key==='ArrowUp'){e.preventDefault();moveQS(-1);}
  else if(e.key==='Enter'){e.preventDefault();if(qsFocusIdx>=0&&qsFocusIdx<qsItems.length)pickQS(qsFocusIdx);}
  else if(e.key==='Escape')clearQS();
});
document.addEventListener('click',function(e){if(!e.target.closest('#qs-box'))closeQS();});

function doQS(val){
  if(!dbReady)return;
  var hits=[];
  for(var i=0;i<DB.length;i++){var s=sim(val,DB[i].name);if(s>=0.28)hits.push({r:DB[i],s:s});}
  hits.sort(function(a,b){return b.s-a.s;});
  renderQS(val,hits.slice(0,9));
}
function renderQS(q,hits){
  qsItems=hits;qsFocusIdx=-1;
  var drop=document.getElementById('qs-drop'),html='';
  if(!hits.length){
    var _escQ = q.replace(/'/g,"\\'");
    html='<div class="tmp-notfound">'
      +'<div class="tmp-notfound-msg">未找到匹配SKU：<strong>'+q+'</strong></div>'
      +'<button class="tmp-create-btn" onclick="TempSKU.openModal(\''+_escQ+'\',\'cart\')">✦ 创建临时物资</button>'
      +'</div>';
  }
  else{
    html='<div style="padding:4px 10px 2px;font-size:10px;font-weight:700;color:var(--t3);letter-spacing:.05em">匹配结果</div>';
    hits.forEach(function(h,i){
      var pct=Math.round(h.s*100),pcls=pct>=85?'pct-hi':'pct-md';
      html+='<div class="qs-item" onclick="pickQS('+i+')">'+
        '<div style="display:flex;align-items:baseline;gap:4px">'+
          '<span class="qs-name">'+hl(h.r.name,q)+'</span>'+
          '<span class="qs-pct '+pcls+'">'+pct+'%</span>'+
        '</div>'+
        '<div class="qs-sub">'+
          '<span class="qs-code">'+h.r.code+'</span>'+
          (h.r.brand?'<span>'+h.r.brand+'</span>':'')+
          '<span style="color:var(--t3)">'+h.r.cat1+'</span>'+
        '</div>'+
        (function(){
          var om=searchOrderItems(h.r.name||'');
          if(!om.length) return '';
          var pc=PLAT_CONFIG[om[0].pt]||{};
          return '<div style="margin-top:2px;display:flex;gap:3px;flex-wrap:wrap">'+
            om.slice(0,3).map(function(m){
              var cfg=PLAT_CONFIG[m.pt]||{};
              return '<a class="plat-link '+(cfg.cls||'')+'" href="'+m.url+'" target="_blank" '+
                'style="font-size:9px;padding:1px 5px" onclick="event.stopPropagation()">'+
                (cfg.ico||'')+' '+m.pt+'</a>';
            }).join('')+
          '</div>';
        })()+
        (h.r.spec?'<div style="font-size:10px;color:var(--t3);margin-top:1px">'+h.r.spec.slice(0,48)+'</div>':'')+
      '</div>';
    });
  }
  html+='<div style="padding:8px 10px;cursor:pointer;border-top:1px solid var(--bd);background:var(--s2);display:flex;align-items:center;gap:6px;font-size:11px;color:var(--t2)" onclick="openNewPanel(\''+q.replace(/'/g,"\\'")+'\')" onmouseover="this.style.background=\'var(--blue-bg)\'" onmouseout="this.style.background=\'var(--s2)\'">'+
    '<span style="font-size:13px">✦</span>新增"<strong>'+q+'</strong>"并自动赋新编码</div>';
  drop.innerHTML=html;drop.classList.add('open');
}
function closeQS(){document.getElementById('qs-drop').classList.remove('open');qsItems=[];qsFocusIdx=-1;}
function moveQS(d){
  qsFocusIdx=Math.max(-1,Math.min(qsItems.length-1,qsFocusIdx+d));
  document.querySelectorAll('.qs-item').forEach(function(el,i){el.classList.toggle('hi',i===qsFocusIdx);});
}
function pickQS(i){
  var h=qsItems[i];if(!h)return;
  qsSel=Object.assign({},h.r);closeQS();
  document.getElementById('qs-inp').value=h.r.name;
  document.getElementById('qs-clr').className='qs-clear on';
  document.getElementById('sc-name').textContent=h.r.name;
  document.getElementById('sc-code').textContent=h.r.code;
  document.getElementById('sc-meta').innerHTML=
    '<span>'+h.r.cat1+' › '+h.r.cat2+' › '+h.r.cat3+'</span>'+
    (h.r.brand?'<br><span>品牌：'+h.r.brand+'</span>':'')+
    (h.r.unit?'<span style="margin-left:7px">单位：'+h.r.unit+'</span>':'')+
    (h.r.spec?'<br><span style="color:var(--t3)">'+h.r.spec.slice(0,55)+'</span>':'');
  document.getElementById('sc-brand').value=h.r.brand||'';
  document.getElementById('sc-unit').value=h.r.unit||'';
  document.getElementById('sc-spec').value=h.r.spec||'';
  document.getElementById('sc-qty').value='1';
  document.getElementById('sel-card').classList.add('on');
  document.getElementById('new-panel').classList.remove('on');
}
function toggleSCExtra(){
  var f=document.getElementById('sc-extra');f.className='sc-extra'+(f.classList.contains('on')?'':' on');
}
function clearQS(){
  document.getElementById('qs-inp').value='';
  document.getElementById('qs-clr').className='qs-clear';
  document.getElementById('sel-card').classList.remove('on');
  document.getElementById('new-panel').classList.remove('on');
  document.getElementById('sc-extra').className='sc-extra';
  closeQS();qsSel=null;
}
function openNewPanel(name){
  closeQS();
  document.getElementById('new-panel').classList.add('on');
  document.getElementById('sel-card').classList.remove('on');
  document.getElementById('nf-name').value=name||document.getElementById('qs-inp').value;
}
function closeNewPanel(){document.getElementById('new-panel').classList.remove('on');}

// ══ 采购清单操作 ══
function addSelToCart(){
  if(!qsSel)return;
  cart.push({id:Date.now()+Math.random(),name:qsSel.name,code:qsSel.code,
    brand:document.getElementById('sc-brand').value||qsSel.brand||'',
    unit:document.getElementById('sc-unit').value||qsSel.unit||'',
    spec:document.getElementById('sc-spec').value||qsSel.spec||'',
    cat1:qsSel.cat1,cat2:qsSel.cat2,cat3:qsSel.cat3,
    qty:Math.max(1,parseInt(document.getElementById('sc-qty').value)||1),isNew:false});
  renderCart();clearQS();
}
function addNewToCart(){
  var name=document.getElementById('nf-name').value.trim();
  var c1=document.getElementById('nf-c1').value,c2=document.getElementById('nf-c2').value,c3=document.getElementById('nf-c3').value;
  if(!name){alert('请填写物资名称');return;}
  if(!c1||!c2||!c3){alert('请选择完整的一级 / 二级 / 三级类目');return;}
  var code=nextCode(c1,c2,c3);
  if(!code){alert('该类目编码已满，请联系管理员扩展');return;}
  cart.push({id:Date.now()+Math.random(),name:name,code:code,
    brand:document.getElementById('nf-brand').value.trim(),
    unit:document.getElementById('nf-unit').value.trim(),
    spec:document.getElementById('nf-spec').value.trim(),
    cat1:c1,cat2:c2,cat3:c3,
    qty:Math.max(1,parseInt(document.getElementById('nf-qty').value)||1),isNew:true});
  renderCart();closeNewPanel();clearQS();
}
function removeCI(id){cart=cart.filter(function(c){return c.id!==id;});renderCart();}
function clearCart(){if(cart.length&&!confirm('确认清空采购清单？'))return;cart=[];renderCart();}
function updateQty(id,v){var c=cart.find(function(x){return x.id===id;});if(c)c.qty=Math.max(1,parseInt(v)||1);}

function renderCart(){
  document.getElementById('cart-cnt').textContent=cart.length+' 项';
  var el=document.getElementById('cart-list');
  if(!cart.length){
    el.innerHTML='<div class="empty-cart"><div class="empty-ico">🛒</div><div class="empty-txt">从左侧搜索添加物资<br>或在数据库页点「+ 清单」</div></div>';
    updateCartStats();return;
  }
  el.innerHTML=cart.map(function(c){
    return '<div class="ci">'+
      '<div class="ci-qty"><div style="font-size:9px;color:var(--t3);margin-bottom:2px;text-align:center">数量</div>'+
        '<input type="number" min="1" value="'+c.qty+'" onchange="updateQty(\''+c.id+'\',this.value)"></div>'+
      '<div class="ci-body">'+
        '<div class="ci-name">'+c.name+
          (c.isNew?'<span class="tag tag-n">✦新码</span>':'<span class="tag tag-m">✓</span>')+
        '</div>'+
        '<div class="ci-code">'+c.code+'</div>'+
        '<div class="ci-meta">'+
          (c.brand?c.brand+' · ':'')+
          (c.spec?c.spec.slice(0,35)+' · ':'')+
          (c.unit||'')+
          '<br><span style="color:var(--t3)">'+c.cat1+' › '+c.cat2+'</span>'+
        '</div>'+
      '</div>'+
      '<button class="ci-del" onclick="removeCI(\''+c.id+'\')">✕</button>'+
    '</div>';
  }).join('');
  updateCartStats();
}
function updateCartStats(){
  var t=cart.length,coded=cart.filter(function(c){return c.code&&!c.isNew;}).length;
  var nw=cart.filter(function(c){return c.isNew;}).length,nocode=cart.filter(function(c){return !c.code;}).length;
  document.getElementById('cs-total').textContent=t;
  document.getElementById('cs-coded').textContent=coded;
  document.getElementById('cs-new').textContent=nw;
  document.getElementById('cs-nocode').textContent=nocode;
}
function exportCart(){
  if(!cart.length){alert('采购清单为空');return;}
  var rows=cart.map(function(c,i){
    // 类目缺失时从DB查找补全
    var cat1=c.cat1||'', cat2=c.cat2||'', cat3=c.cat3||'';
    if(!cat1&&c.code){
      var dbR=DB.find(function(r){return r.code===c.code;});
      if(dbR){cat1=dbR.cat1||'';cat2=dbR.cat2||'';cat3=dbR.cat3||'';}
    }
    if(!cat1&&c.name){
      var dbR2=DB.find(function(r){return r.name===c.name;});
      if(dbR2){cat1=dbR2.cat1||'';cat2=dbR2.cat2||'';cat3=dbR2.cat3||'';}
    }
    return {'序号':i+1,'物料编码':c.code||'','物资名称':c.name,
      '品牌':c.brand||'','规格型号':c.spec||'','单位':c.unit||'','数量':c.qty,
      '一级类目':cat1,'二级类目':cat2,'三级类目':cat3,
      '备注':c.isNew?'新赋码':''};
  });
  (function(){
  var _pid = (typeof PCService!=='undefined'&&PCService.getPid())?PCService.getPid():'';
  var _addr = getProjectAddress(_pid);
  if(_addr){
    rows.unshift({'物资名称':'收货人：'+(_addr.name||''),'参考品牌':'联系电话：'+(_addr.phone||''),'规格参数':'收货地址：'+(_addr.addr||''),'单位':'','数量':'','单价（元）':'','小计（元）':'','备注':'','物料编码':''});
    rows.unshift({'物资名称':'=== 采购清单 ===','参考品牌':'','规格参数':'','单位':'','数量':'','单价（元）':'','小计（元）':'','备注':'','物料编码':''});
  }
})();
xlsxOut(rows,'采购清单','采购清单_'+today()+'.xlsx');
}
function saveCartToDB(){
  if(!cart.length){alert('清单为空');return;}
  var _unlock=typeof syncLock==='function'?syncLock(['btn-save-db','btn-archive-proj','btn-clear-cart']):function(){};
  var added=0;
  cart.forEach(function(c){
    if(!c.code||masterDB.some(function(r){return r.code===c.code;}))return;
    masterDB.push({code:c.code,name:c.name,brand:c.brand||'',spec:c.spec||'',unit:c.unit||'',
      cat1:c.cat1||'',cat2:c.cat2||'',cat3:c.cat3||'',abc:'B'});
    if(!usedCodes.has(c.code)){DB.unshift({code:c.code,name:c.name,brand:c.brand||'',spec:c.spec||'',unit:c.unit||'',cat1:c.cat1||'',cat2:c.cat2||'',cat3:c.cat3||'',abc:'B'});usedCodes.add(c.code);}
    added++;
  });
  saveMaster();
  document.getElementById('topbadge').textContent='数据库 '+DB.length+' 条';
  alert('已新增 '+added+' 条到主数据库（自存共 '+masterDB.length+' 条）');
  _unlock();
  if(document.getElementById('p-db').classList.contains('on'))dbSearch(dbQuery);
}

// ══ 导入补充到清单 ══
document.getElementById('fi-cart').addEventListener('change',function(){if(this.files[0])parseToCart(this.files[0]);this.value='';});
function parseToCart(file){
  readXlsx(file,function(data){
    var keys=Object.keys(data[0]);
    function fc(){var kws=Array.prototype.slice.call(arguments);return keys.find(function(k){return kws.some(function(w){return k.indexOf(w)>=0;});});}
    var nc=fc('物资名称','名称','品名');if(!nc){alert('未找到物资名称列');return;}
    var added=0;
    data.forEach(function(row){
      var name=String(row[nc]||'').replace(/[\n\r]/g,' ').trim();
      if(!name||name==='nan')return;
      var bc=fc('参考品牌','品牌'),sc=fc('规格参数','规格型号','规格');
      var code=String(row['物料编码']||'').trim();
      if(!code){var ms=findTop(name,'',1);if(ms.length&&ms[0].s>=0.9)code=ms[0].r.code;}
      cart.push({id:Date.now()+Math.random(),name:name,code:code,
        brand:bc?String(row[bc]||'').trim():'',
        spec:sc?String(row[sc]||'').slice(0,80).trim():'',
        cat1:String(row['一级类目']||'').trim(),cat2:String(row['二级类目']||'').trim(),cat3:String(row['三级类目']||'').trim(),
        unit:String(row['单位']||'').trim(),qty:parseInt(row['数量']||1)||1,isNew:!code});
      added++;
    });
    renderCart();alert('已导入 '+added+' 条');
  });
}

// ══════════════════════════════════
// 清单匹配赋码
// ══════════════════════════════════
var matchData=[];
document.getElementById('fi-match').addEventListener('change',function(){if(this.files[0])loadMatchFile(this.files[0]);this.value='';});
var dzEl=document.getElementById('dz');
dzEl.addEventListener('dragover',function(e){e.preventDefault();dzEl.classList.add('over');});
dzEl.addEventListener('dragleave',function(){dzEl.classList.remove('over');});
dzEl.addEventListener('drop',function(e){e.preventDefault();dzEl.classList.remove('over');if(e.dataTransfer.files[0])loadMatchFile(e.dataTransfer.files[0]);});

function loadMatchFile(file){
  readXlsx(file,function(data){
    var keys=Object.keys(data[0]);
    function fc(){var kws=Array.prototype.slice.call(arguments);return keys.find(function(k){return kws.some(function(w){return k.indexOf(w)>=0;});});}
    var nc=fc('物资名称','名称','品名','物料名称');
    if(!nc){alert('未找到物资名称列\n列名：'+keys.slice(0,8).join('、'));return;}
    matchData=[];
    data.forEach(function(row){
      var name=String(row[nc]||'').replace(/[\n\r]/g,' ').trim();
      if(!name||name==='nan')return;
      var bc=fc('参考品牌','品牌','供应商'),sc=fc('规格参数','规格型号','规格');
      matchData.push({name:name,
        brand:bc?String(row[bc]||'').replace(/[\n\r]/g,' ').trim():'',
        spec:sc?String(row[sc]||'').replace(/[\n\r]/g,' ').slice(0,80).trim():'',
        cat1:String(row['一级类目']||'').trim(),cat2:String(row['二级类目']||'').trim(),cat3:String(row['三级类目']||'').trim(),
        unit:String(row['单位']||'').trim(),existCode:String(row['物料编码']||'').trim(),qty:parseInt(row['数量']||1)||1});
    });
    var mi=document.getElementById('match-info');
    mi.style.display='block';
    mi.innerHTML='<strong>'+file.name+'</strong><br>共 '+matchData.length+' 条，点击右侧按钮开始匹配';
    document.getElementById('btn-run').disabled=false;
  });
}
function runMatch(){
  if(!matchData.length)return;
  matchResults=[];
  var total=matchData.length,i=0;
  document.getElementById('match-stats').style.display='flex';
  document.getElementById('match-toolbar').style.display='flex';
  document.getElementById('prog-row').classList.add('on');
  function next(){
    var end=Math.min(i+50,total);
    for(;i<end;i++)matchResults.push(doMatchOne(matchData[i]));
    var pct=Math.round(i/total*100);
    document.getElementById('prog-fill').style.width=pct+'%';
    document.getElementById('prog-txt').textContent=pct+'%';
    if(i<total)setTimeout(next,0);
    else{document.getElementById('prog-row').classList.remove('on');renderMatchTbl();updateMatchStats();}
  }
  next();
}
function doMatchOne(item){
  if(item.existCode&&codeRE.test(item.existCode)){
    var dbr=DB.find(function(r){return r.code===item.existCode;});
    var sims=findTop(item.name,item.brand,4).filter(function(m){return m.s>=0.4&&m.r.code!==item.existCode;}).slice(0,2);
    return Object.assign({},item,{type:'matched',code:item.existCode,
      spec:item.spec||(dbr?dbr.spec:''),brand:item.brand||(dbr?dbr.brand:''),sims:sims});
  }
  var ms=findTop(item.name,item.brand,5),top=ms[0];
  if(top&&top.s>=0.9){
    return Object.assign({},item,{type:'matched',code:top.r.code,
      spec:item.spec||top.r.spec,brand:item.brand||top.r.brand,
      cat1:item.cat1||top.r.cat1,cat2:item.cat2||top.r.cat2,cat3:item.cat3||top.r.cat3,
      sims:ms.slice(1,3).filter(function(m){return m.s>=0.4;})});
  }
  var sims=ms.filter(function(m){return m.s>=0.4;});
  if(item.cat1&&item.cat2&&item.cat3){
    var code=nextCode(item.cat1,item.cat2,item.cat3);
    if(code)return Object.assign({},item,{type:'new',code:code,sims:sims.slice(0,2)});
  }
  if(sims.length)return Object.assign({},item,{type:'similar',code:'',sims:sims.slice(0,2)});
  return Object.assign({},item,{type:'nocat',code:'',sims:[]});
}
function updateMatchStats(){
  var ts=['matched','similar','new','nocat'],ls=['✓ 匹配','≈ 相似','✦ 新码','⚠ 待处理'];
  var ids=['ms-m','ms-s','ms-n','ms-e'];
  ts.forEach(function(t,i){document.getElementById(ids[i]).textContent=ls[i]+' '+matchResults.filter(function(r){return r.type===t;}).length;});
}
function setMT(el,t){
  document.querySelectorAll('.match-toolbar .tb').forEach(function(x){x.classList.remove('on');});
  el.classList.add('on');curMT=t;renderMatchTbl();
}
function renderMatchTbl(){
  var tbody=document.getElementById('match-tbody');
  // 更新表头（加操作列）
  var thead=document.getElementById('match-thead');
  if(thead)thead.innerHTML='<tr><th style="width:32px">#</th><th>物资名称</th><th style="width:130px">物料编码</th><th style="width:58px">状态</th><th style="width:70px">品牌</th><th>规格 / 相似参考</th><th style="width:56px">类目</th><th style="width:148px">操作</th></tr>';
  var rows=curMT==='all'?matchResults:matchResults.filter(function(r){return r.type===curMT;});
  if(!rows.length){tbody.innerHTML='<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--t3)">暂无数据</td></tr>';return;}
  var tagMap={matched:'<span class="tag tag-m">✓ 匹配</span>',similar:'<span class="tag tag-s">≈ 相似</span>',new:'<span class="tag tag-n">✦ 新码</span>',nocat:'<span class="tag tag-e">⚠</span>'};
  var clsMap={matched:'rm',similar:'rs',new:'rn',nocat:'re'};
  // 全局索引映射（过滤视图→matchResults真实索引）
  var idxMap=[];
  if(curMT==='all'){for(var k=0;k<matchResults.length;k++)idxMap.push(k);}
  else{for(var k=0;k<matchResults.length;k++){if(matchResults[k].type===curMT)idxMap.push(k);}}
  tbody.innerHTML=rows.map(function(r,i){
    var realIdx=idxMap[i];
    var sc='';
    if(r.sims&&r.sims.length){
      sc=(r.type!=='matched'?'<div style="font-size:10px;color:var(--t3);margin-bottom:1px">相似：</div>':'')+
        r.sims.map(function(s){return '<span style="font-size:10px;color:var(--t2);display:block">'+Math.round(s.s*100)+'% '+s.r.name+' <span style="font-family:monospace;color:var(--blue);font-size:10px">'+s.r.code+'</span></span>';}).join('');
    }else{sc='<span style="font-size:11px;color:var(--t2)">'+(r.spec||'').slice(0,40)+'</span>';}
    // 操作列：仅相似行显示赋码按钮
    var actHtml='<span style="font-size:11px;color:var(--t3)">—</span>';
    if(r.type==='similar'){
      var selId='sim-sel-'+realIdx;
      var opts=r.sims.map(function(s){return '<option value="'+s.r.code+'">'+Math.round(s.s*100)+'% '+s.r.name+' ('+s.r.code+')</option>';}).join('');
      actHtml='<div class="sim-act">'+
        '<select class="sim-code-sel" id="'+selId+'">'+opts+'</select>'+
        '<button class="btn-sim-confirm" onclick="confirmSimCode('+realIdx+',\''+selId+'\')">✓ 确认赋码</button>'+
        '<button class="btn-sim-newcode" onclick="openNewCodeModal('+realIdx+')">＋ 新增赋码</button>'+
      '</div>';
    }else if(r.type==='nocat'){
      actHtml='<button class="btn-sim-newcode" onclick="openNewCodeModal('+realIdx+')" style="font-size:10px">＋ 手动赋码</button>';
    }
    return '<tr class="'+(clsMap[r.type]||'')+'">'+
      '<td style="color:var(--t3);font-size:11px">'+(i+1)+'</td>'+
      '<td><strong style="font-size:12px">'+r.name+'</strong></td>'+
      '<td>'+(r.code?'<span class="mono">'+r.code+'</span>':'<span style="color:var(--t3);font-size:10px">'+(r.cat1?'需填三级类目':'—')+'</span>')+'</td>'+
      '<td>'+(tagMap[r.type]||'')+'</td>'+
      '<td style="font-size:11px;color:var(--t2)">'+(r.brand||'—').slice(0,14)+'</td>'+
      '<td>'+sc+'</td>'+
      '<td style="font-size:10px;color:var(--t3)">'+(r.cat1||'—')+'</td>'+
      '<td>'+actHtml+'</td>'+
    '</tr>';
  }).join('');
}

// ── 相似行确认赋码（选已有编码）
function confirmSimCode(realIdx,selId){
  var r=matchResults[realIdx];if(!r||r.type!=='similar')return;
  var sel=document.getElementById(selId);
  var code=sel?sel.value:'';
  if(!code){alert('请先选择一个候选编码');return;}
  // 从DB查找该编码对应记录，补全信息
  var dbr=DB.find(function(x){return x.code===code;});
  r.type='matched';
  r.code=code;
  if(dbr){
    if(!r.brand&&dbr.brand)r.brand=dbr.brand;
    if(!r.spec&&dbr.spec)r.spec=dbr.spec;
    if(!r.cat1&&dbr.cat1){r.cat1=dbr.cat1;r.cat2=dbr.cat2;r.cat3=dbr.cat3;}
  }
  updateMatchStats();
  renderMatchTbl();
  showMatchToast('✓ 已确认赋码：'+r.name+' → '+code,'green');
}

// ── 打开新增赋码弹窗
var _newCodeIdx=-1;
function openNewCodeModal(realIdx){
  _newCodeIdx=realIdx;
  var r=matchResults[realIdx];if(!r)return;
  document.getElementById('ncm-name').textContent=r.name;
  document.getElementById('ncm-brand').textContent=r.brand?'品牌：'+r.brand:'';
  // 填充一级类目
  var c1s=[...new Set(DB.map(function(x){return x.cat1;}))].filter(Boolean).sort();
  var s1=document.getElementById('ncm-c1');
  s1.innerHTML='<option value="">请选择一级类目</option>';
  c1s.forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;s1.appendChild(o);});
  // 预填类目
  if(r.cat1)s1.value=r.cat1;
  document.getElementById('ncm-c2').innerHTML='<option value="">请选择二级类目</option>';
  document.getElementById('ncm-c3').innerHTML='<option value="">请选择三级类目</option>';
  document.getElementById('ncm-preview').textContent='';
  if(r.cat1){ncmOnC1();if(r.cat2){document.getElementById('ncm-c2').value=r.cat2;ncmOnC2();if(r.cat3)document.getElementById('ncm-c3').value=r.cat3;ncmPreview();}}
  document.getElementById('sim-modal-overlay').classList.add('open');
}
function closeNewCodeModal(){
  document.getElementById('sim-modal-overlay').classList.remove('open');
  _newCodeIdx=-1;
  // 关闭弹窗时恢复原有按钮文案/行为（避免SKU审核流程污染原有"匹配新增"流程）
  var ftBtn = document.querySelector('.sim-modal-ft .btn-blue');
  if(ftBtn){ ftBtn.textContent='✦ 生成编码并转入匹配'; ftBtn.setAttribute('onclick','doNewCodeConfirm()'); }
  if(typeof DemandService !== 'undefined') DemandService._clearPendingSkuApproval();
}
function ncmOnC1(){
  var v=document.getElementById('ncm-c1').value;
  var s2=document.getElementById('ncm-c2');s2.innerHTML='<option value="">请选择二级类目</option>';
  document.getElementById('ncm-c3').innerHTML='<option value="">请选择三级类目</option>';
  document.getElementById('ncm-preview').textContent='';
  if(!v)return;
  [...new Set(DB.filter(function(x){return x.cat1===v;}).map(function(x){return x.cat2;}))].sort()
    .forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;s2.appendChild(o);});
}
function ncmOnC2(){
  var v1=document.getElementById('ncm-c1').value,v2=document.getElementById('ncm-c2').value;
  var s3=document.getElementById('ncm-c3');s3.innerHTML='<option value="">请选择三级类目</option>';
  document.getElementById('ncm-preview').textContent='';
  if(!v1||!v2)return;
  [...new Set(DB.filter(function(x){return x.cat1===v1&&x.cat2===v2;}).map(function(x){return x.cat3;}))].sort()
    .forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;s3.appendChild(o);});
}
function ncmPreview(){
  var c1=document.getElementById('ncm-c1').value,c2=document.getElementById('ncm-c2').value,c3=document.getElementById('ncm-c3').value;
  var el=document.getElementById('ncm-preview');
  if(!c1||!c2||!c3){el.textContent='';return;}
  var ck=c1+'|'+c2+'|'+c3,sk=catM[ck];
  if(!sk){el.textContent='⚠ 该类目暂不在编码规则中';el.style.color='var(--amber)';return;}
  var p=sk.split('|'),cur=seqT[sk]||0,digits=cur>=9999?6:cur>=999?5:4;
  var previewCode='CSFW-'+p[0]+p[1]+p[2]+String(cur+1).padStart(digits,'0');
  el.textContent='预计编码：'+previewCode;el.style.color='var(--green)';
}
function doNewCodeConfirm(){
  if(_newCodeIdx<0)return;
  var r=matchResults[_newCodeIdx];if(!r)return;
  var c1=document.getElementById('ncm-c1').value,c2=document.getElementById('ncm-c2').value,c3=document.getElementById('ncm-c3').value;
  if(!c1||!c2||!c3){alert('请选择完整的三级类目');return;}
  var code=nextCode(c1,c2,c3);
  if(!code){alert('该类目编码已满，请联系管理员扩展');return;}
  r.type='new';r.code=code;r.cat1=c1;r.cat2=c2;r.cat3=c3;
  closeNewCodeModal();
  updateMatchStats();
  renderMatchTbl();
  showMatchToast('✦ 已新增赋码：'+r.name+' → '+code,'blue');
}
function showMatchToast(msg,color){
  var old=document.getElementById('match-toast');if(old)old.remove();
  var t=document.createElement('div');t.id='match-toast';
  t.style.cssText='position:fixed;bottom:22px;right:22px;padding:9px 16px;border-radius:8px;font-size:12px;font-weight:600;z-index:4000;box-shadow:0 4px 16px rgba(0,0,0,.18);transition:opacity .3s;color:#fff;background:'+(color==='green'?'var(--green)':'var(--blue)');
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(function(){t.style.opacity='0';setTimeout(function(){t.remove();},350);},2800);
}
function exportMatch(){
  if(!matchResults.length){alert('暂无匹配结果');return;}
  var stMap={matched:'✓ 已匹配',similar:'≈ 有相似',new:'✦ 新赋码',nocat:'⚠ 类目缺失'};
  var rows=matchResults.map(function(r,i){
    return {'序号':i+1,'物料编码':r.code||'','物资名称':r.name,'品牌':r.brand||'','规格型号':r.spec||'',
      '单位':r.unit||'','数量':r.qty||1,'一级类目':r.cat1||'','二级类目':r.cat2||'','三级类目':r.cat3||'',
      '匹配状态':stMap[r.type]||'',
      '相似参考':(r.sims||[]).map(function(s){return s.r.name+'('+s.r.code+','+Math.round(s.s*100)+'%)';}).join('；')};
  });
  xlsxOut(rows,'匹配结果','采购匹配_'+today()+'.xlsx');
}
function matchToCart(){
  var ok=matchResults.filter(function(r){return r.code;});
  ok.forEach(function(r){
    cart.push({id:Date.now()+Math.random(),name:r.name,code:r.code,brand:r.brand||'',
      spec:r.spec||'',unit:r.unit||'',cat1:r.cat1||'',cat2:r.cat2||'',cat3:r.cat3||'',
      qty:r.qty||1,isNew:r.type==='new'});
  });
  renderCart();alert('已将 '+ok.length+' 条加入采购清单');goPage('p-cart');
}

// ══ 数据库页导出/导入 ══
function exportDB(){
  var rows=DB.map(function(r){
    return {'物料编码':r.code,'物资名称':r.name,'等级':r.abc||'B','品牌':r.brand||'',
      '规格型号':r.spec||'','单位':r.unit||'','一级类目':r.cat1||'','二级类目':r.cat2||'','三级类目':r.cat3||''};
  });
  xlsxOut(rows,'物资数据库','物资数据库_'+today()+'.xlsx');
}
document.getElementById('fi-import-db').addEventListener('change',function(){
  if(!this.files[0])return;var file=this.files[0];this.value='';
  readXlsx(file,function(data){
    var added=0;
    data.forEach(function(row){
      var code=String(row['物料编码']||'').trim(),name=String(row['物资名称']||'').trim();
      if(!code||!name||!codeRE.test(code))return;
      if(masterDB.some(function(r){return r.code===code;}))return;
      var rec={code:code,name:name,brand:String(row['品牌']||'').trim(),spec:String(row['规格型号']||'').trim(),
        unit:String(row['单位']||'').trim(),cat1:String(row['一级类目']||'').trim(),
        cat2:String(row['二级类目']||'').trim(),cat3:String(row['三级类目']||'').trim(),abc:String(row['等级']||'B').trim()};
      masterDB.push(rec);
      if(!usedCodes.has(code)){DB.unshift(rec);usedCodes.add(code);}
      var m=code.match(/^CSFW-([A-Z]{2})(\d{2})(\d{2})(\d{3,5})$/);
      if(m){var sk=m[1]+'|'+m[2]+'|'+m[3];seqT[sk]=Math.max(seqT[sk]||0,parseInt(m[4]));}
      added++;
    });
    saveMaster();
    document.getElementById('topbadge').textContent='数据库 '+DB.length+' 条';
    alert('导入完成，新增 '+added+' 条');dbSearch(dbQuery);
  });
});

// ══ FAQ ══
function toggleFaq(el){el.parentElement.classList.toggle('open');}

// ══ 工具 ══
function readXlsx(file,cb){
  var reader=new FileReader();
  reader.onload=function(e){
    var wb=XLSX.read(e.target.result,{type:'binary'});
    var ws=wb.Sheets[wb.SheetNames[0]];
    var raw=XLSX.utils.sheet_to_json(ws);
    if(!raw.length){alert('文件为空');return;}
    function norm(k){return String(k).replace(/[\n\r\s]/g,'');}
    var data=raw.map(function(row){var nr={};Object.entries(row).forEach(function(kv){nr[norm(kv[0])]=kv[1];});return nr;});
    cb(data);
  };
  reader.readAsBinaryString(file);
}
function xlsxOut(rows,sheet,fname){
  var ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,sheet);XLSX.writeFile(wb,fname);
}
function today(){return new Date().toLocaleDateString('zh-CN').replace(/\//g,'');}

// ══ 启动 ══

// ══════════════════════════════════════════
// 2025年采购历史数据（内嵌）
// ══════════════════════════════════════════

// ══ 2025-2026 分项目采购历史 ══

function initHistCat(){
  var cats=[...new Set(HIST_RECORDS.map(function(r){return r['一级类目'];}))].filter(Boolean).sort();
  var sel=document.getElementById('hist-cat1');
  cats.forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});
}

function histSearch(q){
  var cat1=document.getElementById('hist-cat1').value;
  var st=document.getElementById('hist-status').value;
  q=(q||'').toLowerCase().trim();
  histFiltered=HIST_RECORDS.filter(function(r){
    if(cat1&&r['一级类目']!==cat1)return false;
    if(st&&String(r['赋码状态']).indexOf(st)<0)return false;
    if(!q)return true;
    return (r['物资名称']&&String(r['物资名称']).toLowerCase().indexOf(q)>=0)||
           (r['物料编码']&&String(r['物料编码']).toLowerCase().indexOf(q)>=0)||
           (r['参考品牌']&&String(r['参考品牌']).toLowerCase().indexOf(q)>=0)||
           (r['规格参数']&&String(r['规格参数']).toLowerCase().indexOf(q)>=0)||
           (r['二级类目']&&String(r['二级类目']).toLowerCase().indexOf(q)>=0);
  });
  if(histSortKey) applyHistSort();
  renderHistTable();
  updateHistStats();
}

function sortHist(key){
  if(histSortKey===key){histSortAsc=!histSortAsc;}
  else{histSortKey=key;histSortAsc=true;}
  applyHistSort();
  renderHistTable();
}

function applyHistSort(){
  var key=histSortKey,asc=histSortAsc;
  histFiltered.sort(function(a,b){
    var va=a[key]||'',vb=b[key]||'';
    if(typeof va==='number'&&typeof vb==='number') return asc?va-vb:vb-va;
    return asc?String(va).localeCompare(String(vb),'zh'):String(vb).localeCompare(String(va),'zh');
  });
}

function updateHistStats(){
  var cnt=histFiltered.length;
  var amt=histFiltered.reduce(function(s,r){return s+(Number(r['小计（元）'])||0);},0);
  var items=new Set(histFiltered.map(function(r){return r['物资名称'];})).size;
  var codes=new Set(histFiltered.map(function(r){return r['物料编码'];})).size;
  document.getElementById('hkpi-shown').textContent=cnt;
  document.getElementById('hs-count').textContent=cnt;
  document.getElementById('hs-amount').textContent='¥'+amt.toLocaleString('zh-CN',{minimumFractionDigits:0,maximumFractionDigits:0});
  document.getElementById('hs-items').textContent=items;
  document.getElementById('hs-codes').textContent=codes;
  document.getElementById('hist-pager').textContent=
    cnt>300?'显示前 300 条，共 '+cnt+' 条 · 请搜索/筛选缩小范围':'共 '+cnt+' 条';
}

function statusTag(st){
  st=String(st||'');
  if(st.indexOf('复用')>=0) return '<span class="status-tag st-reuse">✓ 复用</span>';
  if(st.indexOf('统一')>=0) return '<span class="status-tag st-same">✓ 统一</span>';
  if(st.indexOf('新赋')>=0) return '<span class="status-tag st-new">✦ 新码</span>';
  return '<span class="status-tag" style="background:var(--s2);color:var(--t2)">'+st+'</span>';
}

function renderHistTable(){
  var tbody=document.getElementById('hist-tbody');
  var show=histFiltered.slice(0,300);
  if(!show.length){
    tbody.innerHTML='<tr><td colspan="11" style="padding:50px;text-align:center;color:var(--t3)">未找到匹配记录</td></tr>';
    return;
  }
  var CAT_COLOR={'安防':'#EBF3FC','清洁用品':'#E2EFDA','办公用品':'#FFF9F0','电气':'#F5EBF7',
    '装修材料':'#F7F0E6','油漆涂料':'#FFF5E6','泵、阀及管路':'#E6F7F5','照明':'#FFFCE6',
    '个人防护':'#F0F5FF','紧固件':'#F5F5F5','食品水饮':'#FFF0F0','家具':'#F0FFF0'};
  tbody.innerHTML=show.map(function(r,i){
    var st=String(r['赋码状态']||'');
    var bg=st.indexOf('复用')>=0?'#F4FBF4':st.indexOf('统一')>=0?'#F0F7FF':st.indexOf('新赋')>=0?'#FFF8F2':'';
    if(!bg)bg=(i%2===0?'var(--s2)':'var(--sur)');
    var amt=Number(r['小计（元）'])||0;
    var barW=Math.round(amt/HIST_MAX_AMOUNT*60);
    var fmtAmt=amt?'¥'+amt.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
    var fmtPrc=r['单价（元）']?'¥'+Number(r['单价（元）']).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
    return '<tr style="background:'+bg+'">'+
      '<td style="padding:6px 10px;border-bottom:1px solid var(--bd);color:var(--t3);font-size:10px;text-align:center">'+(i+1)+'</td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid var(--bd)"><span style="font-family:monospace;font-size:10px;font-weight:700;color:var(--blue)">'+r['物料编码']+'</span></td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid var(--bd)">'+statusTag(st)+'</td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid var(--bd);font-size:10px;color:var(--t2);white-space:nowrap">'+
        (r['一级类目']||'—')+'<br><span style="color:var(--t3)">'+( r['二级类目']||'')+'</span></td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid var(--bd);font-weight:600;font-size:12px">'+r['物资名称']+'</td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid var(--bd);font-size:11px;color:var(--t2)">'+( r['参考品牌']||'—')+'</td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid var(--bd);font-size:10px;color:var(--t3);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+(escapeHtml(r['规格参数']||''))+'">'+( r['规格参数']||'—')+'</td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid var(--bd);text-align:center;font-size:11px">'+( r['单位']||'—')+'</td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid var(--bd);text-align:center;font-size:11px">'+( r['数量']||'—')+'</td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid var(--bd);text-align:right;font-size:11px;color:var(--t2)">'+fmtPrc+'</td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid var(--bd);text-align:right;font-size:11px;font-weight:600;white-space:nowrap">'+
        fmtAmt+(barW>0?'<span class="amount-bar" style="width:'+barW+'px"></span>':'')+'</td>'+
    '</tr>';
  }).join('');
}

// ══ 导出函数 ══
function exportHistory(){
  var rows=histFiltered.map(function(r){
    return {'物料编码':r['物料编码']||'','赋码状态':r['赋码状态']||'','序号':r['序号']||'',
      '一级类目':r['一级类目']||'','二级类目':r['二级类目']||'','三级类目':r['三级类目']||'',
      '物资名称':escapeHtml(r['物资名称']||''),'参考品牌':escapeHtml(r['参考品牌']||''),'规格参数':escapeHtml(r['规格参数']||''),
      '单位':r['单位']||'','数量':r['数量']||'','单价（元）':r['单价（元）']||'','小计（元）':r['小计（元）']||''};
  });
  xlsxOut(rows,'2025采购清单','2025采购清单_'+today()+'.xlsx');
}

function exportMaster(){
  var rows=HIST_MASTER.map(function(r){
    return {'物料编码':r['物料编码']||'','一级类目':r['一级类目']||'','二级类目':r['二级类目']||'',
      '三级类目':r['三级类目']||'','物资名称':escapeHtml(r['物资名称']||''),'参考品牌':escapeHtml(r['参考品牌']||''),
      '规格参数':escapeHtml(r['规格参数']||''),'单位':r['单位']||''};
  });
  xlsxOut(rows,'物资主数据','2025物资主数据_'+today()+'.xlsx');
}

function exportBeautiful(){
  // 生成美化版 Excel（四个Sheet）
  var wb2=XLSX.utils.book_new();

  // ── Sheet1：概览统计
  var C_DARK='1F3864', C_MID='2E75B6', C_ACCENT='ED7D31';
  var totalAmt=HIST_RECORDS.reduce(function(s,r){return s+(Number(r['小计（元）'])||0);},0);
  var totalItems=new Set(HIST_RECORDS.map(function(r){return r['物资名称'];})).size;
  var totalCodes=new Set(HIST_RECORDS.map(function(r){return r['物料编码'];})).size;

  // 一级类目统计
  var cat1Map={};
  HIST_RECORDS.forEach(function(r){
    var c=r['一级类目']||'其他';
    if(!cat1Map[c])cat1Map[c]={cat1:c,采购次数:0,物资种类:new Set(),采购金额:0};
    cat1Map[c].采购次数++;
    cat1Map[c].物资种类.add(r['物资名称']);
    cat1Map[c].采购金额+=Number(r['小计（元）'])||0;
  });
  var cat1Rows=[['一级类目','采购次数','物资种类','采购金额（元）','占比']];
  Object.values(cat1Map).sort(function(a,b){return b.采购金额-a.采购金额;}).forEach(function(r){
    cat1Rows.push([r.cat1,r.采购次数,r.物资种类.size,
      Math.round(r.采购金额*100)/100,
      Math.round(r.采购金额/totalAmt*1000)/10+'%']);
  });
  cat1Rows.push(['合计',HIST_RECORDS.length,totalItems,Math.round(totalAmt*100)/100,'100%']);

  var ws_s0=XLSX.utils.aoa_to_sheet([
    ['2025年物资采购清单 · 赋码完成版'],
    ['共 '+HIST_RECORDS.length+' 条采购记录 · '+totalItems+' 种物资 · '+totalCodes+' 个编码 · 采购总额 ¥'+totalAmt.toLocaleString('zh-CN',{maximumFractionDigits:0})],
    [],
    ['关键指标','数值'],
    ['采购总额（元）',Math.round(totalAmt)],
    ['物资种类',totalItems],
    ['独立编码',totalCodes],
    ['采购记录',HIST_RECORDS.length],
    [],
  ].concat(cat1Rows));

  // 合并+样式
  ws_s0['!merges']=[
    {s:{r:0,c:0},e:{r:0,c:4}},
    {s:{r:1,c:0},e:{r:1,c:4}},
  ];
  ws_s0['!cols']=[{wch:20},{wch:14},{wch:12},{wch:18},{wch:12}];

  function styleCell(ws,addr,bold,bgRGB,fgRGB,hz){
    if(!ws[addr])ws[addr]={t:'s',v:''};
    ws[addr].s={font:{name:'Arial',bold:!!bold,color:{rgb:fgRGB||'000000'}},
      fill:{patternType:'solid',fgColor:{rgb:bgRGB||'FFFFFF'}},
      alignment:{horizontal:hz||'left',vertical:'center'}};
  }
  // 标题行
  styleCell(ws_s0,'A1',true,C_DARK,'FFFFFF','center');
  styleCell(ws_s0,'A2',false,C_DARK,'BDD7EE','center');
  // 类目表头
  var hdrRow=10;
  ['A','B','C','D','E'].forEach(function(col){styleCell(ws_s0,col+hdrRow,true,C_MID,'FFFFFF','center');});

  XLSX.utils.book_append_sheet(wb2,ws_s0,'📊 总览');

  // ── Sheet2：赋码完成清单（含筛选结果）
  var pRows=[['物料编码','赋码状态','序号','一级类目','二级类目','三级类目','物资名称','参考品牌','规格参数','单位','数量','单价（元）','小计（元）']];
  histFiltered.forEach(function(r){
    pRows.push([r['物料编码']||'',r['赋码状态']||'',r['序号']||'',r['一级类目']||'',r['二级类目']||'',r['三级类目']||'',escapeHtml(r['物资名称']||''),escapeHtml(r['参考品牌']||''),escapeHtml(r['规格参数']||''),r['单位']||'',r['数量']||'',r['单价（元）']||'',r['小计（元）']||'']);
  });
  var ws_p=XLSX.utils.aoa_to_sheet(pRows);
  ws_p['!cols']=[{wch:18},{wch:14},{wch:6},{wch:12},{wch:13},{wch:14},{wch:22},{wch:16},{wch:45},{wch:7},{wch:8},{wch:12},{wch:13}];
  ws_p['!autofilter']={ref:'A1:M'+pRows.length};
  ws_p['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft'};
  // 表头样式
  var hdrCols=['A','B','C','D','E','F','G','H','I','J','K','L','M'];
  hdrCols.forEach(function(col){styleCell(ws_p,col+'1',true,C_DARK,'FFFFFF','center');});
  XLSX.utils.book_append_sheet(wb2,ws_p,'📋 采购赋码清单');

  // ── Sheet3：物资主数据
  var mRows=[['物料编码','一级类目','二级类目','三级类目','物资名称','参考品牌','规格参数','单位']];
  HIST_MASTER.forEach(function(r){
    mRows.push([r['物料编码']||'',r['一级类目']||'',r['二级类目']||'',r['三级类目']||'',escapeHtml(r['物资名称']||''),escapeHtml(r['参考品牌']||''),escapeHtml(r['规格参数']||''),r['单位']||'']);
  });
  var ws_m=XLSX.utils.aoa_to_sheet(mRows);
  ws_m['!cols']=[{wch:18},{wch:12},{wch:13},{wch:14},{wch:22},{wch:16},{wch:50},{wch:7}];
  ws_m['!autofilter']={ref:'A1:H'+mRows.length};
  ws_m['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft'};
  ['A','B','C','D','E','F','G','H'].forEach(function(col){styleCell(ws_m,col+'1',true,'375623','FFFFFF','center');});
  XLSX.utils.book_append_sheet(wb2,ws_m,'📖 物资主数据');

  // ── Sheet4：分类汇总
  var sRows=[['一级类目','二级类目','采购次数','物资种类','采购金额（元）','占比']];
  HIST_SUMMARY.forEach(function(r){
    sRows.push([r['一级类目']||'',r['二级类目']||'',r['条目数']||0,r['种类数']||0,r['总金额']||0,
      Math.round((r['总金额']||0)/totalAmt*1000)/10+'%']);
  });
  sRows.push(['合计','',HIST_RECORDS.length,totalItems,Math.round(totalAmt),  '100%']);
  var ws_st=XLSX.utils.aoa_to_sheet(sRows);
  ws_st['!cols']=[{wch:14},{wch:16},{wch:10},{wch:10},{wch:16},{wch:10}];
  ['A','B','C','D','E','F'].forEach(function(col){styleCell(ws_st,col+'1',true,C_ACCENT,'FFFFFF','center');});
  XLSX.utils.book_append_sheet(wb2,ws_st,'📈 分类统计');

  XLSX.writeFile(wb2,'2025年物资清单_美化版_'+today()+'.xlsx');
}

// ════════════════════════════════════════
// 采购历史三栏交互逻辑
// ════════════════════════════════════════

var _histCurProj  = null;   // 当前选中项目名
var _histCurMonth = null;   // 当前选中月份（null=全部）
var _histSortKey  = 'sub';  // 排序字段
var _histSortAsc  = false;
var _histViewItems = [];    // 当前视图的明细

// 平台色彩配置
var PLAT_CLS = {
  '鑫方盛': 'pl-xfs', '得力': 'pl-dl',
  '震坤行': 'pl-zkh', '京东': 'pl-jd',
};

// ── 初始化项目列表
function initHistPage(){
  renderProjList('');
  initHistCat();    // 初始化旧的类目筛选器（2025历史页用）
}

function filterProjList(q){
  renderProjList(q.toLowerCase().trim());
}

function renderProjList(q){
  var projs = Object.keys(HIST_PROJ).filter(function(p){
    return !q || p.toLowerCase().indexOf(q) >= 0;
  }).sort();

  var totalItems = HIST_RECORDS.length;
  var totalAmt   = HIST_RECORDS.reduce(function(s,r){return s+(Number(r['小计（元）'])||0);},0);
  document.getElementById('proj-total-cnt').textContent =
    projs.length + '个 · ¥' + Math.round(totalAmt/10000) + '万';

  var el = document.getElementById('proj-list-panel');
  // 「全部」入口
  var allHtml =
    '<div class="proj-item' + (!_histCurProj?' on':'') + '" onclick="selectProj(null)">' +
      '<div class="pi-name">📋 全部记录</div>' +
      '<div class="pi-meta">' + HIST_RECORDS.length + '条 · ¥' + Math.round(totalAmt/10000) + '万</div>' +
    '</div>';

  var projHtml = projs.map(function(proj){
    var months  = HIST_PROJ[proj];
    var cnt = 0, amt = 0;
    Object.values(months).forEach(function(m){
      var items = m.items || [];
      cnt += items.length;
      items.forEach(function(it){ var s=Number(it.sub)||0; var pq=(Number(it.p)||0)*(Number(it.q)||Number(it.qty)||1); amt += (s || pq || 0); });
    });
    var mCount  = Object.keys(months).length;
    var isCur   = _histCurProj === proj;
    return '<div class="proj-item' + (isCur?' on':'') + '" onclick="selectProj(\'' + proj.replace(/'/g,"\\'") + '\')">' +
      '<div class="pi-name">' + proj + '</div>' +
      '<div class="pi-meta">' + mCount + '个月 · ' + cnt + '条 · ¥' + Math.round(amt/10000) + '万</div>' +
    '</div>';
  }).join('');

  el.innerHTML = allHtml + projHtml;
}

// ── 选中项目
function selectProj(proj){
  _histCurProj  = proj;
  _histCurMonth = null;
  renderProjList(document.getElementById('proj-search').value.toLowerCase().trim());
  renderMonthList();
  renderHistDetail();
}

// ── 渲染月份列
function renderMonthList(){
  var el = document.getElementById('month-list-panel');
  if(!_histCurProj){
    // 全部模式：显示所有年月
    var allMonths = {};
    Object.keys(HIST_PROJ).forEach(function(proj){
      Object.keys(HIST_PROJ[proj]).forEach(function(month){
        var items = HIST_PROJ[proj][month].items || [];
        if(!allMonths[month]) allMonths[month]={count:0,total:0};
        allMonths[month].count += items.length;
        items.forEach(function(it){ allMonths[month].total += (it.sub || 0); });
      });
    });
    var months = Object.keys(allMonths).sort();
    // 按年分组
    var years = {};
    months.forEach(function(m){
      var y = m.slice(0,4);
      if(!years[y]) years[y]=[];
      years[y].push(m);
    });
    var html = '<div class="month-item' + (!_histCurMonth?' on':'') + '" onclick="selectMonth(null)">全部月份</div>';
    Object.keys(years).sort().forEach(function(y){
      html += '<div class="month-year-hd">' + y + '年</div>';
      years[y].forEach(function(m){
        var d = allMonths[m];
        var mn = m.slice(5) + '月';
        html += '<div class="month-item' + (_histCurMonth===m?' on':'') + '" onclick="selectMonth(\'' + m + '\')">' +
          '<span>' + mn + '</span>' +
          '<span class="mi-stat">' + d.count + '条</span>' +
        '</div>';
      });
    });
    el.innerHTML = html;
    return;
  }
  var months = HIST_PROJ[_histCurProj];
  var allKeys = Object.keys(months).sort();
  // 按年分组
  var years = {};
  allKeys.forEach(function(m){
    var y = m.slice(0,4);
    if(!years[y]) years[y]=[];
    years[y].push(m);
  });
  var html = '<div class="month-item' + (!_histCurMonth?' on':'') + '" onclick="selectMonth(null)">全部月份</div>';
  Object.keys(years).sort().forEach(function(y){
    html += '<div class="month-year-hd">' + y + '年</div>';
    years[y].forEach(function(m){
      var d = months[m];
      var mn = m.slice(5) + '月';
      html += '<div class="month-item' + (_histCurMonth===m?' on':'') + '" onclick="selectMonth(\'' + m + '\')">' +
        '<span>' + mn + '</span>' +
        '<div class="mi-stat">' + (d.items?d.items.length:0) + '条<br>¥' + Math.round((d.items||[]).reduce(function(s,it){return s+(Number(it.sub)||0);},0)/100)/10 + 'k</div>' +
      '</div>';
    });
  });
  el.innerHTML = html;
}

// ── 选中月份
function selectMonth(month){
  _histCurMonth = month;
  renderMonthList();
  renderHistDetail();
}

// ── 渲染明细表
function renderHistDetail(){
  var kw   = (document.getElementById('hist-kw').value||'').toLowerCase().trim();
  var plat = document.getElementById('hist-plat-filter').value;

  // 收集数据
  var items = [];
  if(!_histCurProj){
    // 全部
    HIST_RECORDS.forEach(function(r){
      items.push({n:r['物资名称'],b:r['参考品牌'],s:r['规格参数'],
        u:r['单位'],q:r['数量'],p:r['单价（元）'],sub:r['小计（元）'],
        pt:r.platform,proj:r.proj,month:r.month,url:''});
    });
  } else if(!_histCurMonth){
    // 某项目全部月份
    Object.keys(HIST_PROJ[_histCurProj]).forEach(function(month){
      HIST_PROJ[_histCurProj][month].items.forEach(function(item){
        items.push(Object.assign({},item,{proj:_histCurProj,month:month}));
      });
    });
  } else {
    // 某项目某月份
    var d = HIST_PROJ[_histCurProj][_histCurMonth];
    if(d) items = d.items.map(function(item){
      return Object.assign({},item,{proj:_histCurProj,month:_histCurMonth});
    });
  }

  // 筛选
  if(kw || plat){
    items = items.filter(function(item){
      if(plat && item.pt !== plat) return false;
      if(!kw) return true;
      return (item.n&&item.n.toLowerCase().indexOf(kw)>=0) ||
             (item.b&&item.b.toLowerCase().indexOf(kw)>=0) ||
             (item.s&&item.s.toLowerCase().indexOf(kw)>=0);
    });
  }

  // 排序
  items.sort(function(a,b){
    var va=a[_histSortKey]||0, vb=b[_histSortKey]||0;
    return _histSortAsc ? va-vb : vb-va;
  });

  _histViewItems = items;

  // 更新标题栏
  var titleParts = [];
  if(_histCurProj) titleParts.push(_histCurProj);
  else titleParts.push('全部项目');
  if(_histCurMonth) titleParts.push(_histCurMonth.slice(0,4)+'年'+_histCurMonth.slice(5)+'月');
  document.getElementById('hist-view-title').textContent = titleParts.join(' · ');

  var totalAmt = items.reduce(function(s,i){return s+(Number(i.sub)||0);},0);
  var kinds    = new Set(items.map(function(i){return i.n;})).size;
  document.getElementById('hist-view-stat').textContent =
    items.length + '条 · ' + kinds + '种物资 · ¥' + totalAmt.toLocaleString('zh-CN',{maximumFractionDigits:0});

  // 渲染表格（最多500条）
  var show = items.slice(0,500);
  var PLAT_ICO = {'鑫方盛':'⭕','得力':'🔵','震坤行':'🟠','京东':'🔴'};

  var tbody = document.getElementById('hist-detail-tbody');
  if(!show.length){
    tbody.innerHTML = '<tr><td colspan="9" style="padding:50px;text-align:center;color:var(--t3)">暂无数据</td></tr>';
    document.getElementById('hist-detail-footer').textContent = '';
    return;
  }

  tbody.innerHTML = show.map(function(item,i){
    var url  = item.url || '';
    // 尝试从订单库补充链接
    if(!url){
      var om = searchOrderItems(item.n||'');
      if(om.length) url = om[0].url;
    }
    return '<tr style="background:'+(i%2===0?'var(--s2)':'var(--sur)')+'">' +
      '<td style="padding:6px 10px;color:var(--t3);font-size:10px;text-align:center">'+(i+1)+'</td>'+
      '<td style="padding:6px 10px;font-weight:600;font-size:12px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+(item.n||'')+'">'+(item.n||'—')+'</td>'+
      '<td style="padding:6px 10px">' +
        '<span class="plat-link '+(PLAT_CLS[item.pt]||'')+'" style="font-size:10px;padding:1px 5px;cursor:default">'+(PLAT_ICO[item.pt]||'')+(item.pt||'')+'</span>'+
      '</td>'+
      '<td style="padding:6px 10px;font-size:11px;color:var(--t2)">'+(item.b||'—')+'</td>'+
      '<td style="padding:6px 10px;font-size:10px;color:var(--t3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+(item.s||'')+'">'+(item.s||'—')+'</td>'+
      '<td style="padding:6px 10px;font-size:11px;text-align:center">'+(item.u||'—')+'</td>'+
      '<td style="padding:6px 10px;font-size:11px;text-align:right">'+(item.q||'—')+'</td>'+
      '<td style="padding:6px 10px;font-size:11px;text-align:right;color:var(--t2)">'+((Number(item.p))?'¥'+Number(item.p).toFixed(2):'—')+'</td>'+
      '<td style="padding:6px 10px;white-space:nowrap">'+
        (url?'<a href="'+url+'" target="_blank" rel="noopener" class="plat-link '+(PLAT_CLS[item.pt]||'')+'" style="font-size:10px;padding:1px 6px;margin-right:4px" title="在新窗口打开采购链接（需先登录'+( item.pt||'采购平台')+'）">🔗 下单→</a>':'')+
        '<button class="btn btn-ghost btn-xs" style="font-size:10px;margin-left:4px" onclick="addHistItemDirectToCart(event,'+i+')">＋ 加购物车</button>'+
      '</td>'+
    '</tr>';
  }).join('');

  var foot = '显示 ' + show.length + ' / ' + items.length + ' 条';
  if(items.length > 500) foot += '（仅显示前500条，请筛选缩小范围）';
  document.getElementById('hist-detail-footer').textContent = foot;
}

function sortHistBy(key){
  if(_histSortKey === key) _histSortAsc = !_histSortAsc;
  else { _histSortKey = key; _histSortAsc = false; }
  renderHistDetail();
}

// ── 导出当前视图
function exportHistView(){
  if(!_histViewItems.length){alert('暂无数据');return;}
  var rows = _histViewItems.map(function(item,i){
    return {'序号':i+1,'项目':item.proj||'','月份':item.month||'','平台':item.pt||'',
      '物资名称':item.n||'','品牌':item.b||'','规格':item.s||'','单位':item.u||'',
      '数量':item.q||'','单价（元）':item.p||'','小计（元）':item.sub||''};
  });
  xlsxOut(rows,'采购明细','采购历史_'+(_histCurProj||'全部')+'_'+today()+'.xlsx');
}


// ══ 历史页面旧筛选函数（保留兼容性）══

// ════════════════════════════════════════════════════════
// 项目管理 & 历史优先推荐系统
// ════════════════════════════════════════════════════════

// ── 项目状态
var currentProject = null;   // {id, name, createdAt}
var projectOrders  = {};     // projectId → [{month, items:[{code,name,brand,spec,unit,cat1,cat2,cat3,qty,price,isNew}]}]
var projectList    = [];     // [{id, name, createdAt, orderCount}]

// ── localStorage key
var KEY_PROJECTS = 'pm_projects_v1';
var KEY_ORDERS   = 'pm_orders_v1';
var KEY_CURPROJ  = 'pm_current_v1';

// ── 持久化
function saveProjects(){
  try{localStorage.setItem(KEY_PROJECTS, JSON.stringify(projectList));}catch(e){}
}
function saveOrders(){
  try{localStorage.setItem(KEY_ORDERS, JSON.stringify(projectOrders));}catch(e){}
}
// 2025年历史数据（预置）
/* PRESET_ORDERS 由 embed-data.js 提供 */

function loadProjects(){
  try{
    var p=localStorage.getItem(KEY_PROJECTS); if(p) projectList=JSON.parse(p);
    var o=localStorage.getItem(KEY_ORDERS);   if(o) projectOrders=JSON.parse(o);
    var c=localStorage.getItem(KEY_CURPROJ);
    if(c) currentProject=JSON.parse(c);
  }catch(e){}

  // 预置历史数据：若项目不存在则自动创建（首次加载）
  var presetNames=Object.keys(PRESET_ORDERS);
  presetNames.forEach(function(pname){
    var exists=projectList.some(function(p){return p.name===pname;});
    if(!exists){
      var proj={id:'preset_'+pname.replace(/[^a-z0-9]/gi,'_'),
        name:pname,createdAt:'2025年历史记录',orderCount:1};
      projectList.push(proj);
      projectOrders[proj.id]=[{
        month:'2025-01',
        archivedAt:'2025年采购历史（系统预置）',
        items:PRESET_ORDERS[pname][0].items
      }];
    } else {
      // 已存在：确保历史数据已注入
      var proj=projectList.find(function(p){return p.name===pname;});
      if(proj&&(!projectOrders[proj.id]||projectOrders[proj.id].length===0)){
        projectOrders[proj.id]=[{
          month:'2025-01',
          archivedAt:'2025年采购历史（系统预置）',
          items:PRESET_ORDERS[pname][0].items
        }];
      }
    }
  });
}

// ── 创建项目
function createProject(name){
  if(!name||!name.trim()){alert('请输入项目名称');return null;}
  var proj={id:'proj_'+Date.now(),name:name.trim(),createdAt:new Date().toLocaleDateString('zh-CN'),orderCount:0};
  projectList.unshift(proj);
  projectOrders[proj.id]=[];
  saveProjects();saveOrders();
  return proj;
}

// ── 切换项目
function switchProject(id){
  var proj=projectList.find(function(p){return p.id===id;});
  if(!proj)return;
  currentProject=proj;
  try{localStorage.setItem(KEY_CURPROJ,JSON.stringify(proj));}catch(e){}
  renderProjectBadge();
  renderProjectOrders();
  buildProjectIndex();
  var pn=document.getElementById('proj-panel-name');
  if(pn)pn.textContent=currentProject?currentProject.name:'未选择项目';
}

// ── 项目历史索引：code → {count, lastPrice, lastMonth}
var projHistIndex = {};
function buildProjectIndex(){
  projHistIndex={};
  if(!currentProject||!projectOrders[currentProject.id])return;
  projectOrders[currentProject.id].forEach(function(order){
    order.items.forEach(function(item){
      var k=item.code||item.name;
      if(!projHistIndex[k]){
        projHistIndex[k]={count:0,lastPrice:0,lastMonth:'',name:item.name,
          code:item.code,brand:item.brand,spec:item.spec,unit:item.unit,
          cat1:item.cat1,cat2:item.cat2,cat3:item.cat3};
      }
      projHistIndex[k].count++;
      projHistIndex[k].lastPrice=item.price||0;
      projHistIndex[k].lastMonth=order.month;
    });
  });
}

// ── 归档当前采购清单到项目
function archiveCartToProject(){
  if(!currentProject){
    showProjectModal(function(){archiveCartToProject();});return;
  }
  if(!cart||!cart.length){alert('采购清单为空');return;}
  var month=new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit'}).replace(/\//g,'-');
  var order={
    month:month,
    archivedAt:new Date().toLocaleString('zh-CN'),
    items:cart.map(function(c){return{
      code:c.code||'',name:c.name,brand:c.brand||'',spec:c.spec||'',
      unit:c.unit||'',cat1:c.cat1||'',cat2:c.cat2||'',cat3:c.cat3||'',
      qty:c.qty||1,price:c.price||0,isNew:!!c.isNew
    };})
  };
  if(!projectOrders[currentProject.id]) projectOrders[currentProject.id]=[];
  projectOrders[currentProject.id].unshift(order);
  // 更新项目订单数
  var proj=projectList.find(function(p){return p.id===currentProject.id;});
  if(proj) proj.orderCount=(proj.orderCount||0)+1;
  saveOrders();saveProjects();
  buildProjectIndex();
  renderProjectBadge();
  renderProjectOrders();
  alert('✅ 已归档到「'+currentProject.name+'」\n本次记录 '+order.items.length+' 条物资');
}

// ── 项目历史感知的搜索（替换原 doQS）
function doQS(val){
  if(!dbReady)return;
  var hits=[];
  // 先把项目历史命中的提出来
  var projHits=[], dbHits=[];
  for(var i=0;i<DB.length;i++){
    var r=DB[i];
    var s=sim(val,r.name);
    if(s<0.28)continue;
    var hist=projHistIndex[r.code]||projHistIndex[r.name];
    if(hist&&hist.count>0){
      projHits.push({r:r,s:s,hist:hist});
    } else {
      dbHits.push({r:r,s:s,hist:null});
    }
  }
  // 项目历史结果：按出现频次×相似度排序
  projHits.sort(function(a,b){
    var wa=a.s*(1+Math.min(a.hist.count,5)*0.1);
    var wb2=b.s*(1+Math.min(b.hist.count,5)*0.1);
    return wb2-wa;
  });
  dbHits.sort(function(a,b){return b.s-a.s;});
  // 合并：项目历史最多5条排前面，普通库最多4条
  var merged=projHits.slice(0,5).concat(dbHits.slice(0,4));
  renderQS(val,merged);
}

// ── 改造 renderQS，区分项目历史和普通结果
function renderQS(q,hits){
  qsItems=hits;qsFocusIdx=-1;
  var drop=document.getElementById('qs-drop'),html='';
  if(!hits.length){
    var _escQ2 = q.replace(/'/g,"\\'");
    html='<div class="tmp-notfound">'
      +'<div class="tmp-notfound-msg">未找到匹配SKU：<strong>'+q+'</strong></div>'
      +'<button class="tmp-create-btn" onclick="TempSKU.openModal(\''+_escQ2+'\',\'cart\')">✦ 创建临时物资</button>'
      +'</div>';
  } else {
    var hasProjHits=hits.some(function(h){return h.hist&&h.hist.count>0;});
    if(hasProjHits){
      html+='<div style="padding:4px 10px 2px;font-size:10px;font-weight:700;color:#2A7A3B;letter-spacing:.04em">📌 本项目历史采购</div>';
    }
    hits.forEach(function(h,i){
      var pct=Math.round(h.s*100),pcls=pct>=85?'pct-hi':'pct-md';
      var isProj=h.hist&&h.hist.count>0;
      // 分隔线：从项目历史切换到普通结果时
      if(i>0&&!isProj&&hits[i-1].hist&&hits[i-1].hist.count>0){
        html+='<div style="padding:4px 10px 2px;font-size:10px;font-weight:700;color:var(--t3);letter-spacing:.04em;border-top:1px solid var(--bd);margin-top:2px">编码库</div>';
      }
      var projBadge='';
      if(isProj){
        projBadge='<span style="font-size:10px;padding:1px 5px;border-radius:6px;background:#E2EFDA;color:#375623;font-weight:700;margin-left:4px">'+
          '×'+h.hist.count+(h.hist.lastMonth?' · '+h.hist.lastMonth:'')+'</span>';
        if(h.hist.lastPrice>0){
          projBadge+='<span style="font-size:10px;color:var(--t3);margin-left:4px">上次¥'+h.hist.lastPrice.toLocaleString('zh-CN',{maximumFractionDigits:2})+'</span>';
        }
      }
      var rowBg=isProj?'background:#F6FDF7;':''
      html+='<div class="qs-item" style="'+rowBg+'" onclick="pickQS('+i+')">'+
        '<div style="display:flex;align-items:baseline;gap:4px;flex-wrap:wrap">'+
          '<span class="qs-name">'+hl(h.r.name,q)+'</span>'+
          '<span class="qs-pct '+pcls+'">'+pct+'%</span>'+
          projBadge+
        '</div>'+
        '<div class="qs-sub">'+
          '<span class="qs-code">'+h.r.code+'</span>'+
          (h.r.brand?'<span>'+h.r.brand+'</span>':'')+
          '<span style="color:var(--t3)">'+h.r.cat1+'</span>'+
        '</div>'+
        (h.r.spec?'<div style="font-size:10px;color:var(--t3);margin-top:1px">'+h.r.spec.slice(0,48)+'</div>':'')+
      '</div>';
    });
  }
  html+='<div style="padding:8px 10px;cursor:pointer;border-top:1px solid var(--bd);background:var(--s2);display:flex;align-items:center;gap:6px;font-size:11px;color:var(--t2)" onclick="openNewPanel(\''+q.replace(/'/g,"\\'")+'\')" onmouseover="this.style.background=\'var(--blue-bg)\'" onmouseout="this.style.background=\'var(--s2)\'">'+
    '<span style="font-size:13px">✦</span>新增"<strong>'+q+'</strong>"并自动赋新编码</div>';
  drop.innerHTML=html;drop.classList.add('open');
}

// ── 渲染项目Badge（顶栏）
function renderProjectBadge(){
  var el=document.getElementById('proj-badge');
  if(!el)return;
  el.textContent=currentProject?('📁 '+currentProject.name):'📁 未选择项目';
  el.style.background=currentProject?'rgba(42,122,59,.25)':'rgba(255,255,255,.08)';
  el.style.color=currentProject?'#90EAA0':'rgba(255,255,255,.45)';
}

// ── 渲染项目历史订单列表
function renderProjectOrders(){
  var el=document.getElementById('proj-orders-list');
  if(!el)return;
  if(!currentProject){
    el.innerHTML='<div style="padding:30px;text-align:center;color:var(--t3);font-size:12px">请先选择或创建项目</div>';
    return;
  }
  var orders=projectOrders[currentProject.id]||[];
  if(!orders.length){
    el.innerHTML='<div style="padding:24px;text-align:center;color:var(--t3);font-size:12px">暂无采购记录<br>完成采购清单后点「归档到项目」</div>';
    return;
  }
  el.innerHTML=orders.map(function(order,oi){
    var totalAmt=order.items.reduce(function(s,it){return s+(Number(it.price)||0)*(Number(it.qty)||1);},0);
    return '<div style="border:1px solid var(--bd);border-radius:var(--r);margin-bottom:8px;overflow:hidden">'+
      '<div style="padding:9px 12px;background:var(--s2);display:flex;align-items:center;gap:8px;cursor:pointer" onclick="toggleOrder('+oi+')">'+
        '<span style="font-size:12px;font-weight:700">'+order.month+'</span>'+
        '<span style="font-size:11px;color:var(--t2)">'+order.items.length+'项物资</span>'+
        (totalAmt?'<span style="font-size:11px;color:var(--blue)">¥'+totalAmt.toLocaleString('zh-CN',{maximumFractionDigits:0})+'</span>':'')+''+
        '<span style="font-size:10px;color:var(--t3);margin-left:auto">'+order.archivedAt+'</span>'+
        '<button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:11px;padding:0 3px" onclick="deleteOrder('+oi+',event)">删除</button>'+
        '<span id="order-arrow-'+oi+'" style="color:var(--t3);font-size:11px;transition:.2s">▶</span>'+
      '</div>'+
      '<div id="order-detail-'+oi+'" style="display:none;max-height:240px;overflow-y:auto">'+
        order.items.map(function(it){
          return '<div style="padding:6px 12px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:8px;font-size:11px">'+
            '<span style="font-family:monospace;font-size:10px;color:var(--blue);flex-shrink:0">'+it.code+'</span>'+
            '<span style="font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+it.name+'</span>'+
            (it.brand?'<span style="color:var(--t2);flex-shrink:0">'+it.brand+'</span>':'')+
            '<span style="color:var(--t3);flex-shrink:0">×'+it.qty+(it.unit||'')+'</span>'+
            (it.price?'<span style="color:var(--blue);flex-shrink:0">¥'+it.price+'</span>':'')+
            '<button class="btn btn-ghost btn-xs" style="flex-shrink:0" onclick="addHistItemToCart('+oi+','+order.items.indexOf(it)+')">+购物车</button>'+
          '</div>';
        }).join('')+
      '</div>'+
    '</div>';
  }).join('');
}

function toggleOrder(oi){
  var d=document.getElementById('order-detail-'+oi);
  var a=document.getElementById('order-arrow-'+oi);
  if(!d)return;
  var open=d.style.display!=='none';
  d.style.display=open?'none':'block';
  if(a)a.style.transform=open?'':'rotate(90deg)';
}

function deleteOrder(oi,evt){
  evt.stopPropagation();
  if(!confirm('确认删除这条采购记录？'))return;
  projectOrders[currentProject.id].splice(oi,1);
  saveOrders();buildProjectIndex();renderProjectOrders();
}

function addHistItemToCart(oi,ii){
  if(!currentProject)return;
  var item=projectOrders[currentProject.id][oi].items[ii];
  if(!item)return;
  cart.push({id:Date.now()+Math.random(),
    name:item.name,code:item.code,brand:item.brand||'',
    spec:item.spec||'',unit:item.unit||'',
    cat1:item.cat1||'',cat2:item.cat2||'',cat3:item.cat3||'',
    qty:item.qty||1,price:item.price||0,isNew:false});
  renderCart();
  // 导航到采购清单
  goPage('p-cart');
}

// ── 项目选择弹窗
function showProjectModal(callback){
  var overlay=document.getElementById('proj-modal-overlay');
  if(overlay){
    overlay.style.display='flex';
    renderModalProjectList(); // 每次打开都刷新列表
    return;
  }
  // 动态创建
  var html='<div id="proj-modal-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;display:flex;align-items:center;justify-content:center">'+
    '<div style="background:#fff;border-radius:12px;padding:24px;width:400px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">'+
      '<div style="font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px">📁 选择 / 创建项目'+
        '<button onclick="closeProjectModal()" style="margin-left:auto;background:none;border:none;font-size:18px;cursor:pointer;color:#888">✕</button>'+
      '</div>'+
      '<div style="display:flex;gap:8px;margin-bottom:14px">'+
        '<input type="text" id="new-proj-inp" placeholder="新项目名称，如：天水天庭项目" style="flex:1;padding:8px 10px;font-size:13px;border:1.5px solid #C5BFB5;border-radius:8px;outline:none">'+
        '<button onclick="createAndSwitch()" style="padding:8px 14px;background:#1F3864;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">创建并切换</button>'+
      '</div>'+
      '<div style="font-size:11px;color:#9E9B96;margin-bottom:8px">已有项目</div>'+
      '<div id="proj-list-modal" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:6px"></div>'+
    '</div>'+
  '</div>';
  document.body.insertAdjacentHTML('beforeend',html);
  renderModalProjectList();
  document.getElementById('new-proj-inp').focus();
  document.getElementById('new-proj-inp').addEventListener('keydown',function(e){
    if(e.key==='Enter')createAndSwitch();
  });
}

function closeProjectModal(){
  var el=document.getElementById('proj-modal-overlay');
  if(el)el.remove();
}

function renderModalProjectList(){
  var el=document.getElementById('proj-list-modal');
  if(!el)return;

  // 合并两个项目源：旧系统 projectList + 采购中心 ProjectService
  var combined = [];
  var seen = {};

  // 旧系统项目
  (projectList||[]).forEach(function(p){
    if(!seen[p.name]){ seen[p.name]=true; combined.push({id:p.id,name:p.name,createdAt:p.createdAt,source:'old'}); }
  });

  // 采购中心项目（PCService）
  if(typeof ProjectService!=='undefined'){
    ProjectService.all().forEach(function(p){
      if(!seen[p.name]){ seen[p.name]=true; combined.push({id:p.id,name:p.name,createdAt:p.createdAt,source:'new'}); }
    });
  }

  if(!combined.length){
    el.innerHTML='<div style="text-align:center;padding:20px;color:#9E9B96;font-size:12px">暂无项目，请创建第一个</div>';
    return;
  }

  el.innerHTML=combined.map(function(p){
    var isCur=currentProject&&currentProject.id===p.id;
    var orders=projectOrders[p.id]||[];
    var lastMonth=orders.length?orders[0].month:'—';
    var cartCnt='';
    if(p.source==='new'&&typeof PCService!=='undefined'){
      var n=PCService.getCart(p.id).length;
      if(n>0) cartCnt='<span style="font-size:10px;background:var(--red);color:#fff;padding:1px 6px;border-radius:9px;margin-left:4px">购物车'+n+'</span>';
    }
    return '<div onclick="switchAndCloseByName(\''+p.name.replace(/\'/g,"\\'")+'\',\''+p.id+'\',\''+p.source+'\')"'+
      ' style="padding:10px 14px;border:1.5px solid '+(isCur?'#2E75B6':'#E0DCD5')+';border-radius:8px;cursor:pointer;background:'+(isCur?'#EBF3FC':'#fff')+';transition:.15s"'+
      ' onmouseover="this.style.borderColor=\'#2E75B6\'" onmouseout="this.style.borderColor=\''+(isCur?'#2E75B6':'#E0DCD5')+'\'">'+
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<span style="font-size:13px;font-weight:700;flex:1">'+p.name+'</span>'+
        cartCnt+
        (isCur?'<span style="font-size:10px;background:#2E75B6;color:#fff;padding:2px 7px;border-radius:10px">当前</span>':'')+
        (p.source==='old'?'<button onclick="deleteProject(\''+p.id+'\',event)" style="background:none;border:none;color:#ccc;cursor:pointer;font-size:12px;padding:0 3px" title="删除项目">🗑</button>':'')+
      '</div>'+
      '<div style="font-size:11px;color:#9E9B96;margin-top:3px">'+
        (p.source==='new'?'采购中心项目':orders.length+'次采购 · 最近：'+lastMonth)+' · 创建于 '+p.createdAt+
      '</div>'+
    '</div>';
  }).join('');
}

// 按名称或id切换项目（同时同步到采购中心）
function switchAndCloseByName(name,id,source){
  // 统一切换：无论来源，两边都同步
  if(source==='new'){
    // 采购中心项目 → 切换 PCService
    if(typeof PCService!=='undefined') PCService.switchProj(id);
    // 同步到旧系统（找或创建同名项目）
    var pm=(projectList||[]).find(function(p){return p.name===name;});
    if(pm){
      switchAndClose(pm.id);
    } else {
      // 旧系统没有 → 创建一个同名项目
      var newPm = createProject(name);
      if(newPm) switchAndClose(newPm.id);
      else closeProjectModal();
    }
  } else {
    // 旧系统项目 → 切换旧系统
    switchAndClose(id);
    // 同步到采购中心（找或创建同名项目）
    if(typeof ProjectService!=='undefined'){
      var np=ProjectService.getByName(name);
      if(!np) np=ProjectService.create(name,'');
      if(np&&typeof PCService!=='undefined') PCService.switchProj(np.id);
    }
  }
}

function createAndSwitch(){
  var name=document.getElementById('new-proj-inp').value.trim();
  if(!name){document.getElementById('new-proj-inp').focus();return;}
  // 旧系统创建
  var proj=createProject(name);
  if(proj){
    // 同时在采购中心创建同名项目（如果不存在）
    if(typeof ProjectService!=='undefined'){
      var existing=ProjectService.getByName(name);
      if(!existing) existing=ProjectService.create(name,'');
      if(existing && typeof PCService!=='undefined'){
        PCService.switchProj(existing.id);
      }
    }
    switchProject(proj.id);
    renderModalProjectList();
    document.getElementById('new-proj-inp').value='';
  }
}

function switchAndClose(id){
  switchProject(id);
  closeProjectModal();
}

function deleteProject(id,evt){
  evt.stopPropagation();
  var proj=projectList.find(function(p){return p.id===id;});
  if(!proj)return;
  if(!confirm('删除项目「'+proj.name+'」？所有采购记录将一并删除'))return;
  projectList=projectList.filter(function(p){return p.id!==id;});
  delete projectOrders[id];
  if(currentProject&&currentProject.id===id){
    currentProject=null;
    try{localStorage.removeItem(KEY_CURPROJ);}catch(e){}
  }
  saveProjects();saveOrders();
  renderModalProjectList();
  renderProjectBadge();
  renderProjectOrders();
  buildProjectIndex();
}


// ════════════════════════════════════════
// ════════════════════════════════════════

function exportForCompare(){
  if(!cart.length){alert('采购清单为空');return;}
  // 格式与比价软件的 Excel 输入一致：物资名称、参考品牌、规格参数、单位、数量
  var rows=cart.map(function(c,i){
    return {
      '序号':     i+1,
      '物资名称': c.name||'',
      '参考品牌': c.brand||'',
      '规格参数': c.spec||'',
      '单位':     c.unit||'',
      '数量':     c.qty||1,
      '物料编码': c.code||'',
      '一级类目': c.cat1||'',
      '备注':     ''
    };
  });
  xlsxOut(rows,'比价清单','比价清单_'+today()+'.xlsx');
  // 提示引导
  setTimeout(function(){
    var msg='✅ 比价清单已导出！\n\n接下来：\n'+
      '1. 打开桌面比价软件（main.py）\n'+
      '2. 点「导入采购清单」选择刚导出的文件\n'+
      '3. 比价完成后点「导出报告」保存 Excel\n'+
      '4. 回到本系统点「导入比价结果」查看最低价汇总';
    alert(msg);
  },300);
}

function importCompareResult(){
  var fi=document.getElementById('fi-compare-result');
  if(!fi){
    fi=document.createElement('input');
    fi.type='file'; fi.id='fi-compare-result';
    fi.accept='.xlsx,.xls'; fi.style.display='none';
    fi.addEventListener('change',function(){
      if(this.files[0]) parseCompareResult(this.files[0]);
      this.value='';
    });
    document.body.appendChild(fi);
  }
  fi.click();
}

function parseCompareResult(file){
  var reader=new FileReader();
  reader.onload=function(e){
    var wb=XLSX.read(e.target.result,{type:'binary'});
    var ws=wb.Sheets[wb.SheetNames[0]];
    var data=XLSX.utils.sheet_to_json(ws);
    if(!data.length){alert('文件为空或格式不对');return;}
    // 渲染比价结果弹窗
    showCompareResultModal(data);
  };
  reader.readAsBinaryString(file);
}

function showCompareResultModal(data){
  // 移除旧弹窗
  var old=document.getElementById('compare-modal');
  if(old)old.remove();

  // 统计各平台最低价
  var totalSaving=0;
  var platforms=new Set();
  data.forEach(function(r){
    if(r['最低价平台']) platforms.add(r['最低价平台']);
  });

  var rows=data.map(function(r,i){
    var lowest=parseFloat(r['最低价']||r['最低单价']||0);
    var orig=parseFloat(r['单价']||r['参考单价']||0);
    var saving=orig>0&&lowest>0&&lowest<orig?((orig-lowest)*( r['数量']||1)):0;
    totalSaving+=saving;

    // 找所有平台的价格列
    var priceHtml='';
    ['鑫方盛','得力','震坤行','京东慧采'].forEach(function(p){
      var price=r[p+'单价']||r[p+'_价格']||r[p]||'';
      if(price&&parseFloat(price)>0){
        var isLowest=(r['最低价平台']===p);
        priceHtml+='<span style="margin-right:8px;font-size:11px;'+
          (isLowest?'font-weight:700;color:#2A7A3B;background:#E2EFDA;padding:1px 5px;border-radius:4px;':'color:#666')+
          '">'+p+' ¥'+parseFloat(price).toFixed(2)+'</span>';
      }
    });

    return '<tr style="background:'+(i%2===0?'#F7F6F3':'#fff')+';border-bottom:1px solid #E0DCD5">'+
      '<td style="padding:7px 10px;font-size:12px;font-weight:600">'+( escapeHtml(r['物资名称']||''))+'</td>'+
      '<td style="padding:7px 10px;font-size:11px;color:#666">'+( r['规格参数']||r['规格']||'')+'</td>'+
      '<td style="padding:7px 10px">'+(priceHtml||'<span style="color:#ccc">无报价</span>')+'</td>'+
      '<td style="padding:7px 10px;font-size:12px;font-weight:700;color:#1A5FA8;text-align:right">'+
        (r['最低价平台']?'<span style="font-size:10px;color:#666">'+r['最低价平台']+'</span><br>':'')+'¥'+(lowest?lowest.toFixed(2):'—')+
      '</td>'+
      (saving>0?'<td style="padding:7px 10px;font-size:11px;color:#2A7A3B;text-align:right">省¥'+saving.toFixed(0)+'</td>':'<td></td>')+
    '</tr>';
  }).join('');

  var modal=document.createElement('div');
  modal.id='compare-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:3000;display:flex;align-items:flex-start;justify-content:center;padding-top:40px;overflow-y:auto';
  modal.innerHTML=
    '<div style="background:#fff;border-radius:14px;width:90%;max-width:1000px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">'+
      '<div style="padding:16px 20px;border-bottom:1px solid #E0DCD5;display:flex;align-items:center;gap:12px;flex-shrink:0">'+
        '<span style="font-size:16px;font-weight:700">📊 比价结果汇总</span>'+
        '<span style="font-size:12px;color:#666">共 '+data.length+' 条物资</span>'+
        (totalSaving>0?'<span style="font-size:12px;background:#E2EFDA;color:#2A7A3B;padding:3px 10px;border-radius:20px;font-weight:600">预计可节省 ¥'+totalSaving.toFixed(0)+'</span>':'')+
        '<button onclick="document.getElementById(\'compare-modal\').remove()" style="margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:#999">✕</button>'+
      '</div>'+
      '<div style="overflow-y:auto;flex:1">'+
        '<table style="width:100%;border-collapse:collapse">'+
          '<thead><tr style="background:#1F3864;color:#fff">'+
            '<th style="padding:9px 10px;text-align:left;font-size:11px;font-weight:600">物资名称</th>'+
            '<th style="padding:9px 10px;text-align:left;font-size:11px;font-weight:600">规格</th>'+
            '<th style="padding:9px 10px;text-align:left;font-size:11px;font-weight:600">各平台报价</th>'+
            '<th style="padding:9px 10px;text-align:right;font-size:11px;font-weight:600">最低价</th>'+
            '<th style="padding:9px 10px;text-align:right;font-size:11px;font-weight:600">节省</th>'+
          '</tr></thead>'+
          '<tbody>'+rows+'</tbody>'+
        '</table>'+
      '</div>'+
      '<div style="padding:12px 20px;border-top:1px solid #E0DCD5;display:flex;gap:8px;justify-content:flex-end;flex-shrink:0">'+
        '<button onclick="exportCompareResultXlsx(window._compareData)" style="padding:8px 16px;background:#1F3864;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">⬇ 导出汇总表</button>'+
        '<button onclick="document.getElementById(\'compare-modal\').remove()" style="padding:8px 16px;background:transparent;border:1px solid #C0BAB0;border-radius:8px;font-size:12px;cursor:pointer">关闭</button>'+
      '</div>'+
    '</div>';
  window._compareData=data;
  document.body.appendChild(modal);
}

function exportCompareResultXlsx(data){
  if(!data||!data.length){return;}
  var ws=XLSX.utils.json_to_sheet(data);
  var wb2=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2,ws,'比价结果');
  XLSX.writeFile(wb2,'比价汇总_'+today()+'.xlsx');
}


// ════════════════════════════════════════
// 图片 & 链接管理系统
// ════════════════════════════════════════

// 每条DB记录扩展字段：r.img（图片URL）, r.links（{鑫方盛:'',得力:'',震坤行:'',京东:'',淘宝:''}）
// 存储在 localStorage，key = 'db_links_v1'，格式 {code: {img:'', links:{...}}}
var DB_LINKS = {};  // 运行时缓存
var KEY_DB_LINKS = 'db_links_v1';

function loadDBLinks(){
  try{
    var raw=localStorage.getItem(KEY_DB_LINKS);
    if(raw) DB_LINKS=JSON.parse(raw);
  }catch(e){}
  // 把链接/图片合并到DB记录
  mergeLinksToRecords();
}

// 订单品牌规格补丁（按物资名称匹配）
/* ORDER_PATCHES 由 embed-data.js 提供 */

function mergeLinksToRecords(){
  DB.forEach(function(r){
    var extra=DB_LINKS[r.code];
    if(extra){
      r.img=extra.img||'';
      r.links=extra.links||{};
      if(extra.spec) r.spec=extra.spec;
      if(extra.brand&&extra.brand!=='/'&&extra.brand!=='-') r.brand=extra.brand;
      if(extra.unit) r.unit=extra.unit;
    } else {
      r.img=''; r.links={};
    }
    // 从订单补丁补充品牌/规格（针对空值或占位符）
    var patch=ORDER_PATCHES[r.name];
    if(patch){
      if(patch.brand&&(!r.brand||r.brand==='/'||r.brand==='-'||r.brand==='')){
        r.brand=patch.brand;
      }
      if(patch.spec&&(!r.spec||r.spec==='')){
        r.spec=patch.spec;
      }
    }
  });
}

function saveDBLinks(){
  try{localStorage.setItem(KEY_DB_LINKS,JSON.stringify(DB_LINKS));}catch(e){}
}

// ── 大图预览
function previewImg(url){
  var layer=document.getElementById('img-preview-layer');
  document.getElementById('img-preview-img').src=url;
  layer.classList.add('on');
}

// ── 打开编辑器
var _leIdx=-1;
function openLinkEditor(idx){
  _leIdx=parseInt(idx);
  var r=dbFiltered[_leIdx]; if(!r)return;
  document.getElementById('le-title').textContent='购买地址：'+r.name;
  document.getElementById('le-subtitle').textContent=r.code+' · '+r.brand;
  // 填入现有值
  document.getElementById('le-img-url').value=r.img||'';
  lePreviewImg(r.img||'');
  var links=r.links||{};
  document.getElementById('le-xfs').value=links['鑫方盛']||'';
  document.getElementById('le-dl').value=links['得力']||'';
  document.getElementById('le-zkh').value=links['震坤行']||'';
  document.getElementById('le-jd').value=links['京东']||'';
  document.getElementById('le-tb').value=links['淘宝']||'';
  // 图片区默认折叠；若已有图片则自动展开，方便查看
  var imgSection=document.getElementById('le-img-section');
  var imgIco=document.getElementById('le-img-toggle-ico');
  if(r.img){ imgSection.style.display=''; imgIco.textContent='▾'; }
  else { imgSection.style.display='none'; imgIco.textContent='▸'; }
  document.getElementById('link-editor-overlay').style.display='flex';
  setTimeout(function(){ var el=document.getElementById('le-xfs'); if(el) el.focus(); }, 50);
}

function toggleLeImgSection(){
  var sec=document.getElementById('le-img-section');
  var ico=document.getElementById('le-img-toggle-ico');
  var open=sec.style.display!=='none';
  sec.style.display=open?'none':'';
  ico.textContent=open?'▸':'▾';
}

function closeLinkEditor(){
  document.getElementById('link-editor-overlay').style.display='none';
  _leIdx=-1;
}

function lePreviewImg(url){
  var img=document.getElementById('le-img-preview');
  var ph=document.getElementById('le-img-placeholder');
  var hint=document.getElementById('le-img-hint');
  function showHint(msg,color){
    if(!hint)return;
    hint.style.display='block';
    hint.textContent=msg;
    hint.style.background=color==='warn'?'#FFF5E6':'#FFF0F0';
    hint.style.borderColor=color==='warn'?'#F0C060':'#F0A0A0';
    hint.style.color=color==='warn'?'#B05000':'#900';
  }
  function hideHint(){if(hint)hint.style.display='none';}
  if(!url||!url.startsWith('http')){
    img.style.display='none'; ph.style.display='flex'; hideHint(); return;
  }
  var isBingPage=/bing\.com\/images/.test(url);
  var isSearchPage=/(jd\.com\/Search|s\.taobao|s\.1688|deli\.com\.cn\/search|zkh\.com\/search|jslink\.com\/search|bing\.com\/images\/search)/.test(url);
  if(isBingPage||isSearchPage){
    img.style.display='none'; ph.style.display='flex';
    showHint('⚠ 这是搜索页URL，不是图片地址。请右键商品图→「在新标签打开图片」→复制地址栏URL','warn');
    return;
  }
  img.src=url; img.style.display='block'; ph.style.display='none'; hideHint();
  img.onerror=function(){
    img.style.display='none'; ph.style.display='flex';
    showHint('❌ 图片加载失败（防盗链）。建议右键图片→「在新标签中打开」→复制地址栏URL','err');
  };
}

function leTestLink(inputId){
  var url=document.getElementById(inputId).value.trim();
  if(!url){alert('请先填写链接');return;}
  window.open(url,'_blank');
}

function saveLinkEditor(){
  var r=dbFiltered[_leIdx]; if(!r)return;
  var imgUrl=document.getElementById('le-img-url').value.trim();
  var links={
    '鑫方盛': document.getElementById('le-xfs').value.trim(),
    '得力':   document.getElementById('le-dl').value.trim(),
    '震坤行': document.getElementById('le-zkh').value.trim(),
    '京东':   document.getElementById('le-jd').value.trim(),
    '淘宝':   document.getElementById('le-tb').value.trim(),
  };
  // 过滤空值
  Object.keys(links).forEach(function(k){if(!links[k])delete links[k];});
  // 写入DB记录
  r.img=imgUrl; r.links=links;
  // 写入持久化存储
  if(!DB_LINKS[r.code]) DB_LINKS[r.code]={};
  DB_LINKS[r.code].img=imgUrl;
  DB_LINKS[r.code].links=links;
  saveDBLinks();
  closeLinkEditor();
  renderDBTable();  // 刷新表格
  // 同步到masterDB（如果是自存记录）
  var mIdx=masterDB.findIndex(function(m){return m.code===r.code;});
  if(mIdx>=0){masterDB[mIdx].img=imgUrl; masterDB[mIdx].links=links; saveMaster();}
}

// ── 批量导入链接（从Excel）
// Excel格式：物料编码 | 图片URL | 鑫方盛链接 | 得力链接 | 震坤行链接 | 京东链接 | 淘宝链接
function importLinksFromXlsx(){
  var fi=document.getElementById('fi-import-links');
  if(!fi){
    fi=document.createElement('input');
    fi.type='file'; fi.id='fi-import-links';
    fi.accept='.xlsx,.xls'; fi.style.display='none';
    fi.addEventListener('change',function(){
      if(this.files[0]) parseLinksXlsx(this.files[0]);
      this.value='';
    });
    document.body.appendChild(fi);
  }
  fi.click();
}

function parseLinksXlsx(file){
  var reader=new FileReader();
  reader.onload=function(e){
    var wb=XLSX.read(e.target.result,{type:'binary'});
    var ws=wb.Sheets[wb.SheetNames[0]];
    var data=XLSX.utils.sheet_to_json(ws);
    if(!data.length){alert('文件为空');return;}
    function norm(k){return String(k||'').replace(/[\n\r\s]/g,'');}
    var normalized=data.map(function(row){
      var nr={};Object.entries(row).forEach(function(kv){nr[norm(kv[0])]=kv[1];});return nr;
    });
    var updated=0;
    normalized.forEach(function(row){
      var code=String(row['物料编码']||'').trim();
      if(!code)return;
      var imgUrl=String(row['图片URL']||row['图片']||'').trim();
      var links={};
      ['鑫方盛','得力','震坤行','京东','淘宝'].forEach(function(p){
        var v=String(row[p+'链接']||row[p]||'').trim();
        if(v&&v.startsWith('http'))links[p]=v;
      });
      if(!imgUrl&&!Object.keys(links).length)return;
      if(!DB_LINKS[code])DB_LINKS[code]={};
      if(imgUrl)DB_LINKS[code].img=imgUrl;
      DB_LINKS[code].links=Object.assign(DB_LINKS[code].links||{},links);
      // 同步到DB记录
      var r=DB.find(function(r){return r.code===code;});
      if(r){if(imgUrl)r.img=imgUrl; r.links=Object.assign(r.links||{},links);}
      updated++;
    });
    saveDBLinks();
    renderDBTable();
    alert('✅ 批量导入完成，更新 '+updated+' 条物资的链接/图片');
  };
  reader.readAsBinaryString(file);
}

// ── 导出「链接模板」（供批量填写后导入）
function exportLinksTemplate(){
  var rows=dbFiltered.slice(0,300).map(function(r){
    var links=r.links||{};
    return {
      '物料编码': r.code,
      '物资名称': r.name,
      '品牌':     r.brand||'',
      '规格':     r.spec||'',
      '图片URL':  r.img||'',
      '鑫方盛链接': links['鑫方盛']||'',
      '得力链接':   links['得力']||'',
      '震坤行链接': links['震坤行']||'',
      '京东链接':   links['京东']||'',
      '淘宝链接':   links['淘宝']||'',
    };
  });
  xlsxOut(rows,'链接模板','物资链接模板_'+today()+'.xlsx');
  setTimeout(function(){
    alert('📋 模板已导出！\n\n填写方式：\n在「图片URL」列粘贴商品图片地址\n在各平台「链接」列粘贴商品页面URL\n\n填完后点「批量导入链接」选择此文件即可批量更新');
  },300);
}

// 联想下拉和选中卡中也展示图片和链接
var _origPickQS=pickQS;
pickQS=function(i){
  _origPickQS(i);
  var h=qsItems[i]; if(!h)return;
  // 在 sel-card 中加入图片和链接
  var r=h.r;
  var extra='';
  if(r.img){
    extra+='<img src="'+r.img+'" style="width:80px;height:80px;border-radius:6px;object-fit:cover;border:1px solid var(--bd);margin-top:6px;cursor:zoom-in" onclick="previewImg(\''+r.img.replace(/'/g,"\\'")+'\')">';
  }
  var links=r.links||{};
  var platLinks=Object.keys(links);
  if(platLinks.length){
    extra+='<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">';
    var PCLS={'鑫方盛':'pl-xfs','得力':'pl-dl','震坤行':'pl-zkh','京东':'pl-jd','淘宝':'pl-tb'};
    var PICO={'鑫方盛':'⭕','得力':'🔵','震坤行':'🟠','京东':'🔴','淘宝':'🟣'};
    platLinks.forEach(function(p){
      extra+='<a class="plat-link '+(PCLS[p]||'')+'" href="'+links[p]+'" target="_blank">'+( PICO[p]||'')+'&nbsp;'+p+'</a>';
    });
    extra+='</div>';
  }
  // 从订单库补充平台链接
  var orderHits=searchOrderItems(h.r.name||'');
  if(orderHits.length){
    extra+='<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">';
    orderHits.slice(0,4).forEach(function(m){
      var cfg=PLAT_CONFIG[m.pt]||{};
      extra+='<a class="plat-link '+(cfg.cls||'')+'" href="'+m.url+'" target="_blank" '+
        'title="¥'+m.p+' · 点击在'+m.pt+'查看商品">'+
        (cfg.ico||'')+' '+m.pt+
        (m.p?'<span style="font-size:9px;opacity:.7"> ¥'+m.p+'</span>':'')+
      '</a>';
    });
    extra+='</div>';
  }
  if(extra){
    var metaEl=document.getElementById('sc-meta');
    if(metaEl) metaEl.insertAdjacentHTML('afterend', '<div id="sc-extra-links">'+extra+'</div>');
  }
};

var _origClearQS=clearQS;
clearQS=function(){
  _origClearQS();
  var el=document.getElementById('sc-extra-links');
  if(el)el.remove();
};


// ════════════════════════════════════════
// 自动搜图：调用AI获取候选图片
// ════════════════════════════════════════

var _leCurrentItem = null;  // 当前编辑的物资

// 改造 openLinkEditor，保存当前物资信息
var _origOpenLE = openLinkEditor;
openLinkEditor = function(idx){
  _origOpenLE(idx);
  _leCurrentItem = dbFiltered[parseInt(idx)] || null;
};

function leAutoSearch(){
  if(!_leCurrentItem){alert('请先在数据库中点击物资行的「＋链接」按钮');return;}
  var name  = _leCurrentItem.name||'';
  var brand = (_leCurrentItem.brand||'').split(/[\/，,\n]/)[0].trim();
  if(brand==='/'||brand==='nan'||brand==='-') brand='';
  var kw = (brand?brand+' ':'')+name;
  var enc = encodeURIComponent(kw);

  var cands = document.getElementById('le-img-candidates');
  var grid  = document.getElementById('le-cand-grid');
  cands.style.display = 'block';
  document.getElementById('le-search-kw').textContent = '关键词：'+kw;
  document.getElementById('le-cand-spinner').style.display = 'none';

  var platforms = [
    {name:'必应图片', color:'#0078D4',
     url:'https://cn.bing.com/images/search?q='+enc+'&qft=+filterui:photo-photo&form=IRFLTR'},
    {name:'京东',    cls:'pl-jd',  url:'https://search.jd.com/Search?keyword='+enc},
    {name:'鑫方盛',  cls:'pl-xfs', url:'https://csfzshfwgs.jslink.com/pcweb/search?keywords='+enc},
    {name:'震坤行',  cls:'pl-zkh', url:'https://www.zkh.com/search.html?keyword='+enc},
    {name:'得力',    cls:'pl-dl',  url:'https://www.deli.com.cn/search.html?q='+enc},
  ];

  document.getElementById('le-cand-label').textContent = '① 点击平台搜索 → ② 右键图片 → ③ 粘贴地址到下方';
  grid.innerHTML =
    '<div style="background:#EBF3FC;border:1px solid #B8D5F5;border-radius:8px;padding:10px 12px;margin-bottom:8px;font-size:11px;color:#2A5A8A;line-height:1.9">'+
      '<strong style="display:block;margin-bottom:3px;font-size:12px">📋 获取商品图片（三步）</strong>'+
      '<b>①</b> 点下方搜索按钮 → 找到商品<br>'+
      '<b>②</b> 右键商品图片 → 选<u>「在新标签页中打开图片」</u><br>'+
      '<b>③</b> 复制新标签页<b style="color:#0078D4">地址栏URL</b>（.jpg/.png结尾）→ 粘贴到下方<br>'+
      '<span style="font-size:10px;color:var(--red)">⚠ 注意：必须是图片直链（以.jpg/.png结尾），不能是商品页或搜索页URL</span>'+
    '</div>'+
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'+
    platforms.map(function(p){
      var s=p.cls?'':'background:'+p.color+'18;color:'+p.color+';border-color:'+p.color+'55;';
      return '<a href="'+p.url+'" target="_blank" class="plat-link '+(p.cls||'')+'" style="'+s+'font-size:11px">'+p.name+' →</a>';
    }).join('')+
    '</div>'+
    '<div style="display:flex;gap:6px;align-items:center">'+
      '<input id="le-quick-paste" type="text" placeholder="将图片URL粘贴到这里…（支持 Ctrl+V）"'+
        ' style="flex:1;padding:7px 10px;font-size:12px;border:1.5px dashed #2E75B6;border-radius:7px;outline:none;background:#F7FBFF"'+
        ' oninput="leQuickPaste(this.value)"'+
        ' onpaste="var me=this;setTimeout(function(){leQuickPaste(me.value);},30)">'+
      '<button class="btn btn-blue btn-sm" onclick="leConfirmPaste()">✓ 使用</button>'+
    '</div>';
}

function leQuickPaste(url){
  url=(url||'').trim();
  if(!url)return;
  lePreviewImg(url);
}

function leConfirmPaste(){
  var url=(document.getElementById('le-quick-paste').value||'').trim();
  if(!url){alert('请先粘贴图片URL');return;}
  document.getElementById('le-img-url').value=url;
  lePreviewImg(url);
  document.getElementById('le-cand-label').textContent='✅ 已填入图片地址，确认预览后点「保存」';
  document.getElementById('le-cand-grid').innerHTML=
    '<div style="font-size:11px;color:#2A7A3B;padding:5px 0">图片地址已填入，查看上方预览是否正确</div>';
}
function selectCandImg(url, idx){
  // 选中高亮
  document.querySelectorAll('.cand-img').forEach(function(el,i){
    el.classList.toggle('selected', i===idx);
  });
  // 填入URL输入框并预览
  document.getElementById('le-img-url').value=url;
  lePreviewImg(url);
}


// ════════════════════════════════════════
// 2025年全年订单库（四平台·2030种商品）
// 含平台直达链接，搜索时优先推荐
// ════════════════════════════════════════
/* ORDER_ITEMS 由 embed-data.js 提供 */

// 订单库索引（按名称前4字分组，加速搜索）
var ORDER_INDEX = {};
ORDER_ITEMS.forEach(function(item){
  var key = item.n.slice(0,4);
  if(!ORDER_INDEX[key]) ORDER_INDEX[key]=[];
  ORDER_INDEX[key].push(item);
});

// 平台配置
var PLAT_CONFIG = {
  '鑫方盛': {cls:'pl-xfs', ico:'⭕', label:'鑫方盛'},
  '京东':   {cls:'pl-jd',  ico:'🔴', label:'京东'},
  '得力':   {cls:'pl-dl',  ico:'🔵', label:'得力'},
  '震坤行': {cls:'pl-zkh', ico:'🟠', label:'震坤行'},
};

// 搜索订单库（返回匹配结果）
function searchOrderItems(q) {
  if(!q || q.length < 2) return [];
  q = q.toLowerCase();
  var results = [];
  var seen = new Set();
  ORDER_ITEMS.forEach(function(item) {
    if(item.n.toLowerCase().indexOf(q) >= 0 ||
       (item.b && item.b.toLowerCase().indexOf(q) >= 0)) {
      var key = item.n;
      if(!seen.has(key)) { seen.add(key); results.push(item); }
    }
  });
  return results.slice(0, 12);
}

// 为DB搜索结果附加订单链接
function attachOrderLinks(dbRecord) {
  var q = dbRecord.name || dbRecord.n || '';
  var matches = searchOrderItems(q);
  if(!matches.length) return {};
  // 找最接近的匹配
  var best = matches.find(function(m) {
    return m.n.indexOf(q) >= 0 || q.indexOf(m.n.slice(0,8)) >= 0;
  }) || matches[0];
  var links = {};
  links[best.pt] = best.url;
  return links;
}


// ════════════════════════════════════════
// 规格型号内联编辑
// ════════════════════════════════════════
var _spIdx = -1;

function openSpecEdit(evt, idx){
  evt.stopPropagation();
  _spIdx = idx;
  var r = dbFiltered[idx]; if(!r) return;
  var popup = document.getElementById('spec-popup');
  document.getElementById('sp-item-name').textContent = r.name;
  document.getElementById('sp-spec').value  = r.spec  || '';
  document.getElementById('sp-brand').value = r.brand || '';
  document.getElementById('sp-unit').value  = r.unit  || '';
  // 定位弹窗（靠近点击位置）
  var rect = evt.target.getBoundingClientRect();
  var top  = rect.bottom + 6;
  var left = Math.min(rect.left, window.innerWidth - 360);
  if(top + 180 > window.innerHeight) top = rect.top - 190;
  popup.style.top  = top  + 'px';
  popup.style.left = left + 'px';
  popup.classList.add('on');
  document.getElementById('sp-spec').focus();
  document.getElementById('sp-spec').select();
}

function closeSpecPopup(){
  document.getElementById('spec-popup').classList.remove('on');
  _spIdx = -1;
}

function saveSpec(){
  var r = dbFiltered[_spIdx]; if(!r){ closeSpecPopup(); return; }
  var newSpec  = document.getElementById('sp-spec').value.trim();
  var newBrand = document.getElementById('sp-brand').value.trim();
  var newUnit  = document.getElementById('sp-unit').value.trim();

  // 写入运行时DB记录
  r.spec  = newSpec;
  if(newBrand) r.brand = newBrand;
  if(newUnit)  r.unit  = newUnit;

  // 同步写入 masterDB（自存记录）
  var mi = masterDB.findIndex(function(m){ return m.code === r.code; });
  if(mi >= 0){
    masterDB[mi].spec  = newSpec;
    if(newBrand) masterDB[mi].brand = newBrand;
    if(newUnit)  masterDB[mi].unit  = newUnit;
    saveMaster();
  } else {
    // 不在masterDB中：新增一条（把修改过的记录存入）
    masterDB.push({
      code: r.code, name: r.name, brand: r.brand||'',
      spec: r.spec||'',  unit: r.unit||'',
      cat1: r.cat1||'', cat2: r.cat2||'', cat3: r.cat3||'', abc: r.abc||'B'
    });
    saveMaster();
    if(typeof AuthSystem!=='undefined'&&AuthSystem.current())
      AuthSystem.log('修改SKU规格','['+r.code+'] '+r.name+' → 规格:'+newSpec+(newBrand?' 品牌:'+newBrand:'')+(newUnit?' 单位:'+newUnit:''));
  }

  // 同步写入 DB_LINKS 中的规格字段（用于持久化）
  if(!DB_LINKS[r.code]) DB_LINKS[r.code] = {img:'', links:{}};
  DB_LINKS[r.code].spec  = newSpec;
  DB_LINKS[r.code].brand = r.brand;
  DB_LINKS[r.code].unit  = r.unit;
  saveDBLinks();

  closeSpecPopup();
  renderDBTable();  // 刷新表格
}

// ══════════════════════════════════
// SKU 新增（管理员/招采主管）
// ══════════════════════════════════
var _skeIdx = -1;
var _skeIsNew = false;

// 新增模式：从搜索无结果页触发，预填名称，类目留空待选
function openNewSkuModal(prefillName){
  if(typeof AuthSystem!=='undefined' && !AuthSystem.can('addSKU')){ alert('权限不足'); return; }
  _skeIdx = -1;
  _skeIsNew = true;
  document.getElementById('ske-name').value  = prefillName || '';
  document.getElementById('ske-brand').value = '';
  document.getElementById('ske-unit').value  = '';
  document.getElementById('ske-spec').value  = '';
  document.getElementById('ske-abc').value   = 'B';
  var c1s = [...new Set(DB.map(function(x){return x.cat1;}))].filter(Boolean).sort();
  var s1 = document.getElementById('ske-c1');
  s1.innerHTML = '<option value="">请选择一级类目</option>';
  c1s.forEach(function(c){ var o=document.createElement('option'); o.value=c; o.textContent=c; s1.appendChild(o); });
  document.getElementById('ske-c2').innerHTML = '<option value="">请选择二级类目</option>';
  document.getElementById('ske-c3').innerHTML = '<option value="">请选择三级类目</option>';
  document.getElementById('sku-edit-overlay').style.display = 'flex';
  setTimeout(function(){ document.getElementById('ske-name').focus(); }, 50);
}
function closeSkuEditModal(){
  document.getElementById('sku-edit-overlay').style.display = 'none';
  _skeIdx = -1;
  _skeIsNew = false;
}
function skeOnC1(){
  var v = document.getElementById('ske-c1').value;
  var s2 = document.getElementById('ske-c2'); s2.innerHTML = '<option value="">请选择二级类目</option>';
  document.getElementById('ske-c3').innerHTML = '<option value="">请选择三级类目</option>';
  if(!v) return;
  [...new Set(DB.filter(function(x){return x.cat1===v;}).map(function(x){return x.cat2;}))].filter(Boolean).sort()
    .forEach(function(c){ var o=document.createElement('option'); o.value=c; o.textContent=c; s2.appendChild(o); });
}
function skeOnC2(){
  var v1 = document.getElementById('ske-c1').value, v2 = document.getElementById('ske-c2').value;
  var s3 = document.getElementById('ske-c3'); s3.innerHTML = '<option value="">请选择三级类目</option>';
  if(!v1||!v2) return;
  [...new Set(DB.filter(function(x){return x.cat1===v1&&x.cat2===v2;}).map(function(x){return x.cat3;}))].filter(Boolean).sort()
    .forEach(function(c){ var o=document.createElement('option'); o.value=c; o.textContent=c; s3.appendChild(o); });
}
function saveSkuEdit(){
  var newName  = document.getElementById('ske-name').value.trim();
  if(!newName){ alert('物资名称不能为空'); return; }
  var newBrand = document.getElementById('ske-brand').value.trim();
  var newUnit  = document.getElementById('ske-unit').value.trim();
  var newSpec  = document.getElementById('ske-spec').value.trim();
  var newAbc   = document.getElementById('ske-abc').value;
  var newC1    = document.getElementById('ske-c1').value;
  var newC2    = document.getElementById('ske-c2').value;
  var newC3    = document.getElementById('ske-c3').value;

  // 仅支持新增模式（编辑入口已移除）
  if(!newC1||!newC2||!newC3){ alert('新增SKU需选择完整的三级类目（用于生成正式编码）'); return; }
  var code = nextCode(newC1, newC2, newC3);
  if(!code){ alert('该类目编码已满，请联系管理员扩展'); return; }
  var rec = {code:code, name:newName, brand:newBrand, spec:newSpec, unit:newUnit,
             cat1:newC1, cat2:newC2, cat3:newC3, abc:newAbc, img:'', links:{}};
  masterDB.push(rec);
  saveMaster();
  if(!usedCodes.has(code)){ DB.unshift(rec); usedCodes.add(code); }
  if(typeof AuthSystem!=='undefined' && AuthSystem.current())
    AuthSystem.log('新增SKU', '['+code+'] '+newName+' 类目:'+newC1+'/'+newC2+'/'+newC3);
  var badge = document.getElementById('topbadge');
  if(badge) badge.textContent = '数据库 '+DB.length+' 条';
  closeSkuEditModal();
  dbSearch(document.getElementById('db-inp')?document.getElementById('db-inp').value:'');
  alert('✅ 已生成正式编码 '+code+' 并入库');
}

// ══════════════════════════════════
// SKU 删除（管理员/招采主管）
// ══════════════════════════════════
function deleteSkuRow(idx){
  if(typeof AuthSystem!=='undefined' && !AuthSystem.can('delSKU')){ alert('权限不足'); return; }
  var r = dbFiltered[idx]; if(!r) return;
  if(!confirm('确认删除该SKU？\n\n编码：'+r.code+'\n名称：'+r.name+'\n\n此操作不可恢复，已使用该SKU的历史采购记录不受影响。')) return;

  // 从运行时DB和dbFiltered移除
  var dbIdx = DB.findIndex(function(x){ return x.code === r.code; });
  if(dbIdx >= 0) DB.splice(dbIdx, 1);
  usedCodes.delete(r.code);

  // 从masterDB移除并持久化
  var mi = masterDB.findIndex(function(m){ return m.code === r.code; });
  if(mi >= 0){ masterDB.splice(mi,1); saveMaster(); }

  // 清理DB_LINKS
  if(DB_LINKS[r.code]){ delete DB_LINKS[r.code]; saveDBLinks(); }

  if(typeof AuthSystem!=='undefined' && AuthSystem.current())
    AuthSystem.log('删除SKU', '['+r.code+'] '+r.name);

  var badge = document.getElementById('topbadge');
  if(badge) badge.textContent = '数据库 '+DB.length+' 条';

  dbSearch(document.getElementById('db-inp')?document.getElementById('db-inp').value:'');
  alert('✅ 已删除');
}


// 点击空白处关闭弹窗
document.addEventListener('click', function(e){
  var popup = document.getElementById('spec-popup');
  if(popup && popup.classList.contains('on') && !popup.contains(e.target)){
    closeSpecPopup();
  }
});

// Enter键保存
document.addEventListener('keydown', function(e){
  if(e.key === 'Enter' && _spIdx >= 0 &&
     document.getElementById('spec-popup').classList.contains('on')){
    e.preventDefault(); saveSpec();
  }
});

// loadDBLinks 时也恢复规格字段
var _origLoadDBLinks = loadDBLinks;
loadDBLinks = function(){
  _origLoadDBLinks();
  // 补充规格字段
  DB.forEach(function(r){
    var extra = DB_LINKS[r.code];
    if(extra && extra.spec) r.spec = extra.spec;
    if(extra && extra.brand && !r.brand) r.brand = extra.brand;
    if(extra && extra.unit && !r.unit)   r.unit  = extra.unit;
  });
};


// ── 从采购历史直接加入采购清单
function addHistItemDirectToCart(evt, rowIdx){
  var btn = evt.target;
  if(!_histViewItems || rowIdx >= _histViewItems.length) return;
  var item = _histViewItems[rowIdx];
  if(!item) return;
  // 尝试匹配数据库编码
  var code = '';
  var dbR = DB.find(function(r){ return r.name === item.n; });
  if(dbR) code = dbR.code;
  // 从DB补全类目
  var hcat1='',hcat2='',hcat3='';
  if(code){
    var hdbr=DB.find(function(r){return r.code===code;});
    if(hdbr){hcat1=hdbr.cat1||'';hcat2=hdbr.cat2||'';hcat3=hdbr.cat3||'';}
  }
  if(!hcat1&&item.n){
    var hdbr2=DB.find(function(r){return r.name===item.n;});
    if(hdbr2){hcat1=hdbr2.cat1||'';hcat2=hdbr2.cat2||'';hcat3=hdbr2.cat3||'';}
  }
  var hItem = {
    id: 'i'+Date.now(),
    name:  item.n || '',
    code:  code,
    brand: item.b || '',
    spec:  item.s || '',
    unit:  item.u || '',
    cat1:  hcat1, cat2: hcat2, cat3: hcat3,
    qty:   item.q || 1,
    price: item.p || 0,
    isNew: !code,
  };
  cart.push(Object.assign({},hItem,{id:Date.now()+Math.random()}));
  renderCart();
  // 同步加入采购中心当前项目的购物车
  if(typeof PCService!=='undefined' && PCService.getPid()){
    PCService.addItem(hItem);
  }
  btn.textContent = '✓已加';
  btn.style.color = 'var(--green)';
  btn.disabled = true;
  // 闪烁提示
  var badge = document.getElementById('tab-cart');
  if(badge){
    badge.style.background = 'rgba(42,122,59,.3)';
    setTimeout(function(){ badge.style.background = ''; }, 1000);
  }
}


// ════════════════════════════════════════
// 用订单库批量补全 masterDB 的品牌/规格
// ════════════════════════════════════════
function autoFillMasterDBFromOrders(){
  if(!masterDB||!masterDB.length||!ORDER_ITEMS||!ORDER_ITEMS.length) return;
  
  // 构建订单名称→{brand,spec}的快速查找
  // ORDER_ITEMS 格式：{n:名称, b:品牌, s:规格, pt:平台, ...}
  // 平台优先级：鑫方盛>震坤行>得力>京东
  var PRIO={'鑫方盛':0,'震坤行':1,'得力':2,'京东':3};
  var orderMap = {};  // 核心词(join) → {brand, spec, prio}
  
  function coreWords(name){
    // 提取2字以上中文词
    var words=(name||'').replace(/（单位[：:][^）]*）|\([^)]*\)/g,'')
      .match(/[\u4e00-\u9fa5]{2,}/g)||[];
    return words.sort().join('|');
  }
  
  ORDER_ITEMS.forEach(function(item){
    var key = coreWords(item.n);
    if(!key) return;
    var prio = PRIO[item.pt]||9;
    if(!orderMap[key]||prio<orderMap[key].prio){
      orderMap[key]={brand:item.b||'',spec:item.s||'',prio:prio};
    }
  });
  
  // 对 masterDB 逐条匹配
  var filled=0;
  masterDB.forEach(function(r){
    if(r.brand&&r.spec) return;  // 已完整，跳过
    var key=coreWords(r.name);
    if(!key) return;
    
    // 精确匹配
    var hit=orderMap[key];
    if(!hit){
      // 模糊：找包含关系（masterDB名称词是orderMap词的子集或反向）
      var dbWords=(r.name||'').match(/[\u4e00-\u9fa5]{2,}/g)||[];
      if(dbWords.length<1) return;
      var best=null, bestCommon=0;
      Object.keys(orderMap).forEach(function(okey){
        var oWords=okey.split('|');
        var common=dbWords.filter(function(w){return oWords.indexOf(w)>=0;}).length;
        var score=common/Math.max(dbWords.length,oWords.length);
        if(score>=0.6&&common>bestCommon){bestCommon=common;best=orderMap[okey];}
      });
      hit=best;
    }
    
    if(hit){
      var changed=false;
      if(!r.brand&&hit.brand){r.brand=hit.brand;changed=true;}
      if(!r.spec &&hit.spec ){r.spec =hit.spec; changed=true;}
      if(changed) filled++;
    }
  });
  
  if(filled>0){
    saveMaster();
    console.log('[补全] 自动补全masterDB品牌/规格: '+filled+' 条');
  }
}

// 同样对_REC内置记录做补全（针对品牌为空或仅为"/"的记录）
function autoFillDBFromOrders(){
  if(!ORDER_ITEMS||!ORDER_ITEMS.length) return;
  var PRIO={'鑫方盛':0,'震坤行':1,'得力':2,'京东':3};
  var orderMap={};
  function coreWords(name){
    var words=(name||'').replace(/（单位[：:][^）]*）|\([^)]*\)/g,'')
      .match(/[\u4e00-\u9fa5]{2,}/g)||[];
    return words.sort().join('|');
  }
  ORDER_ITEMS.forEach(function(item){
    var key=coreWords(item.n);
    if(!key)return;
    var prio=PRIO[item.pt]||9;
    if(!orderMap[key]||prio<orderMap[key].prio){
      orderMap[key]={brand:item.b||'',spec:item.s||'',prio:prio};
    }
  });
  var filled=0;
  DB.forEach(function(r){
    var needBrand=!r.brand||r.brand==='/'||r.brand==='nan';
    var needSpec =!r.spec;
    if(!needBrand&&!needSpec)return;
    var key=coreWords(r.name);
    if(!key)return;
    var hit=orderMap[key];
    if(!hit){
      var dbWords=(r.name||'').match(/[\u4e00-\u9fa5]{2,}/g)||[];
      if(dbWords.length<1)return;
      var best=null,bestCommon=0;
      Object.keys(orderMap).forEach(function(okey){
        var oWords=okey.split('|');
        var common=dbWords.filter(function(w){return oWords.indexOf(w)>=0;}).length;
        var score=common/Math.max(dbWords.length,oWords.length);
        if(score>=0.6&&common>bestCommon){bestCommon=common;best=orderMap[okey];}
      });
      hit=best;
    }
    if(hit){
      if(needBrand&&hit.brand){r.brand=hit.brand;filled++;}
      if(needSpec &&hit.spec ){r.spec =hit.spec;}
    }
  });
  console.log('[补全] 内置DB自动补全: '+filled+' 条');
}

window.addEventListener('load',function(){
  // Task 2: IndexedDB 初始化 + localStorage 静默迁移
  if(typeof DB_STORE!=='undefined'){
    DB_STORE.init()
      .then(function(){ return DB_STORE.migrateFromLocalStorage(); })
      .then(function(n){ if(n) console.log('[DB_STORE] 迁移完成: '+n+' 条'); })
      .then(function(){ return DB_STORE.pruneOldData(3); })
      .then(function(n){ if(n) console.log('[DB_STORE] 已清理 '+n+' 条旧历史'); })
      .catch(function(e){ console.warn('[DB_STORE] 初始化异常:', e); });
  }

  dbReady=true; // 搜索可先用
  AuthSystem.init();
  FeishuSync.init();
  initDB();
  initHistPage();
  // 历史页面启动后渲染项目列表和月份列
  if(document.getElementById('proj-list-panel')) renderProjList('');
  if(document.getElementById('month-list-panel')) renderMonthList();
  loadProjects();
  buildProjectIndex();
  renderProjectBadge();
  renderProjectOrders();
  // 同步更新项目面板名称
  var pn=document.getElementById('proj-panel-name');
  if(pn)pn.textContent=currentProject?currentProject.name:'未选择项目';
});