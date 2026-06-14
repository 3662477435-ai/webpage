const DATA_URL = "data/guangdong-carbon-dashboard.json";
const START_YEAR = 2021;
const END_YEAR = 2025;
const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

const d3lib = window.d3;

const metricDefs = {
  monthly: { label: "月排放", icon: "calendar-days", unit: "MtCO2e", palette: "emissions" },
  temperature: { label: "月均温", icon: "thermometer", unit: "°C", palette: "temperature" },
  annual: { label: "年总量", icon: "bar-chart-3", unit: "MtCO2e", palette: "emissions" },
  growth: { label: "2021-2025 增幅", icon: "trending-up", unit: "%", palette: "growth" },
  powerShare: { label: "电力占比", icon: "zap", unit: "%", palette: "share" },
  industrialShare: { label: "产业压力", icon: "factory", unit: "%", palette: "share" },
  pressureIndex: { label: "综合压力指数", icon: "gauge", unit: "0-100", palette: "pressure" }
};

const axisDefs = [
  { key: "total2025Mt", label: "2025总量", suffix: "Mt", value: (city) => city.metrics.total2025Mt },
  { key: "growthPct", label: "增幅", suffix: "%", value: (city) => city.metrics.growthPct },
  { key: "powerSharePct", label: "电力", suffix: "%", value: (city) => city.metrics.powerSharePct },
  { key: "manufacturingSharePct", label: "制造", suffix: "%", value: (city) => city.metrics.manufacturingSharePct },
  { key: "transportSharePct", label: "交通", suffix: "%", value: (city) => city.metrics.transportSharePct },
  { key: "meanTemp2025C", label: "年均温", suffix: "°C", value: (city) => city.metrics.meanTemp2025C },
  { key: "seasonalAmplitudePct", label: "季节波动", suffix: "%", value: (city) => city.metrics.seasonalAmplitudePct },
  { key: "emissionTempCorrelation", label: "温排相关", suffix: "", value: (city) => city.metrics.emissionTempCorrelation },
  { key: "pressureIndex", label: "压力指数", suffix: "", value: (city) => city.metrics.pressureIndex }
];

const sectorColors = {
  power: "#b9482b",
  manufacturing: "#286f8f",
  transportation: "#1f7a5c",
  buildings: "#c58a1d",
  waste: "#756bb1",
  agriculture: "#7f8f3a",
  "fossil-fuel-operations": "#6d4c41",
  "mineral-extraction": "#8d8f94",
  "fluorinated-gases": "#b65f8f"
};

const tableColumns = [
  { key: "nameZh", label: "城市", sort: (city) => city.nameZh, format: (city) => city.nameZh },
  { key: "month", label: "当前月 Mt", sort: (city) => monthlyValue(city, state.year, state.month), format: (city) => formatNumber(monthlyValue(city, state.year, state.month) / 1_000_000, 2) },
  { key: "temperature", label: "月均温 °C", sort: (city) => monthlyTemperature(city, state.year, state.month), format: (city) => formatNumber(monthlyTemperature(city, state.year, state.month), 1) },
  { key: "annual2025", label: "2025 Mt", sort: (city) => city.metrics.total2025Mt, format: (city) => formatNumber(city.metrics.total2025Mt, 1) },
  { key: "growthPct", label: "增幅 %", sort: (city) => city.metrics.growthPct, format: (city) => formatSigned(city.metrics.growthPct) },
  { key: "powerSharePct", label: "电力 %", sort: (city) => city.metrics.powerSharePct, format: (city) => formatNumber(city.metrics.powerSharePct, 1) },
  { key: "manufacturingSharePct", label: "制造 %", sort: (city) => city.metrics.manufacturingSharePct, format: (city) => formatNumber(city.metrics.manufacturingSharePct, 1) },
  { key: "transportSharePct", label: "交通 %", sort: (city) => city.metrics.transportSharePct, format: (city) => formatNumber(city.metrics.transportSharePct, 1) },
  { key: "correlation", label: "温排相关", sort: (city) => city.metrics.emissionTempCorrelation, format: (city) => formatNumber(city.metrics.emissionTempCorrelation, 2) },
  { key: "pressureIndex", label: "压力指数", sort: (city) => city.metrics.pressureIndex, format: (city) => formatNumber(city.metrics.pressureIndex, 1) }
];

const state = {
  selectedCityKey: "Guangzhou",
  metric: "monthly",
  year: 2025,
  month: 12,
  opacity: 0.88,
  tableSearch: "",
  sortKey: "pressureIndex",
  sortDir: "desc",
  visibleAxes: new Set(axisDefs.map((axis) => axis.key))
};

let dataset;
let cityByKey;
let playTimer = null;
let resizeTimer = null;
let basemapCacheKey = "";

