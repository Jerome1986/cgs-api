/** 本机开发库增量补齐管理员资料列，已有列只校验，不覆盖资料或密码。 */
process.loadEnvFile()
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { PrismaMariaDb } = require('@prisma/adapter-mariadb')

async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机开发库')
  const db = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) })
  try {
    const before = await db.$queryRawUnsafe('SHOW FULL COLUMNS FROM admin')
    const ddl = [
      ['display_name', "ALTER TABLE admin ADD COLUMN display_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '管理员显示名称，空时展示登录账号'"],
      ['avatar_url', "ALTER TABLE admin ADD COLUMN avatar_url VARCHAR(4096) NOT NULL DEFAULT '' COMMENT '管理员头像HTTP地址，空表示默认头像'"],
      ['token_version', "ALTER TABLE admin ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0 COMMENT '访问令牌版本，修改密码后递增使旧令牌失效'"]
    ]
    for (const [name, sql] of ddl) if (!before.some(column => column.Field === name)) await db.$executeRawUnsafe(sql)
    const columns = await db.$queryRawUnsafe('SHOW FULL COLUMNS FROM admin')
    for (const [name] of ddl) {
      const column = columns.find(c => c.Field === name)
      assert.ok(column && /[\u4e00-\u9fff]/.test(column.Comment))
      assert.equal(column.Null, 'NO')
      assert.equal(column.Type.toLowerCase(), name === 'display_name' ? 'varchar(100)' : name === 'avatar_url' ? 'varchar(4096)' : 'int(11)')
    }
    console.log('管理员资料三个增量列及中文COMMENT验证通过，原账号密码未修改')
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
