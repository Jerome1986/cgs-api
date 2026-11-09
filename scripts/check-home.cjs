// 使用测试库现有管理员只读验证首页接口，不输出令牌或数据库凭据。
require('reflect-metadata')
process.loadEnvFile()
const assert = require('node:assert/strict')
const { NestFactory } = require('@nestjs/core')
const { JwtService } = require('@nestjs/jwt')
const { AppModule } = require('../dist/src/app.module')
const { setupApp } = require('../dist/src/setup-app')
const { PrismaService } = require('../dist/src/prisma/prisma.service')

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false })
  try {
    setupApp(app)
    await app.listen(0, '127.0.0.1')
    const admin = await app.get(PrismaService).admin.findFirst({
      where: { role: 'ADMIN', status: true }, select: { id: true }
    })
    assert.ok(admin, '测试库需要一个可用管理员')
    const token = app.get(JwtService).sign({ sub: admin.id, role: 'ADMIN' })
    const url = await app.getUrl()
    for (const path of ['/api/admin/me', '/api/user-get?pagesNum=1&pagesSize=10', '/api/user-search-get']) {
      const response = await fetch(url + path, { headers: { Authorization: `Bearer ${token}` } })
      assert.equal(response.status, 200, `${path} 响应失败`)
      const body = await response.json()
      assert.equal(body.code, 200)
      if (path.includes('user-get')) {
        assert.ok(Array.isArray(body.data.list))
        assert.equal(typeof body.data.total, 'number')
      }
      console.log(`${path}: OK`)
    }
  } finally {
    await app.close()
  }
}
main().catch(() => { console.error('首页接口验证失败，请检查测试库或服务配置'); process.exitCode = 1 })
