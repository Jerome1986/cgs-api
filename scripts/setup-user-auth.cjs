/** 本机开发库增量增加用户密码哈希列；默认只读，--apply才执行迁移。 */
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
    const before = await db.$queryRawUnsafe('SELECT id, username, role, status, coins, end_date, created_at, updated_at FROM users ORDER BY id')
    const columns = await db.$queryRawUnsafe('SHOW FULL COLUMNS FROM users')
    if (!columns.some(column => column.Field === 'password_hash') && process.argv.includes('--apply')) {
      await db.$executeRawUnsafe(readFileSync(join(__dirname, '../prisma/migrations/20261104070000_user_auth/migration.sql'), 'utf8'))
    }
    const column = (await db.$queryRawUnsafe('SHOW FULL COLUMNS FROM users')).find(column => column.Field === 'password_hash')
    assert.ok(column, '请先在本机开发库运行 node scripts/setup-user-auth.cjs --apply')
    assert.equal(column.Type.toLowerCase(), 'varchar(60)')
    assert.equal(column.Null, 'YES')
    assert.ok(column.Comment.includes('密码'))
    assert.deepEqual(await db.$queryRawUnsafe('SELECT id, username, role, status, coins, end_date, created_at, updated_at FROM users ORDER BY id'), before)
    console.log('用户密码哈希增量列及中文注释校验通过，已有用户资料保持不变')
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
