import { defineConfig as orm, prisma7Schema } from "@prisma/orm-postgres/config";
import { definePrismaConfig } from "prisma/config";
import { defineConfig as composer } from "@prisma/composer/config";
import { nextjsBuild } from "@prisma/composer/nextjs/control";
import { prismaCloud, prismaState } from "@prisma/composer-prisma-cloud/control";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

export default definePrismaConfig({
  orm: orm({
    contract: prisma7Schema("prisma/schema.prisma"),
    output: "src/prisma",
    db: { connection: process.env["DATABASE_URL"]! },
  }),
  composer: composer({
    entry: "./module.mjs",
    extensions: [prismaCloud(), nextjsBuild()],
    state: prismaState(),
  }),
});
