import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export type FileType = 'image' | 'pdf' | 'audio' | 'file';
export type UploadContext = 'personal_document' | 'room_chat';

export interface UploadedFile {
  id: string;
  owner_user_id: string;
  room_id: string | null;
  chat_message_id: string | null;
  storage_bucket: string;
  storage_path: string;
  original_file_name: string;
  file_type: FileType;
  mime_type: string;
  file_size: number;
  upload_context: UploadContext;
  created_at: string;
  deleted_at: string | null;
}

interface FileRow {
  id: string;
  owner_user_id: string;
  room_id: string | null;
  chat_message_id: string | null;
  storage_bucket: string;
  storage_path: string;
  original_file_name: string;
  file_type: FileType;
  mime_type: string;
  file_size: number;
  upload_context: UploadContext;
  created_at: string;
  deleted_at: string | null;
}

// ─── Limits ───────────────────────────────────────────────────────────────────
const MAX_SIZE: Record<FileType, number> = {
  image: 5 * 1024 * 1024,
  pdf: 10 * 1024 * 1024,
  audio: 5 * 1024 * 1024,
  file: 10 * 1024 * 1024,
};

const MAX_PERSONAL_FILES = 50;
const MAX_ROOM_FILES = 100;
const SIGNED_URL_EXPIRY = 300; // 5 minutes (seconds)

export const ALLOWED_MIME: Record<FileType, string[]> = {
  image: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
  pdf: ['application/pdf'],
  audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/mp4', 'audio/x-m4a'],
  file: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
};

const MIME_TO_TYPE: Record<string, FileType> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/webp': 'image',
  'application/pdf': 'pdf',
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
  'audio/aac': 'audio',
  'audio/mp4': 'audio',
  'audio/x-m4a': 'audio',
  // Codec-specific variants (common from MediaRecorder)
  'audio/webm;codecs=opus': 'audio',
  'audio/webm;codecs=vp9,opus': 'audio',
  'audio/ogg;codecs=opus': 'audio',
  'audio/mp4;codecs=mp4a.40.2': 'audio',
};

// ─── Validation ───────────────────────────────────────────────────────────────
export function detectFileType(file: File): FileType {
  const mime = file.type.toLowerCase();
  // Check exact match first
  if (MIME_TO_TYPE[mime]) return MIME_TO_TYPE[mime];
  // Check for codec-specific MIME types (e.g., "audio/webm;codecs=opus")
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  // Fallback to extension-based detection
  const ext = file.name.toLowerCase().split('.').pop() || '';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm'].includes(ext)) return 'audio';
  if (['docx'].includes(ext)) return 'file';
  if (['pptx'].includes(ext)) return 'file';
  return 'file';
}

export function isAllowedType(file: File): boolean {
  const type = detectFileType(file);
  return ALLOWED_MIME[type].includes(file.type.toLowerCase()) || type !== 'file' || file.type === '';
}

export function validateFile(file: File): { ok: boolean; type?: FileType; error?: string } {
  const type = detectFileType(file);
  const mime = file.type.toLowerCase();
  // For images/pdf/audio we check MIME strictly; for generic files we allow docx/pptx
  if (type === 'image' && !ALLOWED_MIME.image.includes(mime)) {
    return { ok: false, error: 'This file type is not supported.' };
  }
  if (type === 'pdf' && mime !== 'application/pdf') {
    return { ok: false, error: 'This file type is not supported.' };
  }
  // For audio, allow codec-specific MIME types like "audio/webm;codecs=opus"
  if (type === 'audio') {
    const isAllowed = ALLOWED_MIME.audio.includes(mime) ||
      mime.startsWith('audio/webm') ||
      mime.startsWith('audio/ogg') ||
      mime.startsWith('audio/mp4') ||
      mime.startsWith('audio/mpeg') ||
      mime.startsWith('audio/wav');
    if (!isAllowed) {
      return { ok: false, error: 'This file type is not supported.' };
    }
  }
  if (type === 'file') {
    const allowed = [...ALLOWED_MIME.file, 'application/msword', 'application/vnd.ms-powerpoint'];
    if (!allowed.includes(mime)) {
      return { ok: false, error: 'This file type is not supported.' };
    }
  }
  if (file.size > MAX_SIZE[type]) {
    return { ok: false, error: 'File is too large. Please upload a smaller file.' };
  }
  return { ok: true, type };
}

