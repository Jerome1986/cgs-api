import { signedMaterialDownload, uploadMaterialToCos } from './material-cos'
import COS from 'cos-nodejs-sdk-v5'
import { statSync } from 'node:fs'

describe('素材私有桶', () => {
  const name = '00000000-0000-4000-8000-000000000001.zip'
  const address = 'https://download.topcg.top/materials/' + name

  beforeEach(() => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      COS_SECRET_ID: 'test-id',
      COS_SECRET_KEY: 'test-key'
    })
  })
  afterEach(() => jest.restoreAllMocks())

  it('超出单次上传阈值时分块，失败后终止本次任务', async () => {
    jest
      .spyOn(COS.prototype, 'multipartInit')
      .mockResolvedValue({ UploadId: 'test', statusCode: 200 })
    const part = jest.spyOn(COS.prototype, 'multipartUpload').mockRejectedValue(new Error('403'))
    const abort = jest.spyOn(COS.prototype, 'multipartAbort').mockResolvedValue({ statusCode: 204 })
    await expect(uploadMaterialToCos(name, __filename, 4 * 1024 ** 3 + 1)).rejects.toThrow(
      '云存储失败'
    )
    expect(part.mock.calls[0][0]).toMatchObject({ PartNumber: 1, ContentLength: 64 * 1024 ** 2 })
    expect(abort.mock.calls[0][0]).toMatchObject({ UploadId: 'test', Key: 'materials/' + name })
  })

  it('上传使用签名 PUT，持久化地址不含凭据，下载签名限定 Host 和有效期', async () => {
    const put = jest
      .spyOn(COS.prototype, 'putObject')
      .mockResolvedValue({ ETag: 'test', statusCode: 200, Location: address })
    expect(await uploadMaterialToCos(name, __filename, statSync(__filename).size)).toBe(address)
    expect(put.mock.calls[0][0]).toMatchObject({
      Key: 'materials/' + name,
      Headers: { 'x-cos-meta-sha256': expect.stringMatching(/^[a-f0-9]{64}$/) }
    })
    const signed = new URL(signedMaterialDownload(address)!)
    expect(signed.searchParams.get('q-header-list')).toBe('host')
    expect(signed.searchParams.get('q-signature')).toMatch(/^[a-f0-9]{40}$/)
    const expires = Number(signed.searchParams.get('q-sign-time')?.split(';')[1])
    expect(Math.abs(expires - Date.now() / 1000 - 900)).toBeLessThan(2)
    expect(signedMaterialDownload(address.replace('download.', 'other.'))).toBeUndefined()
  })

  it('云端拒绝上传或凭据缺一项均返回失败', async () => {
    jest.spyOn(COS.prototype, 'putObject').mockRejectedValue(new Error('403'))
    await expect(uploadMaterialToCos(name, __filename, statSync(__filename).size)).rejects.toThrow(
      '云存储失败'
    )
    delete process.env.COS_SECRET_KEY
    await expect(uploadMaterialToCos(name, __filename, statSync(__filename).size)).rejects.toThrow(
      '未配置完整'
    )
  })
})
