import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline schema for the Admin Portal on Oracle (19c), schema DIGITALSOLUTIONS.
 *
 * Every table carries an AP_ prefix so it can never collide with the pre-existing
 * objects of other applications in the shared DIGITALSOLUTIONS schema (which
 * already contains USERS, NOTIFICATIONS, DOCUMENTS, CUSTOMERS, ...).
 *
 * Type mappings from the original Postgres entities:
 *   enum            -> VARCHAR2(n)        (application status, roles, kinds, ...)
 *   jsonb           -> CLOB via simple-json
 *   timestamptz     -> TIMESTAMP WITH TIME ZONE
 *   bytea           -> BLOB
 *   date-as-string  -> VARCHAR2(10) ISO    (avoids ORA-01861 format-mask binds)
 *   uuid PK         -> VARCHAR2(36), generated client-side by TypeORM
 *   boolean         -> NUMBER(1)
 */
export class BaselineOracleAdminPortal1792281600000 implements MigrationInterface {
  name = 'BaselineOracleAdminPortal1792281600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------ admin
    await queryRunner.query(`
      CREATE TABLE "DIGITALSOLUTIONS"."AP_ADMIN_USERS" (
        "id"                 VARCHAR2(36)      NOT NULL,
        "email"              VARCHAR2(255)     NOT NULL,
        "phone"              VARCHAR2(255),
        "fullName"           VARCHAR2(255)     NOT NULL,
        "passwordHash"       VARCHAR2(255)     NOT NULL,
        "role"               VARCHAR2(20)      DEFAULT 'reviewer' NOT NULL,
        "active"             NUMBER(1)         DEFAULT 1 NOT NULL,
        "mustChangePassword" NUMBER(1)         DEFAULT 1 NOT NULL,
        "lastLoginAt"        TIMESTAMP,
        "createdAt"          TIMESTAMP         DEFAULT SYSTIMESTAMP NOT NULL,
        "updatedAt"          TIMESTAMP         DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT "PK_AP_ADMIN_USERS" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "DIGITALSOLUTIONS"."UQ_AP_ADMIN_USERS_EMAIL"
        ON "DIGITALSOLUTIONS"."AP_ADMIN_USERS" ("email")
    `);

    // ----------------------------------------------------------- applications
    await queryRunner.query(`
      CREATE TABLE "DIGITALSOLUTIONS"."AP_APPLICATIONS" (
        "id"                          VARCHAR2(36),
        "referenceNumber"             VARCHAR2(255)     NOT NULL,
        "status"                      VARCHAR2(30)      DEFAULT 'draft' NOT NULL,
        "currentStep"                 NUMBER            DEFAULT 1 NOT NULL,
        "phoneNumber"                 VARCHAR2(255),
        "phoneVerified"               NUMBER(1)         DEFAULT 0 NOT NULL,
        "email"                       VARCHAR2(255),
        "referenceAlertSentAt"        TIMESTAMP WITH TIME ZONE,
        "dataCollectionConsent"       NUMBER(1)         DEFAULT 0 NOT NULL,
        "termsAccepted"               NUMBER(1)         DEFAULT 0 NOT NULL,
        "consentTimestamp"            TIMESTAMP WITH TIME ZONE,
        "lastName"                    VARCHAR2(255),
        "firstName"                   VARCHAR2(255),
        "otherNames"                  VARCHAR2(255),
        "sex"                         VARCHAR2(255),
        "nationality"                 VARCHAR2(255),
        "countryOfResidence"          VARCHAR2(255),
        "countyOfResidence"           VARCHAR2(255),
        "cityOrTown"                  VARCHAR2(255),
        "maritalStatus"               VARCHAR2(255),
        "dateOfBirth"                 VARCHAR2(10),
        "alternativeMobileNumber"     VARCHAR2(255),
        "documentIdType"              VARCHAR2(30),
        "documentIdNumber"            VARCHAR2(255),
        "documentIssueDate"           VARCHAR2(10),
        "documentExpiryDate"          VARCHAR2(10),
        "residenceEstate"             VARCHAR2(255),
        "physicalAddress"             VARCHAR2(255),
        "nearestLandmark"             VARCHAR2(255),
        "nearestBranch"               VARCHAR2(255),
        "employmentStatus"            VARCHAR2(30),
        "employerOrBusinessName"      VARCHAR2(255),
        "employerLocation"            VARCHAR2(255),
        "professionOrDesignation"     VARCHAR2(255),
        "employerPhone"               VARCHAR2(255),
        "workAddress"                 VARCHAR2(255),
        "approximateMonthlyIncome"    NUMBER(12,2),
        "accountType"                 VARCHAR2(255),
        "selectedProducts"            CLOB,
        "numberOfShares"              NUMBER            DEFAULT 0 NOT NULL,
        "standingOrderEnabled"        NUMBER(1)         DEFAULT 0 NOT NULL,
        "standingOrderAmount"         NUMBER(12,2),
        "standingOrderFrequency"      VARCHAR2(30),
        "selectedServices"            CLOB,
        "businessName"                VARCHAR2(255),
        "businessPaybillNumbers"      CLOB,
        "referredByStaff"             NUMBER(1)         DEFAULT 0 NOT NULL,
        "referralStaffPfNumber"       VARCHAR2(255),
        "referralStaffName"           VARCHAR2(255),
        "nextOfKinName"               VARCHAR2(255),
        "nextOfKinRelationship"       VARCHAR2(255),
        "nextOfKinMobileNumber"       VARCHAR2(255),
        "idOcrCompleted"              NUMBER(1)         DEFAULT 0 NOT NULL,
        "idOcrExtractedData"          CLOB,
        "idOcrMatchesEnteredData"     NUMBER(1)         DEFAULT 0 NOT NULL,
        "iprsVerified"                NUMBER(1)         DEFAULT 0 NOT NULL,
        "iprsResponse"                CLOB,
        "livenessVerified"            NUMBER(1)         DEFAULT 0 NOT NULL,
        "livenessMatchScore"          NUMBER(5,4),
        "paymentCompleted"            NUMBER(1)         DEFAULT 0 NOT NULL,
        "mpesaCheckoutRequestId"      VARCHAR2(255),
        "merchantRequestId"           VARCHAR2(255),
        "mpesaReceiptNumber"          VARCHAR2(255),
        "amountPaid"                  NUMBER(12,2),
        "submittedAt"                 TIMESTAMP WITH TIME ZONE,
        "fundsTransferredToMemberAccount" NUMBER(1)     DEFAULT 0 NOT NULL,
        "staleReminderSentAt"         TIMESTAMP WITH TIME ZONE,
        "reviewedByAdminId"           VARCHAR2(255),
        "reviewedAt"                  TIMESTAMP WITH TIME ZONE,
        "rejectionReason"             VARCHAR2(2000),
        "cbsCustomerNumber"           VARCHAR2(255),
        "pushedToCbs"                 NUMBER(1)         DEFAULT 0 NOT NULL,
        "pushedToCbsAt"               TIMESTAMP WITH TIME ZONE,
        "cbsApplicationId"            VARCHAR2(255),
        "coreSubmission"              CLOB,
        "createdAt"                   TIMESTAMP         DEFAULT SYSTIMESTAMP NOT NULL,
        "updatedAt"                   TIMESTAMP         DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT "PK_AP_APPLICATIONS" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "DIGITALSOLUTIONS"."UQ_AP_APPLICATIONS_REF"
        ON "DIGITALSOLUTIONS"."AP_APPLICATIONS" ("referenceNumber")
    `);