// ─── Sanitize filename ────────────────────────────────────────────────────────
export function sanitizeFileName(name: string): string {
  // Keep only safe chars: letters, numbers, dash, underscore, dot
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Collapse multiple underscores
  return cleaned.replace(/_+/g, '_').slice(0, 100);
}

function buildStoragePath(
  context: UploadContext,
  userId: string,
  roomId: string | null,
  messageId: string | null,
  fileId: string,
  fileName: string,
): string {
  const safeName = sanitizeFileName(fileName);
  if (context === 'personal_document') {
    return `${userId}/${fileId}-${safeName}`;
  }
  // room_chat: {room_id}/{message_id}/{file_id}-{filename}
  return `${roomId}/${messageId}/${fileId}-${safeName}`;
}

// ─── Upload (personal document) ───────────────────────────────────────────────
export async function uploadPersonalDocument(
  file: File,
  userId: string,
): Promise<{ ok: boolean; file?: UploadedFile; error?: string }> {
  const validation = validateFile(file);
  if (!validation.ok || !validation.type) {
    return { ok: false, error: validation.error };
  }

  // Check file count limit
  const { data: count, error: countErr } = await supabase.rpc('count_user_files');
  if (countErr) return { ok: false, error: 'Could not check file limit. Try again.' };
  if ((count as number) >= MAX_PERSONAL_FILES) {
    return { ok: false, error: `You can upload up to ${MAX_PERSONAL_FILES} personal documents. Delete some to add more.` };
  }

  const fileId = crypto.randomUUID();
  const bucket = 'user-documents';
  const storagePath = buildStoragePath('personal_document', userId, null, null, fileId, file.name);

  // Upload to storage first
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file, { contentType: file.type });

  if (upErr) {
    // Upload failed — nothing to clean up
    return { ok: false, error: 'Upload failed. Please try again.' };
  }

  // Insert metadata. If this fails, we must clean up the orphaned storage file.
  const { data, error: dbErr } = await supabase
    .from('uploaded_files')
    .insert({
      id: fileId,
      owner_user_id: userId,
      room_id: null,
      chat_message_id: null,
      storage_bucket: bucket,
      storage_path: storagePath,
      original_file_name: file.name.slice(0, 200),
      file_type: validation.type,
      mime_type: file.type,
      file_size: file.size,
      upload_context: 'personal_document',
    })
    .select()
    .maybeSingle();

  if (dbErr || !data) {
    // DB insert failed — clean up the orphaned storage file
    await supabase.storage.from(bucket).remove([storagePath]);
    return { ok: false, error: 'Could not save file metadata. Please try again.' };
  }

  return { ok: true, file: data as unknown as UploadedFile };
}

// ─── Upload (room chat attachment) ────────────────────────────────────────────
export async function uploadRoomChatFile(
  file: File,
  userId: string,
  roomId: string,
  messageId: string,
): Promise<{ ok: boolean; file?: UploadedFile; error?: string }> {
  const validation = validateFile(file);
  if (!validation.ok || !validation.type) {
    return { ok: false, error: validation.error };
  }

  // Check room file count limit
  const { data: count, error: countErr } = await supabase.rpc('count_room_files', { p_room_id: roomId });
  if (countErr) return { ok: false, error: 'Could not check file limit. Try again.' };
  if ((count as number) >= MAX_ROOM_FILES) {
    return { ok: false, error: `This room has reached the ${MAX_ROOM_FILES} file limit.` };
  }

  const fileId = crypto.randomUUID();
  const bucket = 'room-chat-files';
  const storagePath = buildStoragePath('room_chat', userId, roomId, messageId, fileId, file.name);

  // Strip codec parameters from the content type for storage upload
  // (e.g. "audio/webm;codecs=opus" -> "audio/webm") — Supabase Storage
  // rejects content types with parameters in some configurations.
  const baseMime = file.type.split(';')[0].trim() || 'application/octet-stream';

  // Upload to storage first
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file, { contentType: baseMime });

  if (upErr) {
    console.error('[files] storage upload failed:', upErr);
    return { ok: false, error: `Upload failed: ${upErr.message}` };
  }

  // Insert metadata
  const { data, error: dbErr } = await supabase
    .from('uploaded_files')
    .insert({
      id: fileId,
      owner_user_id: userId,
      room_id: roomId,
      chat_message_id: messageId,
      storage_bucket: bucket,
      storage_path: storagePath,
      original_file_name: file.name.slice(0, 200),
      file_type: validation.type,
      mime_type: baseMime,
      file_size: file.size,
      upload_context: 'room_chat',
    })
    .select()
    .maybeSingle();

  if (dbErr || !data) {
    // DB failed — clean up orphaned storage file
    console.error('[files] metadata insert failed:', dbErr);
    await supabase.storage.from(bucket).remove([storagePath]);
    return { ok: false, error: `Could not save file metadata: ${dbErr?.message || 'Unknown error'}` };
  }

  return { ok: true, file: data as unknown as UploadedFile };
}

