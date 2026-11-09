/** 本机开发库完整验收：收藏、授权扣费并发、会员额度、文件鉴权和Electron多文件流式下载。 */
require('reflect-metadata')
process.loadEnvFile()
const assert = require('node:assert/strict')
const { randomBytes } = require('node:crypto')
const { mkdtemp, writeFile, readFile, readdir, unlink, rmdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('../dist/src/app.module')
const { setupApp } = require('../dist/src/setup-app')
const { PrismaService } = require('../dist/src/prisma/prisma.service')
const { JwtService } = require('@nestjs/jwt')
const { MaterialUploadService } = require('../dist/src/material/material-upload.service')
const { downloadMaterial } = require('../../cgsweb/electron/material-download.cjs')

async function cleanFiles(root) {
  for (const row of await readdir(root, { withFileTypes: true })) {
    const target = join(root, row.name)
    if (row.isDirectory()) await cleanFiles(target)
    else await unlink(target)
  }
  await rmdir(root)
}
async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机开发库')
  const root = await mkdtemp(join(tmpdir(), 'cgs-material-flow-'))
  const priorDir = process.env.MATERIAL_UPLOAD_DIR
  process.env.MATERIAL_UPLOAD_DIR = join(root, 'uploads')
  const app = await NestFactory.create(AppModule, { logger: false })
  let db, category
  const users = [], materials = []
  let checks = 0
  try {
    setupApp(app)
    await app.listen(0, '127.0.0.1')
    db = app.get(PrismaService)
    const snapshot = JSON.stringify(await db.user.findMany({ orderBy: { id: 'asc' } }))
    const base = await app.getUrl()
    const jwt = app.get(JwtService)
    const suffix = randomBytes(4).toString('hex')
    const makeUser = async (role, coins, cap = 0, endDate = null) => {
      const row = await db.user.create({ data: { username: 't' + randomBytes(4).toString('hex'), role, coins, dailyDownloadLimit: cap, endDate, passwordHash: '$2b$04$ignoredForSignedTestTokenOnly' } })
      users.push(row.id)
      return { ...row, token: jwt.sign({ sub: row.id, role: 'USER' }) }
    }
    const ordinary = await makeUser('user', 10)
    const member = await makeUser('annual', 20, 1, new Date(Date.now() + 86400000))
    const unconfigured = await makeUser('permanent', 10)
    const expired = await makeUser('annual', 5, 8, new Date(Date.now() - 86400000))
    category = await db.category.create({ data: { name: 'flow' + suffix, enName: 'flow', type: '模型', level: 1, sort: 0 } })
    const upload = app.get(MaterialUploadService)
    const fileA = await upload.save({ originalname: 'a.bin', buffer: Buffer.from('first file') }, false)
    const fileB = await upload.save({ originalname: 'b.bin', buffer: Buffer.from('second file') }, false)
    const imageFile = await upload.save({ originalname: 'private.png', buffer: Buffer.from('private download image') }, false)
    for (let index = 0; index < 5; index++) {
      const row = await db.material.create({ data: { topId: category.id, name: 'test-' + suffix + '-' + index, enName: 'test', type: '模型', status: 1,
        tags: ['flow'], colors: ['#FFFFFF'], coverUrl: 'https://example.com/image.png', filesUrl: [fileA, fileB] } })
      materials.push(row.id)
    }
    await db.material.update({ where: { id: materials[4] }, data: { filesUrl: [imageFile] } })
    const call = async (path, method = 'GET', data, token = ordinary.token, expected = 200) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
      const result = await response.json()
      assert.equal(response.status, expected, path + ': ' + JSON.stringify(result))
      checks++
      return result.data
    }
    const id = String(materials[0])
    await call('/user-loveList-get', 'GET', undefined, '', 401)
    await call('/user-loveList-get?user_id=' + member.id, 'GET', undefined, ordinary.token, 403)
    for (let i = 0; i < 2; i++) await call('/user-loveList-add', 'POST', { material_id: id, collected: true })
    assert.equal((await call('/user-loveList-get')).length, 1)
    assert.equal((await call('/user-loveList-get', 'GET', undefined, member.token)).length, 0)
    const own = await call('/user-material-filter', 'POST', { onlyFavorites: true, localIds: [id], pagesType: '模型' })
    assert.equal(own.total, 1)
    assert.deepEqual(own.list[0].files_url, [])
    const none = await call('/user-material-filter', 'POST', { onlyFavorites: true, localIds: [], pagesType: '模型' })
    assert.equal(none.total, 0)
    await call('/user-add-download', 'POST', { material_id: id }, ordinary.token, 403)
    await call('/user-download-file?material_id=' + id, 'GET', undefined, ordinary.token, 403)
    await call(new URL(fileA).pathname, 'GET', undefined, '', 401)
    await call(new URL(imageFile).pathname, 'GET', undefined, '', 401)
    const granted = await Promise.all(Array.from({ length: 3 }, () => call('/user-download-authorize', 'POST', { material_id: id })))
    assert.equal(new Set(granted.map(g => g.grantId)).size, 1)
    assert.equal((await db.user.findUnique({ where: { id: ordinary.id } })).coins, 5)
    assert.equal(await db.downloadGrant.count({ where: { userId: ordinary.id } }), 1)
    assert.equal((await call('/user-downloadList-get')).length, 0)
    await call('/user-download-file?material_id=' + id, 'GET', undefined, member.token, 403)
    const events = []
    const result = await downloadMaterial({ basePath: root, materialId: id, name: 'safe material', type: '模型', files: granted[0].files, apiBase: base, authorization: ordinary.token }, value => events.push(value))
    assert.equal(result.files.length, 2)
    assert.equal((await readFile(result.files[0])).toString(), 'first file')
    assert.equal((await readFile(result.files[1])).toString(), 'second file')
    assert.equal(events.at(-1).progress, 100)
    await call('/user-add-download', 'POST', { material_id: id })
    await call('/user-add-download', 'POST', { material_id: id })
    assert.equal((await call('/user-downloadList-get')).length, 1)
    assert.equal((await call('/user-download-authorize', 'POST', { material_id: id })).reused, true)
    assert.equal((await db.user.findUnique({ where: { id: ordinary.id } })).coins, 5)
    await call('/user-download-authorize', 'POST', { material_id: String(materials[1]) })
    assert.equal((await db.user.findUnique({ where: { id: ordinary.id } })).coins, 0)
    await call('/user-download-authorize', 'POST', { material_id: String(materials[2]) }, ordinary.token, 403)
    const memberResults = await Promise.all([materials[0], materials[1]].map(async materialId => {
      const response = await fetch(base + '/user-download-authorize', { method: 'POST', headers: { Authorization: member.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ material_id: String(materialId) }) })
      return response.status
    }))
    assert.deepEqual(memberResults.sort(), [200, 403])
    assert.equal((await db.user.findUnique({ where: { id: member.id } })).coins, 20)
    assert.equal((await call('/user-download-status', 'GET', undefined, member.token)).remaining, 0)
    await call('/user-download-authorize', 'POST', { material_id: id }, unconfigured.token, 403)
    const admin = await db.admin.findFirst({ where: { role: 'ADMIN', status: true } })
    assert.ok(admin, '本机验收需现有管理员')
    const adminToken = 'Bearer ' + jwt.sign({ sub: admin.id, role: 'ADMIN', ver: admin.tokenVersion })
    await call('/api/user-editInfo', 'PUT', { id: unconfigured.id, username: unconfigured.username, role: 'permanent', dailyDownloadLimit: null }, adminToken, 400)
    await call('/api/user-editInfo', 'PUT', { id: unconfigured.id, username: unconfigured.username, role: 'permanent', dailyDownloadLimit: 2 }, adminToken)
    await call('/user-download-authorize', 'POST', { material_id: id }, unconfigured.token)
    assert.equal((await call('/user-download-status', 'GET', undefined, unconfigured.token)).remaining, 1)
    await call('/user-download-authorize', 'POST', { material_id: id }, expired.token)
    assert.equal((await db.user.findUnique({ where: { id: expired.id } })).coins, 0)
    await call('/user-loveList-add', 'POST', { material_id: id, collected: false })
    assert.equal((await call('/user-loveList-get')).length, 0)
    // 已授权文件临时丢失时不重复扣费，也不伪造下载成功。
    const missingPath = app.get(MaterialUploadService).path(new URL(fileB).pathname.split('/').pop())
    await unlink(missingPath)
    await call(`/user-download-file?material_id=${id}&index=1`, 'GET', undefined, ordinary.token, 404)
    assert.equal((await call('/user-download-authorize', 'POST', { material_id: id })).reused, true)
    assert.equal((await db.user.findUnique({ where: { id: ordinary.id } })).coins, 0)
    await db.user.update({ where: { id: ordinary.id }, data: { status: 0 } })
    await call('/user-download-authorize', 'POST', { material_id: id }, ordinary.token, 401)
    await db.downloadGrant.deleteMany({ where: { userId: { in: users } } })
    await db.downloadUsage.deleteMany({ where: { userId: { in: users } } })
    await db.userFavorite.deleteMany({ where: { userId: { in: users } } })
    await db.user.deleteMany({ where: { id: { in: users } } })
    users.length = 0
    assert.equal(JSON.stringify(await db.user.findMany({ orderBy: { id: 'asc' } })), snapshot)
    console.log(`收藏下载真实验收通过：${checks}次HTTP、并发单次扣费、额度上限、过期会员、身份隔离、两文件落盘及历史幂等；原用户不变`)
  } finally {
    if (db) {
      await db.downloadGrant.deleteMany({ where: { userId: { in: users } } })
      await db.downloadUsage.deleteMany({ where: { userId: { in: users } } })
      await db.userFavorite.deleteMany({ where: { userId: { in: users } } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      await db.material.deleteMany({ where: { id: { in: materials } } })
      if (category) await db.category.delete({ where: { id: category.id } })
    }
    await app.close()
    if (priorDir === undefined) delete process.env.MATERIAL_UPLOAD_DIR
    else process.env.MATERIAL_UPLOAD_DIR = priorDir
    await cleanFiles(root)
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
