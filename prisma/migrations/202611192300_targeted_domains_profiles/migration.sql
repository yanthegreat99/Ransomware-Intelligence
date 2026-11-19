ALTER TABLE "CanonicalVictim" ADD COLUMN "targetedDomain" TEXT;
ALTER TABLE "CanonicalVictim" ADD COLUMN "targetedDomainNormalized" TEXT;
ALTER TABLE "SourceDisclosure" ADD COLUMN "targetedDomain" TEXT;

ALTER TABLE "RansomwareGroup" ADD COLUMN "parserStatus" TEXT;
ALTER TABLE "RansomwareGroup" ADD COLUMN "uptime30d" INTEGER;
ALTER TABLE "RansomwareGroup" ADD COLUMN "contactEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "RansomwareGroup" ADD COLUMN "sessionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "RansomwareGroup" ADD COLUMN "knownLocations" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "RansomwareGroup" ADD COLUMN "profileUrls" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "RansomwareGroup" ADD COLUMN "profileUpdatedAt" TIMESTAMP(3);

CREATE INDEX "CanonicalVictim_targetedDomainNormalized_idx" ON "CanonicalVictim"("targetedDomainNormalized");
