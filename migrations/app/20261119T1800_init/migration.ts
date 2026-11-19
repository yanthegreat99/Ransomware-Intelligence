#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/038c499c6277141bf593e6ed8e9a1e7e69219d92880d17af19a3073f2aaf9a34/contract';
import endContract from '../../snapshots/038c499c6277141bf593e6ed8e9a1e7e69219d92880d17af19a3073f2aaf9a34/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'ConfidenceCategory',
        members: ['HIGH', 'MEDIUM', 'LOW', 'UNCLASSIFIED'],
      }),
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'DuplicateStatus',
        members: ['CONFIRMED_DUPLICATE', 'POTENTIAL_DUPLICATE', 'UNIQUE_VICTIM'],
      }),
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'IngestionStatus',
        members: ['SUCCESS', 'PARTIAL', 'FAILED', 'RUNNING'],
      }),
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'VerificationStatus',
        members: [
          'VERIFIED',
          'PARTIALLY_VERIFIED',
          'UNVERIFIED',
          'DISPUTED',
          'REMOVED',
          'UNDER_REVIEW',
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'CanonicalVictim',
        columns: [
          col('aliases', 'text[]', {
            default: lit([]),
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('confidenceScore', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('country', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('countryCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('domain', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('duplicateStatus', '"DuplicateStatus"', {
            notNull: true,
            default: lit('UNIQUE_VICTIM'),
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'DuplicateStatus' } },
          }),
          col('firstReportedAt', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('gicsConfidence', '"ConfidenceCategory"', {
            notNull: true,
            default: lit('UNCLASSIFIED'),
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'ConfidenceCategory' } },
          }),
          col('gicsEvidence', 'jsonb', {
            notNull: true,
            default: lit([]),
            codecRef: { codecId: 'pg/jsonb@1' },
          }),
          col('gicsIndustryCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('gicsIndustryGroupCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('gicsIndustryGroupName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('gicsIndustryName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('gicsMethod', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('gicsReviewedAt', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('gicsSectorCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('gicsSectorName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('gicsSubIndustryCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('gicsSubIndustryName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('incidentStatus', 'text', {
            notNull: true,
            default: lit('UNVERIFIED_CLAIM'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('lastCheckedAt', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('lastUpdatedAt', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('legitimacyStatus', 'text', {
            notNull: true,
            default: lit('UNKNOWN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('normalizedDomain', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('normalizedName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('organisationType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('ransomwareGroupId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('region', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('targetedDomain', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('targetedDomainNormalized', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('verificationStatus', '"VerificationStatus"', {
            notNull: true,
            default: lit('UNVERIFIED'),
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'VerificationStatus' } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ClassificationHistory',
        columns: [
          col('confidence', '"ConfidenceCategory"', {
            notNull: true,
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'ConfidenceCategory' } },
          }),
          col('evidence', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('method', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reviewedAt', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('reviewedBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('victimId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'DuplicateMatch',
        columns: [
          col('candidateVictimId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('classification', '"DuplicateStatus"', {
            notNull: true,
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'DuplicateStatus' } },
          }),
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('explanation', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('primaryVictimId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('resolution', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reviewedAt', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('reviewedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('similarityScore', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'GicsTaxonomy',
        columns: [
          col('industryCode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('industryGroupCode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('industryGroupName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('industryName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sectorCode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sectorName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('subIndustryCode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('subIndustryName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['subIndustryCode'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'IngestionLease',
        columns: [
          col('expiresAt', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('ownerToken', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sourceName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['sourceName'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'IngestionRun',
        columns: [
          col('completedAt', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('errorCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('errors', 'jsonb', {
            notNull: true,
            default: lit([]),
            codecRef: { codecId: 'pg/jsonb@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('metadata', 'jsonb', {
            notNull: true,
            default: lit({}),
            codecRef: { codecId: 'pg/jsonb@1' },
          }),
          col('recordsCreated', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('recordsRead', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('recordsUpdated', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('sourceName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('startedAt', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('status', '"IngestionStatus"', {
            notNull: true,
            codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'IngestionStatus' } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'RansomwareGroup',
        columns: [
          col('aliases', 'text[]', { codecRef: { codecId: 'pg/text@1', many: true } }),
          col('contactEmails', 'text[]', {
            default: lit([]),
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('firstObserved', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('knownLocations', 'jsonb', {
            notNull: true,
            default: lit([]),
            codecRef: { codecId: 'pg/jsonb@1' },
          }),
          col('lastObserved', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('leakSiteUrls', 'text[]', { codecRef: { codecId: 'pg/text@1', many: true } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('operationalStatus', 'text', {
            notNull: true,
            default: lit('UNKNOWN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('parserStatus', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('profileUpdatedAt', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('profileUrls', 'jsonb', {
            notNull: true,
            default: lit({}),
            codecRef: { codecId: 'pg/jsonb@1' },
          }),
          col('relationships', 'jsonb', {
            notNull: true,
            default: lit([]),
            codecRef: { codecId: 'pg/jsonb@1' },
          }),
          col('sessionIds', 'text[]', {
            default: lit([]),
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('sourceRefs', 'jsonb', {
            notNull: true,
            default: lit([]),
            codecRef: { codecId: 'pg/jsonb@1' },
          }),
          col('updatedAt', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('uptime30d', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'SourceDisclosure',
        columns: [
          col('canonicalVictimId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('normalizedData', 'jsonb', {
            notNull: true,
            default: lit({}),
            codecRef: { codecId: 'pg/jsonb@1' },
          }),
          col('originalCountry', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('originalGroupName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('originalIndustry', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('originalVictimName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('publishedAt', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('ransomwareGroupId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('rawData', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('retrievedAt', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('sourceIdentifier', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('sourceName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sourceUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('targetedDomain', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAtSource', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'VerificationEvidence',
        columns: [
          col('createdBy', 'text', {
            notNull: true,
            default: lit('SYSTEM'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('evidence', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('evidenceType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('retrievedAt', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('sourceName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('sourceUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('supports', 'bool', { notNull: true, codecRef: { codecId: 'pg/bool@1' } }),
          col('victimId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'VictimEdit',
        columns: [
          col('analyst', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 3 } },
          }),
          col('field', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('newValue', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('oldValue', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('victimId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CanonicalVictim',
        index: 'CanonicalVictim_countryCode_idx',
        columns: ['countryCode'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CanonicalVictim',
        index: 'CanonicalVictim_country_idx',
        columns: ['country'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CanonicalVictim',
        index: 'CanonicalVictim_duplicateStatus_idx',
        columns: ['duplicateStatus'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CanonicalVictim',
        index: 'CanonicalVictim_firstReportedAt_idx',
        columns: ['firstReportedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CanonicalVictim',
        index: 'CanonicalVictim_name_idx',
        columns: ['name'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CanonicalVictim',
        index: 'CanonicalVictim_normalizedDomain_idx',
        columns: ['normalizedDomain'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CanonicalVictim',
        index: 'CanonicalVictim_normalizedName_idx',
        columns: ['normalizedName'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CanonicalVictim',
        index: 'CanonicalVictim_targetedDomainNormalized_idx',
        columns: ['targetedDomainNormalized'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CanonicalVictim',
        index: 'CanonicalVictim_verificationStatus_idx',
        columns: ['verificationStatus'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DuplicateMatch',
        index: 'DuplicateMatch_classification_idx',
        columns: ['classification'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DuplicateMatch',
        index: 'DuplicateMatch_primaryVictimId_candidateVictimId_key',
        columns: ['primaryVictimId', 'candidateVictimId'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'DuplicateMatch',
        index: 'DuplicateMatch_similarityScore_idx',
        columns: ['similarityScore'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GicsTaxonomy',
        index: 'GicsTaxonomy_industryCode_idx',
        columns: ['industryCode'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GicsTaxonomy',
        index: 'GicsTaxonomy_industryGroupCode_idx',
        columns: ['industryGroupCode'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GicsTaxonomy',
        index: 'GicsTaxonomy_sectorCode_idx',
        columns: ['sectorCode'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IngestionLease',
        index: 'IngestionLease_expiresAt_idx',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IngestionRun',
        index: 'IngestionRun_sourceName_startedAt_idx',
        columns: ['sourceName', 'startedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'IngestionRun',
        index: 'IngestionRun_status_idx',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'RansomwareGroup',
        index: 'RansomwareGroup_name_idx',
        columns: ['name'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'RansomwareGroup',
        index: 'RansomwareGroup_name_key',
        columns: ['name'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'SourceDisclosure',
        index: 'SourceDisclosure_canonicalVictimId_idx',
        columns: ['canonicalVictimId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SourceDisclosure',
        index: 'SourceDisclosure_publishedAt_idx',
        columns: ['publishedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SourceDisclosure',
        index: 'SourceDisclosure_sourceIdentifier_idx',
        columns: ['sourceIdentifier'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SourceDisclosure',
        index: 'SourceDisclosure_sourceName_idx',
        columns: ['sourceName'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SourceDisclosure',
        index: 'SourceDisclosure_sourceName_sourceIdentifier_key',
        columns: ['sourceName', 'sourceIdentifier'],
        extras: { unique: true },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CanonicalVictim',
        foreignKey: {
          name: 'CanonicalVictim_ransomwareGroupId_fkey',
          columns: ['ransomwareGroupId'],
          references: { schema: 'public', table: 'RansomwareGroup', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ClassificationHistory',
        foreignKey: {
          name: 'ClassificationHistory_victimId_fkey',
          columns: ['victimId'],
          references: { schema: 'public', table: 'CanonicalVictim', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'DuplicateMatch',
        foreignKey: {
          name: 'DuplicateMatch_primaryVictimId_fkey',
          columns: ['primaryVictimId'],
          references: { schema: 'public', table: 'CanonicalVictim', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'DuplicateMatch',
        foreignKey: {
          name: 'DuplicateMatch_candidateVictimId_fkey',
          columns: ['candidateVictimId'],
          references: { schema: 'public', table: 'CanonicalVictim', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SourceDisclosure',
        foreignKey: {
          name: 'SourceDisclosure_canonicalVictimId_fkey',
          columns: ['canonicalVictimId'],
          references: { schema: 'public', table: 'CanonicalVictim', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SourceDisclosure',
        foreignKey: {
          name: 'SourceDisclosure_ransomwareGroupId_fkey',
          columns: ['ransomwareGroupId'],
          references: { schema: 'public', table: 'RansomwareGroup', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'VerificationEvidence',
        foreignKey: {
          name: 'VerificationEvidence_victimId_fkey',
          columns: ['victimId'],
          references: { schema: 'public', table: 'CanonicalVictim', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'VictimEdit',
        foreignKey: {
          name: 'VictimEdit_victimId_fkey',
          columns: ['victimId'],
          references: { schema: 'public', table: 'CanonicalVictim', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
