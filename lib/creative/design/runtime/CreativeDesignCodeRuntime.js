const CONTRACT = "CREATIVE_DESIGN_CODE_RUNTIME_V1";

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const QR_RS_BLOCKS_L = Object.freeze({
  1: [[1, 26, 19]],
  2: [[1, 44, 34]],
  3: [[1, 70, 55]],
  4: [[1, 100, 80]],
  5: [[1, 134, 108]],
  6: [[2, 86, 68]],
  7: [[2, 98, 78]],
  8: [[2, 121, 97]],
  9: [[2, 146, 116]],
  10: [[2, 86, 68], [2, 87, 69]],
});

const QR_ALIGNMENT = Object.freeze({
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
});

const GF_EXP = new Array(512).fill(0);
const GF_LOG = new Array(256).fill(0);
(function initializeGaloisField() {
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    GF_EXP[index] = value;
    GF_LOG[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) {
    GF_EXP[index] = GF_EXP[index - 255];
  }
})();

function gfMultiply(left, right) {
  if (!left || !right) return 0;
  return GF_EXP[GF_LOG[left] + GF_LOG[right]];
}

function generatorPolynomial(degree) {
  let polynomial = [1];
  for (let power = 0; power < degree; power += 1) {
    const next = new Array(polynomial.length + 1).fill(0);
    for (let index = 0; index < polynomial.length; index += 1) {
      next[index] ^= polynomial[index];
      next[index + 1] ^= gfMultiply(polynomial[index], GF_EXP[power]);
    }
    polynomial = next;
  }
  return polynomial;
}

function reedSolomon(data, eccLength) {
  const generator = generatorPolynomial(eccLength);
  const working = [...data, ...new Array(eccLength).fill(0)];
  for (let index = 0; index < data.length; index += 1) {
    const coefficient = working[index];
    if (!coefficient) continue;
    for (let offset = 0; offset < generator.length; offset += 1) {
      working[index + offset] ^= gfMultiply(generator[offset], coefficient);
    }
  }
  return working.slice(data.length);
}

function pushBits(target, value, length) {
  for (let bit = length - 1; bit >= 0; bit -= 1) {
    target.push((value >>> bit) & 1);
  }
}

function qrBlocks(version) {
  const definitions = QR_RS_BLOCKS_L[version];
  if (!definitions) throw new Error(`CREATIVE_DESIGN_QR_VERSION_UNSUPPORTED:${version}`);
  return definitions.flatMap(([count, total, data]) =>
    Array.from({ length: count }, () => ({ total, data, ecc: total - data })),
  );
}

function dataCapacity(version) {
  return qrBlocks(version).reduce((sum, block) => sum + block.data, 0);
}

function chooseQrVersion(byteLength) {
  for (let version = 1; version <= 10; version += 1) {
    const countBits = version < 10 ? 8 : 16;
    const requiredBits = 4 + countBits + byteLength * 8;
    if (requiredBits <= dataCapacity(version) * 8) return version;
  }
  throw new Error("CREATIVE_DESIGN_QR_PAYLOAD_TOO_LARGE");
}

function qrDataCodewords(bytes, version) {
  const capacity = dataCapacity(version);
  const bits = [];
  pushBits(bits, 0b0100, 4);
  pushBits(bits, bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) pushBits(bits, byte, 8);

  const capacityBits = capacity * 8;
  const terminator = Math.min(4, Math.max(0, capacityBits - bits.length));
  for (let index = 0; index < terminator; index += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);

  const codewords = [];
  for (let index = 0; index < bits.length; index += 8) {
    let value = 0;
    for (let offset = 0; offset < 8; offset += 1) {
      value = (value << 1) | bits[index + offset];
    }
    codewords.push(value);
  }
  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < capacity) {
    codewords.push(pads[padIndex % 2]);
    padIndex += 1;
  }
  return codewords;
}

