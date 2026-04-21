const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const prisma = new PrismaClient();

// ─── Helper: parse CSV dari file ─────────────────────────────────────────────
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    // skip header
    const cols = lines[i].split(",");
    if (cols.length < 5) continue;

    const no = cols[0].trim();
    const hari = cols[1].trim(); // e.g. "1 juni 2025"
    const cuacaRaw = cols[2].trim(); // e.g. "Hembusan Angin Pelan (4)"
    const hasilPanen = parseInt(cols[3].trim(), 10);
    const biayaProduksi = parseInt(cols[4].trim(), 10);

    if (!no || isNaN(hasilPanen) || isNaN(biayaProduksi)) continue;

    rows.push({ no, hari, cuacaRaw, hasilPanen, biayaProduksi });
  }

  return rows;
}

// ─── Helper: konversi nama bulan Indonesia ke angka ──────────────────────────
function parseIndonesianDate(str) {
  const bulan = {
    januari: 0,
    februari: 1,
    maret: 2,
    april: 3,
    mei: 4,
    juni: 5,
    juli: 6,
    agustus: 7,
    september: 8,
    oktober: 9,
    november: 10,
    desember: 11,
  };

  const parts = str.toLowerCase().trim().split(/\s+/);
  const day = parseInt(parts[0], 10);
  const month = bulan[parts[1]];
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || month === undefined || isNaN(year)) {
    throw new Error(`Gagal parse tanggal: "${str}"`);
  }

  return new Date(year, month, day);
}

// ─── Helper: ekstrak nama cuaca (tanpa angka di akhir) ───────────────────────
function extractWeatherName(raw) {
  // "Hembusan Angin Pelan (4)" -> "Hembusan Angin Pelan"
  return raw.replace(/\s*\(\d+\)\s*$/, "").trim();
}

// ─────────────────────────────────────────────────────────────────────────────

async function createAdmin() {
  console.log("Seeding admin...");
  const defaultAdmin = {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME,
  };
  const existingAdmin = await prisma.admin.findFirst({
    where: { username: defaultAdmin.username },
  });
  if (!existingAdmin) {
    const hashedPassword = await hash(defaultAdmin.password, 10);
    await prisma.admin.create({
      data: {
        username: defaultAdmin.username,
        password: hashedPassword,
        name: defaultAdmin.name,
      },
    });
    console.log("Admin seeded successfully!");
  } else {
    console.log("Admin already exists. Skipping seeding.");
  }
}

async function createWeathers() {
  console.log("Seeding weathers...");
  const weathers = [
    { name: "Tenang", numericValue: 1 },
    { name: "Sedikit Tenang", numericValue: 2 },
    { name: "Sedikit Hembusan Angin", numericValue: 3 },
    { name: "Hembusan Angin Pelan", numericValue: 4 },
    { name: "Hembusan Angin Sedang", numericValue: 5 },
    { name: "Kencang", numericValue: 6 },
  ];

  const existingWeathers = await prisma.weather.findMany();
  if (existingWeathers.length === 0) {
    await prisma.weather.createMany({ data: weathers });
    console.log("Weathers seeded successfully!");
  } else {
    console.log("Weathers already exist. Skipping seeding.");
  }
}

async function createHarvests() {
  console.log("Seeding harvests dari CSV...");

  const existingHarvests = await prisma.harvestRecord.findMany();
  if (existingHarvests.length >= 89) {
    console.log("Harvests already exist (89+ records). Skipping seeding.");
    return;
  }

  // Ambil semua data cuaca dari DB
  const weathers = await prisma.weather.findMany();
  const weatherMap = new Map(weathers.map((w) => [w.name, w.id]));

  // Baca CSV — sesuaikan path ke lokasi file di project kamu
  const csvPath = path.resolve(__dirname, "data/code_10032026.csv");
  const rows = parseCSV(csvPath);

  const harvests = [];
  const notFound = [];

  for (const row of rows) {
    const weatherName = extractWeatherName(row.cuacaRaw);
    const weatherId = weatherMap.get(weatherName);

    if (!weatherId) {
      notFound.push(weatherName);
      continue;
    }

    const date = parseIndonesianDate(row.hari);

    harvests.push({
      date: date.toISOString(),
      weatherId,
      harvestAmount: row.hasilPanen,
      productionCost: row.biayaProduksi,
    });
  }

  if (notFound.length > 0) {
    console.warn(
      `⚠️  Cuaca tidak ditemukan di DB (dilewati): ${[
        ...new Set(notFound),
      ].join(", ")}`
    );
  }

  await prisma.harvestRecord.createMany({ data: harvests });
  console.log(`${harvests.length} harvest records seeded dari CSV!`);

  // Statistik ringkas
  const amounts = harvests.map((h) => h.harvestAmount);
  const costs = harvests.map((h) => h.productionCost);
  console.log(
    `Harvest: ${Math.min(...amounts)} – ${Math.max(
      ...amounts
    )} kg | rata-rata ${Math.round(
      amounts.reduce((a, b) => a + b, 0) / amounts.length
    )} kg`
  );
  console.log(
    `Biaya: Rp ${Math.min(...costs).toLocaleString("id-ID")} – Rp ${Math.max(
      ...costs
    ).toLocaleString("id-ID")}`
  );
}

async function main() {
  await createAdmin();
  await createWeathers();
  await createHarvests();
  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
