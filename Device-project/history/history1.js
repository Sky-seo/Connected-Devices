let chart;
let metric = "temperature"; // temperature | humidity | felt

document.addEventListener("DOMContentLoaded", () => {
  init();
});

async function init() {
  const canvas = document.getElementById("temperatureChart");
  if (!canvas) return;

  const { labels, values, meta } = await buildRecent7DaysHourlySeries("../logSky.json", metric, {
    timeBasis: "utc",     // "utc" | "local"
    pick: "latest",       // 같은 시간 슬롯 여러 개면 최신값
  });

  updateDayLabelsRecent7(meta, { timeBasis: "utc" });

  const ctx = canvas.getContext("2d");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: values,
        fill: true,
        backgroundColor: "rgba(200, 200, 200, 0.5)",
        borderColor: "#999",
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: false, // null이면 선 끊김
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          displayColors: false,
          callbacks: {
            title: (items) => {
              const i = items?.[0]?.dataIndex ?? 0;
              return meta.slotLabel[i] || "";
            },
            label: (item) => {
              const v = item.raw;
              if (v == null) return "No data";
              return `${metric}: ${Number(v).toFixed(1)}`;
            },
          },
        },
      },
      scales: {
        y: { display: false },
        x: {
          display: false, // 너는 지금 x축 숨기고 있었으니 유지
          ticks: {
            // 168개 너무 빽빽 → 12시간마다만 (원하면 6시간으로)
            callback: (value, index) => (index % 12 === 0 ? meta.tickLabel[index] : ""),
            maxRotation: 0,
            autoSkip: false,
          },
          grid: { display: true },
        },
      },
    },
  });
}

function setMetric(next) {
  metric = next;
  init();
}

/**
 * Recent 7 days (168 hours) hourly series from NDJSON.
 * - Finds latest timestamp in file
 * - rangeStart = latestHour - 167 hours
 * - bucket logs into 0..167 hourly slots
 * - if multiple logs in same hour slot: pick latest
 */
async function buildRecent7DaysHourlySeries(url, field, opts = {}) {
  const timeBasis = opts.timeBasis || "utc"; // "utc" | "local"

  const text = await fetchText(url);
  const rows = parseNDJSON(text);

  // 1) find latest timestamp
  let latest = null;
  for (const r of rows) {
    if (!r.timestamp) continue;
    const d = new Date(r.timestamp);
    if (!isFinite(d.getTime())) continue;
    if (!latest || d > latest) latest = d;
  }

  const latestDate = latest ? new Date(latest) : new Date();

  // 2) snap latestDate to the top of hour (in chosen basis)
  const latestHour = snapToHour(latestDate, timeBasis);

  // rangeStart = latestHour - 167 hours
  const rangeStart = new Date(latestHour.getTime() - 167 * 3600 * 1000);
  const rangeEndExclusive = new Date(latestHour.getTime() + 1 * 3600 * 1000);

  // 3) buckets
  const slots = new Array(168).fill(null); // {timestamp, value, date}

  for (const r of rows) {
    if (!r.timestamp) continue;

    const d = new Date(r.timestamp);
    if (!isFinite(d.getTime())) continue;

    // 범위 밖 스킵
    if (d < rangeStart || d >= rangeEndExclusive) continue;

    const bucketIndex = hourDiff(rangeStart, d, timeBasis); // 0..167
    if (bucketIndex < 0 || bucketIndex > 167) continue;

    const value = toNumOrNull(r[field]);
    if (value === null) continue;

    const existing = slots[bucketIndex];
    if (!existing || new Date(existing.timestamp) < d) {
      slots[bucketIndex] = { timestamp: r.timestamp, value };
    }
  }

  // 4) labels/meta
  const labels = [];
  const values = [];
  const slotLabel = [];
  const tickLabel = [];

  for (let i = 0; i < 168; i++) {
    const slotDate = new Date(rangeStart.getTime() + i * 3600 * 1000);

    labels.push(i);
    values.push(slots[i] ? slots[i].value : null);

    // tooltip title용: 실제 날짜/시간
    slotLabel.push(formatSlot(slotDate, timeBasis));

    // x축 tick용 (간단): MM/DD HH
    tickLabel.push(formatTick(slotDate, timeBasis));
  }

  return { labels, values, meta: { slotLabel, tickLabel, rangeStart, latestHour } };
}


/* ---------- helpers ---------- */

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.text();
}

function parseNDJSON(text) {
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch (e) {}
  }
  return out;
}

function toNumOrNull(v) {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// chosen basis에서 "정시"로 스냅
function snapToHour(d, basis) {
  const x = new Date(d);
  if (basis === "utc") {
    x.setUTCMinutes(0, 0, 0);
  } else {
    x.setMinutes(0, 0, 0);
  }
  return x;
}

// rangeStart 기준으로 몇 시간 차이인지 (basis 기준)
function hourDiff(rangeStart, d, basis) {
  // ⚠️ 시간대/서머타임 꼬임 방지를 위해
  // "basis 기준의 year/month/day/hour"로 다시 정규화해서 UTC ms로 비교
  const a = normalizeToHour(rangeStart, basis);
  const b = normalizeToHour(d, basis);
  return Math.round((b - a) / 3600000);
}

function normalizeToHour(d, basis) {
  if (basis === "utc") {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 0, 0, 0);
  } else {
    // local: Date 생성 후 ms
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
    return x.getTime();
  }
}

function formatSlot(d, basis) {
  // tooltip: "2026-02-01 18:00 (UTC)" 같은 식
  const y = basis === "utc" ? d.getUTCFullYear() : d.getFullYear();
  const m = (basis === "utc" ? d.getUTCMonth() : d.getMonth()) + 1;
  const da = basis === "utc" ? d.getUTCDate() : d.getDate();
  const hh = basis === "utc" ? d.getUTCHours() : d.getHours();

  return `${y}-${String(m).padStart(2,"0")}-${String(da).padStart(2,"0")} ${String(hh).padStart(2,"0")}:00 (${basis.toUpperCase()})`;
}

function formatTick(d, basis) {
  const m = (basis === "utc" ? d.getUTCMonth() : d.getMonth()) + 1;
  const da = basis === "utc" ? d.getUTCDate() : d.getDate();
  const hh = basis === "utc" ? d.getUTCHours() : d.getHours();
  return `${String(m).padStart(2,"0")}/${String(da).padStart(2,"0")} ${String(hh).padStart(2,"0")}`;
}

function updateDayLabelsRecent7(meta, opts = {}) {
  const basis = opts.timeBasis || "utc"; // "utc" | "local"
  const container = document.querySelector(".day-labels");
  if (!container) return;

  const spans = container.querySelectorAll("span");
  if (spans.length < 7) return;

  // 최근 7일 차트에서는 meta.rangeStart가 기준
  const start = meta.rangeStart;
  if (!start) return;

  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 24 * 3600 * 1000);

    const month = (basis === "utc" ? d.getUTCMonth() : d.getMonth()) + 1;
    const day   = basis === "utc" ? d.getUTCDate() : d.getDate();

    spans[i].textContent = `${month}/${day}`;
  }
}
