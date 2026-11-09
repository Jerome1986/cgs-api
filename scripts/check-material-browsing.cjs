/** 本机开发库验收：实际前端API和查询组合函数对接真实HTTP，仅清理脚本创建的分类素材。 */
require('reflect-metadata')
process.loadEnvFile()
const assert = require('node:assert/strict')
const { randomBytes } = require('node:crypto')
const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('../dist/src/app.module')
const { setupApp } = require('../dist/src/setup-app')
const { PrismaService } = require('../dist/src/prisma/prisma.service')
const { loadApi, loadBrowser } = require('../../cgsweb/scripts/helpers/material-browser.cjs')

async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机开发库')
  const app = await NestFactory.create(AppModule, { logger: false })
  const materials = [], categories = []
  let db, checks = 0
  try {
    setupApp(app)
    await app.listen(0, '127.0.0.1')
    db = app.get(PrismaService)
    const snapshot = async () => JSON.stringify(await Promise.all([
      db.material.findMany({ orderBy: { id: 'asc' } }), db.category.findMany({ orderBy: { id: 'asc' } })
    ]))
    const before = await snapshot()
    const base = await app.getUrl()
    // 只转换线上Query和JSON，接口路径、参数名和两种响应均由实际前端API文件生成。
    const request = {
      get: async (path, { params } = {}) => {
        const url = new URL(path, base)
        for (const [key, value] of Object.entries(params ?? {})) if (value !== undefined) url.searchParams.set(key, value)
        const response = await fetch(url)
        assert.ok([200, 201].includes(response.status), path + ' HTTP ' + response.status)
        checks++
        return response.json()
      },
      post: async (path, data) => {
        const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        assert.ok([200, 201].includes(response.status), path + ' HTTP ' + response.status)
        checks++
        return response.json()
      }
    }
    const api = loadApi(request)
    for (const type of ['模型', '贴图', '灯光', '材质']) {
      const marker = 'browse-' + randomBytes(5).toString('hex')
      const top = await db.category.create({ data: { name: marker, enName: marker, type, level: 1, sort: 0 } })
      categories.push(top.id)
      const sub = await db.category.create({ data: { name: marker + '-sub', enName: marker, type, level: 2, parentId: top.id, sort: 0 } })
      categories.push(sub.id)
      for (let i = 0; i < 13; i++) {
        const row = await db.material.create({ data: { topId: top.id, subId: i < 6 ? sub.id : null,
          name: marker + '-' + i, enName: marker + '-' + i, type, status: i === 12 ? 0 : 1,
          coverUrl: 'https://example.com/cover.png', filesUrl: ['https://example.com/archive.zip'],
          tags: [i % 2 === 0 ? '现代' : '古典'], colors: [i % 3 === 0 ? '#FFFFFF' : '#000000'] } })
        materials.push(row.id)
      }
      const { flow, store, unmount } = loadBrowser(type, api)
      await flow.initialize()
      assert.ok(store.selectedMaterials.every(item => item.type === type && item.status === 1))
      assert.ok(flow.firstCategories.value.some(item => item._id === String(top.id)))
      await flow.handleTopCate(String(top.id))
      assert.equal(store.materialTotal, 12)
      assert.equal(store.selectedMaterials.length, 10)
      assert.equal(flow.subCategories.value[1]._id, String(sub.id))
      await flow.handleNum(2)
      assert.equal(store.selectedMaterials.length, 2, type + '分类第二页应有2条')
      await flow.handleSubCate({ _id: String(sub.id) })
      assert.equal(store.materialTotal, 6)
      await flow.handleTag('现代')
      assert.equal(store.materialTotal, 3)
      await flow.handleColor('#FFFFFF')
      assert.equal(store.materialTotal, 1)
      await flow.handleSearch(marker)
      assert.equal(flow.failed.value, false, type + '组合搜索不能失败')
      assert.equal(store.materialTotal, 1)
      await flow.handleSubCate({ _id: 'ALL' })
      await flow.handleSearch(marker)
      await flow.handleNum(2)
      assert.equal(flow.failed.value, false, type + '搜索分页不能失败')
      assert.equal(store.selectedMaterials.length, 2, type + '搜索第二页应有2条')
      assert.equal(flow.query.value.pageNum, 2)
      await flow.handleSize(50)
      assert.equal(store.selectedMaterials.length, 12)
      assert.equal(flow.query.value.pageNum, 1)
      await flow.handleSearch('no-match-' + marker)
      assert.equal(store.materialTotal, 0)
      assert.equal(store.selectedMaterials.length, 0)
      await flow.handleReset()
      assert.equal(flow.query.value.cateId, 'NEW')
      assert.ok(store.selectedMaterials.every(item => item.type === type && item.status === 1))
      unmount()
    }
    await db.material.deleteMany({ where: { id: { in: materials } } })
    materials.length = 0
    for (const id of [...categories].reverse()) await db.category.delete({ where: { id } })
    categories.length = 0
    assert.equal(await snapshot(), before, '原有分类和素材不应变化')
    console.log(`四类素材前端真实API、查询流程与开发库联调通过：${checks}次HTTP；分页、组合搜索、隐藏素材及测试数据清理通过`)
  } finally {
    if (db && materials.length) await db.material.deleteMany({ where: { id: { in: materials } } })
    if (db) for (const id of [...categories].reverse()) await db.category.delete({ where: { id } })
    await app.close()
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 })
