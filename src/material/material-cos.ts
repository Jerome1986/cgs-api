import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common'
import { createHash, createHmac } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import COS from 'cos-nodejs-sdk-v5'

const downloadOrigin = 'https://download.topcg.top'
const objectPath = /^\/materials\/[a-f0-9-]{36}\.[a-z0-9]{1,12}$/

/** 仅签发本项目生成的对象路径，按 COS V5 将方法、路径和 Host 绑定到签名。 */
function sign(url: URL, method: 'get' | 'put') {
  const id = process.env.COS_SECRET_ID
  const secret = process.env.COS_SECRET_KEY
  if (!id || !secret) throw new ServiceUnavailableException('素材云存储凭据未配置完整')
  const now = Math.floor(Date.now() / 1000)
  const time = `${now - 60};${now + 900}`
  const canonical = `${method}\n${url.pathname}\n\nhost=${url.host}\n`
  const hash = createHash('sha1').update(canonical).digest('hex')
  const key = createHmac('sha1', secret).update(time).digest('hex')
  const signature = createHmac('sha1', key).update(`sha1\n${time}\n${hash}\n`).digest('hex')
  return `q-sign-algorithm=sha1&q-ak=${id}&q-sign-time=${time}&q-key-time=${time}&q-header-list=host&q-url-param-list=&q-signature=${signature}`
}

/** 私有素材只保存稳定地址，下载时重新签名；旧素材继续使用原文件接口。 */
export function signedMaterialDownload(address: string) {
  const url = new URL(address)
  if (url.origin !== downloadOrigin || !objectPath.test(url.pathname)) return undefined
  const clean = new URL(url.pathname, downloadOrigin)
  return `${clean.href}?${sign(clean, 'get')}`
}

/** 配置 COS 凭据后将新素材文件上传到广州桶，失败时禁止返回无效地址。 */
export async function uploadMaterialToCos(name: string, path: string, size: number) {
  if (!process.env.COS_SECRET_ID && !process.env.COS_SECRET_KEY) return undefined
  if (!process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY)
    throw new ServiceUnavailableException('素材云存储凭据未配置完整')
  const cos = new COS({
    SecretId: process.env.COS_SECRET_ID,
    SecretKey: process.env.COS_SECRET_KEY
  })
  const object = {
    Bucket: 'cgs-materials-1253114642',
    Region: 'ap-guangzhou',
    Key: 'materials/' + name
  }
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  const metadata = {
    ContentType: 'application/octet-stream',
    Headers: { 'x-cos-meta-sha256': hash.digest('hex') }
  }
  try {
    if (size <= 4 * 1024 ** 3) {
      const body = createReadStream(path)
      try {
        await cos.putObject({
          ...object,
          ...metadata,
          Body: body,
          ContentLength: size
        })
      } finally {
        body.destroy()
      }
    } else {
      const { UploadId } = await cos.multipartInit({ ...object, ...metadata })
      const partSize = Math.max(64 * 1024 ** 2, Math.ceil(size / 10000))
      const Parts: COS.Part[] = []
      try {
        for (let start = 0; start < size; start += partSize) {
          const length = Math.min(size - start, partSize)
          const Body = createReadStream(path, {
            start,
            end: start + length - 1
          })
          const PartNumber = Parts.length + 1
          try {
            const { ETag } = await cos.multipartUpload({
              ...object,
              UploadId,
              PartNumber,
              Body,
              ContentLength: length
            })
            Parts.push({ PartNumber, ETag })
          } finally {
            Body.destroy()
          }
        }
        await cos.multipartComplete({ ...object, UploadId, Parts })
      } catch (error) {
        await cos.multipartAbort({ ...object, UploadId }).catch(() => {})
        throw error
      }
    }
    return downloadOrigin + '/' + object.Key
  } catch {
    throw new BadGatewayException('素材上传到云存储失败，请检查存储权限或重试')
  }
}