const el = {
  mapSvg: document.querySelector("#mapSvg"),
  mapTooltip: document.querySelector("#mapTooltip"),
  mapTitle: document.querySelector("#mapTitle"),
  mapSubtitle: document.querySelector("#mapSubtitle"),
  legend: document.querySelector("#legend"),
  metricTabs: document.querySelector("#metricTabs"),
  playButton: document.querySelector("#playButton"),
  dateLabel: document.querySelector("#dateLabel"),
  timeSlider: document.querySelector("#timeSlider"),
  opacitySlider: document.querySelector("#opacitySlider"),
  resetView: document.querySelector("#resetView"),
  openSources: document.querySelector("#openSources"),
  closeSources: document.querySelector("#closeSources"),
  sourcesDialog: document.querySelector("#sourcesDialog"),
  sourceList: document.querySelector("#sourceList"),
  citySelect: document.querySelector("#citySelect"),
  cityName: document.querySelector("#cityName"),
  cityMeta: document.querySelector("#cityMeta"),
  kpiMonth: document.querySelector("#kpiMonth"),
  kpiMonthRank: document.querySelector("#kpiMonthRank"),
  kpiAnnual: document.querySelector("#kpiAnnual"),
  kpiTrend: document.querySelector("#kpiTrend"),
  kpiTopSector: document.querySelector("#kpiTopSector"),
  kpiTopSectorShare: document.querySelector("#kpiTopSectorShare"),
  kpiTemp: document.querySelector("#kpiTemp"),
  kpiTempTrend: document.querySelector("#kpiTempTrend"),
  kpiPressure: document.querySelector("#kpiPressure"),
  kpiPressureRank: document.querySelector("#kpiPressureRank"),
  kpiCorrelation: document.querySelector("#kpiCorrelation"),
  lineChart: document.querySelector("#lineChart"),
  sectorBars: document.querySelector("#sectorBars"),
  sectorYearLabel: document.querySelector("#sectorYearLabel"),
  temporalMonth: document.querySelector("#temporalMonth"),
  temporalStats: document.querySelector("#temporalStats"),
  temporalChart: document.querySelector("#temporalChart"),
  axisToggles: document.querySelector("#axisToggles"),
  parallelChart: document.querySelector("#parallelChart"),
  tableSearch: document.querySelector("#tableSearch"),
  cityTable: document.querySelector("#cityTable")
};

init();

async function init() {
  if (!d3lib) {
    document.body.innerHTML = "<main class='app-shell'><h1>D3 加载失败</h1></main>";
    return;
  }

  const response = await fetch(DATA_URL);
  dataset = await response.json();
  cityByKey = new Map(dataset.cities.map((city) => [city.cityKey, city]));

  buildControls();
  bindEvents();
  renderAll();
}

function buildControls() {
  el.metricTabs.innerHTML = Object.entries(metricDefs)
    .map(([key, metric]) => `
      <button class="metric-tab" type="button" data-metric="${key}" role="tab" aria-selected="${key === state.metric}">
        <i data-lucide="${metric.icon}"></i><span>${metric.label}</span>
      </button>
    `)
    .join("");

  el.citySelect.innerHTML = dataset.cities
    .map((city) => `<option value="${city.cityKey}">${city.nameZh}</option>`)
    .join("");

  el.axisToggles.innerHTML = axisDefs
    .map((axis) => `
      <label class="axis-toggle">
        <input type="checkbox" value="${axis.key}" checked />
        <span>${axis.label}</span>
      </label>
    `)
    .join("");

  el.sourceList.innerHTML = [
    ...dataset.sources,
    {
      label: "viewExposed reference",
      url: "https://opach.folk.ntnu.no/tools/viewexposed/",
      note: "地图图层、平行坐标和数据表参考"
    },
    {
      label: "A Year in the Life of Earth's CO2 reference",
      url: "http://co2.digitalcartography.org/",
      note: "时间播放、CO2 主题和地图叙事参考"
    },
    {
      label: "OpenStreetMap",
      url: "https://www.openstreetmap.org/copyright",
      note: "地图底图瓦片与版权署名"
    }
  ].map((source) => `
    <article class="source-item">
      <a href="${source.url}" target="_blank" rel="noreferrer">${source.label}</a>
      <p>${source.note}</p>
    </article>
  `).join("");

  refreshIcons();
}

function bindEvents() {
  el.metricTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-metric]");
    if (!button) return;
    state.metric = button.dataset.metric;
    renderAll();
  });

  el.citySelect.addEventListener("change", () => {
    selectCity(el.citySelect.value);
  });

  el.timeSlider.addEventListener("input", () => {
    setTimeIndex(Number(el.timeSlider.value));
  });

  el.opacitySlider.addEventListener("input", () => {
    state.opacity = Number(el.opacitySlider.value) / 100;
    renderMap();
  });

  el.playButton.addEventListener("click", togglePlayback);

  el.resetView.addEventListener("click", () => {
    state.selectedCityKey = "Guangzhou";
    state.metric = "monthly";
    state.year = 2025;
    state.month = 12;
    state.opacity = 0.88;
    state.sortKey = "pressureIndex";
    state.sortDir = "desc";
    state.tableSearch = "";
    el.tableSearch.value = "";
    el.opacitySlider.value = 88;
    renderAll();
  });

  el.axisToggles.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    if (input.checked) {
      state.visibleAxes.add(input.value);
    } else if (state.visibleAxes.size > 2) {
      state.visibleAxes.delete(input.value);
    } else {
      input.checked = true;
    }

    renderParallel();
  });

  el.tableSearch.addEventListener("input", () => {
    state.tableSearch = el.tableSearch.value.trim();
    renderTable();
  });

  el.openSources.addEventListener("click", () => el.sourcesDialog.showModal());
  el.closeSources.addEventListener("click", () => el.sourcesDialog.close());

  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      renderMap();
      renderTemporalChart();
      renderLineChart();
      renderParallel();
    }, 120);
  });
}

