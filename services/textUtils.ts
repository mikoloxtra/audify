/**
 * Text Utilities for Audify
 * Handles text parsing, normalization, and paragraph extraction
 */

import { v4 as uuidv4 } from 'uuid';
import { Paragraph } from '../types';

/**
 * Parse OCR text into paragraphs
 * Splits on double newlines and filters empty paragraphs
 */
export function parseIntoParagraphs(text: string): string[] {
  // Split on double newlines (paragraph breaks)
  let paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  // Further split long paragraphs
  paragraphs = paragraphs.flatMap((p) => normalizeParagraph(p, 1000));

  return paragraphs;
}

/**
 * Normalize paragraph text
 * Splits paragraphs that are too long into smaller chunks
 */
export function normalizeParagraph(
  text: string,
  maxLength: number = 1000
): string[] {
  if (text.length < maxLength) {
    return [text];
  }

  // Try to split on sentences first
  const sentences = text.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  // If chunks are still too long, split by character count
  return chunks.flatMap((chunk) => {
    if (chunk.length < maxLength * 1.5) {
      return [chunk];
    }
    return chunk.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [chunk];
  });
}

/**
 * Create Paragraph objects with metadata
 */
export function createParagraphObjects(
  paragraphTexts: string[],
  timestamps: { start: number; end: number }[]
): Paragraph[] {
  let characterPosition = 0;

  return paragraphTexts.map((text, index) => {
    const paragraph: Paragraph = {
      id: uuidv4(),
      index,
      text: text.trim(),
      startTime: timestamps[index]?.start || 0,
      endTime: timestamps[index]?.end || 0,
      characterStart: characterPosition,
      characterEnd: characterPosition + text.length,
    };

    characterPosition += text.length + 2; // +2 for paragraph break

    return paragraph;
  });
}

/**
 * Calculate total character count
 */
export function getTotalCharacters(paragraphs: string[]): number {
  return paragraphs.reduce((sum, p) => sum + p.length, 0);
}

/**
 * Detect language (simple heuristic)
 */
export function detectLanguage(text: string): string {
  // Simple detection - can be enhanced with a proper library
  const sample = text.slice(0, 1000).toLowerCase();
  
  // Check for common English words
  const englishWords = ['the', 'and', 'is', 'in', 'to', 'of', 'a'];
  const englishCount = englishWords.filter(word => 
    sample.includes(` ${word} `)
  ).length;

  if (englishCount >= 3) {
    return 'en';
  }

  return 'unknown';
}

/**
 * Clean and normalize OCR text
 * Removes excessive whitespace, fixes common OCR errors
 */
export function cleanOCRText(text: string): string {
  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Fix common OCR errors
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([.,!?;:])\s*([.,!?;:])/g, '$1')
    // Normalize quotes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    // Trim
    .trim();
}

/**
 * Combine multiple OCR texts (for multi-image documents)
 */
export function combineOCRTexts(texts: string[]): string {
  return texts
    .map(text => cleanOCRText(text))
    .join('\n\n');
}

/**
 * Format time for display (MM:SS)
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format duration for display (HH:MM:SS or MM:SS)
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
