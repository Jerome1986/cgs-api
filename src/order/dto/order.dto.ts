import { Transform, Type } from 'class-transformer'
import { IsIn, IsInt, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator'

/** 后台订单分页与组合筛选 */
export class QueryOrderDto {
  /** 页码，从1开始 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1
  /** 每页条数，最多100 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 10
  /** 平台订单号、支付流水或当前用户名关键词 */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 128)
  searchValue = ''
  /** 业务状态，区分失败与取消、已支付与已完成 */
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsIn(['PENDING', 'PAID', 'CANCELLED', 'FAILED', 'COMPLETED'])
  orderStatus?: string
  /** 商品类型快照 */
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsIn(['gold', 'membership'])
  productType?: string
}

/** 旧搜索接口保留数组响应和searchValue请求字段 */
export class SearchOrderDto {
  /** 平台订单号、第三方流水或用户名关键词；空字符串返回全部 */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 128)
  searchValue: string
}

/** 管理员读取订单详情的主键参数 */
export class OrderIdDto {
  /** MySQL正整数订单主键，与平台业务订单号不同 */
  @IsString()
  @Matches(/^[1-9]\d{0,9}$/)
  id: string
}
