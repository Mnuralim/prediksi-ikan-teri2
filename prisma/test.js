const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();


async function deletData() {
  await prisma.harvestRecord.deleteMany();
  console.log("success")
}



deletData()
  .catch((e) => {
    console.error("Error deleting database", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
