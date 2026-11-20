// @ts-check
import nextjs from "@prisma/composer/nextjs";
import { compute } from "@prisma/composer-prisma-cloud";
import { postgres } from "@prisma/composer-prisma-cloud/orm";
import { secretString } from "@prisma/composer/zod";
import { z } from "zod";
import { contract } from "./src/prisma/contract.mjs";

const inputSchema = z.object({
  analystAccessSecret: secretString(),
  ingestionJobSecret: secretString().optional(),
  ransomLookApiUrl: z.string().optional(),
  ransomLookDays: z.string().optional(),
  ransomwareLiveApiUrl: z.string().optional(),
  ransomwareLiveProApiUrl: z.string().optional(),
  ransomFeedApiUrl: z.string().optional(),
});

export default compute({
  name: "ransomware-intelligence-app",
  input: inputSchema,
  deps: { db: postgres(contract) },
  build: nextjs({ module: import.meta.url, appDir: "." }),
});
