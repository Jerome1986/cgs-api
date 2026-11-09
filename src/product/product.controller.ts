import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { ProductService } from './product.service'
import {
  DeleteProductDto,
  ProductDto,
  ProductStatusDto,
  QueryProductDto,
  UpdateProductDto
} from './dto/product.dto'

/** 保留旧商品协议，后台写操作统一校验管理员身份 */
@Controller()
export class ProductController {
  constructor(private readonly service: ProductService) {}

  /** Electron读取在售套餐，保留数组data及中文商品类型 */
  @Get('products-get')
  async findPublic(@Query() query: QueryProductDto) {
    return (await this.service.findPage(query)).list
  }

  /** 后台分页筛选全部未删除商品，使用英文原始枚举 */
  @Get('admin/products')
  @UseGuards(AdminAuthGuard)
  findAdmin(@Query() query: QueryProductDto) {
    return this.service.findPage(query, true)
  }

  /** 管理员新增金币包或会员套餐 */
  @Post('products-add')
  @UseGuards(AdminAuthGuard)
  create(@Body() dto: ProductDto) {
    return this.service.create(dto)
  }

  /** 管理员完整编辑指定商品 */
  @Put('products-update')
  @UseGuards(AdminAuthGuard)
  update(@Body() dto: UpdateProductDto) {
    return this.service.update(dto._id, dto)
  }

  /** 管理员独立调整指定商品上下架状态 */
  @Put('products-status')
  @UseGuards(AdminAuthGuard)
  updateStatus(@Body() dto: ProductStatusDto) {
    return this.service.updateStatus(dto._id, dto.isActive)
  }

  /** 管理员软删除商品 */
  @Delete('products-delete')
  @UseGuards(AdminAuthGuard)
  remove(@Query() query: DeleteProductDto) {
    return this.service.remove(query.id)
  }
}
