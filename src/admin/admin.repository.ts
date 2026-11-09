import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 统计全部后台账号，包含禁用账号及非 ADMIN 角色，防止重复初始化 */
  countAll(tx: Prisma.TransactionClient = this.prisma) {
    return tx.admin.count()
  }

  /** 在初始化事务中写入启用的 ADMIN 账号，密码必须为 bcrypt 哈希 */
  createInitial(username: string, password: string, tx: Prisma.TransactionClient) {
    return tx.admin.create({ data: { username, password, role: 'ADMIN', status: true } })
  }

  /** 按唯一用户名查询管理员记录，包含供登录校验使用的密码哈希 */
  findByUsername(username: string) {
    return this.prisma.admin.findUnique({ where: { username } })
  }

  /** 按管理员编号查询记录，供业务层检查账号当前状态及角色 */
  findById(id: number) {
    return this.prisma.admin.findUnique({ where: { id } })
  }

  /** 修改当前仍启用且拥有后台权限的管理员显示资料 */
  updateProfile(id: number, data: { displayName?: string; avatarUrl?: string }) {
    return this.prisma.admin.update({ where: { id, status: true, role: 'ADMIN' }, data })
  }

  /** 同时校验原密码哈希与令牌版本，原子更换密码并使全部旧令牌失效 */
  updatePassword(id: number, expectedPassword: string, expectedVersion: number, password: string) {
    return this.prisma.admin.updateMany({
      where: {
        id,
        password: expectedPassword,
        tokenVersion: expectedVersion,
        status: true,
        role: 'ADMIN'
      },
      data: { password, tokenVersion: { increment: 1 } }
    })
  }
}
