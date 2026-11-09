/** 仅为本机开发库增量创建订单表，存在表时只验证，不覆盖已有结构或数据。 */
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
    const tables = await prisma.$queryRawUnsafe("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders'")
    if (tables.length === 0) {
      const sql = readFileSync(join(__dirname, '../prisma/migrations/20261104040000_add_orders/migration.sql'), 'utf8')
      await prisma.$executeRawUnsafe(sql)
      console.log('本机开发库订单表已增量创建')
    }
    const columns = await prisma.$queryRawUnsafe('SHOW FULL COLUMNS FROM orders')
    assert.equal(columns.length, 15, '已有订单表结构不符，请人工核对，不自动覆盖')
    assert.ok(columns.every(column => /[\u4e00-\u9fff]/.test(column.Comment)), '每个字段必须有中文COMMENT')
    assert.equal(columns.find(column => column.Field === 'amount').Type.toLowerCase(), 'decimal(10,2)')
    const fks = await prisma.$queryRawUnsafe("SELECT DELETE_RULE AS rule FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='orders'")
    assert.equal(fks.length, 2)
    assert.ok(fks.every(fk => fk.rule === 'RESTRICT'))
    console.log('订单表15字段、金额类型、中文COMMENT及历史关联RESTRICT验证通过')
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
