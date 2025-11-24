/**
 * Processing Service for Audify
 * Orchestrates the entire document processing pipeline:
 * Upload → OCR → Parse → Generate Audio → Save
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Document,
  SourceImage,
  ProcessedContent,
  AudioData,
  PlaybackState,
  ProcessingStatus,
  VoiceGender,
  Paragraph,
} from '../types';
import { extractTextFromImage, generateSpeech } from './geminiService';
import {
  uploadSourceImages,
  uploadAudio,
  saveDocument as saveDocumentToFirestore,
} from './storageService';
import {
  concatenateAudioBuffers,
  audioBufferToWav,
  decodeBase64Audio,
  decodeAudioData,
} from './audioUtils';
import {
  parseIntoParagraphs,
  createParagraphObjects,
  combineOCRTexts,
  cleanOCRText,
  getTotalCharacters,
  detectLanguage,
} from './textUtils';

/**
 * Main processing function
 * Takes uploaded images and processes them into a complete audiobook
 */
export async function processDocument(
  userId: string,
  images: File[],
  title: string,
  voiceGender: VoiceGender,
  onProgress: (status: ProcessingStatus) => void
): Promise<Document> {
  const documentId = uuidv4();

  try {
    // ===== STAGE 1: UPLOAD IMAGES =====
    onProgress({
      stage: 'uploading',
      progress: 0,
      message: 'Uploading images...',
      currentStep: 1,
      totalSteps: 4,
    });

    const sourceImages = await uploadSourceImages(userId, documentId, images);

    onProgress({
      stage: 'uploading',
      progress: 25,
      message: `Uploaded ${images.length} image(s)`,
    });

    // ===== STAGE 2: OCR PROCESSING =====
    onProgress({
      stage: 'ocr',
      progress: 25,
      message: 'Extracting text from images...',
      currentStep: 2,
      totalSteps: 4,
    });

    const ocrTexts: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const base64Data = await fileToBase64(image);
      const text = await extractTextFromImage(base64Data, image.type);

      if (!text || text.trim().length === 0) {
        console.warn(`[Processing] Image ${i + 1} has no text, skipping`);
        continue;
      }

      ocrTexts.push(text);

      onProgress({
        stage: 'ocr',
        progress: 25 + (25 * (i + 1)) / images.length,
        message: `Processing image ${i + 1} of ${images.length}...`,
      });
    }

    if (ocrTexts.length === 0) {
      throw new Error('No text found in any of the uploaded images.');
    }

    // Combine and clean OCR text
    const fullText = combineOCRTexts(ocrTexts);
    const paragraphTexts = parseIntoParagraphs(fullText);

    console.log(`[Processing] Extracted ${paragraphTexts.length} paragraphs`);

    // ===== STAGE 3: GENERATE AUDIO =====
    onProgress({
      stage: 'audio',
      progress: 50,
      message: 'Generating audio...',
      currentStep: 3,
      totalSteps: 4,
    });

    const audioResult = await generateFullAudioWithTimestamps(
      paragraphTexts,
      voiceGender,
      (audioProgress) => {
        onProgress({
          stage: 'audio',
          progress: 50 + (audioProgress * 0.4), // 50-90%
          message: `Generating audio... ${Math.round(audioProgress)}%`,
        });
      }
    );

    // ===== STAGE 4: UPLOAD AUDIO & SAVE =====
    onProgress({
      stage: 'saving',
      progress: 90,
      message: 'Saving audiobook...',
      currentStep: 4,
      totalSteps: 4,
    });

    const audioUploadResult = await uploadAudio(
      userId,
      documentId,
      audioResult.audioBlob
    );

    // Create paragraph objects with timestamps
    const paragraphs = createParagraphObjects(
      paragraphTexts,
      audioResult.timestamps
    );

    // Build document object
    const now = new Date().toISOString();
    const document: Document = {
      id: documentId,
      userId,
      title,
      createdAt: now,
      updatedAt: now,
      sourceImages,
      content: {
        fullText: cleanOCRText(fullText),
        paragraphs,
        totalParagraphs: paragraphs.length,
        totalCharacters: getTotalCharacters(paragraphTexts),
        language: detectLanguage(fullText),
        processedAt: now,
      },
      audio: {
        storagePath: audioUploadResult.storagePath,
        downloadURL: audioUploadResult.downloadURL,
        duration: audioResult.duration,
        format: 'wav',
        sampleRate: 24000,
        generatedAt: now,
        voiceGender,
      },
      playback: {
        currentTime: 0,
        currentParagraphIndex: 0,
        lastPlayedAt: now,
        isCompleted: false,
        completionPercentage: 0,
      },
      notes: [],
    };

    // Save to Firestore
    await saveDocumentToFirestore(document);

    onProgress({
      stage: 'complete',
      progress: 100,
      message: 'Audiobook created successfully!',
    });

    console.log(`[Processing] Document ${documentId} created successfully`);

    return document;
  } catch (error: any) {
    console.error('[Processing] Error:', error);
    onProgress({
      stage: 'error',
      progress: 0,
      message: error.message || 'Processing failed',
    });
    throw error;
  }
}

/**
 * Generate full audio with paragraph timestamps
 * Generates audio for each paragraph, tracks durations, and concatenates
 */
async function generateFullAudioWithTimestamps(
  paragraphs: string[],
  voiceGender: VoiceGender,
  onProgress?: (percent: number) => void
): Promise<{
  audioBlob: Blob;
  duration: number;
  timestamps: { start: number; end: number }[];
}> {
  const AudioContextClass =
    (window.AudioContext as any) || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass({ sampleRate: 24000 });

  const audioBuffers: AudioBuffer[] = [];
  const timestamps: { start: number; end: number }[] = [];
  let cumulativeTime = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    console.log(`[Processing] Generating audio for paragraph ${i + 1}/${paragraphs.length}`);

    // Generate audio for this paragraph
    const base64Audio = await generateSpeech(paragraphs[i], voiceGender);
    const pcmBytes = decodeBase64Audio(base64Audio);
    const audioBuffer = await decodeAudioData(pcmBytes, audioContext, 24000, 1);

    // Track timestamp
    const duration = audioBuffer.duration;
    timestamps.push({
      start: cumulativeTime,
      end: cumulativeTime + duration,
    });

    audioBuffers.push(audioBuffer);
    cumulativeTime += duration;

    // Report progress
    if (onProgress) {
      onProgress(((i + 1) / paragraphs.length) * 100);
    }
  }

  console.log(`[Processing] Concatenating ${audioBuffers.length} audio buffers...`);

  // Concatenate all audio buffers into one
  const concatenatedBuffer = concatenateAudioBuffers(audioBuffers, audioContext);

  // Convert to WAV blob
  const audioBlob = audioBufferToWav(concatenatedBuffer);

  console.log(`[Processing] Audio generation complete. Duration: ${cumulativeTime.toFixed(2)}s`);

  return {
    audioBlob,
    duration: cumulativeTime,
    timestamps,
  };
}

/**
 * Convert File to base64 string
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (result.startsWith('data:')) {
        const base64 = result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Invalid file format'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}
