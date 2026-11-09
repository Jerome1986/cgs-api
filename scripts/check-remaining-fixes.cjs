/** 本机开发库验收剩余修复，仅使用隔离管理员及业务用户；不修改真实管理员密码。 */
require('reflect-metadata')
process.loadEnvFile()
const assert = require('node:assert/strict')
const { randomBytes, createHash } = require('node:crypto')
const { mkdtemp, readdir, unlink, rmdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const bcrypt = require('bcrypt')
const { NestFactory } = require('@nestjs/core')
const { JwtService } = require('@nestjs/jwt')
const { AppModule } = require('../dist/src/app.module')
const { setupApp } = require('../dist/src/setup-app')
const { PrismaService } = require('../dist/src/prisma/prisma.service')
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机开发库')
  const uploadRoot = await mkdtemp(join(tmpdir(), 'cgs-admin-profile-check-'))
  process.env.MATERIAL_UPLOAD_DIR = uploadRoot
  const app = await NestFactory.create(AppModule, { logger: false })
  let db
  let adminId
  const userIds = []
  let checks = 0
  try {
    setupApp(app)
    await app.listen(0, '127.0.0.1')
    db = app.get(PrismaService)
    const originalAdmins = digest(await db.admin.findMany({ orderBy: { id: 'asc' } }))
    const originalUsers = digest(await db.user.findMany({ orderBy: { id: 'asc' } }))
    const suffix = randomBytes(5).toString('hex')
    const username = 'profile-check-' + suffix
    const fixture = await db.admin.create({ data: { username, password: await bcrypt.hash('before123', 4), role: 'ADMIN', status: true } })
    adminId = fixture.id
    const base = await app.getUrl()
    process.env.PUBLIC_API_URL = base + '/api'
    const call = async (method, path, body, status = 200, auth) => {
      const res = await fetch(base + path, { method,
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const json = await res.json()
      // 失败时只打印路径与状态，不输出可能含凭据的请求或响应。
      assert.equal(res.status, status, method + ' ' + path)
      if (status < 300) assert.equal(json.code, 200)
      checks++
      return json.data
    }
    const login = await call('POST', '/api/admin/login', { username, password: 'before123' })
    const token = login.token
    assert.equal(login.userInfo.displayName, '')
    const jwt = app.get(JwtService)
    const legacyToken = jwt.sign({ sub: adminId, role: 'ADMIN' })
    const staffToken = jwt.sign({ sub: adminId, role: 'user' })
    for (const auth of [undefined, 'invalid', staffToken]) {
      await call('PATCH', '/api/admin/me', { displayName: '禁止修改' }, 401, auth)
      await call('PATCH', '/api/admin/me/avatar', { avatarUrl: '' }, 401, auth)
      await call('PUT', '/api/admin/me/password', { currentPassword: 'before123', newPassword: 'after123' }, 401, auth)
    }
    const profile = await call('PATCH', '/api/admin/me', { displayName: '  后台验收管理员  ' }, 200, token)
    assert.equal(profile.displayName, '后台验收管理员')
    assert.equal(profile.id, adminId)
    assert.ok(!('password' in profile) && !('tokenVersion' in profile))
    await call('PATCH', '/api/admin/me', { displayName: '', id: adminId + 1 }, 400, token)
    await call('PATCH', '/api/admin/me/avatar', { avatarUrl: 'javascript:alert(1)' }, 400, token)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0xkAAAAASUVORK5CYII=', 'base64')
    const form = new FormData()
    form.append('file', new Blob([png]), 'avatar.png')
    const upload = await fetch(base + '/api/material-upload-cover', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form })
    assert.equal(upload.status, 201)
    const avatarUrl = await upload.json()
    checks++
    const avatar = await call('PATCH', '/api/admin/me/avatar', { avatarUrl }, 200, token)
    assert.equal(avatar.userAvatarUrl, avatarUrl)
    const asset = await fetch(avatarUrl)
    assert.equal(asset.status, 200)
    assert.deepEqual(Buffer.from(await asset.arrayBuffer()), png)
    checks++
    const me = await call('GET', '/api/admin/me', undefined, 200, token)
    assert.equal(me.userAvatarUrl, avatarUrl)
    assert.equal(me.displayName, '后台验收管理员')
    await call('PATCH', '/api/admin/me/avatar', { avatarUrl: '' }, 200, token)
    assert.equal((await db.admin.findUnique({ where: { id: adminId } })).avatarUrl, '')
    const keyword = 'qa' + suffix + '['
    for (const name of [keyword + 'A', keyword + 'B', 'other-' + suffix]) {
      const user = await db.user.create({ data: { username: name } })
      userIds.push(user.id)
    }
    const q = encodeURIComponent(' ' + keyword + ' ')
    const first = await call('GET', '/api/user-get?keyword=' + q + '&pagesNum=1&pagesSize=1', undefined, 200, token)
    const second = await call('GET', '/api/user-get?keyword=' + q + '&pagesNum=2&pagesSize=1', undefined, 200, token)
    assert.equal(first.total, 2); assert.equal(second.total, 2)
    assert.equal(first.list.length, 1); assert.equal(second.list.length, 1)
    assert.notEqual(first.list[0].id, second.list[0].id)
    assert.ok(first.list[0].username.includes('['))
    const beyond = await call('GET', '/api/user-get?keyword=' + q + '&pagesNum=3&pagesSize=1', undefined, 200, token)
    assert.equal(beyond.total, 2); assert.deepEqual(beyond.list, [])
    await call('GET', '/api/user-get?keyword=' + 'a'.repeat(192), undefined, 400, token)
    await call('PUT', '/api/admin/me/password', { currentPassword: 'wrong123', newPassword: 'after123' }, 400, token)
    await call('PUT', '/api/admin/me/password', { currentPassword: 'before123', newPassword: 'before123' }, 400, token)
    await call('PUT', '/api/admin/me/password', { currentPassword: 'before123', newPassword: 'short' }, 400, token)
    await call('PUT', '/api/admin/me/password', { currentPassword: 'before123', newPassword: 'after123' }, 200, token)
    const saved = await db.admin.findUnique({ where: { id: adminId } })
    assert.equal(saved.tokenVersion, 1)
    assert.equal(await bcrypt.compare('after123', saved.password), true)
    for (const auth of [token, legacyToken]) {
      await call('GET', '/api/admin/me', undefined, 401, auth)
      await call('GET', '/api/user-get', undefined, 401, auth)
    }
    await call('POST', '/api/admin/login', { username, password: 'before123' }, 401)
    const updatedLogin = await call('POST', '/api/admin/login', { username, password: 'after123' })
    await call('GET', '/api/admin/me', undefined, 200, updatedLogin.token)
    await db.user.deleteMany({ where: { id: { in: userIds } } }); userIds.length = 0
    await db.admin.delete({ where: { id: adminId } }); adminId = undefined
    assert.equal(digest(await db.admin.findMany({ orderBy: { id: 'asc' } })), originalAdmins, '原管理员记录未改变')
    assert.equal(digest(await db.user.findMany({ orderBy: { id: 'asc' } })), originalUsers, '原业务用户记录未改变')
    console.log('管理员资料、头像上传、改密与令牌失效、搜索分页及原记录保持验证通过；HTTP请求：' + checks)
  } finally {
    if (db && userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } })
    if (db && adminId) await db.admin.delete({ where: { id: adminId } })
    await app.close()
    // 此目录由当前脚本独占，只清理其中实际生成的UUID图片。
    for (const name of await readdir(uploadRoot)) {
      assert.match(name, /^[a-f0-9-]{36}\.png$/)
      await unlink(join(uploadRoot, name))
    }
    await rmdir(uploadRoot)
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
