import type { Request, Response, NextFunction } from 'express'
import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { json } from 'express'

/** 配置 API 前缀、请求参数校验、成功响应包装及跨域，供启动与测试复用 */
export function setupApp(app: INestApplication) {
  // 5万个十位编号约650KB；只放宽本机筛选入口，其他接口保留默认限制。
  const parseFilterBody = json({ limit: '1mb' })
  // 包装为专属中间件，避免Nest将局部jsonParser误识别为已配置的全局解析器。
  app.use(
    ['/user-material-filter', '/api/user-material-filter'],
    (req: Request, res: Response, next: NextFunction) => parseFilterBody(req, res, next)
  )
  // Electron旧请求不带/api，保留旧入口并复用相同业务实现。
  const legacy = new Set([
    'user-register',
    'user-login',
    'user-web-get',
    'user-loveList-add',
    'user-loveList-get',
    'user-add-download',
    'user-downloadList-get',
    'user-webCoins-update',
    'user-webLimits-update',
    'user-download-authorize',
    'user-download-status',
    'user-download-file',
    'user-material-filter',
    'user-add',
    'user-editInfo',
    'user-status-update',
    'user-deleted',
    'watermark-randomGet',
    'watermark-get',
    'watermark-add',
    'watermark-update',
    'watermark-del',
    'user-order-get',
    'user-order-search',
    'products-get',
    'products-add',
    'products-update',
    'products-delete',
    'products-status',
    'material-get',
    'material-search',
    'material-add',
    'material-update',
    'material-deleted',
    'material-byCateId-get',
    'material-tags-get',
    'material-searchWeb',
    'filterMaterial',
    'bothFilterMaterial',
    'material-upload-cover',
    'material-upload-files'
  ])
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (legacy.has(req.path.slice(1))) req.url = '/api' + req.url
    next()
  })
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'cate-first', method: RequestMethod.GET },
      { path: 'cate-sub', method: RequestMethod.GET }
    ]
  })
  // 拒绝 DTO 未声明的字段，并将请求参数转换为 DTO 实例后执行校验。
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  )
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.enableCors()
}
