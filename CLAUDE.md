# 城服公司物资采购管理系统 — 项目规则

## 项目概况

物业行业多项目集中采购协同系统，基于 Cloudflare Pages + D1 + Functions 全栈架构。

- 生产地址：https://csfw-purchase.pages.dev
- 测试地址：https://dev.csfw-purchase.pages.dev
- GitHub 仓库：包含 main（生产）和 dev（测试）两个分支

---

## 分支与数据库隔离（核心规则）

| 分支 | 部署环境 | D1 数据库 | 用途 |
|------|----------|-----------|------|
| `main` | 生产 https://csfw-purchase.pages.dev | `cfgs-purchase-db` | 真实订单，采购员日常使用 |
| `dev` | 测试 https://dev.csfw-purchase.pages.dev | `cfgs-purchase-db-dev` | 开发测试，随便折腾 |

**铁律：**
- 所有代码改动只推 `dev` 分支，绝不直接推 `main`
- `main` 只接受从 `dev` 合并过来的、经过测试的代码
- 不需要每次新建分支，`dev` 分支长期存在，直接在上面开发

---

## 文件结构

```
src/
  index.html          # 主页面
  portal.html         # 招采部HMQ页面
  js/
    main.js           # 核心逻辑（物资库、搜索、购物车）
    AuthSystem.js     # 用户登录与角色管理
    DemandService.js  # 需求单/订单服务
    HMQView.js        # 招采部视图逻辑
    RoleRouter.js     # 角色路由
    OrderStatusTag.js # 订单状态标签
  css/
    layout.css        # 主样式
dist/                 # 构建产物（同步修改 src 时也要更新 dist）
functions/api/        # Cloudflare Functions 后端接口
cloudflare/           # Cloudflare 部署配置
```

**重要：** 修改 `src/` 下的源码后，对应的 `dist/` 内的文件也要同步更新（两个文件保持一致），因为 Cloudflare Pages 部署的是 dist 目录。

---

## 角色说明

| 角色ID | 姓名 | 角色 | 说明 |
|--------|------|------|------|
| `hmq` | 何梦琪 | manager | 招采部，有审核/归档权限 |
| `admin` | 管理员 | admin | 系统管理 |
| 采购员 | 各项目人员 | buyer | 只能看本项目订单 |

---

## 开发规范

1. **每次只改 src/ 源码**，同步更新 dist/ 对应文件
2. **不引入外部依赖**（无爬虫、无第三方API调用）
3. **后端状态机**：订单状态流转只走后端，前端不直接改状态
4. **数据隔离**：采购员 API 请求必须带 project_id，不得越权
5. **搜索框**不保留浏览器自动填充内容（用 type="search" + 多次清空兜底）

---

## 订单状态机

```
购物车 → pending_review（待审核）→ purchasing（采购中）→ received（已收货）→ archived（已归档）
```

归档时后端自动将临时SKU（is_temporary=1）转为全局通用SKU（is_temporary=0, project_id=0）。

---

## 日常开发流程

```
改代码 (src/ + dist/)
  ↓
git add . && git commit -m "描述改动"
  ↓
git push origin dev          ← 推测试，Cloudflare 自动部署（约1分钟）
  ↓
在 https://dev.csfw-purchase.pages.dev 验证
  ↓
验证通过 → git checkout main → git merge dev → git push origin main
  ↓
生产自动更新，采购员零感知
```
