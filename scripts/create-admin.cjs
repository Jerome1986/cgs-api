// 从环境读取凭据，仅创建新账号，不覆盖已有管理员。
require('dotenv/config')
const { PrismaClient } = require('@prisma/client')
const { PrismaMariaDb } = require('@prisma/adapter-mariadb')
const bcrypt = require('bcrypt')

async function main() {
  const { DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD } = process.env
  if (!DATABASE_URL || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error('请设置 DATABASE_URL、ADMIN_USERNAME、ADMIN_PASSWORD')
  }
  if (ADMIN_PASSWORD.length < 6 || ADMIN_PASSWORD.length > 20) {
    throw new Error('密码长度必须为6-20位')
  }
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(DATABASE_URL) })
  try {
    await prisma.admin.create({ data: {
      username: ADMIN_USERNAME,
      password: await bcrypt.hash(ADMIN_PASSWORD, 12),
      role: 'ADMIN',
      status: true
    } })
    console.log('管理员创建成功')
  } catch (error) {
    if (error.code === 'P2002') throw new Error('账号已存在，未修改原有账号')
    throw new Error('管理员创建失败，请检查数据库配置及表结构')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 })
