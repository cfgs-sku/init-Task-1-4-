// db.js — IndexedDB Promise 封装
// Task 2: 替代 localStorage 的 masterDB_v1 / HIST_RECORDS 持久化
// ════════════════════════════════════════════════════════════════
// 用法：
//   DB_STORE.init().then(function(){ ... });
//   DB_STORE.getAllRecords().then(function(rows){ ... });
//   DB_STORE.putRecord(obj).then(function(){ ... });
//   DB_STORE.deleteRecord(id).then(function(){ ... });
//   DB_STORE.getByProject(projName).then(function(rows){ ... });
//   DB_STORE.getByMonth(yyyymm).then(function(rows){ ... });  // 格式: '202506'
//   DB_STORE.pruneOldData(3).then(function(n){ ... });       // 保留最近 n 月
// ════════════════════════════════════════════════════════════════

var DB_STORE = (function(){
  'use strict';

  var DB_NAME    = 'sku25_purchase_db';
  var DB_VERSION = 1;
  var STORE_SKU  = 'masterDB';   // 主物资库（原 masterDB_v1 localStorage）
  var STORE_HIST = 'histRecords'; // 采购历史（原 HIST_RECORDS）

  var _db = null; // IDBDatabase 实例

  /** 通用 Promise 化 IDBRequest */
  function _wrap(req) {
    return new Promise(function(resolve, reject) {
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror   = function(e) { reject(e.target.error); };
    });
  }

  /** 打开/初始化数据库 */
  function init() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function(e) {
        var db = e.target.result;

        // 主物资库
        if (!db.objectStoreNames.contains(STORE_SKU)) {
          var skuStore = db.createObjectStore(STORE_SKU, { keyPath: 'code' });
          skuStore.createIndex('name',  'name',  { unique: false });
          skuStore.createIndex('cat',   'cat',   { unique: false });
          skuStore.createIndex('isTemp','isTemp', { unique: false });
        }

        // 采购历史
        if (!db.objectStoreNames.contains(STORE_HIST)) {
          var histStore = db.createObjectStore(STORE_HIST, { keyPath: '_id', autoIncrement: true });
          histStore.createIndex('proj',  'proj',  { unique: false });
          histStore.createIndex('month', 'month', { unique: false });
          histStore.createIndex('ym',    'ym',    { unique: false }); // 'YYYYMM'
        }
      };

      req.onsuccess = function(e) {
        _db = e.target.result;
        resolve(_db);
      };

      req.onerror = function(e) {
        console.error('[DB_STORE] 打开失败', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /** 获取事务 + store 的快捷方式 */
  function _store(storeName, mode) {
    var tx = _db.transaction(storeName, mode || 'readonly');
    return tx.objectStore(storeName);
  }

  // ── SKU 主库 CRUD ─────────────────────────────────────────────

  function getAllSKU() {
    return init().then(function() {
      return _wrap(_store(STORE_SKU).getAll());
    });
  }

  function getSKU(code) {
    return init().then(function() {
      return _wrap(_store(STORE_SKU).get(code));
    });
  }

  function putSKU(skuObj) {
    return init().then(function() {
      return _wrap(_store(STORE_SKU, 'readwrite').put(skuObj));
    });
  }

  function deleteSKU(code) {
    return init().then(function() {
      return _wrap(_store(STORE_SKU, 'readwrite').delete(code));
    });
  }

  function getSKUByIndex(indexName, value) {
    return init().then(function() {
      return _wrap(_store(STORE_SKU).index(indexName).getAll(value));
    });
  }

  // ── 历史记录 CRUD ─────────────────────────────────────────────

  function getAllRecords() {
    return init().then(function() {
      return _wrap(_store(STORE_HIST).getAll());
    });
  }

  function putRecord(histObj) {
    // 自动注入 ym 字段（用于按月剪枝）
    if (histObj.month && !histObj.ym) {
      // month 格式为 '2026年06月' 或 '202606' 或 '2026-06'
      var m = String(histObj.month).replace(/\D/g, '');
      histObj.ym = m.slice(0, 6); // 取前6位 YYYYMM
    }
    return init().then(function() {
      return _wrap(_store(STORE_HIST, 'readwrite').put(histObj));
    });
  }

  function deleteRecord(id) {
    return init().then(function() {
      return _wrap(_store(STORE_HIST, 'readwrite').delete(id));
    });
  }

  function getByProject(projName) {
    return init().then(function() {
      return _wrap(_store(STORE_HIST).index('proj').getAll(projName));
    });
  }

  function getByMonth(yyyymm) {
    // yyyymm: '202506'
    return init().then(function() {
      return _wrap(_store(STORE_HIST).index('ym').getAll(String(yyyymm)));
    });
  }

  /**
   * 剪枝：删除 nMonths 个月前的历史记录（仅保留最近 n 个自然月）
   * 返回 Promise<number>（删除条数）
   */
  function pruneOldData(nMonths) {
    nMonths = nMonths || 3;
    var now   = new Date();
    var cutoff = new Date(now.getFullYear(), now.getMonth() - nMonths, 1);
    var cutYM  = cutoff.getFullYear() * 100 + (cutoff.getMonth() + 1); // number

    return getAllRecords().then(function(rows) {
      var toDelete = rows.filter(function(r) {
        var ym = parseInt(r.ym || '0', 10);
        return ym > 0 && ym < cutYM;
      });

      return init().then(function() {
        var tx    = _db.transaction(STORE_HIST, 'readwrite');
        var store = tx.objectStore(STORE_HIST);
        toDelete.forEach(function(r) { store.delete(r._id); });
        return new Promise(function(resolve, reject) {
          tx.oncomplete = function() { resolve(toDelete.length); };
          tx.onerror    = function(e) { reject(e.target.error); };
        });
      });
    });
  }

  // ── localStorage 自动迁移 ─────────────────────────────────────

  /**
   * 静默迁移：将 localStorage 中旧数据一次性导入 IndexedDB
   * 成功后删除 localStorage key，避免重复迁移
   */
  function migrateFromLocalStorage() {
    return init().then(function() {
      var migrated = 0;

      // 1. 迁移 masterDB_v1（物资主库）
      try {
        var raw = localStorage.getItem('masterDB_v1');
        if (raw) {
          var arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) {
            var tx = _db.transaction(STORE_SKU, 'readwrite');
            var st = tx.objectStore(STORE_SKU);
            arr.forEach(function(item) {
              if (item && item.code) st.put(item);
            });
            return new Promise(function(resolve, reject) {
              tx.oncomplete = function() {
                console.log('[DB_STORE] 迁移 masterDB_v1：' + arr.length + ' 条');
                localStorage.removeItem('masterDB_v1');
                migrated += arr.length;
                resolve(migrated);
              };
              tx.onerror = function(e) { reject(e.target.error); };
            });
          }
        }
      } catch(e) {
        console.warn('[DB_STORE] masterDB_v1 迁移失败', e);
      }

      return migrated;
    }).then(function(count) {
      // 2. 迁移 HIST_RECORDS（历史记录快照）
      // 注意：HIST_RECORDS 是运行时重建的，源头是 localStorage 'ch' (HIST_PROJ)
      // 这里不直接迁移 HIST_RECORDS，而是在加载 HIST_PROJ 后写入 IndexedDB
      return count;
    });
  }

  /**
   * 将整个 HIST_PROJ 对象写入 IndexedDB（loadHistoryData 后调用）
   * HIST_PROJ 结构：{ projName: { 'YYYY年MM月': { items:[...] } } }
   */
  function importHistProj(histProj) {
    if (!histProj || !Object.keys(histProj).length) return Promise.resolve(0);
    return init().then(function() {
      var tx    = _db.transaction(STORE_HIST, 'readwrite');
      var store = tx.objectStore(STORE_HIST);
      var count = 0;

      Object.keys(histProj).forEach(function(projName) {
        var months = histProj[projName];
        Object.keys(months).forEach(function(monthLabel) {
          var items = months[monthLabel].items || [];
          var ym = monthLabel.replace(/\D/g,'').slice(0,6);
          items.forEach(function(it) {
            store.put({
              proj: projName, month: monthLabel, ym: ym,
              name: it.n||'', brand: it.b||'', spec: it.s||'',
              unit: it.u||'', qty: it.q||0, price: it.p||0,
              sub: it.sub||0, platform: it.pt||'', url: it.url||''
            });
            count++;
          });
        });
      });

      return new Promise(function(resolve, reject) {
        tx.oncomplete = function() { resolve(count); };
        tx.onerror    = function(e) { reject(e.target.error); };
      });
    });
  }

  // ── 公开 API ──────────────────────────────────────────────────
  return {
    init:                 init,
    // SKU 主库
    getAllSKU:            getAllSKU,
    getSKU:              getSKU,
    putSKU:              putSKU,
    deleteSKU:           deleteSKU,
    getSKUByIndex:       getSKUByIndex,
    // 历史记录
    getAllRecords:        getAllRecords,
    putRecord:           putRecord,
    deleteRecord:        deleteRecord,
    getByProject:        getByProject,
    getByMonth:          getByMonth,
    pruneOldData:        pruneOldData,
    // 迁移
    migrateFromLocalStorage: migrateFromLocalStorage,
    importHistProj:          importHistProj
  };
})();
