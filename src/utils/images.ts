/**
 * Detect image content type from base64 magic bytes and build a data URL.
 * Returns null if the string is too short to be valid image data.
 */
export function imageDataUrl(b64: string | undefined | null): string | null {
  if (!b64 || b64.length < 100) return null;
  try {
    const raw = atob(b64);
    const magic = raw.charCodeAt(0).toString(16).padStart(2, '0')
      + raw.charCodeAt(1).toString(16).padStart(2, '0')
      + raw.charCodeAt(2).toString(16).padStart(2, '0')
      + raw.charCodeAt(3).toString(16).padStart(2, '0');

    let mime = 'application/octet-stream';
    if (magic.startsWith('89504e47')) mime = 'image/png';
    else if (magic.startsWith('ffd8ff'))   mime = 'image/jpeg';
    else if (magic.startsWith('52494646')) mime = 'image/webp';
    else if (raw.slice(4, 8) === 'ftyp') {
      const brand = raw.slice(8, 12);
      if (brand === 'avif' || brand === 'avis') mime = 'image/avif';
      else if (brand === 'heic' || brand === 'mif1') mime = 'image/heic';
      else mime = 'image/avif';
    }
    else if (magic.startsWith('25504446')) mime = 'application/pdf';

    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

export interface DocImage {
  key: string;
  label: string;
  dataUrl: string | null;
}

/** Build a list of document images from the application fields. */
export function buildDocImages(app: Record<string, any>): DocImage[] {
  return [
    { key: 'idFrontUrl',  label: 'ID front',  dataUrl: imageDataUrl(app.idFrontUrl) },
    { key: 'idBackUrl',   label: 'ID back',   dataUrl: imageDataUrl(app.idBackUrl) },
    { key: 'passportUrl', label: 'Passport photo', dataUrl: imageDataUrl(app.passportUrl) },
    { key: 'selfieUrl',   label: 'Selfie',    dataUrl: imageDataUrl(app.selfieUrl) },
    { key: 'signatureUrl', label: 'Signature', dataUrl: imageDataUrl(app.signatureUrl) },
  ];
}