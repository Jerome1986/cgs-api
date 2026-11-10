import { mkdtemp, open, readdir, unlink, rmdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Test } from '@nestjs/testing'
import type { App } from 'supertest/types'
import { INestApplication, UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import request from 'supertest'
import { MaterialController } from './material.controller'
import { MaterialService } from './material.service'
import { MaterialRepository } from './material.repository'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { MaterialUploadService } from './material-upload.service'
import { MaterialUploadController } from './material-upload.controller'
import { setupApp } from '../setup-app'

describe('素材HTTP契约（隔离数据库）', () => {
  let app: INestApplication<App>
  const row = {
    id: 1,
    topId: 1,
    subId: null,
    top: { name: '家具', enName: 'Furniture' },
    sub: null as { name: string; enName: string } | null,
    name: '沙发',
    enName: 'sofa',
    coverUrl: 'https://example.com/a.png',
    filesUrl: ['https://example.com/a.zip'],
    tags: ['现代'],
    colors: ['#FFFFFF'],
    type: '模型',
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  }
  const repo = {
    isDownloadAsset: jest.fn().mockResolvedValue(false),
    findMany: jest.fn().mockResolvedValue([row]),
    count: jest.fn().mockResolvedValue(25),
    facets: jest.fn().mockResolvedValue([row]),
    category: jest.fn().mockResolvedValue({ id: 1, level: 1, type: '模型' }),
    create: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue(row),
    remove: jest.fn().mockResolvedValue(row)
  }
  const body = {
    top_id: '1',
    name: '沙发',
    cover_url: row.coverUrl,
    files_url: row.filesUrl,
    type: '模型'
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MaterialController, MaterialUploadController],
      providers: [
        MaterialUploadService,
        { provide: AdminAuthGuard, useValue: { canActivate: (ctx: ExecutionContext) => {
          if (ctx.switchToHttp().getRequest<Request>().headers.authorization !== 'Bearer test') throw new UnauthorizedException()
          return true
        } } },
        MaterialService,
        { provide: MaterialRepository, useValue: repo }
      ]
    })
      .overrideGuard(AdminAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (ctx.switchToHttp().getRequest<Request>().headers.authorization !== 'Bearer test')
            throw new UnauthorizedException()
          return true
        }
      })
      .compile()
    app = module.createNestApplication()
    setupApp(app)
    await app.init()
  })
  afterAll(async () => app.close())
  beforeEach(() => jest.clearAllMocks())
  it('Electron多选属性与颜色在分页前筛选', async () => {
    await request(app.getHttpServer()).get('/api/filterMaterial')
      .query({ pageType: '模型', pageSize: 100, tags: ['现代', '简约'], colors: ['#FFFFFF', '#000000'] })
      .expect(200)
    expect(repo.findMany).toHaveBeenCalledWith({ status: 1, type: '模型',
      AND: [
        { tags: { array_contains: ['现代', '简约'] } },
        { colors: { array_contains: ['#FFFFFF', '#000000'] } }
      ]
    }, 0, 100)
    await request(app.getHttpServer()).get('/api/filterMaterial').query({ tags: [''] }).expect(400)
  })
  it('旧根路径和api路径复用，分页和字段投影正确', async () => {
    const res = await request(app.getHttpServer())
      .get('/material-byCateId-get?pageType=模型&cate_id=ALL&pagesNum=2&pagesSize=10')
      .expect(200)
    expect((res.body as { data: { total: number } }).data.total).toBe(25)
    expect((res.body as { data: { list: unknown[] } }).data.list[0]).toMatchObject({
      _id: '1',
      top_id: '1',
      cate_path: '家具',
      en_cate_path: 'Furniture',
      files_url: [],
      fileCount: 1
    })
    expect(repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ status: 1, type: '模型' }),
      10,
      10
    )
    await request(app.getHttpServer())
      .get('/api/material-get')
      .set('Authorization', 'Bearer test')
      .expect(200)
  })
  it('分类路径包含父子名称，缺少英文时仅回退对应节点', async () => {
    repo.findMany.mockResolvedValueOnce([{
      ...row,
      sub: { name: '沙发', enName: '' }
    }])
    const res = await request(app.getHttpServer()).get('/material-byCateId-get').expect(200)
    expect((res.body as { data: { list: unknown[] } }).data.list[0]).toMatchObject({
      cate_path: '家具 / 沙发', en_cate_path: 'Furniture / 沙发'
    })
  })
  it('所有写入及后台列表拒绝匿名访问', async () => {
    await request(app.getHttpServer()).post('/api/material-add').send(body).expect(401)
    await request(app.getHttpServer())
      .put('/api/material-update')
      .send({ ...body, _id: '1' })
      .expect(401)
    await request(app.getHttpServer()).delete('/api/material-deleted?material_id=1').expect(401)
    await request(app.getHttpServer()).get('/api/material-get').expect(401)
  })
  it('拒绝错误分页、额外字段及跨分类写入', async () => {
    await request(app.getHttpServer()).get('/api/filterMaterial?pageSize=0').expect(400)
    await request(app.getHttpServer())
      .post('/api/material-add')
      .set('Authorization', 'Bearer test')
      .send({ ...body, role: 'ADMIN' })
      .expect(400)
    await request(app.getHttpServer())
      .post('/api/material-add')
      .set('Authorization', 'Bearer test')
      .send({ ...body, sub_id: '1' })
      .expect(400)
    expect(repo.create).not.toHaveBeenCalled()
  })
  it('旧搜索使用数组data及顶层总数，公开查询过滤下架素材', async () => {
    const res = await request(app.getHttpServer())
      .post('/material-searchWeb')
      .send({ pagesType: '模型', searchVal: 'sofa', pageNum: 2, pageSize: 10 })
      .expect(201)
    expect(Array.isArray((res.body as { data: unknown }).data)).toBe(true)
    expect((res.body as { total: number }).total).toBe(25)
    expect(repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 1,
        AND: [{ OR: [{ name: { contains: 'sofa' } }, { enName: { contains: 'sofa' } }] }]
      }),
      10,
      10
    )
  })
  it('写入白名单、编辑和删除成功', async () => {
    await request(app.getHttpServer())
      .post('/api/material-add')
      .set('Authorization', 'Bearer test')
      .send(body)
      .expect(201)
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ topId: 1, subId: null, status: 1 })
    )
    await request(app.getHttpServer())
      .put('/api/material-update')
      .set('Authorization', 'Bearer test')
      .send({ ...body, _id: '1' })
      .expect(200)
    await request(app.getHttpServer())
      .delete('/api/material-deleted?material_id=1')
      .set('Authorization', 'Bearer test')
      .expect(200)
  })
  it('空收藏下载返回空范围，不开放全部素材', async () => {
    await request(app.getHttpServer()).get('/api/bothFilterMaterial').expect(200)
    expect(repo.findMany).toHaveBeenCalledWith(expect.objectContaining({ id: { in: [] } }), 0, 20)
  })
  it('上传接口必须认证，空文件拒绝且不写入磁盘', async () => {
    for (const route of ['material-upload-cover', 'material-upload-files']) {
      await request(app.getHttpServer())
        .post('/api/' + route)
        .expect(401)
      await request(app.getHttpServer())
        .post('/api/' + route)
        .set('Authorization', 'Bearer test')
        .expect(400)
    }
  })
  it('真实磁盘上传返回直接URL，资源可读取且不覆盖同名文件', async () => {
    const localEnv = jest.replaceProperty(process, 'env', { ...process.env })
    delete process.env.COS_SECRET_ID
    delete process.env.COS_SECRET_KEY
    const root = await mkdtemp(join(tmpdir(), 'cgs-material-test-'))
    const previousDir = process.env.MATERIAL_UPLOAD_DIR
    const previousUrl = process.env.PUBLIC_API_URL
    process.env.MATERIAL_UPLOAD_DIR = root
    process.env.PUBLIC_API_URL = 'http://localhost:3000/api'
    try {
      const urls: string[] = []
      for (let i = 0; i < 2; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/material-upload-files')
          .set('Authorization', 'Bearer test')
          .attach('file', Buffer.concat([Buffer.from('504b0506', 'hex'), Buffer.alloc(18)]), 'same.zip')
          .expect(201)
        const url: unknown = res.body
        expect(typeof url).toBe('string')
        if (typeof url !== 'string') throw new Error('上传未返回URL')
        urls.push(url)
        await request(app.getHttpServer()).get(new URL(url).pathname).expect(401)
        const downloaded = await request(app.getHttpServer()).get(new URL(url).pathname).set('Authorization', 'Bearer test').expect(200)
        expect(downloaded.headers['content-disposition']).toContain('attachment')
        expect(downloaded.headers['x-content-type-options']).toBe('nosniff')
      }
      expect(urls[0]).not.toBe(urls[1])
      const source = join(root, 'over-200.bin')
      const handle = await open(source, 'wx')
      const size = 200 * 1024 * 1024 + 1
      try {
        await handle.truncate(size)
      } finally {
        await handle.close()
      }
      const uploaded = await request(app.getHttpServer()).post('/api/material-upload-files')
        .set('Authorization', 'Bearer test').attach('file', source).expect(201)
      const stored = new URL(String(uploaded.body)).pathname.split('/').pop()!
      expect((await stat(join(root, stored))).size).toBe(size)
    } finally {
      if (previousDir === undefined) delete process.env.MATERIAL_UPLOAD_DIR
      else process.env.MATERIAL_UPLOAD_DIR = previousDir
      if (previousUrl === undefined) delete process.env.PUBLIC_API_URL
      else process.env.PUBLIC_API_URL = previousUrl
      for (const name of await readdir(root)) await unlink(join(root, name))
      await rmdir(root)
      localEnv.restore()
    }
  })
  it('上传服务拒绝空文件、伪图片及路径穿越', async () => {
    const service = new MaterialUploadService()
    await expect(service.save(undefined, true)).rejects.toThrow()
    await request(app.getHttpServer()).post('/api/material-upload-cover')
      .set('Authorization', 'Bearer test').attach('file', Buffer.from('script'), 'a.png').expect(400)
    await request(app.getHttpServer()).post('/api/material-upload-files')
      .set('Authorization', 'Bearer test').attach('file', Buffer.from('PK'), 'bad.zip').expect(400)
    expect(() => service.path('../secret')).toThrow()
  })
})
