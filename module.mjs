// @ts-check
import { module } from "@prisma/composer";
import { postgres, dataContract } from "@prisma/composer-prisma-cloud/orm";
import { envSecret } from "@prisma/composer-prisma-cloud";
import contractJson from "./src/prisma/contract.json" with { type: "json" };
import ransomwareIntelligenceAppService from "./service.mjs";

export default module("ransomware-intelligence", ({ provision }) => {
  const database = provision(postgres({ name: "database", contract: dataContract(contractJson), config: "./prisma.config.ts" }));
  provision(ransomwareIntelligenceAppService, {
    id: "ransomwareintelligenceapp",
    deps: { db: database },
    input: {
      analystAccessSecret: envSecret("ANALYST_ACCESS_SECRET"), // Signs analyst admin sessions and gates admin API calls.
      ingestionJobSecret: envSecret("INGESTION_JOB_SECRET"), // Bearer token that authorizes scheduled ingestion runs.
      ransomLookApiUrl: envSecret("RANSOMLOOK_API_URL"), // Endpoint of the user's RansomLook instance for ingestion.
      ransomLookApiKey: envSecret("RANSOMLOOK_API_KEY"), // API key that authenticates RansomLook ingestion calls.
      ransomLookDays: envSecret("RANSOMLOOK_DAYS"), // How many days of RansomLook posts each run fetches.
      ransomwareLiveApiUrl: envSecret("RANSOMWARELIVE_API_URL"), // Endpoint for ransomware.live ingestion, "false" disables it.
      ransomwareLiveProApiUrl: envSecret("RANSOMWARELIVE_PRO_API_URL"), // Pro endpoint used when a ransomware.live key is set.
      ransomwareLiveApiKey: envSecret("RANSOMWARELIVE_API_KEY"), // API key that unlocks ransomware.live pro ingestion.
      ransomFeedApiUrl: envSecret("RANSOMFEED_API_URL"), // Endpoint for Ransomfeed ingestion, "false" disables it.
    },
  });
});
