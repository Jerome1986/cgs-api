import { signedMaterialDownload, uploadMaterialToCos } from './material-cos'

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

  it('上传使用签名 PUT，持久化地址不含凭据，下载签名限定 Host 和有效期', async () => {
    const put = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
    expect(await uploadMaterialToCos(name, Buffer.from('test'))).toBe(address)
    const [target, options] = put.mock.calls[0]
    expect(String(target)).toBe(
      'https://cgs-materials-1253114642.cos.ap-guangzhou.myqcloud.com/materials/' + name
    )
    expect(options?.method).toBe('PUT')
    expect(options?.headers).toMatchObject({ Authorization: expect.stringContaining('q-signature=') })
    const signed = new URL(signedMaterialDownload(address)!)
    expect(signed.searchParams.get('q-header-list')).toBe('host')
    expect(signed.searchParams.get('q-signature')).toMatch(/^[a-f0-9]{40}$/)
    const expires = Number(signed.searchParams.get('q-sign-time')?.split(';')[1])
    expect(Math.abs(expires - Date.now() / 1000 - 900)).toBeLessThan(2)
    expect(signedMaterialDownload(address.replace('download.', 'other.'))).toBeUndefined()
  })

  it('云端拒绝上传或凭据缺一项均返回失败', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 403 }))
    await expect(uploadMaterialToCos(name, Buffer.from('test'))).rejects.toThrow('云存储失败')
    delete process.env.COS_SECRET_KEY
    await expect(uploadMaterialToCos(name, Buffer.from('test'))).rejects.toThrow('未配置完整')
  })
})
