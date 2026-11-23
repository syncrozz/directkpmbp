/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — SYNCROZZ DEADLINE HUB SERVER-SIDE AI EXTRACTION SERVICE
 *
 * Strict Server-Side Rules:
 * - Never expose GEMINI_API_KEY to browser/client code.
 * - Uses official @google/genai SDK with model 'gemini-4-hydrogen'.
 * - Never fabricates or mocks AI results when API key is missing or fails.
 */

import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  DeadlineCategory,
  DeadlineConfidence,
  DeadlineDuplicateMatch,
  DeadlineRecord,
  DeadlineSourceType,
} from '../types.ts';
import {
  DEADLINE_CATEGORIES,
  VALID_DEADLINE_CATEGORY_SET,
  findBestDuplicateDeadlineMatch,
  getKualaLumpurNowParts,
  isValid24HourTime,
  isValidIsoDate,
} from '../utils/deadlineStatus.ts';

const GEMINI_MODEL = 'gemini-4-hydrogen';
const MAX_FILES_PER_REQUEST = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB total upload
const MAX_TEXT_LENGTH = 30000;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export interface ExtractDeadlineFileInput {
  fileName: string;
  mimeType: string;
  base64Data: string;
}

export interface ExtractDeadlineStaffHint {
  id: string;
  nama: string;
  bahagian?: string;
  unit?: string;
  jawatan?: string;
}

export interface ExtractDeadlineRequestPayload {
  sourceType: DeadlineSourceType;
  pastedText?: string;
  files?: ExtractDeadlineFileInput[];
  existingDeadlines?: DeadlineRecord[];
  staffHints?: ExtractDeadlineStaffHint[];
}

export interface ExtractedDeadlineCandidate {
  title: string;
  description: string;
  requiredAction: string;
  category: DeadlineCategory;
  targetAudience: string[];
  targetDepartments: string[];
  targetStaffIds: string[];
  dueDate: string;
  dueTime: string;
  timezone: 'Asia/Kuala_Lumpur';
  announcementDate: string;
  actionUrl: string;
  actionLabel: string;
  attachments: Array<{ name: string; url: string; type?: string }>;
  instructions: string;
  sourceExcerpt: string;
  confidence: DeadlineConfidence;
  missingFields: string[];
  ambiguousFields: string[];
  ambiguityReason: string;
  requiresReview: boolean;
  duplicateMatch: DeadlineDuplicateMatch | null;
}

export interface ExtractDeadlineResponseData {
  sourceSummary: string;
  extractedText: string;
  model: string;
  extractedAt: string;
  extractedDeadlines: ExtractedDeadlineCandidate[];
}

export class DeadlineAiError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

// Short-TTL in-flight + result deduplication cache (prevents duplicate API calls on accidental double submits)
const inflightRequests = new Map<string, Promise<ExtractDeadlineResponseData>>();
const recentResults = new Map<string, { expiresAt: number; data: ExtractDeadlineResponseData }>();

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new DeadlineAiError(
      'GEMINI_API_KEY_MISSING',
      'Kunci API Gemini pelayan (GEMINI_API_KEY) belum dikonfigurasikan pada persekitaran pelayan.',
      503
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function clampConfidence(val: unknown, fallback = 0.5): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return Number(num.toFixed(2));
}

function sanitizeStringArray(arr: unknown, maxItems = 30, maxLen = 120): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const clean = String(item ?? '').trim().slice(0, maxLen);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
      if (out.length >= maxItems) break;
    }
  }
  return out;
}

function normalizeHttpUrl(rawUrl: unknown): string {
  const clean = String(rawUrl ?? '').trim();
  if (!clean) return '';
  if (!/^https?:\/\/[^\s]+$/i.test(clean)) return '';
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString().slice(0, 2000);
  } catch {
    return '';
  }
}

function normalizeDueDate(rawDate: unknown): string {
  const clean = String(rawDate ?? '').trim();
  if (!clean) return '';
  if (isValidIsoDate(clean)) return clean;
  return '';
}

function normalizeDueTime(rawTime: unknown): string {
  const clean = String(rawTime ?? '').trim();
  if (!clean) return '';
  if (isValid24HourTime(clean)) return clean;
  const hhmmss = clean.match(/^([01]\d|2[0-3]):([0-5]\d):[0-5]\d$/);
  if (hhmmss) return `${hhmmss[1]}:${hhmmss[2]}`;
  return '';
}

