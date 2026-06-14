# 长期部署说明

本项目已经整理为纯静态站点，长期部署时只需要发布 `npm run build` 生成的 `dist/` 目录。

## 推荐方式：GitHub Pages

1. 将 `china-carbon-exposure-dashboard` 推送到 GitHub 仓库。
2. 在仓库 Settings -> Pages 中选择 GitHub Actions。
3. 推送到 `main` 分支后，`.github/workflows/deploy-pages.yml` 会自动构建并发布。
4. 发布成功后得到形如 `https://用户名.github.io/仓库名/` 的长期访问地址。

## 备选方式：Vercel

1. 在 Vercel 导入该 GitHub 仓库。
2. 构建命令使用 `npm run build`。
3. 输出目录使用 `dist`。
4. 项目中已提供 `vercel.json`，导入后通常不需要额外配置。

## 备选方式：Netlify

1. 在 Netlify 导入该 GitHub 仓库。
2. 构建命令使用 `npm run build`。
3. 发布目录使用 `dist`。
4. 项目中已提供 `netlify.toml`，导入后通常不需要额外配置。

## 本地预览

```bash
npm run serve
```

打开 `http://localhost:4173` 即可预览。本地预览地址只适合自己电脑测试；长期提交、答辩或分享应使用 GitHub Pages、Vercel 或 Netlify 生成的公网地址。
