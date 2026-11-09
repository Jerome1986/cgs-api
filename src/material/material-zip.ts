import { BadRequestException } from '@nestjs/common'
import { open } from 'node:fs/promises'

/** 从 ZIP 尾部定位完整的中央目录结束记录（包括可选注释），拒绝明显截断的上传。 */
export async function checkZipEnd(path: string, size: number) {
  const length = Math.min(size, 22 + 65535)
  const tail = Buffer.alloc(length)
  const file = await open(path, 'r')
  try {
    await file.read(tail, 0, length, size - length)
  } finally {
    await file.close()
  }
  for (let i = length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) !== 0x06054b50 || i + 22 + tail.readUInt16LE(i + 20) !== length)
      continue
    const directorySize = tail.readUInt32LE(i + 12)
    const offset = tail.readUInt32LE(i + 16)
    if (
      directorySize === 0xffffffff ||
      offset === 0xffffffff ||
      offset + directorySize <= size - length + i
    )
      return
  }
  throw new BadRequestException('ZIP 文件结尾不完整，请检查原压缩包后重新上传')
}
