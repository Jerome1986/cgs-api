/** 仅为本机开发库增量创建水印表，存在表时验证，不覆盖原记录。 */
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
    const tables = await prisma.$queryRawUnsafe("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='watermarks'")
    if (tables.length === 0) {
      await prisma.$executeRawUnsafe(readFileSync(join(__dirname, '../prisma/migrations/20261104050000_add_watermarks/migration.sql'), 'utf8'))
      console.log('本机开发库水印表已增量创建')
    }
    const columns = await prisma.$queryRawUnsafe('SHOW FULL COLUMNS FROM watermarks')
    assert.deepEqual(columns.map(c => c.Field), ['id', 'name', 'image_url', 'deleted_at', 'created_at', 'updated_at'])
    assert.ok(columns.every(c => /[\u4e00-\u9fff]/.test(c.Comment)), '字段必须有中文COMMENT')
    assert.equal(columns.find(c => c.Field === 'image_url').Type.toLowerCase(), 'varchar(4096)')
    const table = await prisma.$queryRawUnsafe("SELECT TABLE_COMMENT AS comment FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='watermarks'")
    assert.match(table[0].comment, /[\u4e00-\u9fff]/)
    console.log('水印表6字段、地址长度及表字段中文COMMENT验证通过')
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