function renderAll() {
  el.citySelect.value = state.selectedCityKey;
  el.timeSlider.value = timeIndex(state.year, state.month);
  el.dateLabel.textContent = `${state.year} / ${String(state.month).padStart(2, "0")}`;

  for (const button of el.metricTabs.querySelectorAll("[data-metric]")) {
    button.setAttribute("aria-selected", String(button.dataset.metric === state.metric));
  }

  renderMap();
  renderTemporalChart();
  renderInspector();
  renderLineChart();
  renderSectorBars();
  renderParallel();
  renderTable();
  refreshIcons();
}

function renderMap() {
  const svg = d3lib.select(el.mapSvg);
  const rect = el.mapSvg.getBoundingClientRect();
  const width = Math.max(420, rect.width || 820);
  const height = Math.max(420, rect.height || 560);
  const selectedCity = getSelectedCity();
  const metric = metricDefs[state.metric];
  const layout = webMercatorLayout(dataset.geojson, width, height, 30);
  const projection = layout.projection;
  const path = d3lib.geoPath(projection);
  const features = dataset.geojson.features;
  const values = features.map((feature) => metricValue(cityByKey.get(feature.properties.cityKey), state.metric));
  const scale = colorScale(values, metric.palette);
  const currentTemps = dataset.cities.map((city) => monthlyTemperature(city, state.year, state.month));
  const tempScale = d3lib.scaleSequential(d3lib.interpolateYlOrRd).domain(d3lib.extent(currentTemps));
  const layers = mapLayers(svg);

  svg.attr("viewBox", `0 0 ${width} ${height}`);

  updateBasemapLayer(layers.basemap, layout, width, height);
  updateTemperatureCloudLayer(layers.clouds, layout, tempScale);

  layers.data.selectAll(".city-shape")
    .data(features, (feature) => feature.properties.cityKey)
    .join("path")
    .attr("class", "city-shape")
    .attr("d", path)
    .attr("fill", (feature) => scale(metricValue(cityByKey.get(feature.properties.cityKey), state.metric)))
    .attr("fill-opacity", state.opacity)
    .attr("stroke", (feature) => feature.properties.cityKey === state.selectedCityKey ? "#1c2621" : "#ffffff")
    .attr("stroke-width", (feature) => feature.properties.cityKey === state.selectedCityKey ? 2.2 : 0.9)
    .on("pointerenter", showTooltip)
    .on("pointermove", moveTooltip)
    .on("pointerleave", hideTooltip)
    .on("click", (_event, feature) => selectCity(feature.properties.cityKey));

  const labelData = [dataset.geojson.features.find((feature) => feature.properties.cityKey === state.selectedCityKey)].filter(Boolean);
  layers.labels.selectAll(".map-label")
    .data(labelData, (feature) => feature.properties.cityKey)
    .join("text")
    .attr("class", "map-label")
    .attr("x", (feature) => path.centroid(feature)[0])
    .attr("y", (feature) => path.centroid(feature)[1])
    .attr("text-anchor", "middle")
    .text((feature) => feature.properties.nameZh);

  el.mapTitle.textContent = `广东省地级市 ${metric.label}`;
  const tempNote = state.metric === "temperature"
    ? ""
    : ` | 月均温 ${formatNumber(monthlyTemperature(selectedCity, state.year, state.month), 1)}°C`;
  el.mapSubtitle.textContent = `${state.year}年${state.month}月 | 选中 ${selectedCity.nameZh} | ${metric.label}: ${formatMetric(metricValue(selectedCity, state.metric), state.metric)}${tempNote}`;
  renderLegend(scale, values);
}

function renderLegend(scale, values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const stops = d3lib.range(6).map((index) => min + ((max - min) * index) / 5);

  el.legend.innerHTML = `
    <div class="legend-row">
      ${stops.map((value) => `<span style="background:${scale(value)}"></span>`).join("")}
    </div>
    <div class="legend-labels">
      <span>${formatMetric(min, state.metric)}</span>
      <span>${formatMetric(max, state.metric)}</span>
    </div>
  `;
}

function mapLayers(svg) {
  ensureMapDefs(svg);

  const layerDefs = [
    { key: "basemap", className: "basemap-layer" },
    { key: "clouds", className: "temperature-cloud-layer" },
    { key: "data", className: "data-layer" },
    { key: "labels", className: "label-layer" }
  ];

  svg.selectAll("g.map-layer")
    .data(layerDefs, (layer) => layer.key)
    .join("g")
    .attr("class", (layer) => `map-layer ${layer.className}`)
    .order();

  return {
    basemap: svg.select(".basemap-layer"),
    clouds: svg.select(".temperature-cloud-layer"),
    data: svg.select(".data-layer"),
    labels: svg.select(".label-layer")
  };
}

