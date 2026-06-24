# 云端部署指南 — Cloudflare Pages + D1

## 前提条件

- Cloudflare 账号 + Pages 项目（`csfw-purchase`）
- `wrangler` CLI 已安装：`npm i -g wrangler`
- 已通过 `wrangler login` 完成认证

---

## Step 1 — 创建 D1 数据库

```bash
# 创建数据库（名称可自定义）
wrangler d1 create sku25_db

# 记录输出的 database_id，填入 wrangler.toml
```

## Step 2 — 配置 wrangler.toml

在项目根目录创建 `wrangler.toml`：

```toml
name = "csfw-purchase"
compatibility_date = "2024-01-01"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "sku25_db"
database_id = "<你的 database_id>"
```

## Step 3 — 初始化数据库表结构

```bash
# 本地测试环境
wrangler d1 execute sku25_db --local --file=cloudflare/schema.sql

# 生产环境
wrangler d1 execute sku25_db --file=cloudflare/schema.sql
```

## Step 4 — 部署 Functions

将 `cloudflare/functions/` 目录复制到 Pages 项目的 `functions/` 目录，然后：

```bash
wrangler pages deploy dist --project-name=csfw-purchase
```

Cloudflare Pages 会自动识别 `functions/api/*.js` 并生成对应路由：
- `POST /api/login`
- `GET  /api/login`
- `GET/POST /api/orders`
- `PATCH /api/orders/:id/status`
- `GET/POST /api/projects`
- `GET/POST /api/temp-skus`
- `PATCH /api/temp-skus/:id/promote`

## Step 5 — 部署前端

```bash
# 构建单文件（原有系统）
npm run build    # 生成 dist/index.html

# 同时将新的多角色门户复制到 dist/
cp src/portal.html dist/portal.html
```

访问地址：
- 原有系统：`https://csfw-purchase.pages.dev/`
- 新多角色门户：`https://csfw-purchase.pages.dev/portal.html`

---

## 账号汇总（已内置于 schema.sql）

| 账号 | 密码 | 姓名 | 角色 | 所属项目 |
|------|------|------|------|---------|
| hmq | hmq | 何梦琪 | 招采主管 | — |
| admin | csfw2024admin | 刘宾 | 管理员 | — |
| wxy | 123456 | 王籽媛 | 采购员 | 绿城物业项目 |
| pmy | 123456 | 柏梦园 | 采购员 | 绿城物业项目 |
| cjj | 123456 | 崔晶晶 | 采购员 | 绿城物业项目 |
| ly | 123456 | 李玉 | 采购员 | 绿城物业项目 |
| lqj | 123456 | 卢晴晴 | 采购员 | 绿城物业项目 |
| wxn | 123456 | 魏雪宁 | 采购员 | 西部城服广场项目 |
| dyq | 123456 | 段娇奇 | 采购员 | 西部城服广场项目 |
| lyj | 123456 | 李雨晴 | 采购员 | 西部城服广场项目 |
| zrf | 123456 | 张若菲 | 采购员 | 西部城服广场项目 |
| czh | 123456 | 崔梓涵 | 采购员 | 西部城服广场项目 |
| bjl | 123456 | 薄佳乐 | 采购员 | 南滨物业项目 |
| zyn | 123456 | 赵一诺 | 采购员 | 南滨物业项目 |
| wzh | 123456 | 王兆辉 | 采购员 | 南滨物业项目 |
| zww | 123456 | 赵微微 | 采购员 | 南滨物业项目 |
| wjm | 123456 | 王嘉铭 | 采购员 | 南滨物业项目 |
| sy | 123456 | 苏颖 | 采购员 | 滨东物业项目 |
| wnn | 123456 | 王宁宁 | 采购员 | 滨东物业项目 |
| chs | 123456 | 池胜洋 | 采购员 | 滨东物业项目 |
| ds | 123456 | 杜淼 | 采购员 | 滨东物业项目 |

> 初始密码 `123456` 首次登录后建议立即修改。

---

## API 权限矩阵

| 接口 | 采购员(buyer) | 招采部(hmq/admin) |
|------|:---:|:---:|
| POST /api/login | ✅ | ✅ |
| GET /api/skus?type=library | ✅ | ✅ |
| GET /api/skus?type=history | ✅ | ✅ |
| POST /api/skus（临时SKU入库） | ✅ | ✅ |
| GET /api/orders（自己项目） | ✅ | ✅ |
| GET /api/orders（全项目） | ❌ | ✅ |
| POST /api/orders（提交申请） | ✅ | ❌ |
| PATCH orders approve/reject | ❌ | ✅ |
| PATCH orders receive | ✅ | ✅ |
| PATCH orders archive（+临时SKU自动转正） | ❌ | ✅ |
| POST /api/temp-skus | ✅ | ❌ |
| PATCH temp-skus promote | ❌ | ✅ |
| POST /api/projects | ❌ | ✅ |

---

## 订单状态机

```
        采购员提交
            ↓
      pending_review（待审核）
       ↙         ↘
   rejected     purchasing（采购中）
（HMQ驳回）         ↓
   ↓          received（已收货）
  重新提交          ↓
              archived（已归档）
                  ↓
             临时SKU转正弹窗（可选）
```
