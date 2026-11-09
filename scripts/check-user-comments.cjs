// 默认只读校验；--apply 用于向已授权测试库补充 users 表及字段注释。
process.loadEnvFile()
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { PrismaClient } = require('@prisma/client')
const { PrismaMariaDb } = require('@prisma/adapter-mariadb')

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) })
  const expected = {
    id: '业务用户编号，MySQL自增整数主键',
    username: '业务用户账号，唯一',
    password_hash: '客户端登录密码bcrypt哈希，旧账号为空且不可密码登录',
    role: '业务用户身份，与后台管理员权限独立',
    status: '账号状态：1正常，0禁用',
    coins: '用户金币余额，单位：金币',
    daily_download_limit: '会员每日首次素材授权额度，0表示未配置',
    end_date: '会员到期时间，空表示未设置',
    created_at: '用户创建时间',
    updated_at: '用户更新时间，由Prisma写入时维护'
  }
  try {
    const before = await prisma.$queryRawUnsafe('SHOW FULL COLUMNS FROM `users`')
    const indexesBefore = await prisma.$queryRawUnsafe('SHOW INDEX FROM `users`')
    const countBefore = await prisma.user.count()
    if (process.argv.includes('--apply')) {
      // SQL 为仓库内固定语句，不拼接外部输入。
      const sql = readFileSync(join(__dirname, 'sql/users-comments.sql'), 'utf8')
      await prisma.$executeRawUnsafe(sql)
    }
    const after = await prisma.$queryRawUnsafe('SHOW FULL COLUMNS FROM `users`')
    const definition = (columns) => columns.map(({ Comment, ...column }) => column)
    assert.deepEqual(definition(after), definition(before), '列定义发生变化')
    assert.deepEqual(await prisma.$queryRawUnsafe('SHOW INDEX FROM `users`'), indexesBefore, '索引发生变化')
    assert.equal(await prisma.user.count(), countBefore, '数据条数发生变化')
    assert.equal(after.length, Object.keys(expected).length)
    for (const column of after) assert.equal(column.Comment, expected[column.Field])
    const tables = await prisma.$queryRawUnsafe(
      "SELECT TABLE_COMMENT AS comment FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'"
    )
    assert.equal(tables[0].comment, '业务用户表，与后台管理员账号独立存储')
    console.log(`users 表及${Object.keys(expected).length}个字段的中文COMMENT已验证，列定义、索引及数据条数保持一致`)
  } finally {
    await prisma.$disconnect()
  }
}
main().catch((error) => {
  console.error(error instanceof assert.AssertionError ? error.message : '注释处理失败，请检查数据库配置与表结构')
  process.exitCode = 1
})
