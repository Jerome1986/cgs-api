import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { map } from 'rxjs/operators'

/** 统一包装成功响应；异常仍由 NestJS 异常处理机制返回 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor<
  unknown,
  {
    /** 业务状态码，成功时固定为 200，不代表 HTTP 状态码 */
    code: number
    /** 业务提示信息 */
    message: string
    /** 接口返回的业务数据 */
    data: unknown
  }
> {
  /** 将接口返回值放入 data，补充统一的成功状态码及提示信息 */
  intercept(_context: ExecutionContext, next: CallHandler<unknown>) {
    return next.handle().pipe(
      map((data: unknown) => ({
        code: 200,
        message: 'success',
        data
      }))
    )
  }
}
