/** 本机浏览器验收专用环境：隔离账号/样本，显式标记并按确切编号清理测试数据。 */
require('reflect-metadata')
process.loadEnvFile()
const assert = require('node:assert/strict')
const { randomBytes, createHash } = require('node:crypto')
const { mkdir, readFile, writeFile, readdir, unlink } = require('node:fs/promises')
const { resolve, join } = require('node:path')
const bcrypt = require('bcrypt')
const { PrismaClient } = require('@prisma/client')
const { PrismaMariaDb } = require('@prisma/adapter-mariadb')

const root = resolve('.browser-qa')
const manifestPath = join(root, 'manifest.json')
// Express 默认拒绝隐藏目录中的静态文件，上传目录单独放在非隐藏路径。
const uploadRoot = resolve('browser-qa-uploads')
const models = ['admin', 'user', 'category', 'attributeTag', 'colorTag', 'product', 'order', 'material', 'watermark']
const digest = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex')

async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机开发库')
  const mode = process.argv[2]
  if (mode === '--serve') {
    process.env.PORT = '3101'
    process.env.MATERIAL_UPLOAD_DIR = uploadRoot
    process.env.PUBLIC_API_URL = 'http://127.0.0.1:3101/api'
    const { NestFactory } = require('@nestjs/core')
    const { AppModule } = require('../dist/src/app.module')
    const { setupApp } = require('../dist/src/setup-app')
    const app = await NestFactory.create(AppModule, { logger: false })
    setupApp(app)
    await app.listen(3101, '127.0.0.1')
    console.log('浏览器验收API已启动：127.0.0.1:3101；仅使用隔离上传目录')
    return
  }
  const db = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) })
  try {
    if (mode === '--prepare') {
      await mkdir(root, { recursive: true })
      try { await readFile(manifestPath); throw new Error('已有验收清单，请先清理或继续原会话') } catch (error) { if (error.code !== 'ENOENT') throw error }
      const marker = 'qa' + randomBytes(3).toString('hex')
      const password = 'QaTest123!'
      const before = {}
      for (const model of models) before[model] = digest(await db[model].findMany({ orderBy: { id: 'asc' } }))
      const fixture = await db.$transaction(async tx => {
        const admin = await tx.admin.create({ data: { username: marker + 'Admin', password: await bcrypt.hash(password, 4), role: 'ADMIN', status: true } })
        const users = []
        for (let i = 0; i < 13; i++) users.push(await tx.user.create({ data: { username: marker + String(i).padStart(2, '0'), coins: 10 + i } }))
        users.push(await tx.user.create({ data: { username: marker + '[sample' } }))
        users.push(await tx.user.create({ data: { username: marker + '<img src=x onerror=alert(1)>' } }))
        const product = await tx.product.create({ data: { productName: marker + '订单关联商品', productType: 'gold', price: '19.90', goldCoinsAmount: 100, description: '浏览器验收隔离商品' } })
        const orders = []
        for (const status of ['PENDING', 'PAID', 'CANCELLED', 'FAILED', 'COMPLETED']) orders.push(await tx.order.create({ data: {
          orderNo: marker + '-' + status, userId: users[0].id, productId: product.id,
          productName: marker + '购买时商品快照', productType: 'gold', amount: '9.90', goldCoinsAmount: 50, status,
          ...(['PAID', 'COMPLETED'].includes(status) ? { paymentId: marker + '-PAY-' + status, paidAt: new Date() } : {})
        } }))
        return { adminId: admin.id, username: admin.username, users: users.map(user => user.id), productId: product.id, orders: orders.map(order => order.id) }
      })
      const color = '#' + randomBytes(3).toString('hex').toUpperCase()
      assert.equal(await db.colorTag.count({ where: { color } }), 0, '颜色冲突，请重新准备')
      const manifest = { marker, username: fixture.username, password, color, before, fixture }
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0xkAAAAASUVORK5CYII=', 'base64')
      await writeFile(join(root, marker + '-asset.png'), png)
      await writeFile(join(root, marker + '-asset.zip'), Buffer.from('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==', 'base64'))
      await writeFile(join(root, marker + '-invalid.txt'), 'browser acceptance: invalid image fixture')
      console.log(JSON.stringify({ marker, username: fixture.username, password, color, files: root }))
    } else if (mode === '--audit') {
      const m = JSON.parse(await readFile(manifestPath, 'utf8'))
      const originalAdmins = await db.admin.findMany({ where: { id: { not: m.fixture.adminId } }, orderBy: { id: 'asc' } })
      const testAdmin = await db.admin.findUnique({ where: { id: m.fixture.adminId }, select: { username: true, tokenVersion: true, displayName: true } })
      console.log(JSON.stringify({ originalAdminsUnchanged: digest(originalAdmins) === m.before.admin, testAdmin }))
    } else if (mode === '--cleanup') {
      const m = JSON.parse(await readFile(manifestPath, 'utf8'))
      const prefix = m.marker
      assert.match(prefix, /^qa[0-9a-f]{6}$/)
      const scoped = async (model, where) => (await db[model].findMany({ where, select: { id: true } })).map(row => row.id)
      const ids = {
        order: await scoped('order', { orderNo: { startsWith: prefix } }),
        material: await scoped('material', { name: { startsWith: prefix } }),
        watermark: await scoped('watermark', { name: { startsWith: prefix } }),
        product: await scoped('product', { productName: { startsWith: prefix } }),
        user: await scoped('user', { username: { startsWith: prefix } }),
        attributeTag: await scoped('attributeTag', { name: { startsWith: prefix } }),
        colorTag: await scoped('colorTag', { color: m.color })
      }
      for (const model of Object.keys(ids)) if (ids[model].length) await db[model].deleteMany({ where: { id: { in: ids[model] } } })
      const categories = await db.category.findMany({ where: { name: { startsWith: prefix } }, orderBy: { level: 'desc' }, select: { id: true } })
      for (const row of categories) await db.category.delete({ where: { id: row.id } })
      await db.admin.deleteMany({ where: { id: m.fixture.adminId, username: m.username } })
      for (const model of models) assert.equal(digest(await db[model].findMany({ orderBy: { id: 'asc' } })), m.before[model], '原记录发生变化：' + model)
      assert.equal(uploadRoot, resolve('browser-qa-uploads'))
      try {
        for (const name of await readdir(uploadRoot)) { assert.match(name, /^[a-f0-9-]{36}\.[a-z0-9]{1,12}$/); await unlink(join(uploadRoot, name)) }
      } catch (error) { if (error.code !== 'ENOENT') throw error }
      await writeFile(join(root, 'cleanup-result.json'), JSON.stringify({ marker: prefix, originalRecordsUnchanged: true }))
      await unlink(manifestPath)
      console.log('浏览器验收测试记录与隔离上传已清理；九个模型的原记录摘要一致')
    } else throw new Error('使用--prepare、--serve、--audit或--cleanup')
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
