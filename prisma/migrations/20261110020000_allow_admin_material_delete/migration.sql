-- 管理员可物理删除已有下载授权的素材；保留原素材编号、扣费凭据和每日用量。
-- 原外键的索引保留，收藏仍由 user_favorites 的外键自动清理。
ALTER TABLE download_grants DROP FOREIGN KEY download_grants_material_fk;