function ensureMapDefs(svg) {
  const defs = svg.selectAll("defs")
    .data([null])
    .join("defs");

  defs.selectAll("#temperatureBlur")
    .data([null])
    .join("filter")
    .attr("id", "temperatureBlur")
    .attr("x", "-80%")
    .attr("y", "-80%")
    .attr("width", "260%")
    .attr("height", "260%")
    .selectAll("feGaussianBlur")
    .data([null])
    .join("feGaussianBlur")
    .attr("stdDeviation", 16);
}

function updateBasemapLayer(layer, layout, width, height) {
  const tiles = osmTiles(layout, width, height);
  const cacheKey = tiles
    .map((tile) => `${tile.z}/${tile.x}/${tile.y}/${Math.round(tile.screenX)}/${Math.round(tile.screenY)}/${Math.round(tile.size)}`)
    .join("|");

  if (basemapCacheKey === cacheKey && layer.selectAll(".osm-tile").size() === tiles.length) {
    return;
  }

  basemapCacheKey = cacheKey;
  layer.selectAll(".osm-tile")
    .data(tiles, (tile) => `${tile.z}-${tile.x}-${tile.y}`)
    .join("image")
    .attr("class", "osm-tile")
    .attr("href", (tile) => tile.url)
    .attr("x", (tile) => tile.screenX)
    .attr("y", (tile) => tile.screenY)
    .attr("width", (tile) => tile.size)
    .attr("height", (tile) => tile.size)
    .attr("preserveAspectRatio", "none");
}

function updateTemperatureCloudLayer(layer, layout, tempScale) {
  const tempExtent = d3lib.extent(dataset.cities, (city) => monthlyTemperature(city, state.year, state.month));
  const cloudGroups = layer.selectAll(".temp-cloud")
    .data(dataset.cities, (city) => city.cityKey)
    .join((enter) => {
      const group = enter.append("g")
        .attr("class", "temp-cloud");
      group.append("g")
        .attr("class", "cloud-motion");
      return group;
    })
    .attr("transform", (city) => {
      const [x, y] = layout.project(cityCenter(city));
      return `translate(${x} ${y})`;
    })
    .style("opacity", state.metric === "temperature" ? 0.5 : 0.24)
    .style("animation-delay", (city) => `${cloudSeed(city.cityKey, 3) * -0.8}s`);

  cloudGroups.select(".cloud-motion")
    .style("--drift-x", (city) => `${Math.round(-14 + cloudSeed(city.cityKey, 0) * 28)}px`)
    .style("--drift-y", (city) => `${Math.round(-8 + cloudSeed(city.cityKey, 1) * 16)}px`);

  cloudGroups.select(".cloud-motion")
    .selectAll(".cloud-puff")
    .data((city) => cloudPuffs(city, tempExtent), (puff) => puff.id)
    .join("ellipse")
    .attr("class", "cloud-puff")
    .attr("cx", (puff) => puff.x)
    .attr("cy", (puff) => puff.y)
    .attr("rx", (puff) => puff.rx)
    .attr("ry", (puff) => puff.ry)
    .attr("fill", (puff) => tempScale(puff.temperature))
    .attr("filter", "url(#temperatureBlur)")
    .attr("opacity", (puff) => puff.opacity);
}

function cloudPuffs(city, tempExtent) {
  const temp = monthlyTemperature(city, state.year, state.month);
  const normalized = normalizeExtent(temp, tempExtent[0], tempExtent[1]);
  const radius = 22 + normalized * 50;
  const opacity = 0.28 + normalized * 0.34;

  return d3lib.range(5).map((index) => {
    const angle = cloudSeed(city.cityKey, index) * Math.PI * 2;
    const distance = index === 0 ? 0 : radius * (0.18 + cloudSeed(city.cityKey, index + 9) * 0.42);
    return {
      id: `${city.cityKey}-${index}`,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance * 0.7,
      rx: radius * (0.55 + cloudSeed(city.cityKey, index + 20) * 0.45),
      ry: radius * (0.32 + cloudSeed(city.cityKey, index + 30) * 0.32),
      temperature: temp,
      opacity: opacity * (index === 0 ? 0.9 : 0.56)
    };
  });
}

