import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/** 仅关联查询用户名，避免暴露用户的余额和其他账号信息 */
export const orderInclude = {
  user: { select: { username: true } }
} satisfies Prisma.OrderInclude

/** 订单持久化读取；本模块不开放支付状态和权益修改 */
@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 按相同条件稳定读取订单，商品与权益使用订单自身快照 */
  findMany(where: Prisma.OrderWhereInput, skip?: number, take?: number) {
    return this.prisma.order.findMany({
      where,
      skip,
      take,
      include: orderInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    })
  }

  /** 统计符合筛选条件的订单总数 */
  count(where: Prisma.OrderWhereInput) {
    return this.prisma.order.count({ where })
  }

  /** 根据主键读取订单及当前用户名 */
  findOne(id: number) {
    return this.prisma.order.findUnique({
      where: { id },
      include: orderInclude
    })
  }
}