function normalizeCategory(rawCat: unknown): DeadlineCategory {
  const clean = String(rawCat ?? '').trim();
  if (VALID_DEADLINE_CATEGORY_SET.has(clean)) {
    return clean as DeadlineCategory;
  }
  const lower = clean.toLowerCase();
  if (lower.includes('akademik') || lower.includes('kuliah')) return 'Akademik';
  if (lower === 'hea' || lower.includes('hal ehwal akademik')) return 'HEA';
  if (lower === 'hep' || lower.includes('hal ehwal pelajar')) return 'HEP';
  if (lower.includes('urus') || lower.includes('pengarah')) return 'Pengurusan';
  if (lower.includes('tadbir') || lower.includes('kewangan')) return 'Pentadbiran';
  if (lower.includes('nilai') || lower.includes('exam') || lower.includes('markah')) return 'Penilaian';
  if (lower.includes('calon') || lower.includes('anugerah')) return 'Pencalonan';
  if (lower.includes('dokumen') || lower.includes('laporan') || lower.includes('fail')) return 'Dokumentasi';
  return 'Other';
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    sourceSummary: {
      type: Type.STRING,
      description: 'Ringkasan padat 1-2 ayat mengenai sumber pengumuman/dokumen.',
    },
    extractedText: {
      type: Type.STRING,
      description: 'Teks penuh yang diekstrak/transkripsi secara tepat daripada semua imej, PDF, dan/atau teks sumber.',
    },
    extractedDeadlines: {
      type: Type.ARRAY,
      description: 'Senarai semua tarikh akhir berbeza yang dikesan dalam sumber.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          requiredAction: { type: Type.STRING },
          category: {
            type: Type.STRING,
            enum: DEADLINE_CATEGORIES,
          },
          targetAudience: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          targetDepartments: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          targetStaffIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          dueDate: {
            type: Type.STRING,
            description: 'Tarikh akhir sebenar format YYYY-MM-DD (Asia/Kuala_Lumpur), atau string kosong "" jika tiada atau tidak jelas.',
          },
          dueTime: {
            type: Type.STRING,
            description: 'Masa akhir format 24-jam HH:mm (cth: 17:00 atau 12:00), atau string kosong "" jika tidak dinyatakan.',
          },
          announcementDate: {
            type: Type.STRING,
            description: 'Tarikh surat/hebahan/program jika berbeza daripada dueDate (YYYY-MM-DD atau ""), jangan kelirukan dengan dueDate.',
          },
          actionUrl: {
            type: Type.STRING,
            description: 'URL rasmi penghantaran/tindakan yang benar-benar wujud dalam sumber, atau "" jika tiada.',
          },
          actionLabel: {
            type: Type.STRING,
            description: 'Label pendek butang tindakan (cth: "Hantar Borang", "Buka Portal"), atau "" jika tiada actionUrl.',
          },
          instructions: {
            type: Type.STRING,
            description: 'Arahan terperinci langkah tindakan yang perlu dilakukan oleh staf/pensyarah.',
          },
          sourceExcerpt: {
            type: Type.STRING,
            description: 'Petikan ayat asal daripada sumber yang menyokong rekod tarikh akhir ini.',
          },
          confidence: {
            type: Type.OBJECT,
            properties: {
              overall: { type: Type.NUMBER },
              date: { type: Type.NUMBER },
              time: { type: Type.NUMBER },
              action: { type: Type.NUMBER },
              audience: { type: Type.NUMBER },
              url: { type: Type.NUMBER },
            },
            required: ['overall', 'date', 'time', 'action', 'audience', 'url'],
          },
          missingFields: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          ambiguousFields: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          ambiguityReason: {
            type: Type.STRING,
          },
          duplicateAnalysis: {
            type: Type.OBJECT,
            properties: {
              matchedExistingId: { type: Type.STRING },
              similarityLevel: { type: Type.STRING, enum: ['none', 'possible', 'high'] },
              recommendation: { type: Type.STRING, enum: ['create_new', 'update_existing', 'ignore'] },
              rationale: { type: Type.STRING },
            },
            required: ['matchedExistingId', 'similarityLevel', 'recommendation', 'rationale'],
          },
        },
        required: [
          'title',
          'description',
          'requiredAction',
          'category',
          'targetAudience',
          'targetDepartments',
          'targetStaffIds',
          'dueDate',
          'dueTime',
          'announcementDate',
          'actionUrl',
          'actionLabel',
          'instructions',
          'sourceExcerpt',
          'confidence',
          'missingFields',
          'ambiguousFields',
          'ambiguityReason',
          'duplicateAnalysis',
        ],
      },
    },
  },
  required: ['sourceSummary', 'extractedText', 'extractedDeadlines'],
};

