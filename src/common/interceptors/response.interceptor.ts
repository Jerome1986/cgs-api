import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { map } from 'rxjs/operators'

@Injectable()
export class ResponseInterceptor implements NestInterceptor<
  unknown,
  { code: number; message: string; data: unknown }
> {
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
