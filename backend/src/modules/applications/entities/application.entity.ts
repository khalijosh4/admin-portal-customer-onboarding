import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NextOfKin } from './next-of-kin.entity';

export enum ApplicationStatus {
  DRAFT = 'draft', // wizard in progress
  SUBMITTED = 'submitted', // step 9 payment completed, awaiting admin review
  UNDER_REVIEW = 'under_review', // admin is actively reviewing
  APPROVED = 'approved', // admin approved -> pushed to CBS
  REJECTED = 'rejected',
}

export enum DocumentIdType {
  NATIONAL_ID = 'national_id',
  PASSPORT = 'passport',
  OTHER = 'other',
}

export enum EmploymentStatus {
  CASUAL = 'casual',
  SELF_EMPLOYED = 'self_employed',
  FORMALLY_EMPLOYED = 'formally_employed',
  CONTRACT = 'contract',
  RETIRED = 'retired',
}

export enum StandingOrderFrequency {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
}

// Fortune Sacco branches the applicant can select as their nearest branch.
export const FORTUNE_BRANCHES = [
  'Kerugoya',
  'Kagumo',
  'Kianyaga',
  'Kiamutugu',
  'Karumandi',
  'Kibirigwi',
  'Kimunye',
  'Kiangai',
  'Sagana',
  'Mwea',
  'Kagio',
  'Kutus',
  'Nairobi',
  'Makutano',
  'Githure',
  'Ongata Rongai',
  'Ruai',
  'Baricho',
  'Riakiania',
  'Others',
] as const;