    // ----------------------------------------------------------- next of kin
    await queryRunner.query(`
      CREATE TABLE "DIGITALSOLUTIONS"."AP_NEXT_OF_KIN" (
        "id"            VARCHAR2(36),
        "applicationId" VARCHAR2(36)      NOT NULL,
        "position"      NUMBER            DEFAULT 1 NOT NULL,
        "name"          VARCHAR2(255)     NOT NULL,
        "relationship"  VARCHAR2(255)     NOT NULL,
        "mobileNumber"  VARCHAR2(255)     NOT NULL,
        "createdAt"     TIMESTAMP         DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT "PK_AP_NEXT_OF_KIN" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "DIGITALSOLUTIONS"."IDX_AP_NEXT_OF_KIN_APP"
        ON "DIGITALSOLUTIONS"."AP_NEXT_OF_KIN" ("applicationId")
    `);
    await queryRunner.query(`
      ALTER TABLE "DIGITALSOLUTIONS"."AP_NEXT_OF_KIN"
        ADD CONSTRAINT "FK_AP_NEXT_OF_KIN_APPLICATION"
        FOREIGN KEY ("applicationId")
        REFERENCES "DIGITALSOLUTIONS"."AP_APPLICATIONS" ("id")
        ON DELETE CASCADE
    `);

    // ---------------------------------------------------------------- images
    await queryRunner.query(`
      CREATE TABLE "DIGITALSOLUTIONS"."AP_IMAGES" (
        "id"            VARCHAR2(36),
        "applicationId" VARCHAR2(36)      NOT NULL,
        "kind"          VARCHAR2(255)     NOT NULL,
        "mimeType"      VARCHAR2(255),
        "data"          BLOB,
        "createdAt"     TIMESTAMP         DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT "PK_AP_IMAGES" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "DIGITALSOLUTIONS"."IDX_AP_IMAGES_APP"
        ON "DIGITALSOLUTIONS"."AP_IMAGES" ("applicationId")
    `);

    // ---------------------------------------------------------- notifications
    await queryRunner.query(`
      CREATE TABLE "DIGITALSOLUTIONS"."AP_NOTIFICATIONS" (
        "id"              VARCHAR2(36),
        "audience"        VARCHAR2(255)     NOT NULL,
        "channel"         VARCHAR2(255)     NOT NULL,
        "recipient"       VARCHAR2(255),
        "applicationId"   VARCHAR2(255),
        "referenceNumber" VARCHAR2(255),
        "title"           VARCHAR2(255)     NOT NULL,
        "body"            VARCHAR2(4000)    NOT NULL,
        "readAt"          TIMESTAMP WITH TIME ZONE,
        "createdAt"       TIMESTAMP         DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT "PK_AP_NOTIFICATIONS" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "DIGITALSOLUTIONS"."IDX_AP_NOTIFICATIONS_AUD_READ"
        ON "DIGITALSOLUTIONS"."AP_NOTIFICATIONS" ("audience", "readAt")
    `);
    await queryRunner.query(`
      CREATE INDEX "DIGITALSOLUTIONS"."IDX_AP_NOTIFICATIONS_APP"
        ON "DIGITALSOLUTIONS"."AP_NOTIFICATIONS" ("applicationId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "DIGITALSOLUTIONS"."AP_NEXT_OF_KIN" CASCADE CONSTRAINTS`);
    await queryRunner.query(`DROP TABLE "DIGITALSOLUTIONS"."AP_IMAGES"`);
    await queryRunner.query(`DROP TABLE "DIGITALSOLUTIONS"."AP_NOTIFICATIONS"`);
    await queryRunner.query(`DROP TABLE "DIGITALSOLUTIONS"."AP_APPLICATIONS"`);
    await queryRunner.query(`DROP TABLE "DIGITALSOLUTIONS"."AP_ADMIN_USERS"`);
  }
}
