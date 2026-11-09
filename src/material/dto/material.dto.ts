import { Transform, Type } from 'class-transformer'
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ArrayMaxSize,
  IsUrl,
  ValidateBy
} from 'class-validator'
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
/** 素材写入白名单 */
export class MaterialDto {
  /** 一级分类编号 */
  @IsString() @Matches(/^[1-9]\d{0,9}$/) top_id: string
  /** 二级分类编号，空串表示不选 */
  @IsString() @Matches(/^(?:[1-9]\d{0,9})?$/) sub_id = ''
  /** 中文名称 */
  @Transform(trim) @IsString() @Length(1, 200) name: string
  /** 英文名称 */
  @Transform(trim) @IsString() @Length(0, 200) en_name = ''
  /** HTTP封面地址 */
  @IsUrl({
    require_tld: false,
    protocols: ['http', 'https'],
    require_protocol: true
  })
  cover_url: string
  /** 下载地址，兼容单地址或多文件 */
  @ValidateBy({
    name: 'filesUrl',
    validator: {
      validate: (v: unknown) => {
        const urls = typeof v === 'string' ? [v] : v
        return (
          Array.isArray(urls) &&
          urls.length > 0 &&
          urls.length <= 100 &&
          urls.every(
            (u: unknown) => typeof u === 'string' && /^https?:\/\//.test(u) && u.length <= 4096
          )
        )
      }
    }
  })
  files_url: string | string[]
  /** 属性标签名称 */
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  tags: string[] = []
  /** 颜色标签 */
  @IsArray()
  @ArrayMaxSize(100)
  @Matches(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i, {
    each: true
  })
  colors: string[] = []
  /** 素材类型 */
  @IsIn(['模型', '贴图', '灯光', '材质']) type: string
  /** 上架状态 */
  @IsInt() @IsIn([0, 1]) status = 1
}
/** 修改素材 */
export class UpdateMaterialDto extends MaterialDto {
  /** 素材编号 */
  @IsString() @Matches(/^[1-9]\d{0,9}$/) _id: string
}
/** 删除素材 */
export class DeleteMaterialDto {
  /** 素材编号 */
  @IsString() @Matches(/^[1-9]\d{0,9}$/) material_id: string
}
/** 兼容后台与Electron的查询参数，统一在Service归一化 */
export class QueryMaterialDto {
  /** 后台页码 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  pagesNum?: number
  /** 后台每页条数 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pagesSize?: number
  /** Electron页码 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  pageNum?: number
  /** Electron每页条数 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number
  /** 后台素材类型 */
  @IsOptional() @IsIn(['模型', '贴图', '灯光', '材质']) materialType?: string
  /** 分类查询类型 */
  @IsOptional() @IsIn(['模型', '贴图', '灯光', '材质']) pageType?: string
  /** 组合查询类型 */
  @IsOptional() @IsIn(['模型', '贴图', '灯光', '材质']) pagesType?: string
  /** 分类编号或ALL、NEW */
  @IsOptional() @IsString() @Length(0, 16) cate_id?: string
  /** 筛选分类编号 */
  @IsOptional() @IsString() @Length(0, 16) cateId?: string
  /** 后台关键词 */
  @IsOptional() @IsString() @Length(0, 200) searchValue?: string
  /** Electron关键词 */
  @IsOptional() @IsString() @Length(0, 200) searchVal?: string
  /** 属性标签 */
  @IsOptional() @IsString() @Length(0, 50) tag?: string
  /** 当前属性标签 */
  @IsOptional() @IsString() @Length(0, 50) currentTag?: string
  /** 颜色 */
  @IsOptional() @IsString() @Length(0, 16) color?: string
  /** 当前颜色 */
  @IsOptional() @IsString() @Length(0, 16) currentColor?: string
  /** 收藏编号，逗号分隔 */
  @IsOptional() @IsString() @Length(0, 12000) loveIds?: string
  /** 下载编号，逗号分隔 */
  @IsOptional() @IsString() @Length(0, 12000) downIds?: string
}
