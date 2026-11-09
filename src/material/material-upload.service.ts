import { BadRequestException, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, open, rename, rm } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { uploadMaterialToCos } from './material-cos'
import { checkZipEnd } from './material-zip'
/** 上传文件最小结构 */
export interface UploadFile {
  /** 原始文件名 */
  originalname: string
  /** Multer 创建的临时文件 */
  path: string
  /** 实际收到的字节数 */
  size: number
}
/** 文件存储服务，随机文件名防覆盖，路径不采用客户端目录 */
@Injectable()
export class MaterialUploadService {
  /** 新素材包优先保存到已配置的 COS；封面及本地模式使用持久化资源目录。 */
  async save(file: UploadFile | undefined, cover: boolean) {
    if (!file) throw new BadRequestException('请选择文件')
    try {
      if (!file.size) throw new BadRequestException('请选择文件')
      return await this.persist(file, cover)
    } finally {
      await rm(file.path, { force: true })
    }
  }

  private async persist(file: UploadFile, cover: boolean) {
    const ext = extname(file.originalname).toLowerCase()
    if (cover && !['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext))
      throw new BadRequestException('封面仅支持JPG、PNG、GIF、WEBP、BMP')
    // 同时核验图片头，防止仅修改扩展名上传脚本。
    if (cover) {
      const header = await open(file.path, 'r')
      const b = Buffer.alloc(12)
      try {
        await header.read(b, 0, b.length, 0)
      } finally {
        await header.close()
      }
      const image =
        (b[0] === 255 && b[1] === 216 && b[2] === 255) ||
        b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString()) ||
        (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') ||
        b.subarray(0, 2).toString() === 'BM'
      if (!image) throw new BadRequestException('封面图片内容无效')
    }
    const name = randomUUID() + (cover ? ext : /^[.][a-z0-9]{1,12}$/.test(ext) ? ext : '.bin')
    if (!cover) {
      if (ext === '.zip') await checkZipEnd(file.path, file.size)
      const url = await uploadMaterialToCos(name, file.path, file.size)
      if (url) return url
    }
    const root = resolve(process.env.MATERIAL_UPLOAD_DIR ?? 'uploads/materials')
    await mkdir(root, { recursive: true })
    const target = resolve(root, name)
    const pending = target + '.part'
    try {
      await copyFile(file.path, pending)
      await rename(pending, target)
    } finally {
      await rm(pending, { force: true })
    }
    const base = process.env.PUBLIC_API_URL ?? 'http://localhost:3000/api'
    return (base.endsWith('/') ? base.slice(0, -1) : base) + '/material-assets/' + name
  }
  /** 随机资源名严格白名单，防止目录穿越 */
  path(name: string) {
    if (!/^[a-f0-9-]{36}[.][a-z0-9]{1,12}$/.test(name))
      throw new BadRequestException('资源名称无效')
    return resolve(process.env.MATERIAL_UPLOAD_DIR ?? 'uploads/materials', name)
  }
}
