// 已授权测试库的增量建表；不清空、覆盖任何现有业务表。
process.loadEnvFile()
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { PrismaClient } = require('@prisma/client')
const { PrismaMariaDb } = require('@prisma/adapter-mariadb')
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) })
async function main() {
  try {
    await prisma.$executeRawUnsafe(readFileSync(join(__dirname, 'sql/categories.sql'), 'utf8'))
    const columns = await prisma.$queryRawUnsafe('SHOW FULL COLUMNS FROM `categories`')
    assert.equal(columns.length, 9)
    assert.ok(columns.every((column) => /[\u4e00-\u9fff]/.test(column.Comment)))
    const tables = await prisma.$queryRawUnsafe("SELECT TABLE_COMMENT AS comment FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories'")
    assert.ok(/[\u4e00-\u9fff]/.test(tables[0].comment))
    console.log('分类表及9个字段的中文COMMENT校验通过')
  } finally { await prisma.$disconnect() }
}
main().catch(() => { console.error('分类表初始化或注释校验失败'); process.exitCode = 1 })
