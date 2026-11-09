/** 本机开发库真实水印验收，上传到隔离临时目录，仅清理本次创建的水印与文件。 */
require('reflect-metadata')
process.loadEnvFile()
const assert = require('node:assert/strict')
const { mkdtemp, readdir, unlink, rmdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { NestFactory } = require('@nestjs/core')
const { JwtService } = require('@nestjs/jwt')
const { AppModule } = require('../dist/src/app.module')
const { setupApp } = require('../dist/src/setup-app')
const { PrismaService } = require('../dist/src/prisma/prisma.service')

async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机开发库')
  const uploadRoot = await mkdtemp(join(tmpdir(), 'cgs-watermark-check-'))
  process.env.MATERIAL_UPLOAD_DIR = uploadRoot
  const app = await NestFactory.create(AppModule, { logger: false })
  const created = []
  let prisma
  let checks = 0
  try {
    setupApp(app)
    await app.listen(0, '127.0.0.1')
    const base = await app.getUrl()
    process.env.PUBLIC_API_URL = base + '/api'
    prisma = app.get(PrismaService)
    const original = JSON.stringify(await prisma.watermark.findMany({ orderBy: { id: 'asc' } }))
    const admin = await prisma.admin.findFirst({ where: { role: 'ADMIN', status: true }, select: { id: true } })
    assert.ok(admin, '需要现有可用管理员')
    const jwt = app.get(JwtService)
    const token = jwt.sign({ sub: admin.id, role: 'ADMIN' })
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
    const upload = async (filename, bytes, status = 201, auth = token) => {
      const form = new FormData()
      form.append('file', new Blob([bytes]), filename)
      const response = await fetch(base + '/api/material-upload-cover', {
        method: 'POST', headers: auth ? { Authorization: 'Bearer ' + auth } : {}, body: form
      })
      assert.equal(response.status, status)
      checks++
      return response.json()
    }
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0xkAAAAASUVORK5CYII=', 'base64')
    await upload('a.png', png, 401, null)
    await upload('a.png', Buffer.from('fake image'), 400)
    await upload('a.svg', Buffer.from('<svg></svg>'), 400)
    const image = await upload('a.png', png)
    assert.equal(typeof image, 'string', '旧上传响应必须直接为URL字符串')
    const asset = await fetch(image)
    assert.equal(asset.status, 200)
    assert.match(asset.headers.get('content-type'), /image\/png/)
    assert.equal(asset.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await asset.arrayBuffer()), png)
    checks++
    for (const auth of [null, 'invalid', jwt.sign({ sub: admin.id, role: 'STAFF' }), jwt.sign({ sub: admin.id, role: 'ADMIN' }, { expiresIn: -1 })]) {
      await call('GET', '/watermark-get', undefined, 401, auth)
      await call('POST', '/watermark-add', { name: '禁止创建', images: image }, 401, auth)
      await call('POST', '/watermark-update', { watermarkId: '1', name: '禁止修改', images: image }, 401, auth)
      await call('POST', '/watermark-del', { watermarkId: '1' }, 401, auth)
    }
    const marker = 'watermark-check-' + Date.now()
    for (const [index, prefix] of ['', '/api'].entries()) {
      const added = await call('POST', prefix + '/watermark-add', { name: marker + '-' + index, images: image }, 201)
      created.push(Number(added.insertedId))
    }
    const q = encodeURIComponent(marker)
    for (const prefix of ['', '/api']) {
      const first = await call('GET', `${prefix}/watermark-get?keyword=${q}&pagesSize=1`)
      const second = await call('GET', `${prefix}/watermark-get?keyword=${q}&pagesSize=1&pagesNum=2`)
      assert.equal(first.total, 2)
      assert.equal(second.total, 2)
      assert.equal(first.list.length, 1)
      assert.notEqual(first.list[0]._id, second.list[0]._id)
      const visible = await prisma.watermark.findMany({ where: { deletedAt: null } })
      const random = await call('GET', prefix + '/watermark-randomGet', undefined, 200, null)
      assert.deepEqual(Object.keys(random), ['images'])
      assert.ok(visible.some(row => row.imageUrl === random.images))
    }
    await call('POST', '/watermark-update', { watermarkId: String(created[0]), name: marker + '-edited', images: image }, 201)
    assert.equal((await prisma.watermark.findUnique({ where: { id: created[0] } })).name, marker + '-edited')
    for (const body of [{ name: '', images: image }, { name: 'bad', images: 'javascript:alert(1)' }, { name: 'bad', images: image, role: 'ADMIN' }])
      await call('POST', '/api/watermark-add', body, 400)
    for (const query of ['pagesNum=0', 'pagesSize=101', 'pagesSize=0', 'extra=1'])
      await call('GET', '/api/watermark-get?' + query, undefined, 400)
    await call('POST', '/api/watermark-del', { watermarkId: '2147483648' }, 400)
    const beyond = await call('GET', `/api/watermark-get?keyword=${q}&pagesNum=100`)
    assert.deepEqual(beyond.list, [])
    assert.equal(beyond.total, 2)
    for (const id of created) {
      await call('POST', '/api/watermark-del', { watermarkId: String(id) }, 201)
      assert.ok((await prisma.watermark.findUnique({ where: { id } })).deletedAt)
      await call('POST', '/watermark-del', { watermarkId: String(id) }, 404)
      await call('POST', '/api/watermark-update', { watermarkId: String(id), name: marker, images: image }, 404)
    }
    const empty = await call('GET', '/api/watermark-get?keyword=' + q)
    assert.equal(empty.total, 0)
    assert.deepEqual(empty.list, [])
    const available = await prisma.watermark.findMany({ where: { deletedAt: null } })
    const random = await call('GET', '/watermark-randomGet', undefined, 200, null)
    assert.ok(available.length ? available.some(row => row.imageUrl === random.images) : random.images === '')
    const retainedAsset = await fetch(image)
    assert.equal(retainedAsset.status, 200, '软删除不清除共享图片')
    await retainedAsset.arrayBuffer()
    checks++
    await prisma.watermark.deleteMany({ where: { id: { in: created } } })
    created.length = 0
    assert.equal(JSON.stringify(await prisma.watermark.findMany({ orderBy: { id: 'asc' } })), original)
    console.log('真实水印CRUD、上传与资源读取、鉴权、分页、软删除和Electron随机协议通过；HTTP请求：' + checks)
  } finally {
    if (prisma && created.length) await prisma.watermark.deleteMany({ where: { id: { in: created } } })
    await app.close()
    // 路径来自本脚本独占的mkdtemp目录，只删除其内实际生成的UUID文件。
    for (const name of await readdir(uploadRoot)) {
      assert.match(name, /^[a-f0-9-]{36}\.png$/)
      await unlink(join(uploadRoot, name))
    }
    await rmdir(uploadRoot)
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
