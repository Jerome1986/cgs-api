/** 本机测试库真实HTTP验收；只清理本次创建的标签，不修改已有记录。 */
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
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机测试库')
  const app = await NestFactory.create(AppModule, { logger: false })
  const created = new Map()
  let call
  let checks = 0
  try {
    setupApp(app)
    await app.listen(0, '127.0.0.1')
    const prisma = app.get(PrismaService)
    const admin = await prisma.admin.findFirst({ where: { role: 'ADMIN', status: true }, select: { id: true } })
    assert.ok(admin, '需要现有可用管理员')
    const jwt = app.get(JwtService)
    const token = jwt.sign({ sub: admin.id, role: 'ADMIN' })
    const staff = jwt.sign({ sub: admin.id, role: 'STAFF' })
    const expired = jwt.sign({ sub: admin.id, role: 'ADMIN' }, { expiresIn: -1 })
    const base = await app.getUrl()
    call = async (method, path, body, status = 200, auth = token) => {
      const response = await fetch(base + path, {
        method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
      const result = await response.json()
      assert.equal(response.status, status, method + ' ' + path + ': ' + JSON.stringify(result))
      assert.match(response.headers.get('content-type'), /application\/json/)
      if (status < 300) assert.equal(result.code, 200)
      checks++
      return result.data
    }
    const marker = '接口验收' + Date.now()
    for (const kind of ['attributeTag', 'colorTag']) {
      const path = '/api/' + kind
      const before = await call('GET', path + '-get', undefined, 200, null)
      const original = JSON.stringify(before.list)
      const color = '#' + randomBytes(4).toString('hex').toUpperCase()
      const input = kind === 'attributeTag' ? { name: marker + kind, en_name: ' test ' } : { color }
      for (const auth of [null, 'invalid', staff, expired]) {
        await call('POST', path + '-add', input, 401, auth)
        await call('PUT', path + '-update', { _id: '1', ...input }, 401, auth)
        await call('DELETE', path + '-del?_id=1', undefined, 401, auth)
      }
      for (const query of ['pagesNum=0', 'pagesNum=1.5', 'pagesSize=0', 'pagesSize=101', 'pagesSize=abc', 'unknown=1']) {
        await call('GET', path + '-get?' + query, undefined, 400)
      }
      const badInputs = kind === 'attributeTag'
        ? [{ name: '' }, { name: ' ' }, { name: 'x'.repeat(51) }, { name: null }, { name: 'test', en_name: null }]
        : [{ color: 'red' }, { color: null }, { color: '#12345' }, { color: '#GGGGGG' }]
      for (const data of [...badInputs, { ...input, unexpected: true }]) await call('POST', path + '-add', data, 400)
      const added = await call('POST', path + '-add', input, 201)
      created.set(kind + ':' + added.insertedId, { kind, id: added.insertedId })
      assert.match(added.insertedId, /^[1-9]\d*$/)
      await call('POST', path + '-add', input, 409)
      const all = await call('GET', path + '-get', undefined, 200, null)
      assert.equal(all.total, before.total + 1)
      const saved = all.list.find(row => row._id === added.insertedId)
      assert.ok(saved)
      if (kind === 'attributeTag') assert.equal(saved.en_name, 'test')
      else assert.equal(saved.color, color.endsWith('FF') ? color.slice(0, 7) : color)
      const page = await call('GET', path + '-get?pagesNum=1&pagesSize=1')
      assert.equal(page.list.length, 1)
      assert.equal(page.pageSize, 1)
      const empty = await call('GET', path + '-get?pagesNum=1000000&pagesSize=100')
      assert.deepEqual(empty.list, [])
      const changed = kind === 'attributeTag' ? { name: marker + '修改', en_name: 'updated' } : { color: '#abc8' }
      await call('PUT', path + '-update', { _id: added.insertedId, ...changed })
      const updated = await call('GET', path + '-get')
      assert.ok(updated.list.some(row => row._id === added.insertedId &&
        (kind === 'attributeTag' ? row.name === changed.name : row.color === '#AABBCC88')))
      for (const id of ['bad', '0', '-1', '2147483648']) {
        await call('DELETE', path + '-del?_id=' + id, undefined, 400)
      }
      const removed = await call('DELETE', path + '-del?_id=' + added.insertedId)
      assert.equal(removed.deletedTag._id, added.insertedId)
      created.delete(kind + ':' + added.insertedId)
      await call('DELETE', path + '-del?_id=' + added.insertedId, undefined, 404)
      await call('PUT', path + '-update', { _id: added.insertedId, ...changed }, 404)
      const after = await call('GET', path + '-get')
      assert.equal(JSON.stringify(after.list), original, '现有标签应保持原样')
      console.log(kind + ': CRUD、字段、分页、错误、真实鉴权及原数据保持校验通过')
    }
    console.log('真实HTTP断言请求通过：' + checks)
  } finally {
    try {
      for (const { kind, id } of created.values()) {
        await call('DELETE', '/api/' + kind + '-del?_id=' + id)
      }
      console.log('本次测试记录已全部清理')
    } finally { await app.close() }
  }
}
main().catch(error => {
  console.error(error instanceof assert.AssertionError ? error.message : '标签验收失败：' + (error.code || error.name))
  process.exitCode = 1
})
