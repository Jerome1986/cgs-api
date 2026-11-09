CREATE TABLE watermarks (
  id INTEGER NOT NULL AUTO_INCREMENT COMMENT '水印编号',
  name VARCHAR(100) NOT NULL COMMENT '水印名称',
  image_url VARCHAR(4096) NOT NULL COMMENT 'HTTP图片地址，对外兼容images字段',
  deleted_at DATETIME(3) NULL COMMENT '软删除时间，空表示可用',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_at DATETIME(3) NOT NULL COMMENT '更新时间',
  PRIMARY KEY (id),
  INDEX watermarks_deleted_at_id_idx (deleted_at, id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='后台维护与Electron共用水印配置';
