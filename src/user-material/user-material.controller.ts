import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards
} from '@nestjs/common'
import type { Response } from 'express'
import { pipeline } from 'node:stream/promises'
import { signedMaterialDownload } from '../material/material-cos'
import { UserAuthGuard } from '../user-auth/user-auth.guard'
import type { UserRequest } from '../user-auth/user-auth.guard'
import { UserMaterialService } from './user-material.service'
import { UserMaterialFileService } from './user-material-file.service'
import {
  DownloadFileQueryDto,
  UserMaterialDto,
  UserMaterialFilterDto,
  UserMaterialQueryDto
} from './dto/user-material.dto'

@Controller()
@UseGuards(UserAuthGuard)
export class UserMaterialController {
  constructor(
    private readonly service: UserMaterialService,
    private readonly files: UserMaterialFileService
  ) {}
  /** 设置当前用户收藏状态，保留旧路径 */
  @Post('user-loveList-add')
  @HttpCode(200)
  favorite(@Req() req: UserRequest, @Body() dto: UserMaterialDto) {
    const id = Number(req.user._id)
    this.service.checkOwner(id, dto.user_id)
    return this.service.favorite(id, this.service.id(dto.material_id), dto.collected ?? true)
  }
  /** 读取当前用户收藏编号 */
  @Get('user-loveList-get')
  favorites(@Req() req: UserRequest, @Query() dto: UserMaterialQueryDto) {
    this.service.checkOwner(Number(req.user._id), dto.user_id)
    return this.service.favorites(Number(req.user._id))
  }
  /** 首次取得素材下载授权，由服务端决定消耗金币或会员次数 */
  @Post('user-download-authorize')
  @HttpCode(200)
  authorize(@Req() req: UserRequest, @Body() dto: UserMaterialDto) {
    this.service.checkOwner(Number(req.user._id), dto.user_id)
    return this.service.authorize(Number(req.user._id), this.service.id(dto.material_id))
  }
  /** 兼容旧扣费接口，统一复用幂等授权，不信任客户端选择扣费方式 */
  @Put(['user-webCoins-update', 'user-webLimits-update'])
  async legacyAuthorize(
    @Req() req: UserRequest,
    @Body() dto: UserMaterialDto,
    @Res() res: Response
  ) {
    const data = await this.authorize(req, dto)
    res.json({ code: 200, message: 'success', data, coins: data.coins })
  }
  /** 客户端确认已有授权下载完成，保留旧路径 */
  @Post('user-add-download')
  @HttpCode(200)
  complete(@Req() req: UserRequest, @Body() dto: UserMaterialDto) {
    this.service.checkOwner(Number(req.user._id), dto.user_id)
    return this.service.complete(Number(req.user._id), this.service.id(dto.material_id))
  }
  /** 读取当前用户已完成的下载历史 */
  @Get('user-downloadList-get')
  downloads(@Req() req: UserRequest, @Query() dto: UserMaterialQueryDto) {
    this.service.checkOwner(Number(req.user._id), dto.user_id)
    return this.service.downloads(Number(req.user._id))
  }
  /** 当前用户每日剩余额度及已取得授权的编号 */
  @Get('user-download-status')
  status(@Req() req: UserRequest) {
    return this.service.status(Number(req.user._id))
  }
  /** 当前收藏与本机编号和普通查询条件一起分页筛选 */
  @Post('user-material-filter')
  @HttpCode(200)
  filter(@Req() req: UserRequest, @Body() dto: UserMaterialFilterDto) {
    return this.service.filter(Number(req.user._id), dto)
  }
  /** 实际文件下载必须持有当前用户令牌及本人素材授权 */
  @Get('user-download-file')
  async file(@Req() req: UserRequest, @Query() dto: DownloadFileQueryDto, @Res() res: Response) {
    this.service.checkOwner(Number(req.user._id), dto.user_id)
    const url = await this.service.file(
      Number(req.user._id),
      this.service.id(dto.material_id),
      dto.index
    )
    const signed = signedMaterialDownload(url)
    res.setHeader('Cache-Control', 'private, no-store')
    if (signed && req.headers['x-cgs-direct-download'] === '1') {
      res.redirect(307, signed)
      return
    }
    const stream = await this.files.open(signed ?? url)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', 'attachment')
    await pipeline(stream, res)
  }
}
