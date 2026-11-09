# nestModel

基于 NestJS 11、Prisma 7 和 MariaDB 的后端，包含管理员登录及设置、业务用户管理和通用基础设施。管理员资料、头像和改密见 [管理员设置接口](./管理员设置接口.md)，业务用户写操作与搜索分页见 [用户管理接口](./用户管理接口.md)，订单管理见 [订单管理接口](./订单管理接口.md)，水印管理与Electron随机读取见 [水印管理接口](./水印管理接口.md)，商品、素材等模块见对应接口文档。

## 已保留内容

- `POST /api/admin/login` 管理员登录
- bcrypt 密码校验与 JWT 签发
- Prisma 全局数据库模块和精简 `Admin` 模型
- 全局 DTO 校验、CORS、`/api` 前缀和统一响应结构
- 单元测试和基础 e2e 测试

## 初始化

```bash
pnpm install
pnpm prisma:generate
pnpm exec prisma db push
pnpm start:dev
```

请先修改 `.env` 中的数据库连接和 JWT 密钥。`admin` 表完全为空时，首次登录会使用此次用户名和密码创建启用的 `ADMIN` 账号，并继续完成登录；密码以 bcrypt 哈希保存。表中存在任何账号（包括禁用账号及其他角色）时均不会自动创建或覆盖账号。空库部署后应及时完成首次登录，首个成功初始化的请求将取得管理员权限。

必需配置：`DATABASE_URL`（MySQL 连接串）、`JWT_SECRET`（随机密钥）；可选 `JWT_EXPIRES_IN`（默认 `7d`）。

首次创建管理员：在环境中设置 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 后，于本目录执行 `node scripts/create-admin.cjs`。脚本只创建角色为 `ADMIN` 的账号，账号已存在时拒绝覆盖。创建后清除临时凭据环境变量。不要将明文凭据提交到仓库。

管理端位于相邻 `cgs` 目录，执行 `pnpm dev` 后打开 `/cgs/login`。开发环境将 `/api` 代理至 `http://localhost:3000`。生产环境需将 `/api` 反向代理到后端，或在构建前设置 `VITE_API_BASE_URL` 为后端域名（不带 `/api`）。其他业务模块尚未在此后端实现。

`GET /api/admin/me` 使用 `Authorization: Bearer <token>`，校验签名、有效期、账号状态、管理员角色及令牌版本。管理业务接口复用 `AdminAuthGuard`。普通退出清除浏览器凭据；修改密码递增令牌版本，使此前签发的全部令牌失效。管理员资料增量迁移和配置见 [管理员设置接口](./管理员设置接口.md)，部署新服务前先应用对应迁移。

登录失败返回 HTTP 401，无后台权限返回 HTTP 403，DTO 校验失败返回 HTTP 400。成功返回 HTTP 200。

## 登录接口

后台首页依赖 `GET /api/admin/me` 和 `GET /api/user-get?pagesNum=1&pagesSize=10&keyword=`，均使用 Bearer 令牌鉴权，客户端不能通过 role 参数授权。分页大小限定1–100，名称搜索下推后端，分页响应为 `data:{list,total}`；旧 `GET /api/user-search-get` 的 `data:[]` 仍保留兼容。

业务用户存储在独立 `users` 表，`id` 为整数自增主键，响应使用 `id`、`username`、`role`、`status`、`coins`、`endDate`、`createdAt`，不再返回 MongoDB 的 `_id`。后台管理员的 `ADMIN` 权限与业务用户身份独立，管理员不会自动作为业务用户显示。新表无数据时首页显示空列表；旧 MongoDB 数据未导入。新增、编辑、删除及状态修改现已实现，字段、权限及金币并发约束见 [用户管理接口](./用户管理接口.md)。

测试库可直接使用 `pnpm exec prisma db push` 同步结构，不需要清空管理员。构建后可运行 `node scripts/check-home.cjs` 使用现有管理员在真实测试库上只读验证首页三个接口；这项检查内部签发测试请求令牌，不需要明文密码，不等同浏览器登录验收。

管理端使用 `node --test scripts/login-flow.test.cjs` 验证路由守卫与首页失败重试行为。401/403 会清理身份并跳转登录；网络或500错误保留登录状态，业务查询仍由后端鉴权。

```http
POST /api/admin/login
Content-Type: application/json

{
  "username": "admin",
  "password": "123456"
}
```