function cloudSeed(key, salt) {
  let hash = 2166136261 + salt * 374761393;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function normalizeExtent(value, min, max) {
  if (!Number.isFinite(value) || max <= min) return 0.5;
  return (value - min) / (max - min);
}

function renderInspector() {
  const city = getSelectedCity();
  const monthMt = monthlyValue(city, state.year, state.month) / 1_000_000;
  const temp = monthlyTemperature(city, state.year, state.month);
  const monthRank = rankBy((item) => monthlyValue(item, state.year, state.month), city.cityKey);

  el.cityName.textContent = `${city.nameZh}市`;
  el.cityMeta.textContent = `${city.id} | ${city.fullName}`;
  el.kpiMonth.textContent = `${formatNumber(monthMt, 2)} Mt`;
  el.kpiMonthRank.textContent = `广东第 ${monthRank} 位`;
  el.kpiAnnual.textContent = `${formatNumber(city.metrics.total2025Mt, 1)} Mt`;
  el.kpiTrend.textContent = `2021-2025 ${formatSigned(city.metrics.growthPct)}`;
  el.kpiTopSector.textContent = city.metrics.topSectorLabel;
  el.kpiTopSectorShare.textContent = `${formatNumber(city.metrics.topSectorSharePct, 1)}% 占比`;
  el.kpiTemp.textContent = `${formatNumber(temp, 1)}°C`;
  el.kpiTempTrend.textContent = `2025较2021 ${formatSignedC(city.metrics.tempChangeC)}`;
  el.kpiPressure.textContent = formatNumber(city.metrics.pressureIndex, 1);
  el.kpiPressureRank.textContent = `广东第 ${city.metrics.pressureRank} 位`;
  el.kpiCorrelation.textContent = formatNumber(city.metrics.emissionTempCorrelation, 2);
}

function renderTemporalChart() {
  const timeline = aggregateTimeline();
  const current = timeline.find((item) => item.year === state.year && item.month === state.month) || timeline.at(-1);
  const svg = d3lib.select(el.temporalChart);
  const rect = el.temporalChart.getBoundingClientRect();
  const width = Math.max(360, rect.width || 760);
  const height = 150;
  const margin = { top: 12, right: 50, bottom: 24, left: 42 };
  const x = d3lib.scaleTime()
    .domain(d3lib.extent(timeline, (item) => item.date))
    .range([margin.left, width - margin.right]);
  const yEmission = d3lib.scaleLinear()
    .domain([0, d3lib.max(timeline, (item) => item.emissionsMt) * 1.08])
    .nice()
    .range([height - margin.bottom, margin.top + 20]);
  const yTemp = d3lib.scaleLinear()
    .domain(d3lib.extent(timeline, (item) => item.temperatureC))
    .nice()
    .range([height - margin.bottom, margin.top + 20]);
  const tempColor = d3lib.scaleSequential(d3lib.interpolateYlOrRd)
    .domain(d3lib.extent(timeline, (item) => item.temperatureC));
  const cellWidth = Math.max(3, (width - margin.left - margin.right) / timeline.length);

  el.temporalMonth.textContent = `${state.year} / ${String(state.month).padStart(2, "0")}`;
  el.temporalStats.textContent = `省域 ${formatNumber(current.emissionsMt, 1)} MtCO2e | 月均温 ${formatNumber(current.temperatureC, 1)}°C | r=${formatNumber(current.correlation, 2)}`;

  svg.attr("viewBox", `0 0 ${width} ${height}`).selectAll("*").remove();

  svg.append("g")
    .selectAll(".heat-cell")
    .data(timeline)
    .join("rect")
    .attr("class", "heat-cell")
    .attr("x", (item) => x(item.date) - cellWidth / 2)
    .attr("y", margin.top)
    .attr("width", cellWidth + 0.5)
    .attr("height", 18)
    .attr("fill", (item) => tempColor(item.temperatureC));

  svg.append("path")
    .datum(timeline)
    .attr("fill", "rgba(185,72,43,0.32)")
    .attr("d", d3lib.area()
      .x((item) => x(item.date))
      .y0(yEmission(0))
      .y1((item) => yEmission(item.emissionsMt))
      .curve(d3lib.curveMonotoneX));

  svg.append("path")
    .datum(timeline)
    .attr("fill", "none")
    .attr("stroke", "#ff8a45")
    .attr("stroke-width", 2.2)
    .attr("d", d3lib.line()
      .x((item) => x(item.date))
      .y((item) => yEmission(item.emissionsMt))
      .curve(d3lib.curveMonotoneX));

  svg.append("path")
    .datum(timeline)
    .attr("fill", "none")
    .attr("stroke", "#ffe084")
    .attr("stroke-width", 2)
    .attr("d", d3lib.line()
      .x((item) => x(item.date))
      .y((item) => yTemp(item.temperatureC))
      .curve(d3lib.curveMonotoneX));

  svg.append("line")
    .attr("class", "current-cursor")
    .attr("x1", x(current.date))
    .attr("x2", x(current.date))
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom);

  svg.append("circle")
    .attr("class", "current-dot")
    .attr("cx", x(current.date))
    .attr("cy", yEmission(current.emissionsMt))
    .attr("r", 4.5)
    .attr("fill", "#ff8a45");

  svg.append("circle")
    .attr("class", "current-dot")
    .attr("cx", x(current.date))
    .attr("cy", yTemp(current.temperatureC))
    .attr("r", 4.5)
    .attr("fill", "#ffe084");

  svg.append("g")
    .attr("class", "temporal-axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3lib.axisBottom(x).ticks(5).tickFormat(d3lib.timeFormat("%Y")));

  svg.append("g")
    .attr("class", "temporal-axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3lib.axisLeft(yEmission).ticks(3));

  svg.append("g")
    .attr("class", "temporal-axis")
    .attr("transform", `translate(${width - margin.right},0)`)
    .call(d3lib.axisRight(yTemp).ticks(3));

  svg.append("text")
    .attr("x", margin.left)
    .attr("y", 11)
    .attr("fill", "#ffcf96")
    .attr("font-size", 10)
    .attr("font-weight", 800)
    .text("温度热色带 / 排放面积 / 温度曲线");
}

function renderLineChart() {
  const city = getSelectedCity();
  const svg = d3lib.select(el.lineChart);
  const rect = el.lineChart.getBoundingClientRect();
  const width = Math.max(300, rect.width || 380);
  const height = 210;
  const margin = { top: 16, right: 16, bottom: 28, left: 44 };
  const series = city.monthlyTotals
    .map((item) => ({
      ...item,
      date: new Date(item.year, item.month - 1, 1),
      mt: item.value / 1_000_000
    }))
    .sort((a, b) => a.date - b.date);
  const current = series.find((item) => item.year === state.year && item.month === state.month);

  const x = d3lib.scaleTime()
    .domain(d3lib.extent(series, (item) => item.date))
    .range([margin.left, width - margin.right]);
  const y = d3lib.scaleLinear()
    .domain([0, d3lib.max(series, (item) => item.mt) * 1.08])
    .nice()
    .range([height - margin.bottom, margin.top]);

  svg.attr("viewBox", `0 0 ${width} ${height}`).selectAll("*").remove();

  svg.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3lib.axisLeft(y).ticks(4).tickSize(-(width - margin.left - margin.right)).tickFormat(""));

  svg.append("path")
    .datum(series)
    .attr("fill", "none")
    .attr("stroke", "#286f8f")
    .attr("stroke-width", 2.4)
    .attr("d", d3lib.line().x((item) => x(item.date)).y((item) => y(item.mt)).curve(d3lib.curveMonotoneX));

  svg.append("path")
    .datum(series)
    .attr("fill", "rgba(40,111,143,0.12)")
    .attr("d", d3lib.area().x((item) => x(item.date)).y0(y(0)).y1((item) => y(item.mt)).curve(d3lib.curveMonotoneX));

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3lib.axisBottom(x).ticks(5).tickFormat(d3lib.timeFormat("%Y")));

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3lib.axisLeft(y).ticks(4));

  if (current) {
    svg.append("circle")
      .attr("cx", x(current.date))
      .attr("cy", y(current.mt))
      .attr("r", 5)
      .attr("fill", "#b9482b")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);
  }
}