export function validateExtractPayload(payload: ExtractDeadlineRequestPayload): {
  sourceType: DeadlineSourceType;
  pastedText: string;
  files: Array<{ fileName: string; mimeType: string; cleanBase64: string; byteLength: number }>;
  existingDeadlines: DeadlineRecord[];
  staffHints: ExtractDeadlineStaffHint[];
} {
  const sourceType = payload?.sourceType;
  if (!sourceType || !['SCREENSHOT', 'PDF', 'PASTED_TEXT'].includes(sourceType)) {
    throw new DeadlineAiError('INVALID_SOURCE_TYPE', 'Jenis sumber tidak sah. Gunakan SCREENSHOT, PDF, atau PASTED_TEXT.', 400);
  }

  const pastedText = String(payload.pastedText || '').trim().slice(0, MAX_TEXT_LENGTH);
  const rawFiles = Array.isArray(payload.files) ? payload.files : [];

  if (rawFiles.length > MAX_FILES_PER_REQUEST) {
    throw new DeadlineAiError(
      'TOO_MANY_FILES',
      `Maksimum ${MAX_FILES_PER_REQUEST} fail dibenarkan bagi setiap analisis.`,
      400
    );
  }

  let totalBytes = 0;
  const normalizedFiles: Array<{ fileName: string; mimeType: string; cleanBase64: string; byteLength: number }> = [];

  for (const file of rawFiles) {
    const fileName = String(file?.fileName || 'upload').trim().slice(0, 160);
    let mimeType = String(file?.mimeType || '').trim().toLowerCase();
    if (mimeType === 'image/jpg') {
      mimeType = 'image/jpeg';
    }
    if (!mimeType || mimeType === 'application/octet-stream') {
      const lowerName = fileName.toLowerCase();
      if (lowerName.endsWith('.pdf')) mimeType = 'application/pdf';
      else if (lowerName.endsWith('.png')) mimeType = 'image/png';
      else if (lowerName.endsWith('.webp')) mimeType = 'image/webp';
      else if (/\.jpe?g$/i.test(lowerName)) mimeType = 'image/jpeg';
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new DeadlineAiError(
        'UNSUPPORTED_FILE_TYPE',
        `Format fail "${fileName}" (${mimeType || 'tidak diketahui'}) tidak disokong. Hanya JPG, PNG, WEBP atau PDF dibenarkan.`,
        400
      );
    }

    const rawB64 = String(file?.base64Data || '').replace(/^data:[^;]+;base64,/i, '').trim();
    if (!rawB64) {
      throw new DeadlineAiError('EMPTY_FILE', `Fail "${fileName}" adalah kosong.`, 400);
    }

    const byteLength = Buffer.byteLength(rawB64, 'base64');
    if (byteLength <= 0 || byteLength > MAX_FILE_BYTES) {
      throw new DeadlineAiError(
        'FILE_TOO_LARGE',
        `Saiz fail "${fileName}" melebihi had maksimum 10MB.`,
        400
      );
    }

    totalBytes += byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new DeadlineAiError(
        'PAYLOAD_TOO_LARGE',
        'Jumlah saiz semua fail melebihi had maksimum 20MB.',
        400
      );
    }

    normalizedFiles.push({
      fileName,
      mimeType,
      cleanBase64: rawB64,
      byteLength,
    });
  }

  if (!pastedText && normalizedFiles.length === 0) {
    throw new DeadlineAiError(
      'EMPTY_INPUT',
      'Sila muat naik sekurang-kurangnya satu imej/PDF atau tampal teks pengumuman.',
      400
    );
  }

  const existingDeadlines = Array.isArray(payload.existingDeadlines)
    ? payload.existingDeadlines.slice(0, 80)
    : [];
  const staffHints = Array.isArray(payload.staffHints)
    ? payload.staffHints.slice(0, 150)
    : [];

  return {
    sourceType,
    pastedText,
    files: normalizedFiles,
    existingDeadlines,
    staffHints,
  };
}

