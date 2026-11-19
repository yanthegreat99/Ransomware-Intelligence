-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'DISPUTED', 'REMOVED', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "DuplicateStatus" AS ENUM ('CONFIRMED_DUPLICATE', 'POTENTIAL_DUPLICATE', 'UNIQUE_VICTIM');

-- CreateEnum
CREATE TYPE "ConfidenceCategory" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'RUNNING');

-- CreateTable
CREATE TABLE "RansomwareGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "description" TEXT,
    "firstObserved" TIMESTAMP(3),
    "lastObserved" TIMESTAMP(3),
    "operationalStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "leakSiteUrls" TEXT[],
    "sourceRefs" JSONB NOT NULL DEFAULT '[]',
    "relationships" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RansomwareGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalVictim" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "domain" TEXT,
    "normalizedDomain" TEXT,
    "country" TEXT,
    "region" TEXT,
    "description" TEXT,
    "organisationType" TEXT,
    "ransomwareGroupId" TEXT,
    "firstReportedAt" TIMESTAMP(3) NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "legitimacyStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "incidentStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED_CLAIM',
    "duplicateStatus" "DuplicateStatus" NOT NULL DEFAULT 'UNIQUE_VICTIM',
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "gicsSectorCode" TEXT,
    "gicsSectorName" TEXT,
    "gicsIndustryGroupCode" TEXT,
    "gicsIndustryGroupName" TEXT,
    "gicsIndustryCode" TEXT,
    "gicsIndustryName" TEXT,
    "gicsSubIndustryCode" TEXT,
    "gicsSubIndustryName" TEXT,
    "gicsConfidence" "ConfidenceCategory" NOT NULL DEFAULT 'UNCLASSIFIED',
    "gicsEvidence" JSONB NOT NULL DEFAULT '[]',
    "gicsMethod" TEXT,
    "gicsReviewedAt" TIMESTAMP(3),
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanonicalVictim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDisclosure" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceIdentifier" TEXT,
    "sourceUrl" TEXT,
    "originalVictimName" TEXT NOT NULL,
    "originalGroupName" TEXT,
    "originalCountry" TEXT,
    "originalIndustry" TEXT,
    "publishedAt" TIMESTAMP(3),
    "updatedAtSource" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB NOT NULL DEFAULT '{}',
    "canonicalVictimId" TEXT,
    "ransomwareGroupId" TEXT,

    CONSTRAINT "SourceDisclosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationEvidence" (
    "id" TEXT NOT NULL,
    "victimId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "evidenceType" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "supports" BOOLEAN NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT 'SYSTEM',

    CONSTRAINT "VerificationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateMatch" (
    "id" TEXT NOT NULL,
    "primaryVictimId" TEXT NOT NULL,
    "candidateVictimId" TEXT NOT NULL,
    "classification" "DuplicateStatus" NOT NULL,
    "similarityScore" INTEGER NOT NULL,
    "explanation" JSONB NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GicsTaxonomy" (
    "sectorCode" TEXT NOT NULL,
    "sectorName" TEXT NOT NULL,
    "industryGroupCode" TEXT NOT NULL,
    "industryGroupName" TEXT NOT NULL,
    "industryCode" TEXT NOT NULL,
    "industryName" TEXT NOT NULL,
    "subIndustryCode" TEXT NOT NULL,
    "subIndustryName" TEXT NOT NULL,

    CONSTRAINT "GicsTaxonomy_pkey" PRIMARY KEY ("subIndustryCode")
);

-- CreateTable
CREATE TABLE "ClassificationHistory" (
    "id" TEXT NOT NULL,
    "victimId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "confidence" "ConfidenceCategory" NOT NULL,
    "evidence" JSONB NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "ClassificationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VictimEdit" (
    "id" TEXT NOT NULL,
    "victimId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" JSONB NOT NULL,
    "newValue" JSONB NOT NULL,
    "analyst" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VictimEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "status" "IngestionStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "recordsRead" INTEGER NOT NULL DEFAULT 0,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionLease" (
    "sourceName" TEXT NOT NULL,
    "ownerToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionLease_pkey" PRIMARY KEY ("sourceName")
);

-- CreateIndex
CREATE UNIQUE INDEX "RansomwareGroup_name_key" ON "RansomwareGroup"("name");

-- CreateIndex
CREATE INDEX "RansomwareGroup_name_idx" ON "RansomwareGroup"("name");

-- CreateIndex
CREATE INDEX "CanonicalVictim_name_idx" ON "CanonicalVictim"("name");

-- CreateIndex
CREATE INDEX "CanonicalVictim_normalizedName_idx" ON "CanonicalVictim"("normalizedName");

-- CreateIndex
CREATE INDEX "CanonicalVictim_normalizedDomain_idx" ON "CanonicalVictim"("normalizedDomain");

-- CreateIndex
CREATE INDEX "CanonicalVictim_country_idx" ON "CanonicalVictim"("country");

-- CreateIndex
CREATE INDEX "CanonicalVictim_firstReportedAt_idx" ON "CanonicalVictim"("firstReportedAt");

-- CreateIndex
CREATE INDEX "CanonicalVictim_verificationStatus_idx" ON "CanonicalVictim"("verificationStatus");

-- CreateIndex
CREATE INDEX "CanonicalVictim_duplicateStatus_idx" ON "CanonicalVictim"("duplicateStatus");

-- CreateIndex
CREATE INDEX "SourceDisclosure_sourceName_idx" ON "SourceDisclosure"("sourceName");

-- CreateIndex
CREATE INDEX "SourceDisclosure_sourceIdentifier_idx" ON "SourceDisclosure"("sourceIdentifier");

-- CreateIndex
CREATE INDEX "SourceDisclosure_publishedAt_idx" ON "SourceDisclosure"("publishedAt");

-- CreateIndex
CREATE INDEX "SourceDisclosure_canonicalVictimId_idx" ON "SourceDisclosure"("canonicalVictimId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDisclosure_sourceName_sourceIdentifier_key" ON "SourceDisclosure"("sourceName", "sourceIdentifier");

-- CreateIndex
CREATE INDEX "DuplicateMatch_classification_idx" ON "DuplicateMatch"("classification");

-- CreateIndex
CREATE INDEX "DuplicateMatch_similarityScore_idx" ON "DuplicateMatch"("similarityScore");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateMatch_primaryVictimId_candidateVictimId_key" ON "DuplicateMatch"("primaryVictimId", "candidateVictimId");

-- CreateIndex
CREATE INDEX "GicsTaxonomy_sectorCode_idx" ON "GicsTaxonomy"("sectorCode");

-- CreateIndex
CREATE INDEX "GicsTaxonomy_industryGroupCode_idx" ON "GicsTaxonomy"("industryGroupCode");

-- CreateIndex
CREATE INDEX "GicsTaxonomy_industryCode_idx" ON "GicsTaxonomy"("industryCode");

-- CreateIndex
CREATE INDEX "IngestionRun_sourceName_startedAt_idx" ON "IngestionRun"("sourceName", "startedAt");

-- CreateIndex
CREATE INDEX "IngestionRun_status_idx" ON "IngestionRun"("status");

-- CreateIndex
CREATE INDEX "IngestionLease_expiresAt_idx" ON "IngestionLease"("expiresAt");

-- AddForeignKey
ALTER TABLE "CanonicalVictim" ADD CONSTRAINT "CanonicalVictim_ransomwareGroupId_fkey" FOREIGN KEY ("ransomwareGroupId") REFERENCES "RansomwareGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDisclosure" ADD CONSTRAINT "SourceDisclosure_canonicalVictimId_fkey" FOREIGN KEY ("canonicalVictimId") REFERENCES "CanonicalVictim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDisclosure" ADD CONSTRAINT "SourceDisclosure_ransomwareGroupId_fkey" FOREIGN KEY ("ransomwareGroupId") REFERENCES "RansomwareGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvidence" ADD CONSTRAINT "VerificationEvidence_victimId_fkey" FOREIGN KEY ("victimId") REFERENCES "CanonicalVictim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateMatch" ADD CONSTRAINT "DuplicateMatch_primaryVictimId_fkey" FOREIGN KEY ("primaryVictimId") REFERENCES "CanonicalVictim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateMatch" ADD CONSTRAINT "DuplicateMatch_candidateVictimId_fkey" FOREIGN KEY ("candidateVictimId") REFERENCES "CanonicalVictim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificationHistory" ADD CONSTRAINT "ClassificationHistory_victimId_fkey" FOREIGN KEY ("victimId") REFERENCES "CanonicalVictim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VictimEdit" ADD CONSTRAINT "VictimEdit_victimId_fkey" FOREIGN KEY ("victimId") REFERENCES "CanonicalVictim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

