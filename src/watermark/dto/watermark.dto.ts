import { Transform, Type } from 'class-transformer'
import { IsInt, IsString, IsUrl, Length, Matches, Max, Min } from 'class-validator'

/** 去除名称及地址两端空白，不转换非字符串输入 */
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

/** 管理端水印分页及名称筛选 */
export class QueryWatermarkDto {
  /** 页码，从1开始 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  pagesNum = 1
  /** 每页条数，默认10、最大100 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pagesSize = 10
  /** 水印名称关键词，空字符串不限制 */
  @Transform(trim)
  @IsString()
  @Length(0, 100)
  keyword = ''
}

/** 水印新增与完整编辑字段白名单 */
export class WatermarkDto {
  /** 水印名称，去除首尾空白后1至100字符 */
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string
  /** 水印HTTP或HTTPS图片地址，最长4096字符 */
  @Transform(trim)
  @IsString()
  @Length(1, 4096)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
    max_allowed_length: 4096,
    disallow_auth: true
  })
  images: string
}

/** 旧协议水印编号参数 */
export class WatermarkIdDto {
  /** MySQL正整数编号，以字符串传输 */
  @IsString()
  @Matches(/^[1-9]\d{0,9}$/)
  watermarkId: string
}

/** 兼容原POST编辑协议，名称及图片必须完整提交 */
export class UpdateWatermarkDto extends WatermarkDto {
  /** 待编辑水印编号 */
  @IsString()
  @Matches(/^[1-9]\d{0,9}$/)
  watermarkId: string
}
