// encoder.ts — uqr wrapper → boolean matrix
import { encode as uqrEncode, QrCodeDataType } from 'uqr';
import type { QrCodeGenerateResult } from 'uqr';

export type ECCLevel = 'L' | 'M' | 'Q' | 'H';

export interface EncodedQR {
  matrix: boolean[][];
  /** Module types: Data | Function | Position (finder) | Timing | Alignment — used for styling eyes */
  types: number[][];
  size: number;
}

export function encode(text: string, ecc: ECCLevel = 'M'): EncodedQR {
  if (!text || text.length === 0) {
    throw new Error('Input text cannot be empty');
  }

  let result: QrCodeGenerateResult;
  try {
    result = uqrEncode(text, { ecc, border: 0 });
  } catch (err) {
    if (err instanceof RangeError && err.message.includes('too long')) {
      throw new Error(
        'Data too long for a QR code. Shorten the input or lower the error correction level.'
      );
    }
    throw err;
  }

  return {
    matrix: result.data,
    types: result.types,
    size: result.size,
  };
}

export { QrCodeDataType };