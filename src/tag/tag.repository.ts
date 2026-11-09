import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/** 标签数据库访问，写入字段显式映射 */
@Injectable()
export class TagRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 属性标签稳定分页 */
  attributes(skip?: number, take?: number) {
    return this.prisma.attributeTag.findMany({
      skip,
      take,
      orderBy: { id: 'asc' }
    })
  }
  /** 属性标签总数 */
  countAttributes() {
    return this.prisma.attributeTag.count()
  }
  /** 颜色标签稳定分页 */
  colors(skip?: number, take?: number) {
    return this.prisma.colorTag.findMany({
      skip,
      take,
      orderBy: { id: 'asc' }
    })
  }
  /** 颜色标签总数 */
  countColors() {
    return this.prisma.colorTag.count()
  }
  /** 新增属性标签 */
  createAttribute(name: string, enName: string) {
    return this.prisma.attributeTag.create({ data: { name, enName } })
  }
  /** 修改属性标签 */
  updateAttribute(id: number, name: string, enName: string) {
    return this.prisma.attributeTag.update({
      where: { id },
      data: { name, enName }
    })
  }
  /** 删除属性标签 */
  removeAttribute(id: number) {
    return this.prisma.attributeTag.delete({ where: { id } })
  }
  /** 新增颜色标签 */
  createColor(color: string) {
    return this.prisma.colorTag.create({ data: { color } })
  }
  /** 修改颜色标签 */
  updateColor(id: number, color: string) {
    return this.prisma.colorTag.update({ where: { id }, data: { color } })
  }
  /** 删除颜色标签 */
  removeColor(id: number) {
    return this.prisma.colorTag.delete({ where: { id } })
  }
}
