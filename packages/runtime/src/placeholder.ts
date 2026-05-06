import { mkdir, writeFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface PlaceholderOptions {
  code: string;
  outputDir: string;
  lang?: string;
  width?: number;
  height?: number;
  label?: string;
  overwrite?: boolean;
}

export interface PlaceholderResult {
  filePath: string;
  fileName: string;
  bytes: number;
  width: number;
  height: number;
  label: string;
  lines: string[];
  impexHint: string;
  overwritten: boolean;
}

const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
const LANG_PATTERN = /^[A-Za-z]{2}(?:_[A-Za-z]{2})?$/;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function splitLabel(label: string): string[] {
  if (label.length <= 22) {
    return [label];
  }
  const dashIdx = label.lastIndexOf(' - ');
  if (dashIdx > 0) {
    return [label.slice(0, dashIdx + 2), label.slice(dashIdx + 3)];
  }
  const mid = Math.floor(label.length / 2);
  const spaceIdx = label.lastIndexOf(' ', mid);
  if (spaceIdx > 0) {
    return [label.slice(0, spaceIdx), label.slice(spaceIdx + 1)];
  }
  return [label];
}

export function buildPlaceholderSvg(label: string, width: number, height: number): { svg: string; lines: string[] } {
  const lines = splitLabel(label);
  const baseFont = Math.min(width, height) / 12;
  // Shrink font so the longest line fits inside the frame with ~10% margin.
  // Approximation: glyph width ≈ 0.55 × font-size for the chosen sans-serif stack.
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const maxByWidth = (width * 0.9) / (longest * 0.55);
  const fontSize = Math.max(12, Math.min(baseFont, maxByWidth));

  const textBlock = lines.length === 1
    ? `<text x="50%" y="50%" dy="0.35em">${escapeXml(lines[0])}</text>`
    : `<text x="50%" y="50%" dy="-0.4em">${escapeXml(lines[0])}</text>
    <text x="50%" y="50%" dy="0.9em">${escapeXml(lines[1])}</text>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#e5e7eb"/>
  <rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="none" stroke="#9ca3af" stroke-width="2" stroke-dasharray="8 6"/>
  <g font-family="-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="${fontSize.toFixed(2)}" fill="#374151" text-anchor="middle">
    ${textBlock}
  </g>
</svg>
`;
  return { svg, lines };
}

export async function createPlaceholderMedia(opts: PlaceholderOptions): Promise<PlaceholderResult> {
  const { code, outputDir, lang, width = 800, height = 600, label, overwrite = false } = opts;

  if (!CODE_PATTERN.test(code)) {
    throw new Error(`code must match ${CODE_PATTERN} (got "${code}")`);
  }
  if (lang !== undefined && !LANG_PATTERN.test(lang)) {
    throw new Error(`lang must match ${LANG_PATTERN} (got "${lang}")`);
  }
  if (!isAbsolute(outputDir)) {
    throw new Error(`outputDir must be an absolute path (got "${outputDir}")`);
  }
  if (!Number.isInteger(width) || width < 16 || width > 8192) {
    throw new Error('width must be an integer between 16 and 8192');
  }
  if (!Number.isInteger(height) || height < 16 || height > 8192) {
    throw new Error('height must be an integer between 16 and 8192');
  }

  const finalLabel = label ?? `placeholder - ${code}`;
  const targetDir = lang ? resolve(outputDir, `_${lang}`) : resolve(outputDir);
  const fileName = `${code}.svg`;
  const filePath = join(targetDir, fileName);

  let exists = false;
  try {
    await access(filePath, fsConstants.F_OK);
    exists = true;
  } catch {
    exists = false;
  }
  if (exists && !overwrite) {
    throw new Error(`File already exists: ${filePath} (pass overwrite=true to replace it)`);
  }

  const { svg, lines } = buildPlaceholderSvg(finalLabel, width, height);

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, svg, 'utf8');

  const impexHint = lang
    ? `# Reference in localized impex (_${lang}):\n# &mediaRef ; code[unique=true] ; @media[translator=de.hybris.platform.impex.jalo.media.MediaDataTranslator] ; mime[default=image/svg+xml] ; realfilename ; folder(qualifier)[default=images]\n# myMediaRef ; ${code} ; images/_${lang}/${fileName} ; image/svg+xml ; ${fileName} ; images`
    : `# Reference in impex:\n# &mediaRef ; code[unique=true] ; @media[translator=de.hybris.platform.impex.jalo.media.MediaDataTranslator] ; mime[default=image/svg+xml] ; realfilename ; folder(qualifier)[default=images]\n# myMediaRef ; ${code} ; images/${fileName} ; image/svg+xml ; ${fileName} ; images`;

  return {
    filePath,
    fileName,
    bytes: Buffer.byteLength(svg, 'utf8'),
    width,
    height,
    label: finalLabel,
    lines,
    impexHint,
    overwritten: exists,
  };
}