function renderSectorBars() {
  const city = getSelectedCity();
  const sectors = Object.entries(city.sectorAnnual[state.year] || {})
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(...sectors.map(([, value]) => value), 1);

  el.sectorYearLabel.textContent = String(state.year);
  el.sectorBars.innerHTML = sectors.slice(0, 9).map(([sector, value]) => {
    const pct = (value / (city.annualTotals[state.year] || 1)) * 100;
    return `
      <div class="bar-row">
        <span>${dataset.sectorLabels[sector] || sector}</span>
        <span class="bar-track">
          <span class="bar-fill" style="--bar-width:${(value / max) * 100}%;--bar-color:${sectorColors[sector] || "#999"}"></span>
        </span>
        <strong>${formatNumber(pct, 1)}%</strong>
      </div>
    `;
  }).join("");
}

function renderParallel() {
  const axes = axisDefs.filter((axis) => state.visibleAxes.has(axis.key));
  const svg = d3lib.select(el.parallelChart);
  const rect = el.parallelChart.getBoundingClientRect();
  const width = Math.max(620, rect.width || 1200);
  const height = 330;
  const margin = { top: 28, right: 34, bottom: 28, left: 34 };
  const x = d3lib.scalePoint()
    .domain(axes.map((axis) => axis.key))
    .range([margin.left, width - margin.right])
    .padding(0.5);
  const yScales = new Map(axes.map((axis) => {
    const values = dataset.cities.map(axis.value);
    return [axis.key, d3lib.scaleLinear().domain(d3lib.extent(values)).nice().range([height - margin.bottom, margin.top])];
  }));

  svg.attr("viewBox", `0 0 ${width} ${height}`).selectAll("*").remove();

  const line = d3lib.line()
    .x((point) => x(point.key))
    .y((point) => yScales.get(point.key)(point.value))
    .curve(d3lib.curveCatmullRom.alpha(0.35));

  svg.append("g")
    .selectAll(".parallel-line")
    .data(dataset.cities, (city) => city.cityKey)
    .join("path")
    .attr("class", "parallel-line")
    .attr("d", (city) => line(axes.map((axis) => ({ key: axis.key, value: axis.value(city) }))))
    .attr("stroke", (city) => city.cityKey === state.selectedCityKey ? "#b9482b" : "#8f978f")
    .attr("stroke-width", (city) => city.cityKey === state.selectedCityKey ? 3.1 : 1.2)
    .attr("stroke-opacity", (city) => city.cityKey === state.selectedCityKey ? 0.95 : 0.32)
    .on("pointerenter", (_event, city) => selectCity(city.cityKey));

  const axisGroups = svg.append("g")
    .selectAll(".parallel-axis")
    .data(axes)
    .join("g")
    .attr("class", "axis parallel-axis")
    .attr("transform", (axis) => `translate(${x(axis.key)},0)`);

  axisGroups.each(function drawAxis(axis) {
    d3lib.select(this).call(d3lib.axisLeft(yScales.get(axis.key)).ticks(4));
  });

  axisGroups.append("text")
    .attr("x", 0)
    .attr("y", 15)
    .attr("text-anchor", "middle")
    .attr("fill", "#1c2621")
    .attr("font-weight", 800)
    .attr("font-size", 12)
    .text((axis) => axis.label);
}

