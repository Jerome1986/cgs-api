import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class UserMaterialRepository {
  constructor(private readonly db: PrismaService) {}
  /** 在业务事务内重读启用状态、会员与余额 */
  user(id: number, tx: Prisma.TransactionClient = this.db) {
    return tx.user.findUnique({ where: { id } })
  }
  /** 读取素材及服务端真实文件地址 */
  material(id: number, tx: Prisma.TransactionClient = this.db) {
    return tx.material.findUnique({ where: { id } })
  }
  /** 查询当前用户唯一素材授权 */
  grant(userId: number, materialId: number, tx: Prisma.TransactionClient = this.db) {
    return tx.downloadGrant.findUnique({ where: { userId_materialId: { userId, materialId } } })
  }
  /** 当前用户收藏列表不含其他用户数据 */
  favorites(userId: number) {
    return this.db.userFavorite.findMany({ where: { userId }, orderBy: { id: 'desc' } })
  }
  /** 幂等设置收藏，不让重复请求取消收藏 */
  favorite(userId: number, materialId: number, collected: boolean) {
    return collected
      ? this.db.userFavorite.upsert({
          where: { userId_materialId: { userId, materialId } },
          create: { userId, materialId },
          update: {}
        })
      : this.db.userFavorite.deleteMany({ where: { userId, materialId } })
  }
  /** 历史下载仅返回客户端确认完成的授权 */
  downloads(userId: number) {
    return this.db.downloadGrant.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' }
    })
  }
  /** 本人所有已取得授权，包括下载失败后可重试的授权 */
  grants(userId: number) {
    return this.db.downloadGrant.findMany({ where: { userId }, select: { materialId: true } })
  }
  /** 会员按上海日期读取已使用额度 */
  usage(userId: number, dayKey: string, tx: Prisma.TransactionClient = this.db) {
    return tx.downloadUsage.findUnique({ where: { userId_dayKey: { userId, dayKey } } })
  }
  /** 在同一SQL中校验余额、账号状态并扣5金币 */
  debit(userId: number, tx: Prisma.TransactionClient) {
    return tx.user.updateMany({
      where: { id: userId, status: 1, coins: { gte: 5 } },
      data: { coins: { decrement: 5 } }
    })
  }
  /** 记录每日授权用量，事务隔离和唯一约束保护并发 */
  useDaily(userId: number, dayKey: string, tx: Prisma.TransactionClient) {
    return tx.downloadUsage.upsert({
      where: { userId_dayKey: { userId, dayKey } },
      create: { userId, dayKey, used: 1 },
      update: { used: { increment: 1 } }
    })
  }
  /** 创建唯一授权与扣费凭据，重复素材不产生第二次消耗 */
  createGrant(data: Prisma.DownloadGrantUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.downloadGrant.create({ data })
  }
  /** 仅确认当前用户已有授权，不新增下载权益 */
  complete(userId: number, materialId: number) {
    return this.db.downloadGrant.updateMany({
      where: { userId, materialId, completedAt: null },
      data: { completedAt: new Date() }
    })
  }
}
