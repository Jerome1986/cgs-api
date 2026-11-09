import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf
} from 'class-validator'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
/** 兼容Electron的中文类型筛选，内部统一英文业务值 */
const productType = ({ value }: { value: unknown }) =>
  value === '金币充值' ? 'gold' : value === '购买会员' ? 'membership' : value

/** 商品列表筛选；公开接口忽略上下架筛选且只返回在售商品 */
export class QueryProductDto {
  /** 页码，省略时为第一页 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  pagesNumber = 1
  /** 每页条数；公开接口省略时返回所有在售套餐 */
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pagesSize?: number
  /** 商品类型，支持英文值和旧中文值 */
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @Transform(productType)
  @IsIn(['gold', 'membership'])
  productType?: string
  /** 中文或英文名称关键词 */
  @Transform(trim)
  @IsString()
  @Length(0, 200)
  keyword = ''
  /** 后台上下架筛选，严格解析true/false */
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value
  )
  @IsBoolean()
  isActive?: boolean
}

/** 商品完整写入白名单，跨类型字段由业务层归一化 */
export class ProductDto {
  /** 商品类型 */
  @Transform(productType)
  @IsIn(['gold', 'membership'])
  productType: string
  /** 中文名称 */
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  productName: string
  /** 英文名称 */
  @Transform(trim)
  @IsString()
  @Length(0, 200)
  en_name = ''
  /** 人民币价格，单位元，大于0且最多两位小数 */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  price: number
  /** 金币数量 */
  @IsInt()
  @Min(0)
  @Max(2147483647)
  goldCoinsAmount = 0
  /** 会员类型，金币商品为空 */
  @IsIn(['', 'annual', 'permanent'])
  membershipType = ''
  /** 每日下载次数 */
  @IsInt()
  @Min(0)
  @Max(2147483647)
  dailyDownloadLimit = 0
  /** 中文描述 */
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  description: string
  /** 英文描述 */
  @Transform(trim)
  @IsString()
  @Length(0, 2000)
  en_description = ''
  /** 是否上架 */
  @IsBoolean()
  isActive = true
}

/** 编辑商品的完整数据 */
export class UpdateProductDto extends ProductDto {
  /** 旧协议字符串商品编号 */
  @IsString()
  @Matches(/^[1-9]\d{0,9}$/)
  _id: string
}

/** 删除商品参数 */
export class DeleteProductDto {
  /** 旧删除协议编号 */
  @IsString()
  @Matches(/^[1-9]\d{0,9}$/)
  id: string
}

/** 独立上下架参数，避免覆盖价格与权益 */
export class ProductStatusDto {
  /** 商品编号 */
  @IsString()
  @Matches(/^[1-9]\d{0,9}$/)
  _id: string
  /** 目标上下架状态 */
  @IsBoolean()
  isActive: boolean
}
