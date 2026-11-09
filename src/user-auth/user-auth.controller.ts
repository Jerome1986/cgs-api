import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import { CurrentUserQueryDto, UserCredentialsDto } from './dto/user-auth.dto'
import { UserAuthService } from './user-auth.service'
import { UserAuthGuard } from './user-auth.guard'
import type { UserRequest } from './user-auth.guard'

@Controller()
export class UserAuthController {
  constructor(private readonly service: UserAuthService) {}

  /** 客户端自助注册普通用户，成功后由现有界面返回登录 */
  @Post('user-register')
  @HttpCode(200)
  register(@Body() dto: UserCredentialsDto) {
    return this.service.register(dto)
  }

  /** 用户名密码登录，返回旧客户端可直接存储的资料与令牌 */
  @Post('user-login')
  @HttpCode(200)
  login(@Body() dto: UserCredentialsDto) {
    return this.service.login(dto)
  }

  /** 读取令牌所属用户资料，旧user_id参数不能用于查询其他账号 */
  @Get('user-web-get')
  @UseGuards(UserAuthGuard)
  current(@Req() request: UserRequest, @Query() query: CurrentUserQueryDto) {
    if (query.user_id !== undefined && query.user_id !== request.user._id)
      throw new ForbiddenException('不能查询其他用户资料')
    return request.user
  }
}
