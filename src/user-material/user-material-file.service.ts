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
      return { stream: createReadStream(path), length: String(exists.size), digest: null }
    }
    try {
      const response = await fetch(parsed, {
        redirect: 'error',
        headers: { 'Accept-Encoding': 'identity' }
      })
      if (response.status !== 200 || response.headers.has('content-range') || !response.body) {
        await response.body?.cancel()
        throw new Error('upstream unavailable')
      }
      const encoding = response.headers.get('content-encoding')
      return {
        stream: Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
        length: !encoding || encoding === 'identity' ? response.headers.get('content-length') : null,
        digest: response.headers.get('x-cos-meta-sha256')
      }
    } catch {
      throw new BadGatewayException('素材文件暂时不可用，可使用原授权重试')
    }
  }
}
