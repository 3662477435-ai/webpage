# 广东碳排放暴露监测

一个参考 `viewExposed` 和 NASA/OSU CO2 互动地图风格的广东城市级数据展示原型。

## 数据

- Climate TRACE API: `https://api.climatetrace.org/v7/sources/emissions`
- Climate TRACE 广东地级市行政 ID: `https://api.climatetrace.org/v7/admins/CHN.6_1/subdivisions`
- DataV 广东地级市边界: `https://geo.datav.aliyun.com/areas_v3/bound/440000_full.json`
- Open-Meteo Historical Weather API: `https://archive-api.open-meteo.com/v1/archive`
- OpenStreetMap tiles: `https://tile.openstreetmap.org`

本地数据文件由 `npm run fetch:data` 生成，时间范围为 2021-2025。排放气体指标为 `co2e_100yr`，部门过滤为 `all_no_forest`。温度使用城市中心点的日均 2 m 气温，聚合为月均温。

## 运行

```bash
npm run fetch:data
npm run serve
```

打开 `http://localhost:4173`。
