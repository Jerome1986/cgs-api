import { Body, Controller, Delete, Get, Post, Put, Query, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { QueryUserDto } from './dto/query-user.dto'
import { UserService } from './user.service'
import { CreateUserDto, DeleteUserDto, UpdateUserDto, UserStatusDto } from './dto/write-user.dto'

@Controller()
@UseGuards(AdminAuthGuard)
export class UserController {
  constructor(private readonly service: UserService) {}

  /** 管理员分页获取业务用户，不使用客户端角色作为授权依据 */
  @Get('user-get')
  findPage(@Query() query: QueryUserDto) {
    return this.service.findPage(query)
  }

  /** 管理员获取供本地搜索使用的业务用户列表 */
  @Get('user-search-get')
  findAll() {
    return this.service.findAll()
  }

  /** 管理员新增业务用户，不赋予后台管理员登录权限 */
  @Post('user-add')
  create(@Body() dto: CreateUserDto) {
    return this.service.create(dto)
  }

  /** 管理员编辑业务用户资料及显式提交的金币余额 */
  @Put('user-editInfo')
  update(@Body() dto: UpdateUserDto) {
    return this.service.update(dto)
  }

  /** 管理员启用或禁用业务用户，不采信请求中的角色授权 */
  @Put('user-status-update')
  updateStatus(@Body() dto: UserStatusDto) {
    return this.service.updateStatus(dto.id, dto.status)
  }

  /** 管理员删除没有历史订单关联的业务用户 */
  @Delete('user-deleted')
  remove(@Query() query: DeleteUserDto) {
    return this.service.remove(query.id)
  }
}
