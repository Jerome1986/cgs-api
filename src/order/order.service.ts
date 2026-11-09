import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { OrderRepository, orderInclude } from './order.repository'
import { QueryOrderDto } from './dto/order.dto'

/** 查询业务与旧Electron订单字段投影集中维护 */
@Injectable()
export class OrderService {
  constructor(private readonly repository: OrderRepository) {}

  /** 统一构建关键词和状态类型筛选，保证总数与列表范围一致 */
  private where(
    query: Pick<QueryOrderDto, 'searchValue' | 'orderStatus' | 'productType'>
  ): Prisma.OrderWhereInput {
    return {
      status: query.orderStatus,
      productType: query.productType,
      ...(query.searchValue
        ? {
            OR: [
              { orderNo: { contains: query.searchValue } },
              { paymentId: { contains: query.searchValue } },
              { user: { username: { contains: query.searchValue } } }
            ]
          }
        : {})
    }
  }

  /** 映射订单快照为旧字段，已完成仍返回旧支付成功码1 */
  private project(row: Prisma.OrderGetPayload<{ include: typeof orderInclude }>) {
    const statuses: Record<string, number> = {
      PENDING: 0,
      PAID: 1,
      COMPLETED: 1,
      CANCELLED: 2,
      FAILED: 2
    }
    return {
      _id: String(row.id),
      user_id: String(row.userId),
      product_id: String(row.productId),
      order_id: row.orderNo,
      payment_id: row.paymentId ?? '',
      username: row.user.username,
      product_name: row.productName,
      productType: row.productType,
      recharge_type:
        row.productType === 'gold'
          ? '金币充值'
          : row.productType === 'membership'
            ? '购买会员'
            : row.productType,
      amount: row.amount.toNumber(),
      status: statuses[row.status] ?? -1,
      orderStatus: row.status,
      create_date: row.createdAt.getTime(),
      updated_at: row.updatedAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
      goldCoinsAmount: row.goldCoinsAmount,
      membershipType: row.membershipType,
      dailyDownloadLimit: row.dailyDownloadLimit
    }
  }

  /** 后台按关键词、业务状态和商品类型分页查询历史订单 */
  async findPage(query: QueryOrderDto) {
    const where = this.where(query)
    const [rows, total] = await Promise.all([
      this.repository.findMany(where, (query.page - 1) * query.pageSize, query.pageSize),
      this.repository.count(where)
    ])
    return {
      list: rows.map((row) => this.project(row)),
      total,
      page: query.page,
      pageSize: query.pageSize
    }
  }

  /** 兼容旧后台搜索数组响应，新后台搜索使用分页入口 */
  async search(searchValue: string) {
    const rows = await this.repository.findMany(this.where({ searchValue }))
    return rows.map((row) => this.project(row))
  }

  /** 校验订单主键并返回详情，不从当前商品重新计算历史权益 */
  async findOne(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1 || id > 2147483647)
      throw new BadRequestException('订单编号无效')
    const row = await this.repository.findOne(id)
    if (!row) throw new NotFoundException('订单不存在')
    return this.project(row)
  }
}
