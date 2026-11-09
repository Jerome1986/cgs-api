import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class UserAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 按唯一用户名读取登录凭据，仅在认证模块内部使用 */
  findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } })
  }

  /** 按可信令牌编号读取当前用户及实时账号状态 */
  findById(id: number) {
    return this.prisma.user.findUnique({ where: { id } })
  }

  /** 自助注册只创建普通用户，余额为零，不接收客户端权益字段 */
  create(username: string, passwordHash: string) {
    return this.prisma.user.create({
      data: { username, passwordHash, role: 'user', status: 1, coins: 0 }
    })
  }
}
