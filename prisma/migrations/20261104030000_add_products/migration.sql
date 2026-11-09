CREATE TABLE products (
  id INTEGER NOT NULL AUTO_INCREMENT COMMENT '商品编号',
  product_type VARCHAR(16) NOT NULL COMMENT 'gold金币充值、membership会员套餐',
  product_name VARCHAR(200) NOT NULL COMMENT '商品中文名称',
  en_name VARCHAR(200) NOT NULL DEFAULT '' COMMENT '商品英文名称',
  price DECIMAL(10,2) NOT NULL COMMENT '人民币价格，单位元',
  gold_coins_amount INTEGER NOT NULL DEFAULT 0 COMMENT '金币数量，会员商品为0',
  membership_type VARCHAR(16) NOT NULL DEFAULT '' COMMENT 'annual年费、permanent永久，金币商品为空',
  daily_download_limit INTEGER NOT NULL DEFAULT 0 COMMENT '每日下载额度，金币商品为0',
  description VARCHAR(2000) NOT NULL COMMENT '中文描述',
  en_description VARCHAR(2000) NOT NULL DEFAULT '' COMMENT '英文描述',
  is_active BOOLEAN NOT NULL DEFAULT true COMMENT '是否上架',
  deleted_at DATETIME(3) NULL COMMENT '软删除时间',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_at DATETIME(3) NOT NULL COMMENT '更新时间',
  PRIMARY KEY (id),
  INDEX products_deleted_at_is_active_product_type_id_idx (deleted_at,is_active,product_type,id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='金币充值包与会员套餐';
