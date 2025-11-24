/**
 * Audio Utilities for Audify
 * Handles audio buffer manipulation, concatenation, and format conversion
 */

/**
 * Concatenate multiple AudioBuffers into a single AudioBuffer
 */
export function concatenateAudioBuffers(
  buffers: AudioBuffer[],
  context: AudioContext
): AudioBuffer {
  if (buffers.length === 0) {
    throw new Error('No audio buffers to concatenate');
  }

  if (buffers.length === 1) {
    return buffers[0];
  }

  // Calculate total length
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
  const numberOfChannels = buffers[0].numberOfChannels;
  const sampleRate = buffers[0].sampleRate;

  // Create new buffer with combined length
  const concatenated = context.createBuffer(
    numberOfChannels,
    totalLength,
    sampleRate
  );

  // Copy data from each buffer
  let offset = 0;
  for (const buffer of buffers) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      concatenated.getChannelData(channel).set(channelData, offset);
    }
    offset += buffer.length;
  }

  return concatenated;
}

/**
 * Convert AudioBuffer to WAV Blob
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;

  const data = interleave(buffer);
  const dataLength = data.length * bytesPerSample;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write audio data
  floatTo16BitPCM(view, 44, data);

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Interleave audio channels
 */
function interleave(buffer: AudioBuffer): Float32Array {
  const numberOfChannels = buffer.numberOfChannels;
  const length = buffer.length * numberOfChannels;
  const result = new Float32Array(length);

  let offset = 0;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      result[offset++] = buffer.getChannelData(channel)[i];
    }
  }

  return result;
}

/**
 * Convert float samples to 16-bit PCM
 */
function floatTo16BitPCM(view: DataView, offset: number, input: Float32Array): void {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

/**
 * Write string to DataView
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Estimate paragraph timestamps based on text length and total duration
 * Used as fallback if actual durations aren't available
 */
export function estimateTimestamps(
  paragraphs: string[],
  totalDuration: number
): { start: number; end: number }[] {
  const totalChars = paragraphs.reduce((sum, p) => sum + p.length, 0);
  const timestamps: { start: number; end: number }[] = [];
  let currentTime = 0;

  for (const paragraph of paragraphs) {
    const proportion = paragraph.length / totalChars;
    const duration = totalDuration * proportion;
    
    timestamps.push({
      start: currentTime,
      end: currentTime + duration,
    });
    
    currentTime += duration;
  }

  return timestamps;
}

/**
 * Calculate duration from audio buffer
 */
export function getAudioDuration(buffer: AudioBuffer): number {
  return buffer.duration;
}

/**
 * Decode base64 PCM audio to Uint8Array
 */
export function decodeBase64Audio(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode Uint8Array to base64 (chunked to avoid stack overflow)
 */
export function encodeAudioToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000; // 32KB chunks
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Decode raw PCM data to AudioBuffer
 */
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  
  return buffer;
}
