import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AccessRole,
  PrismaClient,
  ScreenMode,
  SubjectPriority,
} from "../src/generated/prisma/client";
import { hashPin } from "../src/lib/auth/pin";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function getSeedPin(name: string, localFallback: string): string {
  const pin = process.env[name];

  if (!pin && process.env.PRODUCTION_SEED === "true") {
    throw new Error(`${name} is required when PRODUCTION_SEED=true`);
  }

  const resolvedPin = pin ?? localFallback;
  if (!/^\d{4}$/.test(resolvedPin)) {
    throw new Error(`${name} must contain exactly four digits`);
  }

  return resolvedPin;
}

const initialUsers = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    displayName: "Саша",
    role: AccessRole.CHILD,
    pin: getSeedPin("PIN_SASHA", "5555"),
    sortOrder: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    displayName: "Папа",
    role: AccessRole.ADMIN,
    pin: getSeedPin("PIN_PAPA", "0000"),
    sortOrder: 2,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    displayName: "Дедушка",
    role: AccessRole.ADULT,
    pin: getSeedPin("PIN_GRANDPA", "1111"),
    sortOrder: 3,
  },
] as const;

const initialQuarters = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    schoolYear: "2026/2027",
    number: 1,
    startsOn: new Date("2026-09-01T00:00:00.000Z"),
    endsOn: new Date("2026-10-25T00:00:00.000Z"),
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    schoolYear: "2026/2027",
    number: 2,
    startsOn: new Date("2026-11-05T00:00:00.000Z"),
    endsOn: new Date("2026-12-30T00:00:00.000Z"),
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    schoolYear: "2026/2027",
    number: 3,
    startsOn: new Date("2027-01-11T00:00:00.000Z"),
    endsOn: new Date("2027-03-26T00:00:00.000Z"),
  },
  {
    id: "20000000-0000-4000-8000-000000000004",
    schoolYear: "2026/2027",
    number: 4,
    startsOn: new Date("2027-04-05T00:00:00.000Z"),
    endsOn: new Date("2027-05-26T00:00:00.000Z"),
  },
] as const;

const initialSubjects = [
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Математика",
    priority: SubjectPriority.HIGH,
    sortOrder: 1,
  },
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Русский язык",
    priority: SubjectPriority.HIGH,
    sortOrder: 2,
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    name: "Литература",
    priority: SubjectPriority.NORMAL,
    sortOrder: 3,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Английский язык",
    priority: SubjectPriority.HIGH,
    sortOrder: 4,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    name: "Биология",
    priority: SubjectPriority.NORMAL,
    sortOrder: 5,
  },
  {
    id: "10000000-0000-4000-8000-000000000010",
    name: "География",
    priority: SubjectPriority.NORMAL,
    sortOrder: 6,
  },
  {
    id: "10000000-0000-4000-8000-000000000009",
    name: "История",
    priority: SubjectPriority.NORMAL,
    sortOrder: 7,
  },
  {
    id: "10000000-0000-4000-8000-000000000011",
    name: "Музыка",
    priority: SubjectPriority.LOW,
    sortOrder: 8,
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    name: "Физкультура",
    priority: SubjectPriority.LOW,
    sortOrder: 9,
  },
  {
    id: "10000000-0000-4000-8000-000000000007",
    name: "Труд",
    priority: SubjectPriority.LOW,
    sortOrder: 10,
  },
  {
    id: "10000000-0000-4000-8000-000000000008",
    name: "ИЗО",
    priority: SubjectPriority.LOW,
    sortOrder: 11,
  },
] as const;