function renderTable() {
  const thead = el.cityTable.querySelector("thead");
  const tbody = el.cityTable.querySelector("tbody");
  const keyword = state.tableSearch.toLowerCase();
  const rows = dataset.cities
    .filter((city) => !keyword || city.nameZh.includes(keyword) || city.nameEn.toLowerCase().includes(keyword))
    .sort((a, b) => {
      const column = tableColumns.find((item) => item.key === state.sortKey) || tableColumns[0];
      const av = column.sort(a);
      const bv = column.sort(b);
      const order = typeof av === "string" ? String(av).localeCompare(String(bv), "zh-CN") : av - bv;
      return state.sortDir === "asc" ? order : -order;
    });

  thead.innerHTML = `
    <tr>
      ${tableColumns.map((column) => `
        <th>
          <button type="button" data-sort="${column.key}">
            <span>${column.label}</span>
            <span>${state.sortKey === column.key ? (state.sortDir === "asc" ? "↑" : "↓") : ""}</span>
          </button>
        </th>
      `).join("")}
    </tr>
  `;

  tbody.innerHTML = rows.map((city) => `
    <tr data-city="${city.cityKey}" class="${city.cityKey === state.selectedCityKey ? "is-selected" : ""}">
      ${tableColumns.map((column) => `<td>${column.format(city)}</td>`).join("")}
    </tr>
  `).join("");

  thead.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = key === "nameZh" ? "asc" : "desc";
      }
      renderTable();
    });
  });

  tbody.querySelectorAll("[data-city]").forEach((row) => {
    row.addEventListener("click", () => selectCity(row.dataset.city));
  });
}

function selectCity(cityKey) {
  if (!cityByKey.has(cityKey)) return;
  state.selectedCityKey = cityKey;
  renderAll();
}

function togglePlayback() {
  if (playTimer) {
    stopPlayback();
    return;
  }

  el.playButton.innerHTML = '<i data-lucide="pause"></i>';
  refreshIcons();
  playTimer = window.setInterval(() => {
    const next = (timeIndex(state.year, state.month) + 1) % ((END_YEAR - START_YEAR + 1) * 12);
    setTimeIndex(next);
  }, 760);
}

function stopPlayback() {
  window.clearInterval(playTimer);
  playTimer = null;
  el.playButton.innerHTML = '<i data-lucide="play"></i>';
  refreshIcons();
}

function setTimeIndex(index) {
  const year = START_YEAR + Math.floor(index / 12);
  const month = (index % 12) + 1;
  state.year = year;
  state.month = month;
  renderAll();
}

function timeIndex(year, month) {
  return (year - START_YEAR) * 12 + month - 1;
}

function getSelectedCity() {
  return cityByKey.get(state.selectedCityKey) || dataset.cities[0];
}

function monthlyValue(city, year, month) {
  return city?.monthlyTotals.find((item) => item.year === year && item.month === month)?.value || 0;
}

function monthlyTemperature(city, year, month) {
  return city?.monthlyTemperature.find((item) => item.year === year && item.month === month)?.temperatureC || 0;
}

function cityCenter(city) {
  const feature = dataset.geojson.features.find((item) => item.properties.cityKey === city.cityKey);
  return feature?.properties.centroid || feature?.properties.center || [113.3, 23.1];
}

function aggregateTimeline() {
  const months = [];
  for (let year = START_YEAR; year <= END_YEAR; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const emissionsMt = d3lib.sum(dataset.cities, (city) => monthlyValue(city, year, month)) / 1_000_000;
      const temperatureC = d3lib.mean(dataset.cities, (city) => monthlyTemperature(city, year, month)) || 0;
      months.push({
        year,
        month,
        date: new Date(year, month - 1, 1),
        emissionsMt,
        temperatureC
      });
    }
  }

  const emissions = months.map((item) => item.emissionsMt);
  const temperatures = months.map((item) => item.temperatureC);
  const corr = pearson(emissions, temperatures);
  months.forEach((item) => {
    item.correlation = corr;
  });

  return months;
}

function pearson(a, b) {
  const avgA = d3lib.mean(a) || 0;
  const avgB = d3lib.mean(b) || 0;
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const da = a[index] - avgA;
    const db = b[index] - avgB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }

  const denominator = Math.sqrt(denomA * denomB);
  return denominator ? numerator / denominator : 0;
}

function metricValue(city, metricKey) {
  if (!city) return 0;
  if (metricKey === "monthly") return monthlyValue(city, state.year, state.month) / 1_000_000;
  if (metricKey === "temperature") return monthlyTemperature(city, state.year, state.month);
  if (metricKey === "annual") return (city.annualTotals[state.year] || 0) / 1_000_000;
  if (metricKey === "growth") return city.metrics.growthPct;
  if (metricKey === "powerShare") return city.metrics.powerSharePct;
  if (metricKey === "industrialShare") return city.metrics.industrialSharePct;
  if (metricKey === "pressureIndex") return city.metrics.pressureIndex;
  return 0;
}

