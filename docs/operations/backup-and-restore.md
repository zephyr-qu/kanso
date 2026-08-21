# Docker 备份与恢复

Kanso 的数据目录由 Docker volume 挂载到 `/data`。逻辑备份通过 `/api/settings/backup` 导出，导入前服务会自动把当前数据保存到 `/data/backups/pre-import-*.json`，导入失败或误操作时可从该目录取回快照。

## 导出逻辑备份

```bash
docker exec kanso wget -qO- \
  --header="Authorization: Bearer $KANSO_ACCESS_KEY" \
  http://127.0.0.1:8080/api/settings/backup > kanso-backup.json
```

备份文件包含 `schema`、`version`、`exportedAt` 和完整业务数据。请将 JSON 文件存放在受控位置；它不包含访问密钥，但包含项目内容、评论和活动记录。

## 导入逻辑备份

导入会覆盖当前业务数据。先确认文件来源，再执行：

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $KANSO_ACCESS_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @kanso-backup.json \
  http://127.0.0.1:8080/api/settings/backup
```

导入前自动快照位于容器内 `/data/backups/`。如需保留到宿主机，可复制出来：

```bash
docker cp kanso:/data/backups ./kanso-pre-import-backups
```

## 文件级数据库备份

文件级复制必须在服务停止后进行，以保证 `kanso.db`、`kanso.db-wal` 和 `kanso.db-shm` 不会形成不一致副本：

```bash
docker stop kanso
docker run --rm \
  -v kanso-data:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/kanso-data.tgz -C /data .
docker start kanso
```

恢复文件级备份时先停止容器，再将归档解压回同一个 volume，最后启动并检查就绪探针：

```bash
docker stop kanso
docker run --rm \
  -v kanso-data:/data \
  -v "$PWD":/backup \
  alpine sh -c 'rm -rf /data/* && tar xzf /backup/kanso-data.tgz -C /data'
docker start kanso
curl --fail http://127.0.0.1:8080/api/ready
```

生产环境建议同时保留周期性逻辑备份和文件级备份，并定期在隔离环境演练恢复。
