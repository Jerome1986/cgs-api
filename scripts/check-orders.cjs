/** 本机开发库订单HTTP验收；测试记录在事务内创建，最终只清理这些确切编号。 */
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
  let prisma
  let fixtures
  let checks = 0
  try {
    setupApp(app)
    await app.listen(0, '127.0.0.1')
    prisma = app.get(PrismaService)
    const original = JSON.stringify(await prisma.order.findMany({ orderBy: { id: 'asc' } }))
    const admin = await prisma.admin.findFirst({ where: { role: 'ADMIN', status: true }, select: { id: true } })
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
      assert.match(res.headers.get('content-type'), /application\/json/)
      if (status < 300) assert.equal(json.code, 200)
      checks++
      return json.data
    }
    const marker = 'order-check-' + Date.now()
    fixtures = await prisma.$transaction(async tx => {
      const user = await tx.user.create({ data: { username: marker } })
      const product = await tx.product.create({ data: { productType: 'gold', productName: '最新商品名',
        price: '99.00', goldCoinsAmount: 500, description: '本次隔离测试商品' } })
      const orders = []
      for (const status of ['PENDING', 'PAID', 'CANCELLED', 'FAILED', 'COMPLETED']) {
        orders.push(await tx.order.create({ data: { orderNo: marker + '-' + status,
          userId: user.id, productId: product.id, productName: '购买时旧商品名', productType: 'gold',
          amount: '19.90', goldCoinsAmount: 100, status,
          ...(status === 'PAID' || status === 'COMPLETED' ? { paidAt: new Date(), paymentId: marker + '-PAY-' + status } : {}) } }))
      }
      return { user, product, orders }
    })
    const q = encodeURIComponent(marker)
    for (const auth of [null, 'invalid', jwt.sign({ sub: admin.id, role: 'STAFF' }), jwt.sign({ sub: admin.id, role: 'ADMIN' }, { expiresIn: -1 })]) {
      await call('GET', '/api/user-order-get', undefined, 401, auth)
      await call('POST', '/user-order-search', { searchValue: marker }, 401, auth)
      await call('GET', '/api/admin/orders/' + fixtures.orders[0].id, undefined, 401, auth)
    }
    for (const prefix of ['', '/api']) {
      const first = await call('GET', `${prefix}/user-order-get?searchValue=${q}&pageSize=2`)
      assert.equal(first.total, 5)
      assert.equal(first.list.length, 2)
      const second = await call('GET', `${prefix}/user-order-get?searchValue=${q}&pageSize=2&page=2`)
      assert.equal(second.total, 5)
      assert.equal(second.list.length, 2)
      assert.ok(!first.list.some(a => second.list.some(b => a._id === b._id)))
      const oldSearch = await call('POST', `${prefix}/user-order-search`, { searchValue: marker }, 201)
      assert.equal(oldSearch.length, 5)
    }
    for (const order of fixtures.orders) {
      const page = await call('GET', `/api/user-order-get?searchValue=${q}&orderStatus=${order.status}&productType=gold`)
      assert.equal(page.total, 1)
      const detail = await call('GET', '/api/admin/orders/' + order.id)
      assert.equal(detail.product_name, '购买时旧商品名')
      assert.equal(detail.goldCoinsAmount, 100)
      assert.equal(detail.amount, 19.9)
      assert.equal(detail.username, marker)
      assert.equal(detail.order_id, order.orderNo)
      assert.equal(detail.orderStatus, order.status)
      assert.equal(detail.status, ['PAID', 'COMPLETED'].includes(order.status) ? 1 : order.status === 'PENDING' ? 0 : 2)
      assert.equal(typeof detail.create_date, 'number')
      assert.equal(detail.payment_id, order.paymentId ?? '')
    }
    const empty = await call('GET', `/api/user-order-get?searchValue=${q}&productType=membership`)
    assert.equal(empty.total, 0)
    assert.deepEqual(empty.list, [])
    const beyond = await call('GET', `/api/user-order-get?searchValue=${q}&page=100`)
    assert.equal(beyond.total, 5)
    assert.deepEqual(beyond.list, [])
    for (const invalid of ['page=0', 'pageSize=101', 'orderStatus=1', 'userId=1'])
      await call('GET', '/api/user-order-get?' + invalid, undefined, 400)
    await call('GET', '/api/admin/orders/2147483648', undefined, 400)
    await call('GET', '/api/admin/orders/2147483647', undefined, 404)
    await assert.rejects(prisma.product.delete({ where: { id: fixtures.product.id } }), error => error.code === 'P2003')
    await assert.rejects(prisma.user.delete({ where: { id: fixtures.user.id } }), error => error.code === 'P2003')
    await prisma.$transaction(async tx => {
      await tx.order.deleteMany({ where: { id: { in: fixtures.orders.map(order => order.id) } } })
      await tx.product.delete({ where: { id: fixtures.product.id } })
      await tx.user.delete({ where: { id: fixtures.user.id } })
    })
    fixtures = undefined
    assert.equal(JSON.stringify(await prisma.order.findMany({ orderBy: { id: 'asc' } })), original)
    console.log('真实订单HTTP、鉴权、筛选分页、快照、旧协议、历史外键保护及原记录保持通过；请求数：' + checks)
  } finally {
    if (prisma && fixtures) {
      await prisma.$transaction(async tx => {
        await tx.order.deleteMany({ where: { id: { in: fixtures.orders.map(order => order.id) } } })
        await tx.product.delete({ where: { id: fixtures.product.id } })
        await tx.user.delete({ where: { id: fixtures.user.id } })
      })
    }
    await app.close()
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
