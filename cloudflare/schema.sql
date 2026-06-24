-- ═══════════════════════════════════════════════════════════════
-- 城服公司物资采购管理系统 SKU25  —  Cloudflare D1 数据库 Schema
-- 执行方式：wrangler d1 execute <DB_NAME> --file=cloudflare/schema.sql
-- 更新于：2026-06  新增 sku_library 表、完整账号种子数据
-- ═══════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- 0. 清除旧表（按外键依赖逆序删除）
-- ────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS temp_skus;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS sku_library;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS projects;

-- ────────────────────────────────────────────────────────────────
-- 1. 项目表
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  code        TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────────
-- 2. 用户 / 角色表
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  username    TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'buyer'
                  CHECK(role IN ('buyer','hmq','admin')),
  project_id  TEXT,                      -- buyer 绑定项目；hmq/admin 为 NULL
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

-- ────────────────────────────────────────────────────────────────
-- 3. 标准物资库（含临时 SKU，is_temporary=1 代表待转正）
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sku_library (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,         -- SKU 编码（如 CSFW-AA-0001）
  name          TEXT NOT NULL,
  spec          TEXT DEFAULT '',
  unit          TEXT DEFAULT '',
  brand         TEXT DEFAULT '',
  category      TEXT DEFAULT '',
  is_temporary  INTEGER NOT NULL DEFAULT 0    -- 0: 全局标准; 1: 临时非标（归档后自动转正）
                    CHECK(is_temporary IN (0,1)),
  project_id    TEXT DEFAULT NULL,            -- NULL=全局通用; 非NULL=项目专属临时SKU
  last_price    REAL DEFAULT 0,
  updated_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_sku_project_temp ON sku_library(project_id, is_temporary);
CREATE INDEX IF NOT EXISTS idx_sku_category     ON sku_library(category);

-- ────────────────────────────────────────────────────────────────
-- 4. 采购订单主表（状态机核心）
-- 状态流转：pending_review → purchasing → received → archived
--           (任意态可 → rejected，驳回后采购员可重新提交)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  submitter_id  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending_review'
                    CHECK(status IN (
                      'pending_review',
                      'purchasing',
                      'received',
                      'archived',
                      'rejected'
                    )),
  reject_reason TEXT DEFAULT '',
  remark        TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(project_id)   REFERENCES projects(id),
  FOREIGN KEY(submitter_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_project ON orders(project_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);

-- ────────────────────────────────────────────────────────────────
-- 5. 订单明细表（归档时点数据快照）
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL,
  sku_code    TEXT NOT NULL,
  sku_name    TEXT NOT NULL,
  brand       TEXT DEFAULT '',
  spec        TEXT DEFAULT '',
  unit        TEXT DEFAULT '',
  qty         INTEGER NOT NULL DEFAULT 1,
  est_price   REAL    DEFAULT 0,
  is_temp     INTEGER NOT NULL DEFAULT 0
                  CHECK(is_temp IN (0,1)),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

-- ────────────────────────────────────────────────────────────────
-- 6. 临时 SKU 池（采购员紧急申报，HMQ 审核转正）
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS temp_skus (
  id            TEXT PRIMARY KEY,
  temp_code     TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  brand         TEXT DEFAULT '',
  spec          TEXT NOT NULL,
  unit          TEXT NOT NULL,
  est_price     REAL DEFAULT 0,
  purchase_link TEXT DEFAULT '',
  image_url     TEXT DEFAULT '',
  remark        TEXT DEFAULT '',
  project_id    TEXT NOT NULL,
  creator_id    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','approved','rejected')),
  std_sku_code  TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now')),
  reviewed_at   TEXT,
  reviewer_id   TEXT,
  FOREIGN KEY(project_id)  REFERENCES projects(id),
  FOREIGN KEY(creator_id)  REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_temp_status ON temp_skus(status);

-- ────────────────────────────────────────────────────────────────
-- 7. 操作审计日志
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  detail      TEXT DEFAULT '{}',
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- ════════════════════════════════════════════════════════════════
-- 8. 种子数据（首次部署执行）
-- ════════════════════════════════════════════════════════════════

-- ── 项目 ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO projects(id, name, code) VALUES
  ('proj_gc',  '雄安城服物业项目',   'GC-001'),
  ('proj_xc',  '西部城服广场项目',  'XC-002'),
  ('proj_nb',  '南滨物业项目',     'NB-003'),
  ('proj_bd',  '滨东物业项目',     'BD-004');

-- ── 管理员 & 招采主管 ──────────────────────────────────────────
INSERT OR IGNORE INTO users(id, name, username, password, role, project_id) VALUES
  ('usr_admin', '刘宾',   'admin', 'csfw2024admin', 'admin', NULL),
  ('usr_hmq',   '何梦琪', 'hmq',   'hmq',           'hmq',   NULL);

-- ── 采购员（初始密码 123456，首次登录建议修改）──────────────────
INSERT OR IGNORE INTO users(id, name, username, password, role, project_id) VALUES
  ('usr_wxy',  '王籽媛', 'wxy',  '123456', 'buyer', 'proj_gc'),
  ('usr_pmy',  '柏梦园', 'pmy',  '123456', 'buyer', 'proj_gc'),
  ('usr_cjj',  '崔晶晶', 'cjj',  '123456', 'buyer', 'proj_gc'),
  ('usr_ly',   '李玉',   'ly',   '123456', 'buyer', 'proj_gc'),
  ('usr_wxn',  '魏雪宁', 'wxn',  '123456', 'buyer', 'proj_xc'),
  ('usr_dyq',  '段娇奇', 'dyq',  '123456', 'buyer', 'proj_xc'),
  ('usr_lyj',  '李雨晴', 'lyj',  '123456', 'buyer', 'proj_xc'),
  ('usr_zrf',  '张若菲', 'zrf',  '123456', 'buyer', 'proj_xc'),
  ('usr_bjl',  '薄佳乐', 'bjl',  '123456', 'buyer', 'proj_nb'),
  ('usr_zyn',  '赵一诺', 'zyn',  '123456', 'buyer', 'proj_nb'),
  ('usr_wzh',  '王兆辉', 'wzh',  '123456', 'buyer', 'proj_nb'),
  ('usr_zww',  '赵微微', 'zww',  '123456', 'buyer', 'proj_nb'),
  ('usr_sy',   '苏颖',   'sy',   '123456', 'buyer', 'proj_bd'),
  ('usr_wnn',  '王宁宁', 'wnn',  '123456', 'buyer', 'proj_bd'),
  ('usr_chs',  '池胜洋', 'chs',  '123456', 'buyer', 'proj_bd'),
  ('usr_ds',   '杜淼',   'ds',   '123456', 'buyer', 'proj_bd'),
  ('usr_lqj',  '卢晴晴', 'lqj',  '123456', 'buyer', 'proj_gc'),
  ('usr_czh',  '崔梓涵', 'czh',  '123456', 'buyer', 'proj_xc'),
  ('usr_wjm',  '王嘉铭', 'wjm',  '123456', 'buyer', 'proj_nb');
