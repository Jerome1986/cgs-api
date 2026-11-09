import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { CategoryService } from './category.service'
import {
  CategoryFieldsDto,
  CategoryIdDto,
  CategoryTypeDto,
  CreateCategoryDto,
  QueryCategoryDto
} from './dto/category.dto'

@Controller('categories')
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  /** 公开查询完整分类树，供管理端选择器与Electron复用 */
  @Get('tree')
  tree(@Query() query: CategoryTypeDto) {
    return this.service.tree(query.type)
  }

  /** 管理员分页查询分类 */
  @Get()
  @UseGuards(AdminAuthGuard)
  findPage(@Query() query: QueryCategoryDto) {
    return this.service.findPage(query)
  }

  /** 管理员新增分类 */
  @Post()
  @UseGuards(AdminAuthGuard)
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create(dto)
  }

  /** 管理员修改分类名称和排序 */
  @Patch(':id')
  @UseGuards(AdminAuthGuard)
  update(@Param() params: CategoryIdDto, @Body() dto: CategoryFieldsDto) {
    return this.service.update(params.id, dto)
  }

  /** 管理员删除无子分类的分类 */
  @Delete(':id')
  @UseGuards(AdminAuthGuard)
  remove(@Param() params: CategoryIdDto) {
    return this.service.remove(params.id)
  }
}