function qrInterleavedCodewords(dataCodewords, version) {
  const blocks = qrBlocks(version);
  const dataBlocks = [];
  const eccBlocks = [];
  let cursor = 0;
  for (const block of blocks) {
    const data = dataCodewords.slice(cursor, cursor + block.data);
    cursor += block.data;
    dataBlocks.push(data);
    eccBlocks.push(reedSolomon(data, block.ecc));
  }

  const result = [];
  const maxData = Math.max(...dataBlocks.map((block) => block.length));
  for (let index = 0; index < maxData; index += 1) {
    for (const block of dataBlocks) {
      if (index < block.length) result.push(block[index]);
    }
  }
  const maxEcc = Math.max(...eccBlocks.map((block) => block.length));
  for (let index = 0; index < maxEcc; index += 1) {
    for (const block of eccBlocks) {
      if (index < block.length) result.push(block[index]);
    }
  }
  return result;
}

function bchDigit(value) {
  let digit = 0;
  while (value) {
    digit += 1;
    value >>>= 1;
  }
  return digit;
}

function bchTypeInfo(data) {
  let working = data << 10;
  const generator = 0x537;
  while (bchDigit(working) - bchDigit(generator) >= 0) {
    working ^= generator << (bchDigit(working) - bchDigit(generator));
  }
  return ((data << 10) | working) ^ 0x5412;
}

function bchVersion(version) {
  let working = version << 12;
  const generator = 0x1f25;
  while (bchDigit(working) - bchDigit(generator) >= 0) {
    working ^= generator << (bchDigit(working) - bchDigit(generator));
  }
  return (version << 12) | working;
}

function blankMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(null));
}

function setupFinder(matrix, row, column) {
  const size = matrix.length;
  for (let r = -1; r <= 7; r += 1) {
    const rr = row + r;
    if (rr < 0 || rr >= size) continue;
    for (let c = -1; c <= 7; c += 1) {
      const cc = column + c;
      if (cc < 0 || cc >= size) continue;
      const finder =
        r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
        (r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      matrix[rr][cc] = finder;
    }
  }
}

function setupAlignment(matrix, version) {
  const positions = QR_ALIGNMENT[version] || [];
  for (const row of positions) {
    for (const column of positions) {
      if (matrix[row][column] !== null) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          matrix[row + r][column + c] =
            Math.max(Math.abs(r), Math.abs(c)) === 2 || (r === 0 && c === 0);
        }
      }
    }
  }
}

function setupTiming(matrix) {
  const size = matrix.length;
  for (let index = 8; index < size - 8; index += 1) {
    if (matrix[index][6] === null) matrix[index][6] = index % 2 === 0;
    if (matrix[6][index] === null) matrix[6][index] = index % 2 === 0;
  }
}

function setupFormatInfo(matrix, maskPattern = 0) {
  const size = matrix.length;
  // L error correction is binary 01 in QR format information.
  const bits = bchTypeInfo((1 << 3) | maskPattern);
  for (let index = 0; index < 15; index += 1) {
    const dark = ((bits >>> index) & 1) === 1;

    if (index < 6) matrix[index][8] = dark;
    else if (index < 8) matrix[index + 1][8] = dark;
    else matrix[size - 15 + index][8] = dark;

    if (index < 8) matrix[8][size - index - 1] = dark;
    else if (index < 9) matrix[8][15 - index] = dark;
    else matrix[8][15 - index - 1] = dark;
  }
  matrix[size - 8][8] = true;
}

function setupVersionInfo(matrix, version) {
  if (version < 7) return;
  const size = matrix.length;
  const bits = bchVersion(version);
  for (let index = 0; index < 18; index += 1) {
    const dark = ((bits >>> index) & 1) === 1;
    matrix[Math.floor(index / 3)][index % 3 + size - 11] = dark;
    matrix[index % 3 + size - 11][Math.floor(index / 3)] = dark;
  }
}

function maskBit(row, column, pattern = 0) {
  if (pattern !== 0) throw new Error(`CREATIVE_DESIGN_QR_MASK_UNSUPPORTED:${pattern}`);
  return (row + column) % 2 === 0;
}

