import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Category, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CategoryRepository } from './category.repository'
import { CategoryFieldsDto, CreateCategoryDto, QueryCategoryDto } from './dto/category.dto'

/** 树节点直接复用整数分类主键，供管理端和新客户端共用 */
type CategoryNode = Category & { children: CategoryNode[] }

@Injectable()
export class CategoryService {
  constructor(
    private readonly repository: CategoryRepository,
    private readonly prisma: PrismaService
  ) {}

  /** 按类型、层级、父级和名称分页查询分类 */
  async findPage(query: QueryCategoryDto) {
    const where: Prisma.CategoryWhereInput = {
      type: query.type,
      level: query.level,
      parentId: query.parentId
    }
    if (query.search)
      where.OR = [{ name: { contains: query.search } }, { enName: { contains: query.search } }]
    const [list, total] = await Promise.all([
      this.repository.findMany(where, (query.pageNum - 1) * query.pageSize, query.pageSize),
      this.repository.count(where)
    ])
    return {
      list: list.map(({ parent, ...item }) => ({ ...item, parentName: parent?.name ?? null })),
      total,
      pageNum: query.pageNum,
      pageSize: query.pageSize
    }
  }

  /** 一次性返回完整分类树，避免选择器仅有第一页 */
  async tree(type: string) {
    const rows = await this.repository.findMany({ type })
    const nodes = new Map<number, CategoryNode>()
    for (const row of rows) {
      const { id, name, enName, parentId, type, level, sort, createdAt, updatedAt } = row
      nodes.set(id, {
        id,
        name,
        enName,
        parentId,
        type,
        level,
        sort,
        createdAt,
        updatedAt,
        children: []
      })
    }
    const roots: CategoryNode[] = []
    for (const node of nodes.values()) {
      if (node.parentId === null) roots.push(node)
      else nodes.get(node.parentId)?.children.push(node)
    }
    return roots
  }

  /** 创建最多三级的分类，校验直属父级存在且类型一致 */
  async create(dto: CreateCategoryDto) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const parent = dto.parentId ? await this.repository.findOne(dto.parentId, tx) : null
          if (dto.parentId && !parent) throw new NotFoundException('父分类不存在')
          if (parent && parent.level >= 3) throw new BadRequestException('最多支持三级分类')
          if (parent && parent.type !== dto.type)
            throw new BadRequestException('父子分类素材类型必须一致')
          return this.repository.create(
            {
              name: dto.name,
              enName: dto.enName,
              sort: dto.sort,
              type: parent?.type ?? dto.type,
              parentId: parent?.id ?? null,
              level: parent ? parent.level + 1 : 1
            },
            tx
          )
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    } catch (error) {
      this.rethrow(error)
    }
  }

  /** 修改分类名称、英文名称与排序，保留现有父子结构及类型 */
  async update(id: number, dto: CategoryFieldsDto) {
    try {
      return await this.repository.update(id, {
        name: dto.name,
        enName: dto.enName,
        sort: dto.sort
      })
    } catch (error) {
      this.rethrow(error)
    }
  }

  /** 仅允许删除叶子分类，防止误删整棵分类树 */
  async remove(id: number) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (!(await this.repository.findOne(id, tx))) throw new NotFoundException('分类不存在')
          if (await this.repository.countChildren(id, tx))
            throw new ConflictException('请先删除子分类')
          await this.repository.remove(id, tx)
          return { id }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    } catch (error) {
      this.rethrow(error)
    }
  }

  /** 将持久化竞争和缺失记录转换为可预期的业务错误 */
  private rethrow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') throw new NotFoundException('分类不存在')
      if (['P2003', 'P2034'].includes(error.code))
        throw new ConflictException('分类已被关联或正在变更，请刷新后重试')
    }
    throw error
  }

  /** 适配Electron旧一级分类响应，仅此兼容层输出旧字段名 */
  async legacyFirst(type: string) {
    return (await this.repository.findMany({ type, level: 1 })).map((row) => this.legacyRow(row))
  }

  /** 保留Electron data[0].subCategories 结构，查询直属子分类 */
  async legacySub(cateId: string) {
    if (cateId === 'NEW' || cateId === 'ALL') return [{ _id: cateId, subCategories: [] }]
    const id = Number(cateId)
    if (id > 2147483647) throw new BadRequestException('分类编号超出范围')
    const parent = await this.repository.findOne(id)
    if (!parent) throw new NotFoundException('分类不存在')
    const children = await this.repository.findMany({ parentId: id })
    return [
      { ...this.legacyRow(parent), subCategories: children.map((row) => this.legacyRow(row)) }
    ]
  }

  /** 将整数主键转换为旧客户端比较所需的十进制字符串 */
  private legacyRow(row: Category) {
    return {
      id: row.id,
      _id: String(row.id),
      name: row.name,
      en_name: row.enName,
      parent_id: row.parentId === null ? null : String(row.parentId),
      type: row.type,
      sort: row.sort
    }
  }
}
