import { MaterialUploadService } from './material-upload.service'
import type { UploadFile } from './material-upload.service'
import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { tmpdir } from 'node:os'
import type { Response } from 'express'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { MaterialAssetGuard } from './material-asset.guard'
@Controller()
export class MaterialUploadController {
  constructor(private readonly service: MaterialUploadService) {}
  /** 管理员上传封面，保留旧接口直接URL响应 */
  @Post('material-upload-cover')
  @UseGuards(AdminAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      dest: tmpdir(),
      limits: { files: 1 }
    })
  )
  async cover(@UploadedFile() file: UploadFile | undefined, @Res() res: Response) {
    res.json(await this.service.save(file, true))
  }

  /** 管理员上传单个素材，按流写入临时文件，不设应用层字节上限。 */
  @Post('material-upload-files')
  @UseGuards(AdminAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      dest: tmpdir(),
      limits: { files: 1 }
    })
  )
  async files(@UploadedFile() file: UploadFile | undefined, @Res() res: Response) {
    res.json(await this.service.save(file, false))
  }

  /** 读取素材资源，文件包强制下载，禁止浏览器嗅探 */
  @Get('material-assets/:name')
  @UseGuards(MaterialAssetGuard)
  asset(@Param('name') name: string, @Res() res: Response) {
    const path = this.service.path(name)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (!/[.](?:jpg|jpeg|png|gif|webp|bmp)$/.test(name)) res.download(path, name)
    else res.sendFile(path)
  }
}
