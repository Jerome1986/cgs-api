import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { TagService } from './tag.service'
import {
  AttributeTagDto,
  ColorTagDto,
  QueryTagDto,
  TagIdDto,
  UpdateAttributeTagDto,
  UpdateColorTagDto
} from './dto/tag.dto'

/** 标签字典读取公开，所有写操作必须具备管理员身份 */
@Controller()
export class TagController {
  constructor(private readonly service: TagService) {}
  /** 查询attribute 标签字典或分页列表 */
  @Get('attributeTag-get')
  findAttribute(@Query() query: QueryTagDto) {
    return this.service.findPage('attribute', query)
  }

  /** 管理员新增attribute 标签 */
  @Post('attributeTag-add')
  @UseGuards(AdminAuthGuard)
  createAttribute(@Body() dto: AttributeTagDto) {
    return this.service.createAttribute(dto)
  }

  /** 管理员修改attribute 标签 */
  @Put('attributeTag-update')
  @UseGuards(AdminAuthGuard)
  updateAttribute(@Body() dto: UpdateAttributeTagDto) {
    return this.service.updateAttribute(dto._id, dto)
  }

  /** 管理员删除attribute 标签 */
  @Delete('attributeTag-del')
  @UseGuards(AdminAuthGuard)
  removeAttribute(@Query() query: TagIdDto) {
    return this.service.removeAttribute(query._id)
  }
  /** 查询color 标签字典或分页列表 */
  @Get('colorTag-get')
  findColor(@Query() query: QueryTagDto) {
    return this.service.findPage('color', query)
  }

  /** 管理员新增color 标签 */
  @Post('colorTag-add')
  @UseGuards(AdminAuthGuard)
  createColor(@Body() dto: ColorTagDto) {
    return this.service.createColor(dto.color)
  }

  /** 管理员修改color 标签 */
  @Put('colorTag-update')
  @UseGuards(AdminAuthGuard)
  updateColor(@Body() dto: UpdateColorTagDto) {
    return this.service.updateColor(dto._id, dto.color)
  }

  /** 管理员删除color 标签 */
  @Delete('colorTag-del')
  @UseGuards(AdminAuthGuard)
  removeColor(@Query() query: TagIdDto) {
    return this.service.removeColor(query._id)
  }
}