成功响应：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "...",
    "userInfo": {
      "id": 1,
      "username": "admin",
      "role": "ADMIN"
    }
  }
}
```

## 分类管理（后台维护，Electron复用）

分类按模型、贴图、灯光、材质分组，支持最多三级。后台入口保留 `/cate/firstcate`、`/cate/subcate`、`/cate/thirdcate`，共用分类管理页面与表单。支持分页、中文/英文关键字查询、创建子分类、编辑名称和排序、删除。搜索在当前类型、层级及选中父分类范围内执行，搜索条件翻页时保留；父分类选择器读取完整树。

新接口统一返回 `{ code: 200, message: 'success', data }`，ID为整数，字段为camelCase。

| 方法与完整路径 | 权限 | 输入 | data |
| --- | --- | --- | --- |
| GET `/api/categories` | 管理员Bearer令牌 | Query：可选type、level(1–3)、parentId、search；pageNum默认1、pageSize默认10且最多100 | `{ list, total, pageNum, pageSize }`，list包含parentName |
| GET `/api/categories/tree` | 公开字典 | Query：type必填，模型/贴图/灯光/材质 | 完整树数组，子节点字段children |
| POST `/api/categories` | 管理员Bearer令牌 | Body：name(1–50)、enName(1–100)、type、sort(非负整数)；parentId可选，不传为一级 | 创建后的分类，HTTP 201 |
| PATCH `/api/categories/:id` | 管理员Bearer令牌 | Body：name、enName、sort，全部必填 | 更新后的分类 |
| DELETE `/api/categories/:id` | 管理员Bearer令牌 | 正整数路径id | `{ id }` |
| GET `/cate-first` | 公开字典，Electron旧路径，无/api前缀 | Query：pageType | 一级分类数组，保留_id字符串、en_name等旧字段 |
| GET `/cate-sub` | 公开字典，Electron旧路径，无/api前缀 | Query：cateId（十进制ID字符串或NEW/ALL） | `[{ ...parent, subCategories: [] }]`，虚拟入口返回空子列表 |

新后台与新客户端应复用 `/api/categories/tree` 和整数id。旧Electron接口仅在适配层输出 `_id`，数据库无MongoDB字段。NEW/ALL为虚拟入口，不建记录。Electron源码未修改，其当前远程baseURL仍需指向实际部署了本服务的域名；本轮未部署，也不表示素材接口已经完成。旧后台分类路径由新管理页面替换，不为不再使用的后台表单提供整套旧写接口；素材上传页面仍使用的分类树查询已在后台API封装中适配。

父子类型必须一致，层级由服务端计算，最多三级；编辑不允许移动父级或变更素材类型，避免制造循环与跨类型树。删除仅允许叶子分类，存在子分类返回409，查询不存在返回404，非法参数400，无身份401，无管理员权限403。名称不预设同级唯一约束，排序按sort、id升序。素材模型现已实现，分类引用外键使用Restrict；浏览器已验证被素材引用的分类删除返回冲突，保留原分类。

分类Schema位于 `prisma/schema.prisma`，表与9个持久化字段均有中文说明及真实MySQL COMMENT。测试库按既定方式执行 `node scripts/setup-categories.cjs` 增量创建表，不清库；固定DDL保存在 `scripts/sql/categories.sql`。此脚本不作为生产迁移工具。

构建后执行 `node scripts/check-categories.cjs` 可在真实测试库验证CRUD、查询、层级、权限及Electron响应；仅创建本次测试分类，最后按逆序删除。后台执行 `node --test scripts/category-flow.test.cjs` 验证空父分类、错误重试、迟到响应隔离与表单重置。浏览器主要流程已完成，见 [后台浏览器验收报告](./后台浏览器验收报告.md)；Electron实际设备操作未验收。

## Electron 用户认证

已实现注册、登录和当前用户资料，兼容三个旧路径及`/api`前缀。详见[客户端用户认证接口](./客户端用户认证接口.md)。已有无密码用户不会自动分配密码。

收藏、下载授权、每日额度、本机筛选与多文件下载已接入，详见[客户端收藏与下载接口](./客户端收藏与下载接口.md)。新增数据表仅已应用到本机开发库。更新后需重启后端与Electron主进程。支付最后对接；以图搜图按项目范围仅保留“仍在开发中”提示。

## 常用命令

```bash
pnpm build
pnpm test
pnpm test:e2e
pnpm lint
```