function mapQrData(matrix, codewords, maskPattern = 0) {
  const size = matrix.length;
  let row = size - 1;
  let increment = -1;
  let byteIndex = 0;
  let bitIndex = 7;

  for (let column = size - 1; column > 0; column -= 2) {
    if (column === 6) column -= 1;
    while (true) {
      for (let offset = 0; offset < 2; offset += 1) {
        const targetColumn = column - offset;
        if (matrix[row][targetColumn] !== null) continue;
        let dark = false;
        if (byteIndex < codewords.length) {
          dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
        }
        if (maskBit(row, targetColumn, maskPattern)) dark = !dark;
        matrix[row][targetColumn] = dark;
        bitIndex -= 1;
        if (bitIndex < 0) {
          byteIndex += 1;
          bitIndex = 7;
        }
      }
      row += increment;
      if (row < 0 || row >= size) {
        row -= increment;
        increment = -increment;
        break;
      }
    }
  }
}

export function createQrMatrix(value, options = {}) {
  const payload = String(value ?? "");
  if (!payload.length) throw new Error("CREATIVE_DESIGN_QR_VALUE_REQUIRED");
  const correction = text(options.error_correction || options.errorCorrection || "L").toUpperCase();
  if (correction !== "L") {
    throw new Error(`CREATIVE_DESIGN_QR_ERROR_CORRECTION_UNSUPPORTED:${correction}`);
  }
  const bytes = [...new TextEncoder().encode(payload)];
  const version = number(options.version, 0) || chooseQrVersion(bytes.length);
  if (version < 1 || version > 10) {
    throw new Error(`CREATIVE_DESIGN_QR_VERSION_UNSUPPORTED:${version}`);
  }
  if (bytes.length * 8 + 20 > dataCapacity(version) * 8) {
    throw new Error(`CREATIVE_DESIGN_QR_VERSION_CAPACITY_EXCEEDED:${version}`);
  }

  const data = qrDataCodewords(bytes, version);
  const codewords = qrInterleavedCodewords(data, version);
  const size = 17 + version * 4;
  const matrix = blankMatrix(size);
  setupFinder(matrix, 0, 0);
  setupFinder(matrix, size - 7, 0);
  setupFinder(matrix, 0, size - 7);
  setupAlignment(matrix, version);
  setupTiming(matrix);
  setupFormatInfo(matrix, 0);
  setupVersionInfo(matrix, version);
  mapQrData(matrix, codewords, 0);

  return {
    contract: "CREATIVE_DESIGN_QR_MATRIX_V1",
    value: payload,
    version,
    error_correction: "L",
    mask_pattern: 0,
    size,
    matrix,
  };
}

export function renderQrNodeToSvg(node = {}) {
  const frame = node.frame || {};
  const qr = createQrMatrix(node.value ?? node.content, node);
  const quiet = Math.max(4, Math.floor(number(node.quiet_zone, 4)));
  const logicalSize = qr.size + quiet * 2;
  const moduleSize = Math.min(number(frame.width), number(frame.height)) / logicalSize;
  const qrWidth = logicalSize * moduleSize;
  const x0 = number(frame.x) + (number(frame.width) - qrWidth) / 2 + quiet * moduleSize;
  const y0 = number(frame.y) + (number(frame.height) - qrWidth) / 2 + quiet * moduleSize;
  const commands = [];
  for (let row = 0; row < qr.size; row += 1) {
    for (let column = 0; column < qr.size; column += 1) {
      if (!qr.matrix[row][column]) continue;
      const x = x0 + column * moduleSize;
      const y = y0 + row * moduleSize;
      commands.push(`M${x.toFixed(4)} ${y.toFixed(4)}h${moduleSize.toFixed(4)}v${moduleSize.toFixed(4)}h-${moduleSize.toFixed(4)}z`);
    }
  }
  return {
    svg: `<g data-node-id="${escapeXml(node.id)}" data-code-type="QR"><rect x="${number(frame.x)}" y="${number(frame.y)}" width="${number(frame.width)}" height="${number(frame.height)}" fill="${escapeXml(node.background || "#ffffff")}"/><path d="${commands.join("")}" fill="${escapeXml(node.fill || "#000000")}"/></g>`,
    evidence: {
      node_id: node.id,
      type: "QR",
      value: qr.value,
      version: qr.version,
      error_correction: qr.error_correction,
      matrix_size: qr.size,
      quiet_zone_modules: quiet,
      deterministic: true,
    },
  };
}

