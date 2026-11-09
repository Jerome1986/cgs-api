// 在已授权测试库启动临时HTTP服务，测试数据仅通过接口创建并按逆序清理。
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
  const created = []
  let call
  try {
    setupApp(app)
    await app.listen(0, '127.0.0.1')
    const admin = await app.get(PrismaService).admin.findFirst({ where: { role: 'ADMIN', status: true }, select: { id: true } })
    assert.ok(admin, '测试需要现有管理员')
    const jwt = app.get(JwtService)
    const token = jwt.sign({ sub: admin.id, role: 'ADMIN' })
    const forbiddenToken = jwt.sign({ sub: admin.id, role: 'STAFF' })
    const base = await app.getUrl()
    call = async (method, path, data, expected = 200, auth = token) => {
      const response = await fetch(base + path, { method, headers: {
        'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {})
      }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
      const body = await response.json()
      assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(body)}`)
      return body.data
    }
    const prefix = `分类测试${Date.now()}`
    const add = async (name, parentId, type = '模型', sort = 0) => {
      const row = await call('POST', '/api/categories', { name, enName: 'category-test', type, sort, ...(parentId ? { parentId } : {}) }, 201)
      created.push(row.id)
      return row
    }
    await call('GET', '/api/categories', undefined, 401, null)
    await call('POST', '/api/categories', {}, 401, null)
    await call('POST', '/api/categories', {}, 401, forbiddenToken)
    const root = await add(prefix)
    const child = await add(prefix + '二级', root.id)
    const leaf = await add(prefix + '三级', child.id)
    assert.equal(typeof root.id, 'number')
    assert.equal(leaf.level, 3)
    assert.equal(leaf.parentId, child.id)
    await call('POST', '/api/categories', { name: '四级', enName: 'fourth', type: '模型', sort: 0, parentId: leaf.id }, 400)
    await call('POST', '/api/categories', { name: '类型不符', enName: 'wrong', type: '贴图', sort: 0, parentId: root.id }, 400)
    await call('POST', '/api/categories', { name: '   ', enName: 'empty', type: '模型', sort: 0 }, 400)
    await call('POST', '/api/categories', { name: '多余字段', enName: 'extra', type: '模型', sort: 0, level: 3 }, 400)
    await call('POST', '/api/categories', { name: '父级不存在', enName: 'missing', type: '模型', sort: 0, parentId: 2147483647 }, 404)
    const updated = await call('PATCH', `/api/categories/${leaf.id}`, { name: prefix + '已修改', enName: 'updated', sort: 8 })
    assert.equal(updated.sort, 8)
    assert.equal(updated.parentId, child.id)
    await call('PATCH', `/api/categories/${leaf.id}`, { name: '禁止移动', enName: 'move', sort: 0, parentId: root.id }, 400)
    await call('DELETE', `/api/categories/${root.id}`, undefined, 409)
    await call('DELETE', '/api/categories/not-an-id', undefined, 400)
    await call('DELETE', '/api/categories/99999999999999', undefined, 400)
    await call('PATCH', '/api/categories/2147483647', { name: '不存在', enName: 'missing', sort: 0 }, 404)
    await call('GET', '/api/categories?pageSize=101', undefined, 400)
    const page = await call('GET', `/api/categories?type=${encodeURIComponent('模型')}&level=3&parentId=${child.id}&search=${encodeURIComponent(prefix)}&pageNum=1&pageSize=10`)
    assert.equal(page.total, 1)
    assert.equal(page.list[0].id, leaf.id)
    assert.equal(page.list[0].parentName, child.name)
    assert.equal(page.list[0]._id, undefined)
    const empty = await call('GET', `/api/categories?parentId=${child.id}&pageNum=2&pageSize=10`)
    assert.equal(empty.list.length, 0)
    const tree = await call('GET', `/api/categories/tree?type=${encodeURIComponent('模型')}`, undefined, 200, null)
    assert.equal(tree.find((row) => row.id === root.id).children[0].children[0].id, leaf.id)
    const first = await call('GET', `/cate-first?pageType=${encodeURIComponent('模型')}`, undefined, 200, null)
    assert.equal(first.find((row) => row._id === String(root.id)).en_name, root.enName)
    const second = await call('GET', `/cate-sub?cateId=${root.id}`, undefined, 200, null)
    assert.equal(second[0].subCategories[0]._id, String(child.id))
    const third = await call('GET', `/cate-sub?cateId=${child.id}`, undefined, 200, null)
    assert.equal(third[0].subCategories[0].name, updated.name)
    for (const virtual of ['NEW', 'ALL']) {
      const virtualResult = await call('GET', `/cate-sub?cateId=${virtual}`, undefined, 200, null)
      assert.deepEqual(virtualResult[0].subCategories, [])
    }
    await call('GET', '/cate-sub?cateId=bad', undefined, 400, null)
    console.log('分类CRUD、分页搜索、三级约束、参数与鉴权校验、公开树及Electron旧响应验证通过')
  } finally {
    try {
      for (const id of created.reverse()) await call('DELETE', `/api/categories/${id}`)
      if (created.length) console.log('本次创建的测试分类已清理')
    } finally { await app.close() }
  }
}
main().catch((error) => {
  console.error(error instanceof assert.AssertionError ? error.message : '分类验证失败，请检查测试库与服务配置')
  process.exitCode = 1
})
