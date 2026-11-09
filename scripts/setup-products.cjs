/** 仅针对本机开发库增量建商品表，存在表时拒绝覆盖。 */
process.loadEnvFile()
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { PrismaClient } = require('@prisma/client')
const { PrismaMariaDb } = require('@prisma/adapter-mariadb')

async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机开发库')
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) })
  try {
    const tables = await prisma.$queryRawUnsafe("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products'")
    if (tables.length === 0) {
      const sql = readFileSync(join(__dirname, '../prisma/migrations/20261104030000_add_products/migration.sql'), 'utf8')
      await prisma.$executeRawUnsafe(sql)
      console.log('本机开发库商品表已增量创建')
    }
    const columns = await prisma.$queryRawUnsafe('SHOW FULL COLUMNS FROM products')
    assert.equal(columns.length, 14, '已有商品表结构不符，请人工核对，不自动覆盖')
    assert.ok(columns.every(column => /[\u4e00-\u9fff]/.test(column.Comment)), '字段必须有中文COMMENT')
    const price = columns.find(column => column.Field === 'price')
    assert.equal(price.Type.toLowerCase(), 'decimal(10,2)')
    const comments = await prisma.$queryRawUnsafe("SELECT TABLE_COMMENT AS comment FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products'")
    assert.ok(/[\u4e00-\u9fff]/.test(comments[0].comment))
    console.log('商品表14个字段、金额类型与中文COMMENT验证通过，现有记录未修改')
  } finally {
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
