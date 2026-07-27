-- 已部署数据库执行一次：为 (createTime, id) 稳定游标分页增加复合索引。
CREATE INDEX idx_appId_createTime_id ON chat_history (appId, createTime, id);