@Entity({ name: 'AP_APPLICATIONS', schema: 'DIGITALSOLUTIONS' })
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Human-friendly reference shown to the member, e.g. FS-2026-000123
  @Column({ unique: true })
  referenceNumber: string;

  @Column({ type: 'varchar2', length: 30, default: ApplicationStatus.DRAFT })
  status: ApplicationStatus;

  // Highest step (1-9) the applicant has completed so far
  @Column({ default: 1 })
  currentStep: number;

  // ---------- STEP 1: Phone verification ----------
  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ default: false })
  phoneVerified: boolean;

  // Mandatory from Step 3 (personal information).
  @Column({ nullable: true })
  email: string;

  // Set once the "keep this reference number" SMS has been sent, so the
  // member is only alerted on first verification.
  @Column({ type: 'timestamp with time zone', nullable: true })
  referenceAlertSentAt: Date;

  // ---------- STEP 2: Consent ----------
  @Column({ default: false })
  dataCollectionConsent: boolean;

  @Column({ default: false })
  termsAccepted: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  consentTimestamp: Date;

  // ---------- STEP 3: Personal information ----------
  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  otherNames: string;

  @Column({ nullable: true })
  sex: string;

  @Column({ nullable: true })
  nationality: string;

  @Column({ nullable: true })
  countryOfResidence: string;

  @Column({ nullable: true })
  countyOfResidence: string;

  @Column({ nullable: true })
  cityOrTown: string;

  @Column({ nullable: true })
  maritalStatus: string;

  @Column({ type: 'varchar2', length: 10, nullable: true })
  dateOfBirth: string;

  @Column({ nullable: true })
  alternativeMobileNumber: string;

  @Column({ type: 'varchar2', length: 30, nullable: true })
  documentIdType: DocumentIdType;

  @Column({ nullable: true })
  documentIdNumber: string;

  @Column({ type: 'varchar2', length: 10, nullable: true })
  documentIssueDate: string;

  @Column({ type: 'varchar2', length: 10, nullable: true })
  documentExpiryDate: string;

  @Column({ nullable: true })
  residenceEstate: string;

  @Column({ nullable: true })
  physicalAddress: string;

  @Column({ nullable: true })
  nearestLandmark: string;

  // Mandatory in Step 3: the Fortune Sacco branch nearest to the applicant.
  @Column({ nullable: true })
  nearestBranch: string;

  // ---------- STEP 4: Employment ----------
  @Column({ type: 'varchar2', length: 30, nullable: true })
  employmentStatus: EmploymentStatus;

  @Column({ nullable: true })
  employerOrBusinessName: string;

  @Column({ nullable: true })
  employerLocation: string;

  @Column({ nullable: true })
  professionOrDesignation: string;

  @Column({ nullable: true })
  employerPhone: string;

  @Column({ nullable: true })
  workAddress: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  approximateMonthlyIncome: number;

  // ---------- STEP 5: Account, products & services ----------
  @Column({ nullable: true })
  accountType: string; // premium | zidisha | mwelekeo | business_saving | flexi

  @Column({ type: 'simple-json', nullable: true })
  selectedProducts: string[]; // jiinue | fixed_deposit | junior (multi-select)

  @Column({ default: 0 })
  numberOfShares: number;

  @Column({ default: false })
  standingOrderEnabled: boolean;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  standingOrderAmount: number;

  @Column({ type: 'varchar2', length: 30, nullable: true })
  standingOrderFrequency: StandingOrderFrequency;

  @Column({ type: 'simple-json', nullable: true })
  selectedServices: string[]; // internet_banking | mobile_banking | business_paybill

  @Column({ nullable: true })
  businessName: string;

  @Column({ type: 'simple-json', nullable: true })
  businessPaybillNumbers: string[]; // 2 or more mobile numbers

  // ---------- STEP 6: Referral ----------
  @Column({ default: false })
  referredByStaff: boolean;

  @Column({ nullable: true })
  referralStaffPfNumber: string;

  @Column({ nullable: true })
  referralStaffName: string;

  // ---------- STEP 7: Next of kin / nominee ----------
  // Legacy single-nominee columns kept in sync with the first row of the
  // next_of_kin table for backwards compatibility with existing reports.
  @Column({ nullable: true })
  nextOfKinName: string;

  @Column({ nullable: true })
  nextOfKinRelationship: string;

  @Column({ nullable: true })
  nextOfKinMobileNumber: string;

  // ---------- STEP 8: Documents / verification results ----------
  @Column({ default: false })
  idOcrCompleted: boolean;

  @Column({ type: 'simple-json', nullable: true })
  idOcrExtractedData: Record<string, any>;

  @Column({ default: false })
  idOcrMatchesEnteredData: boolean;

  @Column({ default: false })
  iprsVerified: boolean;

  @Column({ type: 'simple-json', nullable: true })
  iprsResponse: Record<string, any>;

  @Column({ default: false })
  livenessVerified: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  livenessMatchScore: number;

  // ---------- STEP 9: Payment ----------
  @Column({ default: false })
  paymentCompleted: boolean;

  @Column({ nullable: true })
  mpesaCheckoutRequestId: string;

  @Column({ nullable: true })
  merchantRequestId: string;

  @Column({ nullable: true })
  mpesaReceiptNumber: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amountPaid: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  submittedAt: Date;

  // True once the collected onboarding fee (held in the Sacco collection
  // account) has been moved into the member's account after CBS created it.
  @Column({ default: false })
  fundsTransferredToMemberAccount: boolean;

  // Set when the 48-hour "still awaiting review" reminder has been raised so
  // admins are only alerted once per application.
  @Column({ type: 'timestamp with time zone', nullable: true })
  staleReminderSentAt: Date;

  // ---------- Admin review / CBS ----------
  @Column({ nullable: true })
  reviewedByAdminId: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  reviewedAt: Date;

  @Column({ nullable: true })
  rejectionReason: string;

  @Column({ nullable: true })
  cbsCustomerNumber: string;

  @Column({ default: false })
  pushedToCbs: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  pushedToCbsAt: Date;

  // ---------- Core submission (CBS core API) ----------
  // The application's id within the core API (APP-2026-XXXX), used by
  // submit-to-core. Null until the application is created/located in the core.
  @Column({ nullable: true })
  cbsApplicationId: string;

  // Snapshot of the last core submission result for surfacing in the UI.
  @Column({ type: 'simple-json', nullable: true })
  coreSubmission: Record<string, any> | null;

  @OneToMany(() => NextOfKin, (nok) => nok.application)
  nextOfKin: NextOfKin[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
