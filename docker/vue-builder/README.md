# Vue 离线构建镜像

运行时构建容器使用 `--network none`，通过符号链接直接引用镜像内预装的 `node_modules`（避免在 bind mount 上逐文件复制依赖，Windows 本地可提速 ~6 倍），随后执行 `npm run build`。因此，运行时不会执行 npm 安装，也不要求生成项目带有 `package-lock.json`。

首次或更新依赖白名单后，由管理员在可联网的受控环境执行：

```bash
docker build -t fish-ai-code-vue-builder:20 -f docker/vue-builder/Dockerfile docker/vue-builder
```

`package.json` 中列出了当前支持的 Vue/Vite 依赖版本。预热下载源为 `registry.npmmirror.com`。如果生成项目使用了清单外的依赖，构建会明确失败；审核后将依赖固定版本加入此文件、重新构建镜像，再部署该镜像；不要为运行时构建容器开放网络。
