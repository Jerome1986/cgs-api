/** 本机开发库用户写操作验收，只创建和清理本脚本的隔离记录，不修改原用户。 */
require('reflect-metadata')
process.loadEnvFile()
const assert = require('node:assert/strict')
const { randomBytes } = require('node:crypto')
const { NestFactory } = require('@nestjs/core')
const { JwtService } = require('@nestjs/jwt')
const { AppModule } = require('../dist/src/app.module')
const { setupApp } = require('../dist/src/setup-app')
const { PrismaService } = require('../dist/src/prisma/prisma.service')

async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机开发库')
  const app = await NestFactory.create(AppModule, { logger: false })
  const users = []
  let product
  let order
  let db
  let checks = 0
  try {
    setupApp(app)
    await app.listen(0, '127.0.0.1')
    db = app.get(PrismaService)
    const originalUsers = JSON.stringify(await db.user.findMany({ orderBy: { id: 'asc' } }))
    const adminSelect = { id: true, username: true, role: true, status: true }
    const originalAdmins = JSON.stringify(await db.admin.findMany({ orderBy: { id: 'asc' }, select: adminSelect }))
    const admin = await db.admin.findFirst({ where: { role: 'ADMIN', status: true }, select: { id: true } })
    assert.ok(admin, '需要现有可用管理员')
    const jwt = app.get(JwtService)
    const token = jwt.sign({ sub: admin.id, role: 'ADMIN' })
    const base = await app.getUrl()
    const call = async (method, path, body, status = 200, auth = token) => {
      const res = await fetch(base + path, { method,
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const json = await res.json()
      assert.equal(res.status, status, method + ' ' + path + ': ' + JSON.stringify(json))
      if (status < 300) assert.equal(json.code, 200)
      checks++
      return json.data
    }
    const suffix = randomBytes(5).toString('hex')
    const name = 'u' + suffix
    const secondName = 'v' + suffix
    for (const auth of [null, 'invalid', jwt.sign({ sub: admin.id, role: 'STAFF' }), jwt.sign({ sub: admin.id, role: 'ADMIN' }, { expiresIn: -1 })]) {
      await call('POST', '/user-add', { username: name, role: 'user', coins: 10 }, 401, auth)
      await call('PUT', '/api/user-editInfo', { id: 1, username: name, role: 'user' }, 401, auth)
      await call('PUT', '/user-status-update', { id: 1, status: 0, role: 'ADMIN' }, 401, auth)
      await call('DELETE', '/api/user-deleted?id=1', undefined, 401, auth)
    }
    for (const [username, prefix] of [[name, ''], [secondName, '/api']]) {
      const created = await call('POST', prefix + '/user-add', { username, role: 'user', coins: 10 }, 201)
      users.push(created.insertedId)
      const saved = await db.user.findUnique({ where: { id: created.insertedId } })
      assert.equal(saved.status, 1)
      assert.equal(saved.coins, 10)
    }
    const id = users[0]
    await call('POST', '/api/user-add', { username: name, role: 'user', coins: 0 }, 409)
    await db.user.update({ where: { id }, data: { coins: { increment: 5 } } })
    await call('PUT', '/user-editInfo', { id, username: name, role: 'vip' })
    assert.equal((await db.user.findUnique({ where: { id } })).coins, 15, '改资料不覆盖期间变化的余额')
    await call('PUT', '/api/user-editInfo', { id, username: 'w' + suffix, role: 'admin', coins: 20, expectedCoins: 10 }, 409)
    const conflicted = await db.user.findUnique({ where: { id } })
    assert.equal(conflicted.username, name)
    assert.equal(conflicted.role, 'vip')
    assert.equal(conflicted.coins, 15)
    await call('PUT', '/api/user-editInfo', { id, username: name, role: 'admin', coins: 0, expectedCoins: 15 })
    const edit = coins => fetch(base + '/api/user-editInfo', { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, username: name, role: 'admin', coins, expectedCoins: 0 }) })
    const concurrent = await Promise.all([edit(5), edit(6)])
    const statuses = concurrent.map(res => res.status).sort()
    await Promise.all(concurrent.map(res => res.arrayBuffer()))
    assert.deepEqual(statuses, [200, 409], '同一原余额的并发调整只能成功一次')
    checks += 2
    await call('PUT', '/user-status-update', { id, status: 0 })
    assert.equal((await db.user.findUnique({ where: { id } })).status, 0)
    await call('PUT', '/api/user-status-update', { id, status: 1, role: 'ADMIN' })
    assert.equal((await db.user.findUnique({ where: { id } })).status, 1)
    const businessToken = jwt.sign({ sub: id, role: 'admin' })
    await call('PUT', '/api/user-status-update', { id, status: 0, role: 'ADMIN' }, 401, businessToken)
    await call('PUT', '/api/user-editInfo', { id, username: secondName, role: 'user' }, 409)
    await call('POST', '/api/user-add', { username: 'bad', role: 'ADMIN', coins: -1 }, 400)
    await call('PUT', '/api/user-editInfo', { id, username: name, role: 'user', coins: 20 }, 400)
    await call('DELETE', '/api/user-deleted?id=2147483648', undefined, 400)
    const fixture = await db.$transaction(async tx => {
      const p = await tx.product.create({ data: { productType: 'gold', productName: '用户验收隔离商品', price: '1.00', goldCoinsAmount: 1, description: '仅本次测试' } })
      const o = await tx.order.create({ data: { orderNo: 'user-write-check-' + suffix, userId: id, productId: p.id,
        productName: p.productName, productType: 'gold', amount: '1.00', goldCoinsAmount: 1 } })
      return { p, o }
    })
    product = fixture.p.id
    order = fixture.o.id
    await call('DELETE', '/user-deleted?id=' + id, undefined, 409)
    assert.ok(await db.user.findUnique({ where: { id } }))
    await db.order.delete({ where: { id: order } }); order = undefined
    await db.product.delete({ where: { id: product } }); product = undefined
    for (const [index, userId] of [...users].entries()) {
      await call('DELETE', (index ? '/api' : '') + '/user-deleted?id=' + userId)
      await call('DELETE', '/api/user-deleted?id=' + userId, undefined, 404)
      await call('PUT', '/api/user-status-update', { id: userId, status: 1 }, 404)
    }
    users.length = 0
    assert.equal(JSON.stringify(await db.user.findMany({ orderBy: { id: 'asc' } })), originalUsers)
    assert.equal(JSON.stringify(await db.admin.findMany({ orderBy: { id: 'asc' }, select: adminSelect })), originalAdmins)
    console.log('真实用户CRUD、启禁用、并发余额保护、权限隔离、历史订单保护及原用户保持通过；HTTP请求：' + checks)
  } finally {
    if (db) {
      if (order) await db.order.delete({ where: { id: order } })
      if (product) await db.product.delete({ where: { id: product } })
      if (users.length) await db.user.deleteMany({ where: { id: { in: users } } })
    }
    await app.close()
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
