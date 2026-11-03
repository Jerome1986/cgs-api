# nestModel

基于 NestJS 11、Prisma 7 和 MariaDB 的精简后端模板。项目仅保留管理员登录及通用基础设施，不包含用户、商品、分类、订单等业务模块。

## 已保留内容

- `POST /api/admin/login` 管理员登录
- bcrypt 密码校验与 JWT 签发
- Prisma 全局数据库模块和精简 `Admin` 模型
- 全局 DTO 校验、CORS、`/api` 前缀和统一响应结构
- 单元测试和基础 e2e 测试

## 初始化

```bash
pnpm install
Copy-Item .env.example .env
pnpm prisma:generate
pnpm prisma:migrate -- --name init
pnpm start:dev
```

请先修改 `.env` 中的数据库连接和 JWT 密钥。首次登录前，需要在 `admin` 表中写入一条管理员数据；`password` 必须是 bcrypt 哈希，不能保存明文。

## 登录接口

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

## 常用命令

```bash
pnpm build
pnpm test
pnpm test:e2e
pnpm lint
```
