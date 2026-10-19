import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { Application } from '../applications/entities/application.entity';
import { DocumentsService } from '../documents/documents.service';

interface FillOp {
  start: number;
  end?: number;
  str: string;
  label?: string;
}

interface WtToken {
  text: string;
  fullEnd: number;
  textStart: number;
  textEnd: number;
}

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

// Where each applicant image lands on the printed form.
// - mode "frame": the heading is followed by floating custGeom frames; the
//   picture is anchored inside the selected frame (`skip` picks which one
//   when several share the heading paragraph).
// - mode "inline": the "boxes" are inline custGeom outlines in the text
//   flow; each is swapped for an identically-sized inline picture so the
//   photo occupies exactly the printed box area.
const IMAGE_TARGETS: Array<{ kind: string; headingLabel: string; skip: number; mode: 'frame' | 'inline' }> = [
  { kind: 'signature', headingLabel: 'SIGN', skip: 0, mode: 'frame' },
  { kind: 'passport_photo', headingLabel: 'PASSPORT', skip: 1, mode: 'frame' },
  { kind: 'id_front', headingLabel: 'FRONT ID', skip: 0, mode: 'inline' },
  { kind: 'id_back', headingLabel: 'BACK ID', skip: 0, mode: 'inline' },
];

/**
 * Fills the official Fortune DT Sacco Membership Application Form (Word Flat
 * OPC XML template) with an applicant's details, photos and signature so the
 * branch can print a fully-populated form for the member's file.
 */
@Injectable()
export class PrintFormService {
  private readonly logger = new Logger(PrintFormService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly documents: DocumentsService,
    @InjectRepository(Application) private readonly applicationRepo: Repository<Application>,
  ) {}

