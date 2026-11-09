import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Product } from '@prisma/client'
import { ProductRepository } from './product.repository'
import { ProductDto, QueryProductDto } from './dto/product.dto'

/** 管理端与Electron复用商品业务与字段映射 */
@Injectable()
export class ProductService {
  constructor(private readonly repository: ProductRepository) {}

  /** 后台分页包含上下架商品，公开读取仅包含在售商品 */
  async findPage(query: QueryProductDto, admin = false) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      isActive: admin ? query.isActive : true,
      productType: query.productType,
      ...(query.keyword
        ? {
            OR: [
              { productName: { contains: query.keyword } },
              { enName: { contains: query.keyword } }
            ]
          }
        : {})
    }
    const take = query.pagesSize ?? (admin ? 10 : undefined)
    const skip = take === undefined ? undefined : (query.pagesNumber - 1) * take
    const [rows, total] = await Promise.all([
      this.repository.findMany(where, skip, take),
      this.repository.count(where)
    ])
    return {
      list: rows.map((row) => this.project(row, !admin)),
      total,
      currentPage: take === undefined ? 1 : query.pagesNumber,
      pageSize: take ?? total
    }
  }

  /** 序列化旧商品字段，Electron保留中文商品类型及数字元价格 */
  private project(row: Product, legacy = false) {
    return {
      _id: String(row.id),
      productType: legacy
        ? row.productType === 'gold'
          ? '金币充值'
          : '购买会员'
        : row.productType,
      productName: row.productName,
      en_name: row.enName,
      price: row.price.toNumber(),
      goldCoinsAmount: row.goldCoinsAmount,
      membershipType: row.membershipType,
      dailyDownloadLimit: row.dailyDownloadLimit,
      description: row.description,
      en_description: row.enDescription,
      isActive: row.isActive
    }
  }

  /** 校验商品权益组合并清除切换类型后的无关权益 */
  private mapData(dto: ProductDto): Prisma.ProductCreateInput {
    if (dto.productType === 'gold' && dto.goldCoinsAmount < 1)
      throw new BadRequestException('金币商品的金币数量必须大于0')
    if (
      dto.productType === 'membership' &&
      (!['annual', 'permanent'].includes(dto.membershipType) || dto.dailyDownloadLimit < 1)
    )
      throw new BadRequestException('会员商品必须选择会员类型并设置大于0的每日下载额度')
    return {
      productType: dto.productType,
      productName: dto.productName,
      enName: dto.en_name,
      price: new Prisma.Decimal(dto.price),
      goldCoinsAmount: dto.productType === 'gold' ? dto.goldCoinsAmount : 0,
      membershipType: dto.productType === 'membership' ? dto.membershipType : '',
      dailyDownloadLimit: dto.productType === 'membership' ? dto.dailyDownloadLimit : 0,
      description: dto.description,
      enDescription: dto.en_description,
      isActive: dto.isActive
    }
  }

  /** 严格校验MySQL整数商品编号 */
  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1 || id > 2147483647)
      throw new BadRequestException('商品编号无效')
    return id
  }

  /** 将商品并发删除或不存在转换为明确的404 */
  private async write<T>(operation: () => Promise<T>) {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw new NotFoundException('商品不存在或已删除')
      throw error
    }
  }

  /** 新增商品并返回兼容旧协议的字符串编号 */
  async create(dto: ProductDto) {
    const row = await this.repository.create(this.mapData(dto))
    return { acknowledged: true, insertedId: String(row.id) }
  }

  /** 完整更新商品的名称、价格与权益 */
  async update(id: string, dto: ProductDto) {
    await this.write(() => this.repository.update(this.parseId(id), this.mapData(dto)))
    return { acknowledged: true, matchedCount: 1 }
  }

  /** 独立切换商品上下架状态 */
  async updateStatus(id: string, isActive: boolean) {
    await this.write(() => this.repository.update(this.parseId(id), { isActive }))
    return { acknowledged: true, matchedCount: 1 }
  }

  /** 软删除并下架商品，保留历史关联所需的数据 */
  async remove(id: string) {
    await this.write(() =>
      this.repository.update(this.parseId(id), {
        deletedAt: new Date(),
        isActive: false
      })
    )
    return { acknowledged: true, deletedCount: 1 }
  }
}
