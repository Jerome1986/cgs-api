/** 真实本机开发库HTTP验收，仅创建并清理本脚本注册的测试用户。 */
require('reflect-metadata')
process.loadEnvFile()
const assert = require('node:assert/strict')
const { randomBytes } = require('node:crypto')
const bcrypt = require('bcrypt')
const { NestFactory } = require('@nestjs/core')
const { JwtService } = require('@nestjs/jwt')
const { AppModule } = require('../dist/src/app.module')
const { setupApp } = require('../dist/src/setup-app')
const { PrismaService } = require('../dist/src/prisma/prisma.service')

async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机开发库')
  const app = await NestFactory.create(AppModule, { logger: false })
  let db
  const created = []
  let checks = 0
  try {
    setupApp(app)
    await app.listen(0, '127.0.0.1')
    db = app.get(PrismaService)
    const original = JSON.stringify(await db.user.findMany({ orderBy: { id: 'asc' } }))
    const base = await app.getUrl()
    const call = async (method, path, body, status = 200, token) => {
      const response = await fetch(base + path, { method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const result = await response.json()
      assert.equal(response.status, status, method + ' ' + path)
      checks++
      return result.data
    }
    let token
    for (const prefix of ['', '/api']) {
      const credentials = { username: 'a' + randomBytes(5).toString('hex'), password: randomBytes(12).toString('hex') }
      const registered = await call('POST', prefix + '/user-register', credentials)
      const id = Number(registered._id)
      created.push(id)
      const saved = await db.user.findUniqueOrThrow({ where: { id } })
      assert.equal(saved.coins, 0)
      assert.equal(saved.role, 'user')
      assert.ok(await bcrypt.compare(credentials.password, saved.passwordHash))
      await call('POST', prefix + '/user-register', credentials, 409)
      await call('POST', prefix + '/user-login', { ...credentials, password: 'incorrect' }, 401)
      const loggedIn = await call('POST', prefix + '/user-login', credentials)
      assert.ok(!('passwordHash' in loggedIn))
      token = loggedIn.token
      const me = await call('GET', prefix + '/user-web-get', undefined, 200, token)
      assert.equal(me._id, String(id))
      await call('GET', prefix + '/user-web-get?user_id=' + (id + 1), undefined, 403, token)
      await db.user.update({ where: { id }, data: { status: 0 } })
      await call('GET', prefix + '/user-web-get', undefined, 401, token)
      await call('POST', prefix + '/user-login', credentials, 401)
    }
    await call('GET', '/user-web-get', undefined, 401)
    await call('GET', '/api/admin/me', undefined, 401, 'Bearer ' + token)
    const jwt = app.get(JwtService)
    await call('GET', '/user-web-get', undefined, 401, jwt.sign({ sub: created[0], role: 'ADMIN' }))
    await db.user.deleteMany({ where: { id: { in: created } } })
    created.length = 0
    assert.equal(JSON.stringify(await db.user.findMany({ orderBy: { id: 'asc' } })), original)
    console.log(`用户注册登录与当前资料真实HTTP验收通过：${checks}项；测试用户已清理，原用户未改动`)
  } finally {
    if (db && created.length) await db.user.deleteMany({ where: { id: { in: created } } })
    await app.close()
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