export async function extractDeadlinesWithGemini(
  payload: ExtractDeadlineRequestPayload
): Promise<ExtractDeadlineResponseData> {
  const validated = validateExtractPayload(payload);

  // Build deterministic cache key over source content + existing deadlines snapshot
  const hash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        sourceType: validated.sourceType,
        pastedText: validated.pastedText,
        files: validated.files.map((f) => ({
          name: f.fileName,
          mime: f.mimeType,
          digest: crypto.createHash('sha1').update(f.cleanBase64).digest('hex'),
        })),
        existingIds: validated.existingDeadlines.map((d) => `${d.id}:${d.dueDate}:${d.dueTime}:${d.updatedAt}`),
      })
    )
    .digest('hex');

  const cached = recentResults.get(hash);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const existingPromise = inflightRequests.get(hash);
  if (existingPromise) {
    return existingPromise;
  }

  const job = (async (): Promise<ExtractDeadlineResponseData> => {
    const ai = getGeminiClient();
    const klNow = getKualaLumpurNowParts();

    const deptSet = new Set<string>();
    const compactStaff = validated.staffHints.map((s) => {
      if (s.bahagian) deptSet.add(s.bahagian);
      if (s.unit) deptSet.add(s.unit);
      return `${s.id} | ${s.nama} | ${s.bahagian || '-'} | ${s.unit || '-'}`;
    });

    const compactExisting = validated.existingDeadlines
      .filter((d) => d.status !== 'ARCHIVED')
      .map((d) => ({
        id: d.id,
        title: d.title,
        requiredAction: d.requiredAction,
        dueDate: d.dueDate,
        dueTime: d.dueTime,
        actionUrl: d.actionUrl,
        targetAudience: d.targetAudience,
      }));

    const promptText = `Anda ialah enjin pengekstrakan tarikh akhir rasmi untuk sistem institusi Kolej Profesional MARA Bandar Penawar (DIRECT KPMBP — DEADLINE).

KONTEKS MASA SEMASA:
- Zon masa rasmi: Asia/Kuala_Lumpur (UTC+8)
- Tarikh hari ini: ${klNow.dateStr}
- Masa semasa: ${klNow.timeStr}

ARAHAN PENGEKSTRAKAN KETAT:
1. Analisis SEMUA fail imej, PDF, dan/atau teks pengumuman yang diberikan.
2. Transkripsi / ekstrak teks penuh daripada imej, PDF atau sumber dengan tepat ke dalam medan "extractedText".
3. Jika terdapat BERBILANG tarikh akhir / tindakan yang berbeza dalam satu dokumen atau mesej (contohnya tarikh pencalonan berbeza dengan tarikh penghantaran laporan), pisahkan setiap satunya sebagai item berasingan dalam "extractedDeadlines". Jika pengumuman atau tugasan tidak menyatakan tarikh khusus lagi, masih ekstrak sebagai item dalam "extractedDeadlines" dengan dueDate = "" dan masukkan "dueDate" dalam "missingFields".
4. JANGAN REKA ATAU TEKA maklumat yang tiada:
   - Jika tarikh akhir tiada dalam sumber, letakkan dueDate = "" dan masukkan "dueDate" dalam "missingFields".
   - Jika masa akhir tidak dinyatakan, letakkan dueTime = "" (jangan letak 23:59 atau 17:00 secara andaian).
   - Jika tiada pautan/URL dalam sumber, letakkan actionUrl = "". Jangan reka URL.
   - Bezakan tarikh surat/hebahan/mesyuarat/program ("announcementDate") daripada tarikh akhir penghantaran/tindakan sebenar ("dueDate"). Jika tarikh yang wujud kelihatan meragukan sama ada tarikh program atau tarikh akhir, masukkan "dueDate" ke dalam "ambiguousFields" dan terangkan sebabnya dalam "ambiguityReason".
4. Format Tarikh & Masa:
   - dueDate: YYYY-MM-DD (cth: "2026-11-23").
   - dueTime: Format 24-jam HH:mm (cth: "12:00 PM" -> "12:00", "5:00 petang" -> "17:00", "11:59 malam" -> "23:59").
5. Pemetaan Sasaran KPMBP:
   - Bahagian/Unit sedia ada: ${Array.from(deptSet).join(', ') || 'Pengurusan, Akademik, Pentadbiran, Sokongan Akademik'}
   - Masukkan nama Bahagian/Unit yang terlibat ke dalam "targetDepartments" jika dapat dikenal pasti.
   - Masukkan ID Staf (cth: ST001) ke dalam "targetStaffIds" HANYA jika nama/ID staf tersebut disebut secara jelas dalam pengumuman.
   - Rujukan ringkas staf:
${compactStaff.slice(0, 90).join('\n') || '(Tiada senarai staf dibekalkan)'}
6. Pengesanan Duplikat & Kemas Kini Pintar:
   - Bandingkan setiap tarikh akhir yang diekstrak dengan rekod sedia ada di bawah.
   - Jika rekod baharu kelihatan seperti lanjutan masa, pindaan tarikh, atau hebahan susulan bagi rekod sedia ada (cth: program/pertandingan/tindakan/URL yang sama), tetapkan duplicateAnalysis.matchedExistingId kepada ID rekod tersebut, similarityLevel kepada "high" atau "possible", dan recommendation kepada "update_existing" (atau "ignore" jika tarikh, masa dan kandungannya hampir sama tepat).
   - Senarai rekod sedia ada:
${JSON.stringify(compactExisting)}
${validated.pastedText ? `\nTEKS SUMBER YANG DITAMPAL:\n"""\n${validated.pastedText}\n"""` : ''}`;

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    for (const file of validated.files) {
      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.cleanBase64,
        },
      });
    }
    parts.push({ text: promptText });

    let response;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      });
    } catch (apiErr: any) {
      const msg = String(apiErr?.message || apiErr || '');
      const status = Number(apiErr?.status || apiErr?.code || 502);
      if (msg.includes('API key') || msg.includes('PERMISSION_DENIED') || status === 401 || status === 403) {
        throw new DeadlineAiError(
          'GEMINI_AUTH_ERROR',
          'Akses ke perkhidmatan AI Gemini gagal (kunci API tidak sah atau tiada kebenaran).',
          503
        );
      }
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429') || status === 429) {
        throw new DeadlineAiError(
          'GEMINI_RATE_LIMIT',
          'Had permintaan AI Gemini telah dicapai buat sementara waktu. Sila cuba sebentar lagi.',
          429
        );
      }
      throw new DeadlineAiError(
        'GEMINI_REQUEST_FAILED',
        `Ralat pelayan AI Gemini semasa menganalisis sumber: ${msg.slice(0, 220)}`,
        502
      );
    }

    const rawText = (response?.text || '').trim();
    if (!rawText) {
      throw new DeadlineAiError(
        'GEMINI_EMPTY_RESPONSE',
        'Model AI tidak memulangkan sebarang kandungan berstruktur.',
        502
      );
    }

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new DeadlineAiError(
          'GEMINI_INVALID_JSON',
          'Output daripada AI tidak berada dalam format JSON yang sah.',
          502
        );
      }
      try {
        parsedJson = JSON.parse(jsonMatch[0]);
      } catch {
        throw new DeadlineAiError(
          'GEMINI_INVALID_JSON',
          'Output JSON daripada AI tidak dapat dihuraikan.',
          502
        );
      }
    }

    const rawItems = Array.isArray(parsedJson?.extractedDeadlines) ? parsedJson.extractedDeadlines : [];
    const existingById = new Map(validated.existingDeadlines.map((d) => [d.id, d]));

    const extractedDeadlines: ExtractedDeadlineCandidate[] = rawItems.map((raw: any) => {
      const title = String(raw?.title || '').trim().slice(0, 200) || 'Tarikh Akhir Tanpa Tajuk';
      const description = String(raw?.description || '').trim().slice(0, 2000);
      const requiredAction = String(raw?.requiredAction || '').trim().slice(0, 500);
      const category = normalizeCategory(raw?.category);
      const targetAudience = sanitizeStringArray(raw?.targetAudience, 30, 120);
      const targetDepartments = sanitizeStringArray(raw?.targetDepartments, 30, 120);
      const targetStaffIds = sanitizeStringArray(raw?.targetStaffIds, 100, 64);

      const dueDate = normalizeDueDate(raw?.dueDate);
      const dueTime = normalizeDueTime(raw?.dueTime);
      const announcementDate = normalizeDueDate(raw?.announcementDate);

      let actionUrl = normalizeHttpUrl(raw?.actionUrl);
      // Guard against fabricated URLs when input is pure text
      if (
        actionUrl &&
        validated.sourceType === 'PASTED_TEXT' &&
        validated.pastedText &&
        !validated.pastedText.toLowerCase().includes(actionUrl.toLowerCase().replace(/\/+$/, ''))
      ) {
        try {
          const host = new URL(actionUrl).hostname.toLowerCase();
          if (!validated.pastedText.toLowerCase().includes(host)) {
            actionUrl = '';
          }
        } catch {
          actionUrl = '';
        }
      }

      const actionLabel = actionUrl
        ? String(raw?.actionLabel || 'Buka Pautan Tindakan').trim().slice(0, 120)
        : '';
      const instructions = String(raw?.instructions || '').trim().slice(0, 4000);
      const sourceExcerpt = String(raw?.sourceExcerpt || '').trim().slice(0, 2000);

      const confidence: DeadlineConfidence = {
        overall: clampConfidence(raw?.confidence?.overall, dueDate ? 0.8 : 0.45),
        date: clampConfidence(raw?.confidence?.date, dueDate ? 0.85 : 0),
        time: clampConfidence(raw?.confidence?.time, dueTime ? 0.85 : 1),
        action: clampConfidence(raw?.confidence?.action, requiredAction ? 0.8 : 0.4),
        audience: clampConfidence(raw?.confidence?.audience, targetAudience.length > 0 ? 0.8 : 0.5),
        url: clampConfidence(raw?.confidence?.url, actionUrl ? 0.9 : 1),
      };

      const missingFieldsSet = new Set<string>(sanitizeStringArray(raw?.missingFields, 20, 64));
      if (!dueDate) missingFieldsSet.add('dueDate');
      if (!requiredAction) missingFieldsSet.add('requiredAction');

      const ambiguousFields = sanitizeStringArray(raw?.ambiguousFields, 20, 64);
      const ambiguityReason = String(raw?.ambiguityReason || '').trim().slice(0, 1000);

      // Reconcile AI duplicateAnalysis with deterministic similarity matcher
      let duplicateMatch: DeadlineDuplicateMatch | null = null;
      const aiMatchId = String(raw?.duplicateAnalysis?.matchedExistingId || '').trim();
      const aiSimilarity = raw?.duplicateAnalysis?.similarityLevel;
      const aiExisting = aiMatchId ? existingById.get(aiMatchId) : undefined;

      const deterministicMatch = findBestDuplicateDeadlineMatch(
        {
          title,
          description,
          requiredAction,
          actionUrl,
          dueDate,
          dueTime,
          targetAudience,
        },
        validated.existingDeadlines
      );

      if (aiExisting && (aiSimilarity === 'high' || aiSimilarity === 'possible')) {
        const rec = raw?.duplicateAnalysis?.recommendation;
        const recommendation: 'create_new' | 'update_existing' | 'ignore' =
          rec === 'ignore' || rec === 'update_existing' || rec === 'create_new'
            ? rec
            : 'update_existing';

        duplicateMatch = {
          matchedExistingId: aiExisting.id,
          matchedTitle: aiExisting.title,
          matchedDueDate: aiExisting.dueDate,
          matchedDueTime: aiExisting.dueTime || '',
          matchedRequiredAction: aiExisting.requiredAction || '',
          matchedActionUrl: aiExisting.actionUrl || '',
          matchedTargetAudience: aiExisting.targetAudience || [],
          similarityLevel: aiSimilarity,
          score: deterministicMatch?.matchedExistingId === aiExisting.id
            ? Math.max(deterministicMatch.score, aiSimilarity === 'high' ? 0.85 : 0.55)
            : aiSimilarity === 'high'
            ? 0.85
            : 0.55,
          reasons: deterministicMatch?.matchedExistingId === aiExisting.id
            ? deterministicMatch.reasons
            : ['Padanan semantik AI dengan rekod sedia ada'],
          recommendation,
          rationale:
            String(raw?.duplicateAnalysis?.rationale || '').trim().slice(0, 500) ||
            deterministicMatch?.rationale ||
            `Berpotensi sebagai kemas kini kepada "${aiExisting.title}".`,
        };
      } else if (deterministicMatch) {
        duplicateMatch = deterministicMatch;
      }

      const missingFields = Array.from(missingFieldsSet);
      const requiresReview =
        !dueDate ||
        missingFields.length > 0 ||
        ambiguousFields.length > 0 ||
        confidence.overall < 0.75 ||
        Boolean(duplicateMatch && duplicateMatch.similarityLevel !== 'none');

      return {
        title,
        description,
        requiredAction,
        category,
        targetAudience,
        targetDepartments,
        targetStaffIds,
        dueDate,
        dueTime,
        timezone: 'Asia/Kuala_Lumpur',
        announcementDate,
        actionUrl,
        actionLabel,
        attachments: [],
        instructions,
        sourceExcerpt,
        confidence,
        missingFields,
        ambiguousFields,
        ambiguityReason,
        requiresReview,
        duplicateMatch,
      };
    });

    const extractedText = (
      validated.sourceType === 'PASTED_TEXT' && validated.files.length === 0 && validated.pastedText
        ? validated.pastedText
        : String(parsedJson?.extractedText || validated.pastedText || '')
    )
      .trim()
      .slice(0, 30000);

    // Ensure announcements without a specific due date still produce a reviewable draft (without inventing dates/times)
    if (extractedDeadlines.length === 0 && extractedText.length >= 10) {
      const firstLine = extractedText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) || '';
      const fallbackTitle = (
        String(parsedJson?.sourceSummary || '').trim() ||
        firstLine ||
        'Makluman Tanpa Tarikh Akhir Khusus'
      ).slice(0, 200);
      const fallbackMatch = findBestDuplicateDeadlineMatch(
        {
          title: fallbackTitle,
          description: extractedText.slice(0, 500),
          requiredAction: '',
          actionUrl: '',
          dueDate: '',
          dueTime: '',
          targetAudience: [],
        },
        validated.existingDeadlines
      );
      extractedDeadlines.push({
        title: fallbackTitle,
        description: extractedText.slice(0, 2000),
        requiredAction: '',
        category: 'Other',
        targetAudience: [],
        targetDepartments: [],
        targetStaffIds: [],
        dueDate: '',
        dueTime: '',
        timezone: 'Asia/Kuala_Lumpur',
        announcementDate: '',
        actionUrl: '',
        actionLabel: '',
        attachments: [],
        instructions: '',
        sourceExcerpt: extractedText.slice(0, 2000),
        confidence: {
          overall: 0.4,
          date: 0,
          time: 1,
          action: 0.3,
          audience: 0.4,
          url: 1,
        },
        missingFields: ['dueDate', 'requiredAction'],
        ambiguousFields: [],
        ambiguityReason:
          'Tiada tarikh akhir khusus dikesan dalam pengumuman sumber. Sila semak dan lengkapkan tarikh akhir secara manual sebelum diterbitkan.',
        requiresReview: true,
        duplicateMatch: fallbackMatch,
      });
    }

    const result: ExtractDeadlineResponseData = {
      sourceSummary: String(parsedJson?.sourceSummary || '').trim().slice(0, 500) ||
        `${extractedDeadlines.length} tarikh akhir dikesan daripada sumber.`,
      extractedText,
      model: GEMINI_MODEL,
      extractedAt: new Date().toISOString(),
      extractedDeadlines,
    };

    recentResults.set(hash, {
      expiresAt: Date.now() + 30000,
      data: result,
    });
    if (recentResults.size > 50) {
      const oldestKey = recentResults.keys().next().value;
      if (oldestKey) recentResults.delete(oldestKey);
    }

    return result;
  })();

  inflightRequests.set(hash, job);
  try {
    return await job;
  } finally {
    inflightRequests.delete(hash);
  }
}