const EAN_L = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const EAN_G = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];
const EAN_R = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];
const EAN_PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

function ean13Checksum(firstTwelve) {
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(firstTwelve[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

function normalizeEan13(value) {
  let digits = String(value ?? "").replace(/\s+/g, "");
  if (!/^\d{12,13}$/.test(digits)) {
    throw new Error("CREATIVE_DESIGN_EAN13_DIGITS_REQUIRED");
  }
  if (digits.length === 12) digits += String(ean13Checksum(digits));
  const expected = ean13Checksum(digits.slice(0, 12));
  if (Number(digits[12]) !== expected) {
    throw new Error("CREATIVE_DESIGN_EAN13_CHECKSUM_INVALID");
  }
  return digits;
}

export function createEan13Bits(value) {
  const digits = normalizeEan13(value);
  const parity = EAN_PARITY[Number(digits[0])];
  let bits = "101";
  for (let index = 1; index <= 6; index += 1) {
    const digit = Number(digits[index]);
    bits += parity[index - 1] === "L" ? EAN_L[digit] : EAN_G[digit];
  }
  bits += "01010";
  for (let index = 7; index <= 12; index += 1) bits += EAN_R[Number(digits[index])];
  bits += "101";
  return { digits, bits };
}

export function renderBarcodeNodeToSvg(node = {}) {
  const symbology = text(node.symbology || node.format || "EAN13").toUpperCase();
  if (!["EAN13", "EAN-13"].includes(symbology)) {
    throw new Error(`CREATIVE_DESIGN_BARCODE_SYMBOLOGY_UNSUPPORTED:${symbology}`);
  }
  const encoded = createEan13Bits(node.value ?? node.content);
  const frame = node.frame || {};
  const quietModules = Math.max(10, Math.floor(number(node.quiet_zone, 10)));
  const logicalWidth = encoded.bits.length + quietModules * 2;
  const moduleWidth = number(frame.width) / logicalWidth;
  const barHeight = Math.max(1, number(frame.height) * (node.show_text === false ? 1 : 0.82));
  const x0 = number(frame.x) + quietModules * moduleWidth;
  const paths = [];
  for (let index = 0; index < encoded.bits.length; index += 1) {
    if (encoded.bits[index] !== "1") continue;
    paths.push(`<rect x="${(x0 + index * moduleWidth).toFixed(4)}" y="${number(frame.y).toFixed(4)}" width="${moduleWidth.toFixed(4)}" height="${barHeight.toFixed(4)}"/>`);
  }
  const label = node.show_text === false
    ? ""
    : `<text x="${(number(frame.x) + number(frame.width) / 2).toFixed(4)}" y="${(number(frame.y) + number(frame.height)).toFixed(4)}" text-anchor="middle" font-family="monospace" font-size="${Math.max(8, number(frame.height) * 0.12).toFixed(2)}" fill="${escapeXml(node.fill || "#000000")}">${escapeXml(encoded.digits)}</text>`;
  return {
    svg: `<g data-node-id="${escapeXml(node.id)}" data-code-type="EAN13"><rect x="${number(frame.x)}" y="${number(frame.y)}" width="${number(frame.width)}" height="${number(frame.height)}" fill="${escapeXml(node.background || "#ffffff")}"/><g fill="${escapeXml(node.fill || "#000000")}">${paths.join("")}</g>${label}</g>`,
    evidence: {
      node_id: node.id,
      type: "BARCODE",
      symbology: "EAN13",
      value: encoded.digits,
      checksum_valid: true,
      module_count: encoded.bits.length,
      deterministic: true,
    },
  };
}

export const CreativeDesignCodeRuntime = Object.freeze({
  contract: CONTRACT,
  qr: createQrMatrix,
  renderQr: renderQrNodeToSvg,
  ean13: createEan13Bits,
  renderBarcode: renderBarcodeNodeToSvg,
});
