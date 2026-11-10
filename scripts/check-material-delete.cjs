/** 本机真实数据库回归：所有测试数据在事务结束时回滚。 */
require('reflect-metadata')
process.loadEnvFile()
process.env.TS_NODE_TRANSPILE_ONLY = 'true'
require('ts-node/register')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { PrismaMariaDb } = require('@prisma/adapter-mariadb')
const { MaterialRepository } = require('../src/material/material.repository')
const { MaterialService } = require('../src/material/material.service')
async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机开发库')
  const db = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) })
  const rollback = new Error('rollback-test-fixtures')
  let checksPassed = false
  try {
    await db.$transaction(async tx => {
      const user = await tx.user.create({ data: { username: 'delete-test-' + randomUUID(), coins: 15 } })
      const top = await tx.category.create({ data: { name: '删除测试', enName: 'delete-test', type: '模型', level: 1 } })
      const material = await tx.material.create({ data: {
        topId: top.id, name: '删除测试', type: '模型', coverUrl: 'https://example.com/cover.png',
        filesUrl: ['https://example.com/file.zip'], tags: [], colors: []
      }, select: { id: true } })
      const grant = await tx.downloadGrant.create({ data: {
        userId: user.id, materialId: material.id, kind: 'coins', chargedCoins: 5, completedAt: new Date()
      } })
      const usage = await tx.downloadUsage.create({ data: { userId: user.id, dayKey: '2026-11-10', used: 1 } })
      await tx.userFavorite.create({ data: { userId: user.id, materialId: material.id } })
      const service = new MaterialService(new MaterialRepository(tx))
      assert.deepEqual(await service.remove(String(material.id)), { deletedCount: 1 })
      assert.equal(await tx.material.findUnique({ where: { id: material.id }, select: { id: true } }), null)
      assert.equal(await tx.userFavorite.count({ where: { materialId: material.id } }), 0)
      assert.deepEqual(await tx.downloadGrant.findUnique({ where: { id: grant.id } }), grant)
      assert.deepEqual(await tx.downloadUsage.findUnique({ where: { id: usage.id } }), usage)
      assert.equal((await tx.user.findUnique({ where: { id: user.id } })).coins, 15)
      await assert.rejects(service.remove(String(material.id)), /素材不存在/)
      checksPassed = true
      throw rollback
    }, { timeout: 15000 }).catch(error => { if (error !== rollback) throw error })
    assert.ok(checksPassed)
    console.log('PASS：带下载授权素材可删除、收藏清理、扣费凭据/余额/用量保留、重复删除404；测试事务已回滚')
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
