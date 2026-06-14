import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");

const YEARS = [2021, 2022, 2023, 2024, 2025];
const GAS = "co2e_100yr";
const ADMIN_ID = "CHN.6_1";
const EMISSION_BASE = "https://api.climatetrace.org/v7/sources/emissions";
const TEMPERATURE_BASE = "https://archive-api.open-meteo.com/v1/archive";
const ADMIN_URL = `https://api.climatetrace.org/v7/admins/${ADMIN_ID}/subdivisions`;
const BOUNDARY_URL = "https://geo.datav.aliyun.com/areas_v3/bound/440000_full.json";

const cityNameZh = {
  Chaozhou: "潮州",
  Dongguan: "东莞",
  Foshan: "佛山",
  Guangzhou: "广州",
  Heyuan: "河源",
  Huizhou: "惠州",
  Jiangmen: "江门",
  Jieyang: "揭阳",
  Maoming: "茂名",
  Meizhou: "梅州",
  Qingyuan: "清远",
  Shantou: "汕头",
  Shanwei: "汕尾",
  Shaoguan: "韶关",
  Shenzhen: "深圳",
  Yangjiang: "阳江",
  Yunfu: "云浮",
  Zhanjiang: "湛江",
  Zhaoqing: "肇庆",
  Zhongshan: "中山",
  Zhuhai: "珠海"
};

const cityNameEn = Object.fromEntries(Object.entries(cityNameZh).map(([en, zh]) => [zh, en]));

const sectorLabels = {
  agriculture: "农业",
  buildings: "建筑",
  "fluorinated-gases": "含氟气体",
  "fossil-fuel-operations": "化石燃料作业",
  manufacturing: "制造业",
  "mineral-extraction": "矿产开采",
  power: "电力",
  transportation: "交通",
  waste: "废弃物"
};

