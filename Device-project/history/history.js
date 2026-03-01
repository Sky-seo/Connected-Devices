let chart;
let metric = "temperature"; // temperature | humidity | felt

document.addEventListener("DOMContentLoaded", () => {
  init();
  window.addEventListener("keydown", (e) => {
    if (e.key === "1") setMetric("temperature");
    if (e.key === "2") setMetric("humidity");
    if (e.key === "3") setMetric("felt");
    if (e.key === "r" || e.key === "R") init(); // reload
  });
});

async function init() {
  const canvas = document.getElementById("temperatureChart");
  if (!canvas) return;

  const { labels, values, meta } = await buildWeeklyHourlySeries("logSky.json", metric, {
    timeBasis: "utc", // "utc" | "local"
    strategy: "latest", // same hour slot → pick latest
  });

  const ctx = canvas.getContext("2d");

  // destroy existing chart (if reloading)
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels, // length 168
      datasets: [
        {
          data: values, // length 168, numbers or null
          fill: true,
          backgroundColor: "rgba(200, 200, 200, 0.5)",
          borderColor: "#999",
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          spanGaps: false, // null이 있으면 선 끊김 (p5 segment 느낌)
        },
      ],
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
              if (v === null || v === undefined) return "No data";
              return `${metric}: ${Number(v).toFixed(1)}`;
            },
          },
        },
      },
      scales: {
        y: { display: false },
        x: {
          display: true,
          ticks: {
            // x축이 168개라서 너무 빽빽함 → 6시간마다만 라벨
            callback: (value, index) => (index % 6 === 0 ? meta.hourLabel[index] : ""),
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
 * Build a 7*24 hourly series from newline-delimited JSON.
 * - Finds latest timestamp in file, sets weekStart to that week's Monday 00:00
 * - Creates 168 slots
 * - Assigns each log to slot (UTC or local)
 * - If multiple logs in same slot, keeps latest (by timestamp)
 */
async function buildWeeklyHourlySeries(url, field, opts = {}) {
  const timeBasis = opts.timeBasis || "utc"; // "utc" or "local"

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

  const base = latest ? new Date(latest) : new Date();

  // 2) compute weekStart: Monday 00:00 (in chosen basis)
  const weekStart = computeWeekStart(base, timeBasis);

  // 3) prepare 168 slots
  const slots = new Array(168).fill(null); // each slot stores {timestamp, value}
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3600 * 1000);

  for (const r of rows) {
    if (!r.timestamp) continue;
    const d = new Date(r.timestamp);
    if (!isFinite(d.getTime())) continue;

    if (d < weekStart || d >= weekEnd) continue;

    const { dayIndex, hour } = getDayHour(d, timeBasis);
    const slotIndex = dayIndex * 24 + hour;

    const value = toNumOrNull(r[field]);
    if (value === null) continue;

    const existing = slots[slotIndex];
    if (!existing || new Date(existing.timestamp) < d) {
      slots[slotIndex] = { timestamp: r.timestamp, value };
    }
  }

  // 4) build labels + values + tooltip meta
  const labels = [];
  const values = [];
  const slotLabel = [];
  const hourLabel = [];

  for (let i = 0; i < 168; i++) {
    const slotDate = new Date(weekStart.getTime() + i * 3600 * 1000);

    const { dayIndex, hour } = getDayHour(slotDate, timeBasis);
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const hh = String(hour).padStart(2, "0");

    // x축 라벨은 너무 길면 지저분해서, ticks callback에서 hourLabel만 씀
    labels.push(i);

    hourLabel.push(`${hh}`);

    slotLabel.push(`${dayNames[dayIndex]} ${hh}:00 (${timeBasis.toUpperCase()})`);

    const cell = slots[i];
    values.push(cell ? cell.value : null);
  }

  return { labels, values, meta: { slotLabel, hourLabel, weekStart } };
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
    try {
      out.push(JSON.parse(line));
    } catch (e) {
      // ignore bad lines
    }
  }
  return out;
}

function toNumOrNull(v) {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeWeekStart(baseDate, basis) {
  if (basis === "utc") {
    const day = baseDate.getUTCDay(); // Sun=0
    const diffToMonday = (day + 6) % 7;

    // UTC Monday 00:00
    return new Date(Date.UTC(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate() - diffToMonday,
      0, 0, 0, 0
    ));
  } else {
    const d = new Date(baseDate);
    const day = d.getDay();
    const diffToMonday = (day + 6) % 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - diffToMonday);
    return d;
  }
}

function getDayHour(d, basis) {
  if (basis === "utc") {
    const utcDay = d.getUTCDay();
    const dayIndex = (utcDay + 6) % 7; // Mon=0..Sun=6
    const hour = d.getUTCHours();
    return { dayIndex, hour };
  } else {
    const localDay = d.getDay();
    const dayIndex = (localDay + 6) % 7;
    const hour = d.getHours();
    return { dayIndex, hour };
  }
}