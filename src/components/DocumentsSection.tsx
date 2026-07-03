import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Trash2, Download, Eye, Loader2, FileText, ImageIcon, Music, File, X, AlertTriangle } from 'lucide-react';
import { useTheme } from '../lib/theme';
import {
  fetchPersonalDocuments, uploadPersonalDocument, deleteFile, getSignedUrl,
  validateFile, formatFileSize, formatDate,
  type UploadedFile, type FileType,
} from '../lib/files';

interface Props {
  userId: string;
}

export default function DocumentsSection({ userId }: Props) {
  const { colors } = useTheme();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<{ url: string; name: string; type: FileType } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchPersonalDocuments();
    setFiles(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';

    setError(null);
    const validation = validateFile(file);
    if (!validation.ok) {
      setError(validation.error || 'File is too large. Please upload a smaller file.');
      return;
    }

    setUploading(true);
    const result = await uploadPersonalDocument(file, userId);
    setUploading(false);

    if (!result.ok || !result.file) {
      setError(result.error || 'Upload failed. Please try again.');
      return;
    }

    setFiles(prev => [result.file!, ...prev]);
    setSuccess('Document uploaded successfully.');
    setTimeout(() => setSuccess(null), 2500);
  }

  async function handlePreview(file: UploadedFile) {
    const url = await getSignedUrl(file.storage_bucket, file.storage_path);
    if (!url) {
      setError('Could not open file. Please try again.');
      return;
    }
    setPreviewUrl({ url, name: file.original_file_name, type: file.file_type });
  }

  async function handleDownload(file: UploadedFile) {
    // Use the downloadFile helper which fetches as blob first
    const { downloadFile: doDownload } = await import('../lib/files');
    const result = await doDownload(file.storage_bucket, file.storage_path, file.original_file_name);
    if (!result.ok) {
      setError(result.error || 'Could not download file. Please try again.');
    }
  }

  async function handleDelete(fileId: string) {
    const result = await deleteFile(fileId);
    if (!result.ok) {
      setError(result.error || 'Could not delete file.');
      return;
    }
    setFiles(prev => prev.filter(f => f.id !== fileId));
    setConfirmDelete(null);
  }

  function getIcon(type: FileType) {
    const props = { size: 20, color: colors.accent };
    switch (type) {
      case 'image': return <ImageIcon {...props} />;
      case 'pdf': return <FileText {...props} />;
      case 'audio': return <Music {...props} />;
      default: return <File {...props} />;
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textPrimary }}>
          Documents
        </p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity"
          style={{
            background: colors.accent,
            color: '#fff',
            border: 'none',
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.mp3,.wav,.ogg,.m4a,.aac,audio/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      <p className="text-xs" style={{ color: colors.textSecondary }}>
        Your private documents. PDF, images, and audio up to 10 MB each. Only you can see them.
      </p>

      {error && (
        <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2" style={{ background: colors.errorBg, color: colors.error }}>
          <AlertTriangle size={13} style={{ flexShrink: 0 }} />
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: colors.error }}>
            <X size={14} />
          </button>
        </div>
      )}

      {success && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: colors.successBg, color: colors.success }}>
          {success}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin" size={20} color={colors.textSecondary} />
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-8 rounded-lg" style={{ background: colors.bgInput }}>
          <File size={28} color={colors.textTertiary} className="mx-auto mb-2" />
          <p className="text-xs" style={{ color: colors.textSecondary }}>No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map(file => (
            <div
              key={file.id}
              className="flex items-center gap-3 rounded-lg p-3"
              style={{ background: colors.bgInput, border: `1px solid ${colors.borderLight}` }}
            >
              <div className="flex-shrink-0">{getIcon(file.file_type)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>
                  {file.original_file_name}
                </p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                  {file.file_type.toUpperCase()} · {formatFileSize(file.file_size)} · {formatDate(file.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handlePreview(file)}
                  title="Preview"
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ background: colors.bgHover || 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <Eye size={15} color={colors.textSecondary} />
                </button>
                <button
                  onClick={() => handleDownload(file)}
                  title="Download"
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ background: colors.bgHover || 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <Download size={15} color={colors.textSecondary} />
                </button>
                <button
                  onClick={() => setConfirmDelete(file.id)}
                  title="Delete"
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <Trash2 size={15} color={colors.error} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="relative max-w-3xl w-full max-h-[90vh] rounded-xl overflow-hidden flex flex-col"
            style={{ background: colors.bgCard }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: colors.borderLight }}>
              <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>{previewUrl.name}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    // Fetch as blob and download (required for cross-origin URLs)
                    try {
                      const response = await fetch(previewUrl.url);
                      if (response.ok) {
                        const blob = await response.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = blobUrl;
                        a.download = previewUrl.name;
                        a.rel = 'noopener';
                        a.style.display = 'none';
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => {
                          URL.revokeObjectURL(blobUrl);
                          document.body.removeChild(a);
                        }, 1000);
                      }
                    } catch (err) {
                      console.error('[Documents] download failed:', err);
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold"
                  style={{ background: colors.bgInput, color: colors.textPrimary, border: `1px solid ${colors.borderLight}`, cursor: 'pointer' }}
                >
                  <Download size={13} /> Download
                </button>
                <button onClick={() => setPreviewUrl(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <X size={18} color={colors.textSecondary} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-4" style={{ minHeight: '300px' }}>
              {previewUrl.type === 'image' ? (
                <img src={previewUrl.url} alt={previewUrl.name} className="max-w-full max-h-[70vh] rounded-lg" />
              ) : previewUrl.type === 'pdf' ? (
                <iframe src={previewUrl.url} title={previewUrl.name} className="w-full" style={{ height: '70vh', border: 'none' }} />
              ) : previewUrl.type === 'audio' ? (
                <audio controls src={previewUrl.url} className="w-full" />
              ) : (
                <div className="text-center py-12">
                  <File size={40} color={colors.textTertiary} className="mx-auto mb-3" />
                  <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>
                    Preview not available for this file type.
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        const response = await fetch(previewUrl.url);
                        if (response.ok) {
                          const blob = await response.blob();
                          const blobUrl = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = blobUrl;
                          a.download = previewUrl.name;
                          a.rel = 'noopener';
                          a.style.display = 'none';
                          document.body.appendChild(a);
                          a.click();
                          setTimeout(() => {
                            URL.revokeObjectURL(blobUrl);
                            document.body.removeChild(a);
                          }, 1000);
                        }
                      } catch (err) {
                        console.error('[Documents] download failed:', err);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-white"
                    style={{ background: colors.accent, border: 'none', cursor: 'pointer' }}
                  >
                    <Download size={14} /> Download
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: colors.bgCard }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={18} color={colors.error} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="text-sm font-bold mb-1" style={{ color: colors.textPrimary }}>Delete document?</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                  This will permanently remove the file from your storage. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2 rounded-lg text-xs font-bold text-white"
                style={{ background: colors.error, border: 'none', cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