// ─── List personal documents ──────────────────────────────────────────────────
export async function fetchPersonalDocuments(): Promise<UploadedFile[]> {
  const { data, error } = await supabase
    .from('uploaded_files')
    .select('*')
    .eq('upload_context', 'personal_document')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[files] fetch failed:', error);
    return [];
  }

  return (data || []) as unknown as UploadedFile[];
}

// ─── Fetch a single file metadata by id ───────────────────────────────────────
export async function fetchFileById(fileId: string): Promise<UploadedFile | null> {
  const { data, error } = await supabase
    .from('uploaded_files')
    .select('*')
    .eq('id', fileId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as UploadedFile;
}

// ─── Signed URL (private access, short-lived) ─────────────────────────────────
export async function getSignedUrl(
  bucket: string,
  path: string,
  download: boolean = false,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_EXPIRY, { download });

  if (error || !data?.signedUrl) {
    console.error('[files] signed URL failed:', error);
    return null;
  }

  return data.signedUrl;
}

// ─── Delete file (storage + metadata) ─────────────────────────────────────────
export async function deleteFile(
  fileId: string,
): Promise<{ ok: boolean; error?: string }> {
  // Fetch the file metadata first (we need the storage path)
  const file = await fetchFileById(fileId);
  if (!file) {
    return { ok: false, error: 'File not found.' };
  }

  // Delete from storage
  const { error: storageErr } = await supabase.storage
    .from(file.storage_bucket)
    .remove([file.storage_path]);

  if (storageErr) {
    console.error('[files] storage delete failed:', storageErr);
    // Continue to delete metadata even if storage delete fails — avoids orphans in DB
  }

  // Soft-delete metadata
  const { error: dbErr } = await supabase
    .from('uploaded_files')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', fileId);

  if (dbErr) {
    return { ok: false, error: 'Could not delete file metadata.' };
  }

  return { ok: true };
}

// ─── Delete room files (when a room is deleted) ───────────────────────────────
export async function deleteRoomFiles(roomId: string): Promise<void> {
  // Fetch all files for this room
  const { data, error } = await supabase
    .from('uploaded_files')
    .select('storage_bucket, storage_path')
    .eq('room_id', roomId)
    .is('deleted_at', null);

  if (error || !data) return;

  const rows = data as unknown as { storage_bucket: string; storage_path: string }[];

  // Group by bucket for batch removal
  const byBucket = new Map<string, string[]>();
  for (const r of rows) {
    const arr = byBucket.get(r.storage_bucket) || [];
    arr.push(r.storage_path);
    byBucket.set(r.storage_bucket, arr);
  }

  for (const [bucket, paths] of byBucket) {
    await supabase.storage.from(bucket).remove(paths);
  }
}

// ─── Download helper (triggers browser download, no duplication) ──────────────
/**
 * Triggers a browser download of a file via a temporary signed URL.
 * Fetches the file as a blob first (required for cross-origin URLs where
 * the `download` attribute is ignored), then creates an object URL for download.
 * Does NOT create a duplicate file in Storage or the database.
 */
export async function downloadFile(
  bucket: string,
  path: string,
  fileName: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = await getSignedUrl(bucket, path, false);
  if (!url) {
    return { ok: false, error: 'Could not generate download link. Please try again.' };
  }

  try {
    // Fetch the file as blob (required for cross-origin downloads)
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, error: 'Could not download file. Please try again.' };
    }
    const blob = await response.blob();

    // Create object URL and trigger download
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    // Clean up after a short delay
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    }, 1000);

    return { ok: true };
  } catch (err) {
    console.error('[files] download failed:', err);
    return { ok: false, error: 'Download failed. Please try again.' };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export function getFileIcon(type: FileType): string {
  switch (type) {
    case 'image': return 'image';
    case 'pdf': return 'pdf';
    case 'audio': return 'audio';
    default: return 'file';
  }
}

export { MAX_SIZE, MAX_PERSONAL_FILES, MAX_ROOM_FILES };
