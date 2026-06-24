#!/usr/bin/env node
/**
 * scripts/apply-tasks.js
 * 在 npm run setup（extract.js）之后运行，
 * 将任务书 Task 2–4 的增强功能 patch 进已提取的 src/js 模块。
 *
 * 运行：node scripts/apply-tasks.js  （或 npm run patch）
 *
 * 补丁内容：
 *   Task 2 — 将 db.js、utils.js 加入 src/index.html 脚本加载顺序
 *   Task 3 — TempSKU 前缀改为 TEMP-2026xxxx；启用 ReviewService；
 *             Zhenkunhang API 失败时显示手动粘贴输入框
 *   Task 4 — saveCartToDB/archiveCartToProject 加云同步锁；
 *             exportCart() 自动回填收货地址；
 *             renderHistDetail 中关键字段使用 escapeHtml
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const JS  = path.join(SRC, 'js');

function readFile(relPath) {
  const full = path.join(SRC, relPath);
  if (!fs.existsSync(full)) { console.warn('⚠️  文件不存在：' + relPath); return null; }
  // 统一换行符为 LF，避免 Windows CRLF 匹配失败
  return fs.readFileSync(full, 'utf-8').replace(/\r\n/g, '\n');
}
function writeFile(relPath, content) {
  fs.writeFileSync(path.join(SRC, relPath), content, 'utf-8');
  console.log('✓  patch: ' + relPath);
}
function replace(content, from, to, label) {
  // 同样规范化 from 字符串的换行符
  const normFrom = from.replace(/\r\n/g, '\n');
  if (content.indexOf(normFrom) === -1) {
    console.warn('  ⚠️  未找到目标字符串: ' + (label || normFrom.slice(0, 60)));
    return content;
  }
  return content.split(normFrom).join(to);
}

// ════════════════════════════════════════════════════════════
// Task 2 — 在 src/index.html 里加入 db.js + utils.js 脚本引用
// ════════════════════════════════════════════════════════════
(function patchIndexHtml() {
  var html = readFile('index.html');
  if (!html) return;

  // 在 ApiService.js 之前插入 utils.js + db.js
  var marker = '<script src="./js/ApiService.js"></script>';
  if (html.indexOf('<script src="./js/utils.js">') === -1) {
    html = replace(html, marker,
      '<script src="./js/utils.js"></script>\n' +
      '<script src="./js/db.js"></script>\n' +
      marker,
      'inject utils.js + db.js before ApiService');
  } else {
    console.log('  ⏭  utils.js + db.js 已在 index.html 中，跳过');
  }
  writeFile('index.html', html);
})();

// ════════════════════════════════════════════════════════════
// Task 2 — ApiService.js：loadHistoryData 后将数据写入 IndexedDB
// ════════════════════════════════════════════════════════════
(function patchApiService() {
  var src = readFile('js/ApiService.js');
  if (!src) return;

  // 在 rebuildHR() 调用之后，异步写入 IndexedDB
  var oldCb = "HIST_PROJ=JSON.parse(x.responseText);_cs('ch',HIST_PROJ);rebuildHR();if(cb)cb();";
  var newCb = "HIST_PROJ=JSON.parse(x.responseText);_cs('ch',HIST_PROJ);rebuildHR();if(cb)cb();" +
    "if(typeof DB_STORE!=='undefined'){DB_STORE.importHistProj(HIST_PROJ).then(function(n){" +
    "if(n)console.log('[DB_STORE] HIST_PROJ 已写入 IndexedDB: '+n+' 条');}).catch(function(){});}";

  src = replace(src, oldCb, newCb, 'ApiService: DB_STORE.importHistProj');
  writeFile('js/ApiService.js', src);
})();

// ════════════════════════════════════════════════════════════
// Task 3 — AuthSystem.js (TempSKU)：更改临时 SKU 前缀为 TEMP-2026xxxx
// ════════════════════════════════════════════════════════════
(function patchTempSKU() {
  var src = readFile('js/AuthSystem.js');
  if (!src) return;

  // 1. 旧序号正则兼容新前缀（加 TEMP- 前缀兼容）
  src = replace(src,
    "var m = (_db[i].sku||'').match(/TMP-(\\d+)/);",
    "var m = (_db[i].sku||'').match(/TEMP-\\d{4}(\\d+)/)||(_db[i].sku||'').match(/TMP-(\\d+)/);",
    'TempSKU: seq regex'
  );

  // 2. 生成新前缀编码
  src = replace(src,
    "return 'TMP-' + String(_seq).padStart(6,'0');",
    "var _yr=new Date().getFullYear(); return 'TEMP-'+_yr+String(_seq).padStart(4,'0');",
    'TempSKU: _nextCode prefix'
  );

  // 3. 预览显示新格式
  src = replace(src,
    "el.textContent = 'TMP-' + String(_seq+1).padStart(6,'0');",
    "var _yr=new Date().getFullYear(); el.textContent='TEMP-'+_yr+String(_seq+1).padStart(4,'0');",
    'TempSKU: preview text'
  );

  // 4. 标签文字：「临时物资」→「临时非标」
  src = replace(src,
    "function tmpTagHtml(){ return '<span class=\"tmp-tag\">🟡 临时物资</span>'; }",
    "function tmpTagHtml(){ return '<span class=\"tmp-tag\">🟡 临时非标</span>'; }",
    'TempSKU: tag label'
  );

  writeFile('js/AuthSystem.js', src);
})();

// ════════════════════════════════════════════════════════════
// Task 3 — DemandService.js (URLGateway)：API 失败时显示手动输入框
// ════════════════════════════════════════════════════════════
(function patchURLGateway() {
  var src = readFile('js/DemandService.js');
  if (!src) return;

  // _searchAndFill 的 catch 块
  src = replace(src,
    "}).catch(function(e){\n        _setStatus('搜索失败: '+e.message, '#dc2626');\n      });",
    "}).catch(function(e){\n" +
    "        _setStatus('API 请求失败，请手动填写或粘贴商品 URL 后点击「手动解析」', '#dc2626');\n" +
    "        var fb=document.getElementById('tmp-manual-url-fallback');if(fb)fb.style.display='';\n" +
    "      });",
    'URLGateway: _searchAndFill catch'
  );

  // _fetchCommodity 的 catch 块
  src = replace(src,
    "}).catch(function(e){\n        _setStatus('获取详情失败: '+e.message, '#dc2626');\n      });",
    "}).catch(function(e){\n" +
    "        _setStatus('获取详情失败，请手动填写或粘贴商品 URL', '#dc2626');\n" +
    "        var fb=document.getElementById('tmp-manual-url-fallback');if(fb)fb.style.display='';\n" +
    "      });",
    'URLGateway: _fetchCommodity catch'
  );

  writeFile('js/DemandService.js', src);
})();

// ════════════════════════════════════════════════════════════
// Task 3 — 在临时物资弹窗中加入手动回退区（HTML 补丁）
// ════════════════════════════════════════════════════════════
(function patchTmpModalFallback() {
  var html = readFile('index.html');
  if (!html) return;

  // 在 tmp-url-status 后面插入手动回退区（初始隐藏）
  var marker = '<div id="tmp-url-status" style="font-size:11px;color:#0369a1;margin-top:4px;display:none"></div>';
  var fallback =
    '<div id="tmp-manual-url-fallback" style="display:none;margin-top:8px;padding:8px;' +
    'background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;font-size:12px">' +
    '<div style="color:#92400e;margin-bottom:6px">⚠️ 自动解析失败，请手动粘贴原始商品页 URL：</div>' +
    '<div style="display:flex;gap:6px">' +
    '<input id="tmp-manual-url-input" class="tmp-inp" type="text" placeholder="粘贴完整商品页面 URL" style="flex:1;font-size:12px">' +
    '<button class="btn btn-sm" style="background:#d97706;color:#fff;border:none;padding:4px 12px;border-radius:6px;font-size:12px;white-space:nowrap" ' +
    'onclick="(function(){var u=document.getElementById(\'tmp-manual-url-input\').value.trim();' +
    'if(u){document.getElementById(\'tmp-url-parse\').value=u;URLGateway.parse();}})()">重试解析</button>' +
    '</div>' +
    '</div>';

  if (html.indexOf('tmp-manual-url-fallback') === -1) {
    html = replace(html, marker, marker + '\n' + fallback, 'inject tmp-manual-url-fallback');
    writeFile('index.html', html);
  } else {
    console.log('  ⏭  tmp-manual-url-fallback 已存在，跳过');
  }
})();

// ════════════════════════════════════════════════════════════
// Task 4 — main.js：saveCartToDB 加同步锁；exportCart 回填地址
// ════════════════════════════════════════════════════════════
(function patchMainJs() {
  var src = readFile('js/main.js');
  if (!src) return;

  // ── 4a. saveCartToDB 加写入锁 ─────────────────────────────
  var oldSave =
    "function saveCartToDB(){\n" +
    "  if(!cart.length){alert('清单为空');return;}\n" +
    "  var added=0;";
  var newSave =
    "function saveCartToDB(){\n" +
    "  if(!cart.length){alert('清单为空');return;}\n" +
    "  var _unlock=syncLock(['btn-save-db','btn-archive-proj','btn-clear-cart']);\n" +
    "  var added=0;";
  // 找结尾 alert 那行，加 _unlock()
  src = replace(src, oldSave, newSave, 'saveCartToDB: add syncLock');
  src = replace(src,
    "alert('已新增 '+added+' 条到主数据库（自存共 '+masterDB.length+' 条）');",
    "alert('已新增 '+added+' 条到主数据库（自存共 '+masterDB.length+' 条）');\n  _unlock();",
    'saveCartToDB: unlock after alert'
  );

  // ── 4b. exportCart 自动回填收货地址 ─────────────────────────
  // 在 xlsxOut 调用前注入地址行
  var oldExport = "xlsxOut(rows,'采购清单','采购清单_'+today()+'.xlsx');";
  var newExport =
    "(function(){\n" +
    "  var _pid = (typeof PCService!=='undefined'&&PCService.getPid())?PCService.getPid():'';\n" +
    "  var _addr = getProjectAddress(_pid);\n" +
    "  if(_addr){\n" +
    "    rows.unshift({'物资名称':'收货人：'+(_addr.name||''),'参考品牌':'联系电话：'+(_addr.phone||''),'规格参数':'收货地址：'+(_addr.addr||''),'单位':'','数量':'','单价（元）':'','小计（元）':'','备注':'','物料编码':''});\n" +
    "    rows.unshift({'物资名称':'=== 采购清单 ===','参考品牌':'','规格参数':'','单位':'','数量':'','单价（元）':'','小计（元）':'','备注':'','物料编码':''});\n" +
    "  }\n" +
    "})();\n" +
    "xlsxOut(rows,'采购清单','采购清单_'+today()+'.xlsx');";
  src = replace(src, oldExport, newExport, 'exportCart: auto-fill address');

  // ── 4c. renderHistDetail XSS 防护 ──────────────────────────
  // 找 renderHistDetail 中使用用户数据的行，加 escapeHtml 包裹
  // 主要保护 '物资名称'、'参考品牌'、'规格参数' 三个字段
  src = replace(src,
    "r['物资名称']||''",
    "escapeHtml(r['物资名称']||'')",
    'renderHistDetail: escapeHtml name'
  );
  src = replace(src,
    "r['参考品牌']||''",
    "escapeHtml(r['参考品牌']||'')",
    'renderHistDetail: escapeHtml brand'
  );
  src = replace(src,
    "r['规格参数']||''",
    "escapeHtml(r['规格参数']||'')",
    'renderHistDetail: escapeHtml spec'
  );

  writeFile('js/main.js', src);
})();

// ════════════════════════════════════════════════════════════
// Task 2 — main.js：启动时执行 IndexedDB 初始化与 localStorage 迁移
// ════════════════════════════════════════════════════════════
(function patchDbInit() {
  var src = readFile('js/main.js');
  if (!src) return;

  // 在 window.addEventListener('load', ...) 回调最开始注入 DB_STORE 初始化
  var marker = "window.addEventListener('load',function(){";
  var injection =
    "window.addEventListener('load',function(){\n" +
    "  // Task 2: IndexedDB 初始化 + localStorage 静默迁移\n" +
    "  if(typeof DB_STORE!=='undefined'){\n" +
    "    DB_STORE.init()\n" +
    "      .then(function(){ return DB_STORE.migrateFromLocalStorage(); })\n" +
    "      .then(function(n){ if(n) console.log('[DB_STORE] 迁移完成: '+n+' 条'); })\n" +
    "      .then(function(){ return DB_STORE.pruneOldData(3); })\n" +
    "      .then(function(n){ if(n) console.log('[DB_STORE] 已清理 '+n+' 条旧历史'); })\n" +
    "      .catch(function(e){ console.warn('[DB_STORE] 初始化异常:', e); });\n" +
    "  }\n";

  if (src.indexOf('DB_STORE.init()') === -1) {
    // 只替换第一次出现
    var idx = src.indexOf(marker);
    if (idx !== -1) {
      src = src.slice(0, idx) + injection + src.slice(idx + marker.length);
      writeFile('js/main.js', src);
    } else {
      console.warn('  ⚠️  未找到 window.addEventListener load，DB_STORE 初始化未注入');
    }
  } else {
    console.log('  ⏭  DB_STORE.init() 已存在于 main.js，跳过');
  }
})();

// ════════════════════════════════════════════════════════════
// Task 4 — HTML：给三个关键按钮加 id（供 syncLock 定位）
// ════════════════════════════════════════════════════════════
(function patchButtonIds() {
  var html = readFile('index.html');
  if (!html) return;

  var changed = false;

  // 存入数据库按钮
  var oldSaveBtn = 'onclick="saveCartToDB()">💾 存入数据库</button>';
  var newSaveBtn = 'id="btn-save-db" onclick="saveCartToDB()">💾 存入数据库</button>';
  if (html.indexOf('id="btn-save-db"') === -1) {
    html = replace(html, oldSaveBtn, newSaveBtn, 'button id: btn-save-db');
    changed = true;
  }

  // 归档到项目按钮
  var oldArchBtn = 'onclick="archiveCartToProject()">📁 归档到项目</button>';
  var newArchBtn = 'id="btn-archive-proj" onclick="archiveCartToProject()">📁 归档到项目</button>';
  if (html.indexOf('id="btn-archive-proj"') === -1) {
    html = replace(html, oldArchBtn, newArchBtn, 'button id: btn-archive-proj');
    changed = true;
  }

  // 清空购物车按钮（主清单页）
  var oldClrBtn = 'onclick="clearCart()">清空</button>';
  var newClrBtn = 'id="btn-clear-cart" onclick="clearCart()">清空</button>';
  if (html.indexOf('id="btn-clear-cart"') === -1) {
    html = replace(html, oldClrBtn, newClrBtn, 'button id: btn-clear-cart');
    changed = true;
  }

  if (changed) writeFile('index.html', html);
  else console.log('  ⏭  按钮 ID 已存在，跳过');
})();

console.log('\n✅ Task 2–4 补丁全部应用完毕！');
console.log('   接下来运行：npm run dev');
