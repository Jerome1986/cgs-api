/** 本机开发库增量增加收藏和下载授权表，不覆盖已有账号、余额或素材。 */
process.loadEnvFile()
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { PrismaClient } = require('@prisma/client')
const { PrismaMariaDb } = require('@prisma/adapter-mariadb')
async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机开发库')
  const db = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) })
  try {
    const before = JSON.stringify(await db.$queryRawUnsafe('SELECT id, username, role, coins, status, end_date FROM users ORDER BY id'))
    const sql = readFileSync(join(__dirname, '../prisma/migrations/20261104080000_user_materials/migration.sql'), 'utf8')
    const columns = await db.$queryRawUnsafe('SHOW FULL COLUMNS FROM users')
    if (process.argv.includes('--apply')) {
      for (const statement of sql.split(';').map(v => v.trim()).filter(Boolean)) {
        if (statement.startsWith('ALTER TABLE') && columns.some(c => c.Field === 'daily_download_limit')) continue
        await db.$executeRawUnsafe(statement.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS '))
      }
    }
    for (const table of ['user_favorites', 'download_grants', 'download_usage']) {
      const fields = await db.$queryRawUnsafe(`SHOW FULL COLUMNS FROM ${table}`)
      assert.ok(fields.length && fields.every(field => field.Comment), table + '中文字段注释缺失')
    }
    assert.equal(JSON.stringify(await db.$queryRawUnsafe('SELECT id, username, role, coins, status, end_date FROM users ORDER BY id')), before)
    console.log('收藏、下载授权、每日用量表和额度列已准备；原账号余额与状态未变')
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
