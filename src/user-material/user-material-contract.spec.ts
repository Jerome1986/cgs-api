import { Test } from '@nestjs/testing'
import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import request from 'supertest'
import { Readable } from 'node:stream'
import { UserMaterialController } from './user-material.controller'
import { UserMaterialService } from './user-material.service'
import { UserMaterialFileService } from './user-material-file.service'
import { UserMaterialRepository } from './user-material.repository'
import { UserAuthGuard } from '../user-auth/user-auth.guard'
import { MaterialService } from '../material/material.service'
import { MaterialUploadService } from '../material/material-upload.service'
import { PrismaService } from '../prisma/prisma.service'
import { setupApp } from '../setup-app'

describe('客户端素材对接修复（隔离数据库）', () => {
  let app: INestApplication
  let service: UserMaterialService
  const findPage = jest.fn().mockResolvedValue({ list: [], total: 0 })
  const repo = {
    favorites: jest.fn().mockResolvedValue([{ materialId: 1001 }]),
    user: jest.fn().mockResolvedValue({ status: 1, coins: 20 }),
    material: jest.fn(),
    grant: jest.fn().mockResolvedValue({ id: 1 })
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UserMaterialController],
      providers: [
        UserMaterialService,
        { provide: UserMaterialFileService, useValue: {} },
        { provide: UserMaterialRepository, useValue: repo },
        { provide: MaterialService, useValue: { findPage } },
        { provide: PrismaService, useValue: {
          $transaction: (work: (tx: object) => unknown) => work({})
        } }
      ]
    }).overrideGuard(UserAuthGuard).useValue({
      canActivate: (ctx: ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest<Request>()
        if (req.headers.authorization !== 'test') throw new UnauthorizedException()
        Object.assign(req, { user: { _id: '1' } })
        return true
      }
    }).compile()
    service = module.get(UserMaterialService)
    app = module.createNestApplication()
    setupApp(app)
    await app.init()
  })
  afterAll(async () => app.close())
  beforeEach(() => jest.clearAllMocks())

  it.each(['/user-material-filter', '/api/user-material-filter'])(
    '%s接受超过默认100KB的5万编号，编号与分页完整传递', async (route) => {
      const ids = Array.from({ length: 50000 }, (_, i) => String(1000000000 + i))
      const body = { localIds: ids, pageNum: 2, pageSize: 10 }
      await request(app.getHttpServer()).post(route).set('Authorization', 'test').send(body).expect(200)
      expect(findPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ pageNum: 2, pageSize: 10 }), false, false, ids.map(Number)
      )
    }
  )
  it('收藏与1001个本机编号取交集，空数组不放开范围', async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => String(i + 1))
    await request(app.getHttpServer()).post('/user-material-filter').set('Authorization', 'test')
      .send({ localIds: ids, onlyFavorites: true }).expect(200)
    expect(findPage.mock.calls.at(-1)?.[3]).toEqual([1001])
    await request(app.getHttpServer()).post('/user-material-filter').set('Authorization', 'test')
      .send({ localIds: [] }).expect(200)
    expect(findPage.mock.calls.at(-1)?.[3]).toEqual([])
  })
  it('仍拒绝未登录、超上限和非法编号', async () => {
    await request(app.getHttpServer()).post('/user-material-filter').send({ localIds: [] }).expect(401)
    for (const localIds of [Array(50001).fill('1'), ['not-an-id']]) {
      await request(app.getHttpServer()).post('/user-material-filter').set('Authorization', 'test')
        .send({ localIds }).expect(400)
    }
    expect(findPage).not.toHaveBeenCalled()
  })
  it('授权返回真实中文文件名，畸形转义不会阻断已有授权', async () => {
    const name = '中文素材名称测试文件资源包.zip'
    repo.material.mockResolvedValue({ status: 1, filesUrl: [
      `https://example.com/${encodeURIComponent(name)}`, 'https://example.com/bad%XX.max'
    ] })
    const result = await service.authorize(1, 1)
    expect(result.files.map((file) => file.name)).toEqual([name, 'bad%XX.max'])
    expect(result.reused).toBe(true)
    expect(result.coins).toBe(20)
  })
  it('远程文件采用与客户端相同的10分钟时限并可读取完整流', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('file-content'))
    const timeout = jest.spyOn(AbortSignal, 'timeout')
    try {
      const files = new UserMaterialFileService({} as MaterialUploadService)
      const stream: Readable = await files.open('https://example.com/file.zip')
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(Buffer.from(chunk))
      expect(Buffer.concat(chunks).toString()).toBe('file-content')
      expect(timeout).toHaveBeenCalledWith(600000)
      expect(fetchSpy).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'error' }))
    } finally {
      timeout.mockRestore()
      fetchSpy.mockRestore()
    }
  })
})
