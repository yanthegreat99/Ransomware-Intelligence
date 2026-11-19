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
  ransomLookApiUrl: secretString().optional(),
  ransomLookApiKey: secretString().optional(),
  ransomLookDays: secretString().optional(),
  ransomwareLiveApiUrl: secretString().optional(),
  ransomwareLiveProApiUrl: secretString().optional(),
  ransomwareLiveApiKey: secretString().optional(),
  ransomFeedApiUrl: secretString().optional(),
});

export default compute({
  name: "ransomware-intelligence-app",
  input: inputSchema,
  deps: { db: postgres(contract) },
  build: nextjs({ module: import.meta.url, appDir: "." }),
});
