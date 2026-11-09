/** 本机开发库真实商品HTTP验收，仅清理本脚本创建的隔离商品。 */
require('reflect-metadata')
process.loadEnvFile()
const assert = require('node:assert/strict')
const { NestFactory } = require('@nestjs/core')
const { JwtService } = require('@nestjs/jwt')
const { AppModule } = require('../dist/src/app.module')
const { setupApp } = require('../dist/src/setup-app')
const { PrismaService } = require('../dist/src/prisma/prisma.service')

async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机开发库')
  const app = await NestFactory.create(AppModule, { logger: false })
  const created = []
  let prisma
  let checks = 0
  try {
    setupApp(app)
    await app.listen(0, '127.0.0.1')
    prisma = app.get(PrismaService)
    const original = JSON.stringify(await prisma.product.findMany({ orderBy: { id: 'asc' } }))
    const admin = await prisma.admin.findFirst({ where: { role: 'ADMIN', status: true }, select: { id: true } })
    assert.ok(admin, '需要现有可用管理员')
    const jwt = app.get(JwtService)
    const token = jwt.sign({ sub: admin.id, role: 'ADMIN' })
    const staff = jwt.sign({ sub: admin.id, role: 'STAFF' })
    const expired = jwt.sign({ sub: admin.id, role: 'ADMIN' }, { expiresIn: -1 })
    const base = await app.getUrl()
    const call = async (method, path, body, status = 200, auth = token) => {
      const response = await fetch(base + path, {
        method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
      const json = await response.json()
      assert.equal(response.status, status, method + ' ' + path + ': ' + JSON.stringify(json))
      assert.match(response.headers.get('content-type'), /application\/json/)
      if (status < 300) assert.equal(json.code, 200)
      checks++
      return json.data
    }
    const marker = '商品验收' + Date.now()
    const body = { productType: 'gold', productName: marker, price: 19.9, goldCoinsAmount: 100, description: '隔离测试商品' }
    for (const auth of [null, staff, expired, 'invalid']) {
      await call('GET', '/api/admin/products', undefined, 401, auth)
      await call('POST', '/products-add', body, 401, auth)
      await call('PUT', '/products-update', { ...body, _id: '1' }, 401, auth)
      await call('PUT', '/products-status', { _id: '1', isActive: false }, 401, auth)
      await call('DELETE', '/products-delete?id=1', undefined, 401, auth)
    }
    for (const changes of [{ price: 0 }, { price: 1.111 }, { goldCoinsAmount: 0 }, { role: 'ADMIN' }, { isActive: 'false' }])
      await call('POST', '/api/products-add', { ...body, ...changes }, 400)
    for (const type of ['gold', 'membership']) {
      const data = type === 'gold' ? body : { ...body, productType: type, membershipType: 'annual', dailyDownloadLimit: 30 }
      const added = await call('POST', '/api/products-add', data, 201)
      created.push(Number(added.insertedId))
    }
    const page = await call('GET', '/api/admin/products?pagesNumber=1&pagesSize=1&keyword=' + encodeURIComponent(marker))
    assert.equal(page.total, 2)
    assert.equal(page.list.length, 1)
    const all = await call('GET', '/products-get?keyword=' + encodeURIComponent(marker), undefined, 200, null)
    assert.equal(all.length, 2)
    assert.deepEqual(all.map(row => row.productType), ['金币充值', '购买会员'])
    assert.equal(all[0].price, 19.9)
    assert.equal(all[1].goldCoinsAmount, 0)
    const id = String(created[0])
    await call('PUT', '/api/products-status', { _id: id, isActive: false })
    const publicDown = await call('GET', '/api/products-get?isActive=false&keyword=' + encodeURIComponent(marker), undefined, 200, null)
    assert.equal(publicDown.length, 1)
    const down = await call('GET', '/api/admin/products?isActive=false&keyword=' + encodeURIComponent(marker))
    assert.equal(down.total, 1)
    await call('PUT', '/api/products-update', { ...body, _id: id, productType: 'membership', membershipType: 'permanent', dailyDownloadLimit: 99, isActive: false })
    const saved = await prisma.product.findUnique({ where: { id: created[0] } })
    assert.equal(saved.goldCoinsAmount, 0)
    assert.equal(saved.membershipType, 'permanent')
    assert.equal(saved.price.toString(), '19.9')
    await call('DELETE', '/api/products-delete?id=' + id)
    assert.ok((await prisma.product.findUnique({ where: { id: created[0] } })).deletedAt)
    await call('PUT', '/api/products-status', { _id: id, isActive: true }, 404)
    await call('DELETE', '/api/products-delete?id=' + id, undefined, 404)
    await call('DELETE', '/api/products-delete?id=2147483648', undefined, 400)
    const empty = await call('GET', '/api/admin/products?keyword=' + encodeURIComponent(marker) + '&pagesNumber=1000000&pagesSize=100')
    assert.deepEqual(empty.list, [])
    assert.equal(empty.total, 1)
    // 仅清理本脚本创建的确切编号，校验原有商品记录完全不变。
    await prisma.product.deleteMany({ where: { id: { in: created } } })
    created.length = 0
    assert.equal(JSON.stringify(await prisma.product.findMany({ orderBy: { id: 'asc' } })), original)
    console.log('真实数据库商品CRUD、软删除、在售隔离、分页、Decimal、鉴权及原记录保持通过；HTTP请求：' + checks)
  } finally {
    if (prisma && created.length) await prisma.product.deleteMany({ where: { id: { in: created } } })
    await app.close()
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
