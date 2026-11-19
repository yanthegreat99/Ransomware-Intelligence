import { config } from "dotenv";
import postgres from "@prisma/orm-postgres/runtime";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeContract } from "../src/prisma/runtime-contract.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const url = process.env["DATABASE_URL"];
if (!url) throw new Error("DATABASE_URL must be set in the environment or .env.local");

export const db = postgres({ contract: runtimeContract, url });
