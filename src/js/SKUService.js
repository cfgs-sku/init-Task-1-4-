// ══════════════════════════════════
// SKUService.js — SKU 检索 & 查重
// ══════════════════════════════════
var SKUService = (function(){
  var SYN = {
    '打印纸':'复印纸','激光纸':'复印纸','喷墨纸':'复印纸',
    '胶带':'封箱胶带','透明胶':'透明胶带',
    '扫帚':'扫把','笤帚':'扫把',
    '螺丝':'螺栓','螺丝钉':'螺栓',
    '插排':'插座排插','排插':'插座排插'
  };

  function _norm(t){
    if(!t) return '';
    t = String(t).toLowerCase().replace(/[\s\-_]+/g,' ').trim();
    t = t.replace(/(\d+)\s*g\b/g,'$1克').replace(/(\d+)\s*kg\b/g,'$1千克');
    var keys = Object.keys(SYN);
    for(var i=0; i<keys.length; i++){
      if(t.indexOf(keys[i])>=0){
        t = t.split(keys[i]).join(SYN[keys[i]]);
      }
    }
    return t;
  }

  return {
    normalizeText: _norm,
    normalizeSpec: _norm,
    findSimilarSKU: function(name, spec, thresh){
      if(!name || typeof sim !== 'function') return [];
      thresh = thresh || 0.55;
      var nA = _norm(name);
      var out = [];
      for(var i=0; i<DB.length && out.length<20; i++){
        var r = DB[i];
        var sc = sim(nA, _norm(r.name));
        if(sc >= thresh){
          out.push({skuId:r.code, itemName:r.name, spec:r.spec||'',
                    similarity:Math.round(sc*100), r:r});
        }
      }
      out.sort(function(a,b){ return b.similarity - a.similarity; });
      return out.slice(0,5);
    }
  };
})();
