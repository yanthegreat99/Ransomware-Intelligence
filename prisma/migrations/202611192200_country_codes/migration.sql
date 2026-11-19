-- AlterTable
ALTER TABLE "CanonicalVictim" ADD COLUMN "countryCode" TEXT;

-- CreateIndex
CREATE INDEX "CanonicalVictim_countryCode_idx" ON "CanonicalVictim"("countryCode");
