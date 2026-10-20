// Speech to text for every voice button, on Anna's own OpenAI key (functions/transcribeVoice).
// The recording is sent inline instead of being uploaded first: an upload costs a Base44
// integration credit, and Base44's own TranscribeAudio costs more. Very long recordings
// (over ~4 MB) still go through an upload.
import { base44 } from '@/api/base44Client';

const INLINE_MAX = 4 * 1024 * 1024;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error || new Error('Could not read the recording'));
    r.readAsDataURL(blob);
  });
}

/** Returns the transcript text ('' if nothing was heard). Throws on failure. */
export async function transcribe(blob, mime) {
  const type = mime || blob?.type || 'audio/webm';
  let body;
  if (blob.size <= INLINE_MAX) {
    body = { audio_base64: await blobToBase64(blob), mime: type };
  } else {
    const ext = type.includes('wav') ? 'wav' : (type.includes('mp4') || type.includes('aac')) ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    const { file_url } = await base44.integrations.Core.UploadFile({ file: new File([blob], `recording.${ext}`, { type }) });
    body = { file_url, mime: type };
  }
  const { data } = await base44.functions.invoke('transcribeVoice', body);
  if (!data?.success && data?.error) throw new Error(data.details || data.error);
  return String(data?.transcript || '').trim();
}
