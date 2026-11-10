/** 仅本机开发库：解除素材删除外键，保留全部授权及扣费记录。默认只检查。 */
process.loadEnvFile()
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { PrismaMariaDb } = require('@prisma/adapter-mariadb')
async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), '仅允许本机开发库')
  const db = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) })
  try {
    const constraints = await db.$queryRaw`
      SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'download_grants'
        AND COLUMN_NAME = 'material_id' AND REFERENCED_TABLE_NAME = 'materials'
    `
    if (!process.argv.includes('--apply')) {
      console.log('待解除的素材外键数量：' + constraints.length + '；使用 --apply 应用')
      return
    }
    for (const row of constraints) {
      // 标识符来自数据库元数据，转义反引号；不删除授权行、余额或用量。
      const name = row.name.replaceAll('`', '``')
      await db.$executeRawUnsafe('ALTER TABLE download_grants DROP FOREIGN KEY `' + name + '`')
    }
    console.log('素材删除限制已解除；原授权、扣费和用量记录保留')
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