function colorScale(values, palette) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (palette === "growth" && min < 0) {
    return d3lib.scaleDiverging([min, 0, max], (t) => d3lib.interpolateRdYlGn(1 - t));
  }
  const interpolator = palette === "share"
    ? d3lib.interpolateBuGn
    : palette === "temperature"
      ? d3lib.interpolateYlOrRd
    : palette === "pressure"
      ? d3lib.interpolateOrRd
      : d3lib.interpolateYlOrRd;
  return d3lib.scaleSequential(interpolator).domain([min, max]);
}

function webMercatorLayout(geojson, width, height, padding) {
  const bounds = mercatorBounds(geojson);
  const xSpan = bounds.maxX - bounds.minX || 1;
  const ySpan = bounds.maxY - bounds.minY || 1;
  const scale = Math.min((width - padding * 2) / xSpan, (height - padding * 2) / ySpan);
  const xOffset = (width - xSpan * scale) / 2;
  const yOffset = (height - ySpan * scale) / 2;

  function project(point) {
    const mercator = lonLatToMercator01(point[0], point[1]);
    return [
      xOffset + (mercator.x - bounds.minX) * scale,
      yOffset + (mercator.y - bounds.minY) * scale
    ];
  }

  const projection = d3lib.geoTransform({
    point(lon, lat) {
      this.stream.point(...project([lon, lat]));
    }
  });

  return { bounds, scale, xOffset, yOffset, projection, project };
}

function mercatorBounds(geojson) {
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity
  };

  for (const feature of geojson.features) {
    visitCoordinates(feature.geometry.coordinates, (lon, lat) => {
      const mercator = lonLatToMercator01(lon, lat);
      bounds.minX = Math.min(bounds.minX, mercator.x);
      bounds.maxX = Math.max(bounds.maxX, mercator.x);
      bounds.minY = Math.min(bounds.minY, mercator.y);
      bounds.maxY = Math.max(bounds.maxY, mercator.y);
    });
  }

  return bounds;
}

function lonLatToMercator01(lon, lat) {
  const sin = Math.sin((Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180);
  return {
    x: (lon + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)
  };
}

function osmTiles(layout, width, height) {
  const z = Math.max(6, Math.min(10, Math.round(Math.log2(layout.scale / 256))));
  const n = 2 ** z;
  const minX = clamp(Math.floor(((0 - layout.xOffset) / layout.scale + layout.bounds.minX) * n), 0, n - 1);
  const maxX = clamp(Math.floor(((width - layout.xOffset) / layout.scale + layout.bounds.minX) * n), 0, n - 1);
  const minY = clamp(Math.floor(((0 - layout.yOffset) / layout.scale + layout.bounds.minY) * n), 0, n - 1);
  const maxY = clamp(Math.floor(((height - layout.yOffset) / layout.scale + layout.bounds.minY) * n), 0, n - 1);
  const size = layout.scale / n;
  const tiles = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      tiles.push({
        x,
        y,
        z,
        size,
        screenX: layout.xOffset + (x / n - layout.bounds.minX) * layout.scale,
        screenY: layout.yOffset + (y / n - layout.bounds.minY) * layout.scale,
        url: `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
      });
    }
  }

  return tiles;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function visitCoordinates(value, callback) {
  if (typeof value?.[0] === "number") {
    callback(value[0], value[1]);
    return;
  }

  for (const item of value || []) {
    visitCoordinates(item, callback);
  }
}

function showTooltip(event, feature) {
  const city = cityByKey.get(feature.properties.cityKey);
  el.mapTooltip.hidden = false;
  el.mapTooltip.innerHTML = `
    <strong>${city.nameZh}市</strong>
    <span>${metricDefs[state.metric].label}: ${formatMetric(metricValue(city, state.metric), state.metric)}</span>
    <span>月均温: ${formatNumber(monthlyTemperature(city, state.year, state.month), 1)}°C</span>
    <span>2025总量: ${formatNumber(city.metrics.total2025Mt, 1)} MtCO2e</span>
    <span>温排相关: ${formatNumber(city.metrics.emissionTempCorrelation, 2)}</span>
  `;
  moveTooltip(event);
}

function moveTooltip(event) {
  const parent = el.mapTooltip.parentElement.getBoundingClientRect();
  const x = event.clientX - parent.left + 14;
  const y = event.clientY - parent.top + 14;
  el.mapTooltip.style.left = `${Math.min(x, parent.width - 225)}px`;
  el.mapTooltip.style.top = `${Math.min(y, parent.height - 112)}px`;
}

function hideTooltip() {
  el.mapTooltip.hidden = true;
}

function rankBy(accessor, cityKey) {
  const sorted = [...dataset.cities].sort((a, b) => accessor(b) - accessor(a));
  return sorted.findIndex((city) => city.cityKey === cityKey) + 1;
}

function formatMetric(value, metricKey) {
  if (metricKey === "monthly" || metricKey === "annual") return `${formatNumber(value, 2)} Mt`;
  if (metricKey === "temperature") return `${formatNumber(value, 1)}°C`;
  if (metricKey === "growth") return `${formatSigned(value)}`;
  if (metricKey === "powerShare" || metricKey === "industrialShare") return `${formatNumber(value, 1)}%`;
  return formatNumber(value, 1);
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function formatSigned(value) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}%`;
}

function formatSignedC(value) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}°C`;
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  }
}