  /**
   * The template lives in backend/resources/. Depending on how the server was
   * started, process.cwd() may be the project root instead of backend/, so try
   * the usual candidates before giving up.
   */
  private resolveTemplatePath(): string {
    const configured = this.config.get<string>('FORM_TEMPLATE_PATH');
    if (configured && fs.existsSync(configured)) return configured;

    const candidates = [
      path.resolve(process.cwd(), 'resources/FORTUNE-MEMBERSHIP-APPLICATION-FORM.xml'),
      path.resolve(__dirname, '../../../resources/FORTUNE-MEMBERSHIP-APPLICATION-FORM.xml'),
      path.resolve(__dirname, '../../../../resources/FORTUNE-MEMBERSHIP-APPLICATION-FORM.xml'),
      path.resolve(process.cwd(), 'backend/resources/FORTUNE-MEMBERSHIP-APPLICATION-FORM.xml'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error(
      `Membership form template not found (looked in: ${candidates.join('; ')})`,
    );
  }

  async buildMembershipForm(applicationId: string): Promise<{ buffer: Buffer; filename: string }> {
    const templatePath = this.resolveTemplatePath();
    const pkg = fs.readFileSync(templatePath, 'utf8');

    const bounds = this.documentPartBounds(pkg);
    let doc = pkg.slice(bounds.start, bounds.end);

    const app = await this.applicationRepo.findOneOrFail({
      where: { id: applicationId },
      relations: ['nextOfKin'],
    });

    // ---------- TEXT FIELDS ----------
    let tokens = this.tokenize(doc);
    const ops: FillOp[] = [];
    const pushOp = (op: FillOp) => ops.push(op);

    this.fillTextFields(doc, tokens, app, pushOp);
    // Ops were collected against the ORIGINAL document, so they must be
    // applied from the highest offset downwards - otherwise every insertion
    // shifts the positions of the ones before it.
    doc = this.applyOps(doc, ops.slice().sort((a, b) => b.start - a.start));

    // ---------- IMAGES ----------
    // Each target mutates `doc` in turn (frames get a floating picture,
    // inline box outlines are swapped for an identically-sized picture), so
    // every lookup runs against the already-updated document.
    const mediaParts: string[] = [];
    const relationshipEntries: string[] = [];
    try {
      let relId = 101;
      for (let i = 0; i < IMAGE_TARGETS.length; i++) {
        const target = IMAGE_TARGETS[i];
        const img = await this.loadImage(app.id, target.kind);
        if (!img) continue;

        const ext = img.mimeType.includes('png') ? 'png' : 'jpeg';
        const mediaName = `app_${target.kind}.${ext}`;
        mediaParts.push(
          `<pkg:part pkg:name="/word/media/${mediaName}" pkg:contentType="image/${ext}" pkg:compression="store"><pkg:binaryData>${img.data.toString('base64')}</pkg:binaryData></pkg:part>`,
        );
        const rid = `rIdApp${relId++}`;
        relationshipEntries.push(`<Relationship Id="${rid}" Type="${REL_IMAGE}" Target="media/${mediaName}"/>`);

        const dims = await sharp(img.data).metadata().catch(() => ({ width: 4, height: 3 }));
        if (target.mode === 'inline') {
          const swapped =
            this.swapInlineBoxWithPicture(doc, target.headingLabel, target.skip, rid, 900 + i, `Applicant ${target.kind}`) ??
            this.swapPictBoxWithPicture(doc, target.headingLabel, rid, 900 + i, `Applicant ${target.kind}`);
          if (!swapped) {
            this.logger.warn(`Inline image box after "${target.headingLabel}" not found in form template`);
            continue;
          }
          doc = swapped;
        } else {
          // Fit the picture INSIDE the decorative frame drawn under the
          // heading, centred and aspect-true, so it never spills outside.
          const box = this.findBoxAfterHeading(doc, target.headingLabel, target.skip);
          if (!box) {
            this.logger.warn(`Image box after "${target.headingLabel}" not found in form template`);
            continue;
          }
          doc =
            doc.slice(0, box.insertAfter) +
            this.anchoredImageDrawing(rid, 900 + i, `Applicant ${target.kind}`, box, dims?.width || 4, dims?.height || 3) +
            doc.slice(box.insertAfter);
        }
      }

      // ---------- Indemnity signature overlay ----------
      // A background-free version of the signature placed inline right
      // after the INDEMNITY "Signature" label so the form looks as if it
      // was signed by hand over the dotted line.
      const sigImg = await this.loadImage(app.id, 'signature');
      if (sigImg) {
        const png = await this.transparentSignaturePng(sigImg.data);
        const mediaName = 'app_signature_plain.png';
        mediaParts.push(
          `<pkg:part pkg:name="/word/media/${mediaName}" pkg:contentType="image/png" pkg:compression="store"><pkg:binaryData>${png.toString('base64')}</pkg:binaryData></pkg:part>`,
        );
        const rid = `rIdApp${relId++}`;
        relationshipEntries.push(`<Relationship Id="${rid}" Type="${REL_IMAGE}" Target="media/${mediaName}"/>`);

        const spot = this.indemnitySignatureInsert(doc);
        if (!spot) {
          this.logger.warn('Indemnity "Signature" label not found; signature overlay skipped');
        } else {
          const meta = await sharp(png).metadata().catch(() => ({ width: 4, height: 1 }));
          const h = 200000; // ~16pt tall - fits inline on the Signature line
          const w = Math.min(1900000, Math.max(1, Math.round(((meta.width || 4) / (meta.height || 1)) * h)));
          const drawing = this.inlineImageDrawing(rid, 950, 'Indemnity signature', w, h);
          doc = this.placeIndemnitySignature(doc, spot.insertAfter, spot.textEnd, spot.tailText, spot.tailRpr, drawing);
        }
      }
    } catch (err) {
      this.logger.warn(`Image embedding skipped: ${err?.message || err}`);
    }

    let out = pkg.slice(0, bounds.start) + doc + pkg.slice(bounds.end);

    // Cheap well-formedness tripwire: an unbalanced <w:t>/<w:r> means some
    // fill op sliced through markup - Word would refuse the whole document.
    for (const [openRe, closeRe, name] of [
      [/<w:t[ >]/g, /<\/w:t>/g, 'w:t'],
      [/<w:r[ >]/g, /<\/w:r>/g, 'w:r'],
    ] as Array<[RegExp, RegExp, string]>) {
      const opens = (doc.match(openRe) || []).length;
      const closes = (doc.match(closeRe) || []).length;
      if (opens !== closes) {
        this.logger.error(`Form XML imbalance: ${name} open=${opens} close=${closes} - output will be corrupt`);
      }
    }

    if (relationshipEntries.length) {
      out = this.injectRelationships(out, relationshipEntries.join(''));
    }
    if (mediaParts.length) {
      out = out.replace('</pkg:package>', mediaParts.join('') + '</pkg:package>');
    }

    return {
      buffer: Buffer.from(out, 'utf8'),
      filename: `Membership-Application-${app.referenceNumber}.doc`,
    };
  }

  // ---------- text field filling ----------

  private fillTextFields(doc: string, tokens: WtToken[], app: Application, op: (o: FillOp) => void) {
    const plain = tokens.map((t) => t.text).join('');
    const plainTokens = this.plainTokenMap(tokens);

    const fill = (label: string, value?: string | null, occurrence = 1, fromIdx = 0) => {
      if (value === undefined || value === null || String(value).trim() === '') return;
      let at = fromIdx - 1;
      for (let n = 0; n < occurrence; n++) at = plain.indexOf(label, at + 1);
      if (at < 0) {
        this.logger.warn(`Form label not found: "${label}"`);
        return;
      }
      const endToken = this.tokenAt(plainTokens, at + label.length - 1);
      if (!endToken) return;
      const offsetInToken = at + label.length - endToken.plainStart;

      // The value goes into its OWN run so it can carry explicit black,
      // bold formatting that stands out from the form's printed labels -
      // splicing it into the label's <w:t> would inherit the label style
      // and the two become indistinguishable. The replacement spans whole
      // tokens: the first token's run is re-emitted up to the label end,
      // then a styled value run (and optionally a plain tail run whose
      // closing </w:t></w:r> is the last token's own, left in place).
      const upper = String(value).toUpperCase();
      const styledRpr = this.blackBoldRunRpr(doc, endToken.token.textStart);
      const baseRpr = this.enclosingRunRpr(doc, endToken.token.textStart);

      let head = endToken.token.text.slice(0, offsetInToken);
      // Strip leading dot leaders from head – they belong to the previous
      // field's dot leader, not this label (e.g. "..Profession/Designation:"
      // where the ".." is the tail of the Work Address leader).
      // Matches ASCII dots (.) and Unicode ellipsis (U+2026 …).
      const headDotMatch = head.match(/^([.…\u2026]{1,})(.+)/);
      if (headDotMatch) {
        head = headDotMatch[2];
      }
      const rest = endToken.token.text.slice(offsetInToken);
      const leader = rest.match(/^[.…\u2026]+\s*/);

      // Always consume trailing dot-only tokens after the end token,
      // whether or not there's a leader in the end token itself.  This
      // removes the stray "........." that appear after filled values
      // when dots live in separate runs (e.g. Work Adress + separate
      // dot-only tokens).
      let lastTok = endToken.token;
      const startIdx = plainTokens.findIndex((p) => p.token === endToken.token);
      if (startIdx >= 0) {
        for (let j = startIdx + 1; j < plainTokens.length; j++) {
          const nxt = plainTokens[j].token;
          if (/^[.…\u2026]{1,}\s*$/.test(nxt.text)) lastTok = nxt;
          else break;
        }
      }

      const tailSource =
        lastTok === endToken.token ? rest.slice(leader ? leader[0].length : 0) : lastTok.text.replace(/^[.…\u2026]+\s*/, '');
      const tail = tailSource.trim();

      let str =
        `${this.escapeXml(head)}` +
        `</w:t></w:r><w:r>${styledRpr}<w:t xml:space="preserve"> ${this.escapeXml(upper)} `;
      if (tail) {
        str += `</w:t></w:r><w:r>${baseRpr}<w:t xml:space="preserve"> ${this.escapeXml(tail)}`;
      }
      op({ start: endToken.token.textStart, end: lastTok.textEnd, str, label });
    };

    const tick = (option: string) => {
      // Preferred: the whole option lives in one run.
      for (const t of tokens) {
        if (t.text === option || t.text.trim() === option) {
          op({ start: t.textStart, end: t.textEnd, str: `[X] ${this.escapeXml(option)}`, label: `tick:${option}` });
          return;
        }
      }
      // Fallback: the option is split across several runs (spell-check
      // markers etc.), so locate it in the concatenated text and replace
      // the full span of runs it covers.
      const map = this.plainTokenMap(tokens);
      const at = plain.indexOf(option);
      if (at >= 0) {
        const firstTok = this.tokenAt(map, at);
        const lastTok = this.tokenAt(map, at + option.length - 1);
        if (firstTok && lastTok) {
          op({
            start: firstTok.token.textStart,
            end: lastTok.token.textEnd,
            str: `[X] ${this.escapeXml(option)}`,
            label: `tick:${option}`,
          });
          return;
        }
      }
      this.logger.warn(`Form tick option not found: "${option}"`);
    };

    const fmtDate = (d?: string | Date | null) => {
      if (!d) return '';
      const dt = typeof d === 'string' ? new Date(d) : d;
      if (isNaN(dt.getTime())) return String(d);
      return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    };

    fill('Form No:', app.referenceNumber);
    fill('Application Date:', fmtDate(app.submittedAt || app.createdAt));
    fill('Customer No:', app.cbsCustomerNumber);
    fill('Full A/C No.', app.cbsCustomerNumber);
    fill('Last Name', app.lastName);
    fill('First Name', app.firstName);
    fill('Other Names', app.otherNames);
    if (app.sex === 'Male') tick('Male');
    if (app.sex === 'Female') tick('Female');
    fill('Nationality:', app.nationality);
    fill('Country of Residence:', app.countryOfResidence);
    fill('County/City/Town:', [app.countyOfResidence, app.cityOrTown].filter(Boolean).join(' / '));
    fill('Marital Status:', app.maritalStatus);
    fill('Date of Birth:', fmtDate(app.dateOfBirth));
    fill('Mobile Number:', app.phoneNumber);
    fill('Alternative No:', app.alternativeMobileNumber);
    if (app.documentIdType === 'national_id') tick('National ID');
    if (app.documentIdType === 'passport') tick('Passport');
    if (app.documentIdType === 'other') tick('Others:');
    fill('ID/Passport NO:', app.documentIdNumber);
    fill('Date of Issue:', fmtDate(app.documentIssueDate));
    fill('Expiry Date:', fmtDate(app.documentExpiryDate));
    fill('Email Address:', app.email);
    // occurrence 2: the first "Residence:" is part of "Country of Residence:".
    fill('Residence:', app.residenceEstate, 2);
    fill('Nearest Landmark:', app.nearestLandmark);

    // Next of kin + additional nominees into the beneficiaries table.
    const nominees = (app.nextOfKin || []).slice().sort((a, b) => a.position - b.position);
    const primary = nominees[0];
    fill('Next of Kin:', primary?.name || app.nextOfKinName);
    fill('Relationship:', primary?.relationship || app.nextOfKinRelationship);
    fill('Mobile No:', primary?.mobileNumber || app.nextOfKinMobileNumber);
    this.fillBeneficiaryRows(doc, tokens, op, nominees.slice(1));

    // Employment / company / business data (labels mirror the template text,
    // including its double spaces and "Adress" typo).
    if (app.employmentStatus === 'formally_employed' || app.employmentStatus === 'contract') tick('Salaried');
    if (app.employmentStatus === 'self_employed') tick('Self Employed');
    if (app.employmentStatus === 'retired') tick('Retired');
    if (app.employmentStatus === 'casual') tick('Casual');
    fill('Current  Employer/Business:', app.employerOrBusinessName);
    fill('Location:', app.employerLocation);
    fill('Telephone  No:', app.employerPhone);
    fill('Work Adress', app.workAddress);
    fill('Profession/Designation:', app.professionOrDesignation);
    fill(
      'Approximate income',
      app.approximateMonthlyIncome != null
        ? `KES ${Number(app.approximateMonthlyIncome).toLocaleString()}`
        : '',
    );

    // Accounts: share capital is mandatory; Zidisha maps onto the form's
    // Back Office/Zidisha Shares option.
    tick('Share Capital');
    if (app.accountType === 'zidisha') tick('Back Office/Zidisha Shares');

    // Digital solutions.
    if ((app.selectedServices || []).includes('business_paybill')) tick('Paybill Service');
    if ((app.selectedServices || []).includes('mobile_banking')) tick('Mobile Banking');
    if ((app.selectedServices || []).includes('internet_banking')) tick('Internet Banking');

    if (app.referredByStaff) {
      fill('Referred by;', ` ${app.referralStaffName || ''}`);
      fill('PF NO.', ` ${app.referralStaffPfNumber || ''}`);
    }

    // ---------- INDEMNITY execution block ----------
    // "Signed this ..day of.. 20.." gets today's date, and the member's
    // name goes on the first Name/Signature line pair.
    const indAt = plain.indexOf('INDEMNITY');
    if (indAt >= 0) {
      const now = new Date();
      fill('Signed this', String(now.getDate()), 1, indAt);
      const dofAt = plain.indexOf('day of', indAt);
      if (dofAt >= 0) {
        fill('day of', now.toLocaleString('en-GB', { month: 'long' }), 1, indAt);
        const yearAt = plain.indexOf('20', dofAt);
        // The form prints the century already ("20..."), so only the
        // trailing two digits are inserted after it.
        if (yearAt >= 0) fill('20', String(now.getFullYear() % 100), 1, yearAt);
        const fullName = [app.firstName, app.otherNames, app.lastName].filter(Boolean).join(' ').trim().toUpperCase();
        if (fullName) fill('Name', fullName, 1, yearAt >= 0 ? yearAt : dofAt);
      }
    }
  }

  private escapeXml(v: string): string {
    return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private valueRun(value: string): string {
    return `<w:r><w:rPr><w:b/><w:u/><w:color w:val="29255D"/></w:rPr><w:t xml:space="preserve">${this.escapeXml(value)}</w:t></w:r>`;
  }

  private documentPartBounds(pkg: string): { start: number; end: number } {
    const marker = '<pkg:part pkg:name="/word/document.xml"';
    const start = pkg.indexOf(marker);
    if (start < 0) throw new Error('document.xml part missing from template');
    const next = pkg.indexOf('<pkg:part ', start + marker.length);
    return { start, end: next };
  }

  private tokenize(doc: string): WtToken[] {
    const tokens: WtToken[] = [];
    const re = /<w:t(?:\s[^>]*)?>((?:[^<]|<(?!\/w:t>))*)<\/w:t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(doc))) {
      const openEnd = doc.indexOf('>', m.index) + 1;
      tokens.push({
        text: m[1],
        fullEnd: m.index + m[0].length,
        textStart: openEnd,
        textEnd: openEnd + m[1].length,
      });
    }
    return tokens;
  }

  private plainTokenMap(tokens: WtToken[]) {
    const map: Array<{ token: WtToken; plainStart: number }> = [];
    let acc = 0;
    for (const t of tokens) {
      map.push({ token: t, plainStart: acc });
      acc += t.text.length;
    }
    return map;
  }

  private tokenAt(
    map: ReturnType<PrintFormService['plainTokenMap']>,
    plainPos: number,
  ): { token: WtToken; plainStart: number } | null {
    for (let i = map.length - 1; i >= 0; i--) {
      if (plainPos >= map[i].plainStart) return map[i];
    }
    return null;
  }

  private applyOps(doc: string, sortedDesc: FillOp[]): string {
    let out = doc;
    // Ops are applied highest-offset-first. Two ops whose ranges intersect
    // would corrupt the XML (the second splice lands inside already-spliced
    // markup and can cut through tags), so collisions are dropped loudly.
    let applied: FillOp | null = null;
    for (const op of sortedDesc) {
      const end = op.end ?? op.start;
      // sortedDesc is highest-start-first, so the previously applied range
      // always starts at or above the current one; any tail extending past
      // its start means the two ranges intersect.
      if (applied && end > applied.start) {
        this.logger.warn(
          `Dropping overlapping form fill op "${op.label ?? '?'}" (${op.start}..${end}) colliding with "${applied.label ?? '?'}" (${applied.start}..${applied.end})`,
        );
        continue;
      }
      applied = op;
      out = out.slice(0, op.start) + op.str + out.slice(end);
    }
    return out;
  }

  // Best-effort: write extra nominees into the empty cells of the
  // "ADD OTHER BENEFICIARIES" table (names, phone, relationship per row).
  private fillBeneficiaryRows(doc: string, tokens: WtToken[], op: (o: FillOp) => void, extras: Array<any>) {
    if (!extras.length) return;
    try {
      const header = tokens.find((t) => t.text === 'PHONE NUMBER');
      if (!header) return;
      const tblStart = doc.lastIndexOf('<w:tbl>', header.textStart);
      const tblEnd = doc.indexOf('</w:tbl>', tblStart);
      if (tblStart < 0 || tblEnd < 0) return;
      const tbl = doc.slice(tblStart, tblEnd);

      const cellRe = /<w:tc>[\s\S]*?<\/w:tc>/g;
      let m: RegExpExecArray | null;
      const COLS = 4;
      let cellIdx = 0;
      let row = 0;
      while ((m = cellRe.exec(tbl))) {
        const col = cellIdx % COLS;
        const dataRow = row; // row 0 = header, row 1+ = data
        cellIdx++;
        if (col === COLS - 1) row++;

        if (dataRow < 1) continue; // skip header row

        const nomineeIdx = dataRow - 1;
        if (nomineeIdx >= extras.length) continue;
        const nominee = extras[nomineeIdx];

        // Column 0 = NO. → row number
        // Column 1 = NAMES → name
        // Column 2 = PHONE NUMBER → mobileNumber
        // Column 3 = RELATIONSHIP → relationship
        let value: string | undefined;
        if (col === 0) value = String(nomineeIdx + 1);
        else if (col === 1) value = nominee.name;
        else if (col === 2) value = nominee.mobileNumber;
        else if (col === 3) value = nominee.relationship;

        if (!value) continue;
        op({
          start: tblStart + m.index + m[0].lastIndexOf('</w:p>'),
          str: `<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${this.escapeXml(value)}</w:t></w:r>`,
          label: `beneficiary:${nomineeIdx}:${col}`,
        });
      }
    } catch (err) {
      this.logger.warn(`Beneficiary table fill failed: ${err?.message || err}`);
    }
  }

  // ---------- images ----------

  private async loadImage(applicationId: string, kind: string): Promise<{ data: Buffer; mimeType: string } | null> {
    try {
      const img = await this.documents.getImageBinary(applicationId, kind);
      if (!img) return null;
      if (img.mimeType === 'image/webp') {
        return { data: await sharp(img.data).png().toBuffer(), mimeType: 'image/png' };
      }
      return img;
    } catch (err) {
      this.logger.warn(`Could not load image ${kind}: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * Locates the first "Signature" label after the INDEMNITY heading and
   * reports where the inline signature image must be inserted: after the
   * label's run is closed, plus the remaining text and run properties so a
   * valid tail run can be re-opened (a drawing may never sit inside w:t).
   */
  private indemnitySignatureInsert(
    doc: string,
  ): { insertAfter: number; textEnd: number; tailText: string; tailRpr: string } | null {
    const tokens = this.tokenize(doc);
    const plainMap = this.plainTokenMap(tokens);
    const plain = tokens.map((t) => t.text).join('');
    const indAt = plain.indexOf('INDEMNITY');
    if (indAt < 0) return null;
    const sigAt = plain.indexOf('Signature', indAt);
    if (sigAt < 0) return null;
    const info = this.tokenAt(plainMap, sigAt + 'Signature'.length - 1);
    if (!info) return null;
    let ins = sigAt + 'Signature'.length - info.plainStart;
    while (ins < info.token.text.length && /\s/.test(info.token.text[ins])) ins++;
    // Always keep at least one space in the reopened tail run - the token's
    // own closing tags must seal SOMETHING.
    const rest = ins < info.token.text.length ? info.token.text.slice(ins) : ' ';
    return {
      insertAfter: info.token.textStart + (sigAt + 'Signature'.length - info.plainStart),
      textEnd: info.token.textEnd,
      tailText: rest,
      tailRpr: this.enclosingRunRpr(doc, info.token.textStart),
    };
  }

  /** Splices the signature drawing into the document with valid run boundaries. */
  private placeIndemnitySignature(
    doc: string,
    insertAfter: number,
    textEnd: number,
    tailText: string,
    tailRpr: string,
    drawingXml: string,
  ): string {
    const str =
      `</w:t></w:r>` +
      `<w:r><w:drawing>${drawingXml}</w:drawing></w:r>` +
      `<w:r>${tailRpr}<w:t xml:space="preserve">${this.escapeXml(tailText)}`;
    return doc.slice(0, insertAfter) + str + doc.slice(textEnd);
  }

  /**
   * Converts a signature photo/scan into a clean black-on-transparent PNG.
   * An adaptive (local-mean / Bradley) threshold separates pen strokes from
   * paper even under uneven lighting and shadows that defeat global
   * thresholds. The result is cropped tightly to the strokes so it can sit
   * on the printed dotted line like a real hand signature.
   */
  private async transparentSignaturePng(data: Buffer): Promise<Buffer> {
    const { data: g, info } = await sharp(data)
      .resize({ width: 900, withoutEnlargement: true })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const W = info.width;
    const H = info.height;

    // Integral image for O(1) local-mean lookups.
    const ii = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let rowSum = 0;
      for (let x = 0; x < W; x++) {
        rowSum += g[y * W + x];
        ii[(y + 1) * (W + 1) + (x + 1)] = ii[y * (W + 1) + (x + 1)] + rowSum;
      }
    }

    const win = Math.max(15, Math.floor(W / 18)) | 1;
    const C = 22;
    const rgba = Buffer.alloc(W * H * 4);
    let minX = W;
    let minY = H;
    let maxX = -1;
    let maxY = -1;
    let ink = 0;
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - win);
      const y1 = Math.min(H - 1, y + win);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - win);
        const x1 = Math.min(W - 1, x + win);
        const area = (x1 - x0 + 1) * (y1 - y0 + 1);
        const s =
          ii[(y1 + 1) * (W + 1) + x1 + 1] -
          ii[y0 * (W + 1) + x1 + 1] -
          ii[(y1 + 1) * (W + 1) + x0] +
          ii[y0 * (W + 1) + x0];
        const v = g[y * W + x];
        let a = 0;
        if (v < s / area - C) {
          // Hard binary: pixel is significantly darker than local mean → ink.
          a = 255;
          ink++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        rgba[(y * W + x) * 4] = 0;
        rgba[(y * W + x) * 4 + 1] = 0;
        rgba[(y * W + x) * 4 + 2] = 0;
        rgba[(y * W + x) * 4 + 3] = a;
      }
    }
    this.logger.log(`Signature extraction: ${(((ink || 0) / (W * H)) * 100).toFixed(1)}% ink`);

    // Nothing detected - return a 1×1 transparent PNG rather than the
    // original image (which still has the paper background).
    if (maxX < 0) {
      return sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    }

    const pad = 10;
    const left = Math.max(0, minX - pad);
    const top = Math.max(0, minY - pad);
    const width = Math.min(W - left, maxX - minX + 1 + pad * 2);
    const height = Math.min(H - top, maxY - minY + 1 + pad * 2);
    return sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
      .extract({ left, top, width, height })
      .png()
      .toBuffer();
  }

  // Run properties of the run whose text starts at `textStart` (best effort).
  private enclosingRunRpr(doc: string, textStart: number): string {
    const runStart = Math.max(doc.lastIndexOf('<w:r>', textStart), doc.lastIndexOf('<w:r ', textStart));
    const head = runStart >= 0 ? doc.slice(runStart, textStart) : '';
    const rprM = head.match(/<w:rPr[\s\S]*?<\/w:rPr>/);
    return rprM ? rprM[0] : '';
  }

  // The enclosing run properties with colour stripped and black+bold forced,
  // so filled values stay in the form's font/size but read as entered data.
  private blackBoldRunRpr(doc: string, textStart: number): string {
    let rpr = this.enclosingRunRpr(doc, textStart);
    rpr = rpr.replace(/<w:color[^>]*\/>/g, '').replace(/<w:b(?:\s[^>]*)?\/>/g, '');
    if (rpr) return rpr.replace(/<\/w:rPr>$/, '<w:b/><w:color w:val="000000"/></w:rPr>');
    return '<w:rPr><w:b/><w:color w:val="000000"/></w:rPr>';
  }

  // Document offset of the given heading text (start of its first run).
  private headingPosition(doc: string, headingText: string): number {
    const tokens = this.tokenize(doc);
    const token = tokens.find((t) => t.text.trim() === headingText);
    if (token) return token.fullEnd - token.text.length;
    // The heading may be split across runs (e.g. leading spaces), fall back
    // to searching the concatenated plain text for the trimmed label.
    const plainMap = this.plainTokenMap(tokens);
    const plain = tokens.map((t) => t.text).join('');
    const at = plain.indexOf(headingText);
    if (at < 0) return -1;
    const tok = this.tokenAt(plainMap, at);
    if (!tok) return -1;
    return tok.token.fullEnd - tok.token.text.length + (at - tok.plainStart);
  }

  // End offset of the paragraph that contains the given heading text.
  private headingParagraphEnd(doc: string, headingText: string): number {
    const pos = this.headingPosition(doc, headingText);
    if (pos < 0) return -1;
    return doc.indexOf('</w:p>', doc.indexOf('>', doc.lastIndexOf('<w:t', pos))) + '</w:p>'.length;
  }

  /**
   * Locates the decorative drawing frame (custGeom shape) that sits under a
   * heading - e.g. the SIGNATURE or PASSPORT PHOTOGRAPH box - and reports its
   * geometry so the applicant's picture can be anchored inside it.
   */
  private findBoxAfterHeading(
    doc: string,
    headingText: string,
    skip = 0,
  ): { insertAfter: number; relH: string; offH: number; relV: string; offV: number; cx: number; cy: number } | null {
    const headingEnd = this.headingParagraphEnd(doc, headingText);
    if (headingEnd < 0) return null;

    let pos = doc.indexOf('<wp:anchor', headingEnd);
    let found = 0;
    while (pos >= 0 && pos < headingEnd + 60000) {
      const anchorEnd = doc.indexOf('</wp:anchor>', pos);
      if (anchorEnd < 0) return null;
      const block = doc.slice(pos, anchorEnd);
      if (block.includes('<a:custGeom')) {
        // Frames sharing the heading paragraph are visited left-to-right;
        // `skip` selects which one (e.g. PASSPORT is the 2nd frame).
        if (found++ < skip) {
          pos = doc.indexOf('<wp:anchor', doc.indexOf('</mc:AlternateContent>', anchorEnd));
          continue;
        }
        const relHM = block.match(/<wp:positionH relativeFrom="([^"]+)">([\s\S]*?)<\/wp:positionH>/);
        const relVM = block.match(/<wp:positionV relativeFrom="([^"]+)">([\s\S]*?)<\/wp:positionV>/);
        const offH = relHM && relHM[2].match(/<wp:posOffset>(-?\d+)<\/wp:posOffset>/);
        const offV = relVM && relVM[2].match(/<wp:posOffset>(-?\d+)<\/wp:posOffset>/);
        const extM = block.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
        if (!relHM || !relVM || !offH || !offV || !extM) {
          this.logger.warn(`Image box after "${headingText}" has unsupported geometry`);
          return null;
        }
        // Insert right after the box's AlternateContent block so the new
        // drawing shares the same paragraph (and therefore the same
        // vertical reference frame) as the frame itself.
        const altClose = doc.indexOf('</mc:AlternateContent>', anchorEnd);
        const insertAfter =
          altClose >= 0 && altClose < anchorEnd + 200000
            ? altClose + '</mc:AlternateContent>'.length
            : doc.indexOf('</w:drawing>', anchorEnd) + '</w:drawing>'.length;
        return {
          insertAfter,
          relH: relHM[1],
          offH: Number(offH[1]),
          relV: relVM[1],
          offV: Number(offV[1]),
          cx: Number(extM[1]),
          cy: Number(extM[2]),
        };
      }
      pos = doc.indexOf('<wp:anchor', anchorEnd);
    }
    return null;
  }

  /**
   * The FRONT ID / BACK ID "boxes" are inline custGeom outlines sitting in
   * the text flow rather than floating frames. Each outline (wrapped in an
   * mc:AlternateContent block) is replaced outright with an identically-sized
   * inline picture so the photo occupies exactly the printed box area.
   */
  private swapInlineBoxWithPicture(
    doc: string,
    headingText: string,
    skip: number,
    rid: string,
    id: number,
    name: string,
  ): string | null {
    const headingPos = this.headingPosition(doc, headingText);
    if (headingPos < 0) return null;

    let pos = doc.indexOf('<mc:AlternateContent', headingPos);
    let found = 0;
    while (pos >= 0 && pos < headingPos + 60000) {
      const close = doc.indexOf('</mc:AlternateContent>', pos);
      if (close < 0) return null;
      const block = doc.slice(pos, close);
      if (block.includes('<wp:inline') && block.includes('<a:custGeom')) {
        if (found++ < skip) {
          pos = doc.indexOf('<mc:AlternateContent', close);
          continue;
        }
        const extM = block.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
        if (!extM) {
          this.logger.warn(`Inline image box after "${headingText}" has no extent`);
          return null;
        }
        const drawing =
          `<w:drawing>` +
          this.inlineImageDrawing(rid, id, name, Number(extM[1]), Number(extM[2])) +
          `</w:drawing>`;
        return doc.slice(0, pos) + drawing + doc.slice(close + '</mc:AlternateContent>'.length);
      }
      pos = doc.indexOf('<mc:AlternateContent', close);
    }
    return null;
  }

  /**
   * Fallback for boxes that exist only as VML (w:pict v:group) with no
   * DrawingML twin - e.g. the BACK ID box. Such in-flow pictures are
   * identified by their char/line relative positioning and swapped for an
   * identically-sized inline picture.
   */
  private swapPictBoxWithPicture(doc: string, headingText: string, rid: string, id: number, name: string): string | null {
    const headingPos = this.headingPosition(doc, headingText);
    if (headingPos < 0) return null;

    let pos = doc.indexOf('<w:pict', headingPos);
    while (pos >= 0 && pos < headingPos + 60000) {
      const close = doc.indexOf('</w:pict>', pos);
      if (close < 0) return null;
      const block = doc.slice(pos, close);
      if (block.includes('mso-position-horizontal-relative:char') && block.includes('<v:group')) {
        const wM = block.match(/width:([\d.]+)pt/);
        const hM = block.match(/height:([\d.]+)pt/);
        if (!wM || !hM) {
          this.logger.warn(`VML image box after "${headingText}" has no usable size`);
          return null;
        }
        // 1pt = 12700 EMU.
        const cx = Math.round(parseFloat(wM[1]) * 12700);
        const cy = Math.round(parseFloat(hM[1]) * 12700);
        const drawing = `<w:drawing>${this.inlineImageDrawing(rid, id, name, cx, cy)}</w:drawing>`;

        // The pict may be the VML fallback inside an mc:AlternateContent
        // whose Choice branch draws the empty box - replacing only the pict
        // would leave that invisible-in-Word box as the rendered content.
        // Replace the WHOLE block in that case.
        const encStart = doc.lastIndexOf('<mc:AlternateContent', pos);
        if (encStart >= 0) {
          const encClose = doc.indexOf('</mc:AlternateContent>', pos);
          if (encClose > close) {
            return doc.slice(0, encStart) + drawing + doc.slice(encClose + '</mc:AlternateContent>'.length);
          }
        }
        return doc.slice(0, pos) + drawing + doc.slice(close + '</w:pict>'.length);
      }
      pos = doc.indexOf('<w:pict', close);
    }
    return null;
  }

  /** An inline picture filling the given extent exactly. */  private inlineImageDrawing(rid: string, id: number, name: string, cx: number, cy: number): string {
    return (
      `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
      `<wp:docPr id="${id}" name="${name}"/><wp:cNvGraphicFramePr>` +
      `<a:graphicFrameLocks xmlns:a="${NS_A}" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_PIC}">` +
      `<pic:pic xmlns:pic="${NS_PIC}"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
      `</a:graphicData></a:graphic></wp:inline>`
    );
  }

  /**
   * A floating picture anchored inside one of the form's drawing boxes,
   * scaled to fit (aspect preserved) and centred with a small margin.
   */
  private anchoredImageDrawing(
    rid: string,
    id: number,
    name: string,
    box: { relH: string; offH: number; relV: string; offV: number; cx: number; cy: number },
    imgW: number,
    imgH: number,
  ): string {
    // Stay just inside the printed frame border (~3.5pt / ~2.4pt).
    const insetX = 45000;
    const insetY = 30000;
    const availW = Math.max(1, box.cx - insetX * 2);
    const availH = Math.max(1, box.cy - insetY * 2);
    const scale = Math.min(availW / imgW, availH / imgH);
    const drawW = Math.max(1, Math.round(imgW * scale));
    const drawH = Math.max(1, Math.round(imgH * scale));
    const offX = box.offH + insetX + Math.round((availW - drawW) / 2);
    const offY = box.offV + insetY + Math.round((availH - drawH) / 2);

    return (
      `<w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" ` +
      `relativeHeight="${251700000 + id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">` +
      `<wp:simplePos x="0" y="0"/>` +
      `<wp:positionH relativeFrom="${box.relH}"><wp:posOffset>${offX}</wp:posOffset></wp:positionH>` +
      `<wp:positionV relativeFrom="${box.relV}"><wp:posOffset>${offY}</wp:posOffset></wp:positionV>` +
      `<wp:extent cx="${drawW}" cy="${drawH}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
      `<wp:wrapNone/>` +
      `<wp:docPr id="${id}" name="${name}"/><wp:cNvGraphicFramePr>` +
      `<a:graphicFrameLocks xmlns:a="${NS_A}" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_PIC}">` +
      `<pic:pic xmlns:pic="${NS_PIC}"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${drawW}" cy="${drawH}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
      `</a:graphicData></a:graphic></wp:anchor></w:drawing>`
    );
  }

  // ---------- package assembly ----------

  private injectRelationships(pkg: string, entries: string): string {
    const marker = '<pkg:part pkg:name="/word/_rels/document.xml.rels"';
    const start = pkg.indexOf(marker);
    if (start < 0) throw new Error('document.xml.rels part missing from template');
    const openTagStart = pkg.indexOf('<Relationships ', start);
    const openTagEnd = pkg.indexOf('>', openTagStart) + 1;
    const closeIdx = pkg.indexOf('</Relationships>', openTagEnd);
    return pkg.slice(0, closeIdx) + entries + pkg.slice(closeIdx);
  }
}
