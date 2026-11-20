// @ts-check
import { module } from "@prisma/composer";
import { postgres } from "@prisma/composer-prisma-cloud/orm";
import { envSecret } from "@prisma/composer-prisma-cloud";
import { contract } from "./src/prisma/contract.mjs";
import ransomwareIntelligenceAppService from "./service.mjs";

export default module("ransomware-intelligence", ({ provision }) => {
  const database = provision(postgres({ name: "database", contract, config: "./prisma.config.ts" }));
  provision(ransomwareIntelligenceAppService, {
    id: "ransomwareintelligenceapp",
    deps: { db: database },
    input: {
      analystAccessSecret: envSecret("ANALYST_ACCESS_SECRET"), // Signs analyst admin sessions and gates admin API calls.
      ingestionJobSecret: envSecret("INGESTION_JOB_SECRET"), // Bearer token that authorizes scheduled ingestion runs.
      ransomLookApiUrl: "https://www.ransomlook.io/api/posts",
      ransomLookDays: "3650",
      ransomwareLiveApiUrl: "https://api.ransomware.live/v2/recentvictims",
      ransomwareLiveProApiUrl: "https://api-pro.ransomware.live/victims/recent",
      ransomFeedApiUrl: "https://api.ransomfeed.it",
    },
  });
});