const initialChores = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    name: "Накрыть на стол или убрать со стола",
    instruction: "Помочь до или после семейного приёма пищи.",
    sortOrder: 1,
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    name: "Загрузить или разгрузить посудомоечную машину",
    instruction: "Проверить, что посуду можно безопасно брать и ставить.",
    sortOrder: 2,
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    name: "Вынести мусор",
    instruction: "Закрыть пакет и отнести его в согласованное место.",
    sortOrder: 3,
  },
  {
    id: "30000000-0000-4000-8000-000000000004",
    name: "Протереть стол или рабочую поверхность",
    instruction: "Использовать подходящую салфетку и убрать её после работы.",
    sortOrder: 4,
  },
  {
    id: "30000000-0000-4000-8000-000000000005",
    name: "Разложить продукты",
    instruction: "Разложить покупки по привычным местам.",
    sortOrder: 5,
  },
  {
    id: "30000000-0000-4000-8000-000000000006",
    name: "Помочь с бельём",
    instruction: "Загрузить, развесить или аккуратно сложить бельё.",
    sortOrder: 6,
  },
  {
    id: "30000000-0000-4000-8000-000000000007",
    name: "Пропылесосить выбранную зону",
    instruction: "Заранее договориться со взрослым, какую зону убрать.",
    sortOrder: 7,
  },
  {
    id: "30000000-0000-4000-8000-000000000008",
    name: "Мытьё посуды",
    instruction: "Вымыть посуду и оставить раковину чистой.",
    sortOrder: 8,
  },
] as const;

const initialRewards = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    name: "Дополнительные 30 минут игры в компьютер",
    description:
      "30 дополнительных минут игры в компьютер. День заранее согласовать со взрослым.",
    cost: 10,
    sortOrder: 1,
  },
  {
    id: "40000000-0000-4000-8000-000000000002",
    name: "Лечь на 30 минут позже",
    description:
      "Можно договориться на пятницу или субботу, если следующий день не учебный.",
    cost: 15,
    sortOrder: 2,
  },
  {
    id: "40000000-0000-4000-8000-000000000003",
    name: "Пригласить друга",
    description: "Дату и остальные условия заранее согласовать со взрослым.",
    cost: 25,
    sortOrder: 3,
  },
] as const;

const additionalRewards = [
  {
    id: "40000000-0000-4000-8000-000000000004",
    name: "Дополнительные 15 минут игры в телефоне",
    description: "15 дополнительных минут игры в телефоне. День заранее согласовать со взрослым.",
    cost: 10,
    sortOrder: 4,
  },
  {
    id: "40000000-0000-4000-8000-000000000005",
    name: "Сладкое из пекарни",
    description: "Одна сладость из пекарни на выбор. Покупку согласовать со взрослым.",
    cost: 25,
    sortOrder: 5,
  },
  {
    id: "40000000-0000-4000-8000-000000000006",
    name: "Чипсы или другая вкусность",
    description: "Одна упаковка чипсов или другая согласованная вкусность. Размер порции согласовать со взрослым.",
    cost: 40,
    sortOrder: 6,
  },
] as const;

const initialScreenModes = [
  { mode: ScreenMode.FULL, dailyLimitMinutes: 120 },
  { mode: ScreenMode.STANDARD, dailyLimitMinutes: 60 },
  { mode: ScreenMode.RECOVERY, dailyLimitMinutes: 30 },
] as const;

async function seed() {
  for (const user of initialUsers) {
    const { pin, ...userData } = user;
    const pinHash = await hashPin(pin);

    await prisma.user.upsert({
      where: { id: user.id },
      update: { ...userData, pinHash },
      create: { ...userData, pinHash },
    });
  }

  for (const quarter of initialQuarters) {
    await prisma.academicQuarter.upsert({
      where: {
        schoolYear_number: {
          schoolYear: quarter.schoolYear,
          number: quarter.number,
        },
      },
      update: quarter,
      create: quarter,
    });
  }

  for (const subject of initialSubjects) {
    await prisma.subject.upsert({
      where: { id: subject.id },
      update: subject,
      create: subject,
    });
  }

  for (const chore of initialChores) {
    await prisma.chore.upsert({
      where: { id: chore.id },
      update: chore,
      create: chore,
    });
  }

  for (const reward of [...initialRewards, ...additionalRewards]) {
    await prisma.reward.upsert({
      where: { id: reward.id },
      update: reward,
      create: reward,
    });
  }

  for (const setting of initialScreenModes) {
    await prisma.screenModeSetting.upsert({
      where: { mode: setting.mode },
      update: setting,
      create: setting,
    });
  }
}

seed()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