async function fetchJson(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Codex Guangdong carbon dashboard data build"
      }
    });

    if (response.ok) {
      return response.json();
    }

    if (attempt === retries) {
      const body = await response.text();
      throw new Error(`Request failed ${response.status} for ${url}\n${body.slice(0, 300)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
  }
}

function cityKeyFromAdminName(name) {
  return name.replace(" Prefecture City", "").trim();
}

function stripCitySuffix(name) {
  return name
    .replace(/自治州$/u, "")
    .replace(/地区$/u, "")
    .replace(/盟$/u, "")
    .replace(/市$/u, "");
}

function sumValues(values) {
  return values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalize(value, min, max) {
  if (!Number.isFinite(value) || max <= min) return 0;
  return (value - min) / (max - min);
}

function sectorObject(entries = []) {
  return Object.fromEntries(entries.map((entry) => [entry.sector, entry.emissionsQuantity || 0]));
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? sumValues(clean) / clean.length : 0;
}

function correlation(a, b) {
  if (a.length !== b.length || a.length < 2) return 0;
  const avgA = average(a);
  const avgB = average(b);
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

async function fetchMonthlyTemperature(center) {
  const params = new URLSearchParams({
    latitude: String(center[1]),
    longitude: String(center[0]),
    start_date: `${YEARS[0]}-01-01`,
    end_date: `${YEARS[YEARS.length - 1]}-12-31`,
    daily: "temperature_2m_mean",
    timezone: "Asia/Shanghai"
  });
  const payload = await fetchJson(`${TEMPERATURE_BASE}?${params.toString()}`);
  const buckets = new Map();

  payload.daily.time.forEach((date, index) => {
    const key = date.slice(0, 7);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(payload.daily.temperature_2m_mean[index]);
  });

  return [...buckets.entries()]
    .map(([key, values]) => {
      const [year, month] = key.split("-").map(Number);
      return {
        year,
        month,
        temperatureC: round(average(values), 2)
      };
    })
    .filter((item) => YEARS.includes(item.year))
    .sort((a, b) => (a.year - b.year) || (a.month - b.month));
}

async function buildCity(admin, center) {
  const cityKey = cityKeyFromAdminName(admin.name);
  const nameZh = cityNameZh[cityKey] || cityKey;
  const annualTotals = {};
  const sectorAnnual = {};
  const monthlyTotals = [];
  const sectorMonthly = [];
  const monthlyTemperature = await fetchMonthlyTemperature(center);

  for (const year of YEARS) {
    const params = new URLSearchParams({
      year: String(year),
      gas: GAS,
      sectors: "all_no_forest",
      gadmId: admin.id
    });
    const payload = await fetchJson(`${EMISSION_BASE}?${params.toString()}`);

    annualTotals[year] = payload.totals?.summaries?.[0]?.emissionsQuantity || 0;
    sectorAnnual[year] = sectorObject(payload.sectors?.summaries || []);

    for (const item of payload.totals?.timeseries || []) {
      monthlyTotals.push({
        year: item.year,
        month: item.month,
        value: item.emissionsQuantity || 0
      });
    }

    for (const item of payload.sectors?.timeseries || []) {
      sectorMonthly.push({
        year: item.year,
        month: item.month,
        sector: item.sector,
        value: item.emissionsQuantity || 0
      });
    }
  }

  const sectors2025 = sectorAnnual[2025] || {};
  const total2025 = annualTotals[2025] || 0;
  const total2021 = annualTotals[2021] || 0;
  const monthly2025 = monthlyTotals.filter((item) => item.year === 2025);
  const temp2025 = monthlyTemperature.filter((item) => item.year === 2025);
  const temp2021 = monthlyTemperature.filter((item) => item.year === 2021);
  const values2025 = monthly2025.map((item) => item.value);
  const maxMonthValue = Math.max(...values2025);
  const minMonthValue = Math.min(...values2025);
  const peak = monthly2025.find((item) => item.value === maxMonthValue) || { month: 1, value: 0 };
  const peakTemp = [...temp2025].sort((a, b) => b.temperatureC - a.temperatureC)[0] || { month: 1, temperatureC: 0 };
  const topSectorEntry = Object.entries(sectors2025).sort((a, b) => b[1] - a[1])[0] || ["power", 0];
  const industrialTotal = sumValues([
    sectors2025.power,
    sectors2025.manufacturing,
    sectors2025["fossil-fuel-operations"],
    sectors2025["mineral-extraction"]
  ]);

  return {
    id: admin.id,
    cityKey,
    nameEn: cityKey,
    nameZh,
    fullName: admin.full_name,
    annualTotals,
    sectorAnnual,
    monthlyTotals,
    sectorMonthly,
    monthlyTemperature,
    metrics: {
      total2025,
      total2021,
      total2025Mt: round(total2025 / 1_000_000, 3),
      growthPct: total2021 ? round(((total2025 - total2021) / total2021) * 100, 2) : 0,
      powerSharePct: total2025 ? round(((sectors2025.power || 0) / total2025) * 100, 2) : 0,
      manufacturingSharePct: total2025 ? round(((sectors2025.manufacturing || 0) / total2025) * 100, 2) : 0,
      transportSharePct: total2025 ? round(((sectors2025.transportation || 0) / total2025) * 100, 2) : 0,
      industrialSharePct: total2025 ? round((industrialTotal / total2025) * 100, 2) : 0,
      seasonalAmplitudePct: total2025 ? round(((maxMonthValue - minMonthValue) / (total2025 / 12)) * 100, 2) : 0,
      peakMonth: peak.month,
      peakMonthMt: round(peak.value / 1_000_000, 3),
      meanTemp2025C: round(average(temp2025.map((item) => item.temperatureC)), 2),
      tempChangeC: round(average(temp2025.map((item) => item.temperatureC)) - average(temp2021.map((item) => item.temperatureC)), 2),
      peakTempMonth: peakTemp.month,
      peakTempC: round(peakTemp.temperatureC, 2),
      emissionTempCorrelation: round(correlation(
        monthlyTotals.map((item) => item.value),
        monthlyTemperature.map((item) => item.temperatureC)
      ), 3),
      topSector: topSectorEntry[0],
      topSectorLabel: sectorLabels[topSectorEntry[0]] || topSectorEntry[0],
      topSectorSharePct: total2025 ? round((topSectorEntry[1] / total2025) * 100, 2) : 0
    }
  };
}

function addPressureIndex(cities) {
  const ranges = ["total2025", "growthPct", "industrialSharePct", "seasonalAmplitudePct"].reduce((acc, key) => {
    const values = cities.map((city) => city.metrics[key]);
    acc[key] = [Math.min(...values), Math.max(...values)];
    return acc;
  }, {});

  for (const city of cities) {
    const total = normalize(city.metrics.total2025, ...ranges.total2025);
    const growth = normalize(city.metrics.growthPct, ...ranges.growthPct);
    const industry = normalize(city.metrics.industrialSharePct, ...ranges.industrialSharePct);
    const seasonal = normalize(city.metrics.seasonalAmplitudePct, ...ranges.seasonalAmplitudePct);
    city.metrics.pressureIndex = round((0.45 * total + 0.2 * growth + 0.2 * industry + 0.15 * seasonal) * 100, 2);
  }

  [...cities]
    .sort((a, b) => b.metrics.pressureIndex - a.metrics.pressureIndex)
    .forEach((city, index) => {
      city.metrics.pressureRank = index + 1;
    });
}

function attachGeoMetadata(boundary, cities) {
  const byZh = new Map(cities.map((city) => [city.nameZh, city]));

  for (const feature of boundary.features) {
    const zh = stripCitySuffix(feature.properties.name);
    const city = byZh.get(zh);
    if (!city) continue;

    feature.properties.cityKey = city.cityKey;
    feature.properties.nameZh = city.nameZh;
    feature.properties.nameEn = city.nameEn;
    feature.properties.climateTraceId = city.id;
  }

  boundary.features.sort((a, b) => {
    const cityA = cityNameEn[stripCitySuffix(a.properties.name)] || "";
    const cityB = cityNameEn[stripCitySuffix(b.properties.name)] || "";
    return cityA.localeCompare(cityB);
  });
}

async function main() {
  await mkdir(dataDir, { recursive: true });

  const [admins, boundary] = await Promise.all([fetchJson(ADMIN_URL), fetchJson(BOUNDARY_URL)]);
  const centersByZh = new Map(boundary.features.map((feature) => [
    stripCitySuffix(feature.properties.name),
    feature.properties.centroid || feature.properties.center
  ]));
  const sortedAdmins = admins
    .map((admin) => ({ ...admin, cityKey: cityKeyFromAdminName(admin.name) }))
    .filter((admin) => cityNameZh[admin.cityKey])
    .sort((a, b) => a.cityKey.localeCompare(b.cityKey));

  const cities = [];
  for (const admin of sortedAdmins) {
    console.log(`Fetching ${admin.cityKey}`);
    cities.push(await buildCity(admin, centersByZh.get(cityNameZh[admin.cityKey])));
  }

  addPressureIndex(cities);
  attachGeoMetadata(boundary, cities);

  const payload = {
    generatedAt: new Date().toISOString(),
    region: {
      nameZh: "广东省",
      nameEn: "Guangdong Province",
      adminId: ADMIN_ID,
      years: YEARS,
      gas: GAS
    },
    sectorLabels,
    sources: [
      {
        label: "Climate TRACE API",
        url: "https://api.climatetrace.org/v7/sources/emissions",
        note: "GADM level-2 city emissions, gas=co2e_100yr, sectors=all_no_forest"
      },
      {
        label: "Climate TRACE Guangdong admin list",
        url: ADMIN_URL,
        note: "Administrative IDs for Guangdong prefecture-level cities"
      },
      {
        label: "DataV GeoJSON boundary",
        url: BOUNDARY_URL,
        note: "Guangdong city boundary polygons"
      },
      {
        label: "Open-Meteo Historical Weather API",
        url: TEMPERATURE_BASE,
        note: "ERA5/ERA5-Land daily 2 m mean temperature aggregated to monthly means"
      }
    ],
    cities,
    geojson: boundary
  };

  await writeFile(
    path.join(dataDir, "guangdong-carbon-dashboard.json"),
    `${JSON.stringify(payload)}\n`,
    "utf8"
  );

  console.log(`Wrote ${cities.length} cities to data/guangdong-carbon-dashboard.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
