import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { MaterialUploadService } from '../material/material-upload.service'

@Injectable()
export class UserMaterialFileService {
  constructor(private readonly uploads: MaterialUploadService) {}
  /** 下载服务端已授权文件，本地上传文件直接读取，远程文件不转发用户凭据 */
  async open(url: string) {
    const parsed = new URL(url)
    const localOrigin = new URL(process.env.PUBLIC_API_URL ?? 'http://localhost:3000/api').origin
    if (parsed.origin === localOrigin && /\/material-assets\/[^/]+$/.test(parsed.pathname)) {
      const path = this.uploads.path(parsed.pathname.split('/').pop()!)
      const exists = await stat(path).catch(() => null)
      if (!exists?.isFile()) throw new NotFoundException('素材文件不存在，请联系管理员')
      return createReadStream(path)
    }
    try {
      const response = await fetch(parsed, {
        redirect: 'error',
        // 与Electron保持10分钟总传输时限，避免远程大文件在2分钟被提前中断。
        signal: AbortSignal.timeout(10 * 60 * 1000)
      })
      if (!response.ok || !response.body) throw new Error('upstream unavailable')
      return Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
    } catch {
      throw new BadGatewayException('素材文件暂时不可用，可使用原授权重试')
    }
  }
}
