const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const ensureApiKey = () => {
  if (!apiKey || apiKey.startsWith('YOUR_')) {
    throw new Error('Gemini API key missing. Set VITE_GEMINI_API_KEY in your environment.');
  }
};

const request = async <T>(endpoint: string, payload: unknown): Promise<T> => {
  ensureApiKey();

  const url = `${BASE_URL}/${endpoint}?key=${apiKey}`;
  console.log('[Gemini] →', endpoint);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Gemini request failed (${response.status})`;
    try {
      const errorBody = await response.json();
      message = errorBody?.error?.message ?? message;
      console.error('[Gemini] ← error', response.status, errorBody);
    } catch (parseError) {
      console.error('[Gemini] ← error (unreadable body)', response.status, parseError);
    }
    throw new Error(message);
  }

  const data = (await response.json()) as T;
  console.log('[Gemini] ←', endpoint);
  return data;
};

const extractTextFromResponse = (data: any): string => {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part: any) => part?.text ?? '')
    .join('')
    .trim();
  return text;
};

const extractAudioFromResponse = (data: any): string | null => {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part?.inlineData?.data) {
      return part.inlineData.data;
    }
  }
  return null;
};

/**
 * Performs OCR on an image using Gemini Flash.
 */
export const extractTextFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
  try {
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Image,
                mimeType,
              },
            },
            {
              text:
                'Extract all the legible text from this document image. Maintain the original paragraph structure as best as possible. Do not add any markdown formatting like bold or italics, just plain text.',
            },
          ],
        },
      ],
    };

    const response = await request<any>('gemini-2.5-flash:generateContent', payload);
    const text = extractTextFromResponse(response);
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }
    return text;
  } catch (error: any) {
    console.error('OCR Error:', error);
    throw new Error(error.message || 'Failed to extract text from the image.');
  }
};

/**
 * Generates Speech from Text using Gemini TTS.
 */
export const generateSpeech = async (text: string, gender: 'MALE' | 'FEMALE'): Promise<string> => {
  if (!text || !text.trim()) {
    throw new Error('Text is empty, cannot generate speech.');
  }

  if (text.length > 4000) {
    console.warn('Text length exceeds typical limits, truncating for TTS safety.');
    text = text.substring(0, 4000);
  }

  try {
    const voiceName = gender === 'MALE' ? 'Fenrir' : 'Kore';

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text }],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    };

    const response = await request<any>('gemini-2.5-flash-preview-tts:generateContent', payload);
    const base64Audio = extractAudioFromResponse(response);

    if (!base64Audio) {
      const textPart = extractTextFromResponse(response);
      if (textPart) {
        console.error('Gemini TTS returned text instead of audio:', textPart);
        throw new Error(`Gemini refused to generate audio: ${textPart}`);
      }

      console.error('Gemini TTS Response structure unexpected:', response);
      throw new Error('No audio data returned from Gemini.');
    }

    return base64Audio;
  } catch (error: any) {
    console.error('TTS Error:', error);
    throw new Error(error.message || 'Failed to generate speech.');
  }
};

export const generateSummary = async (text: string): Promise<string> => {
  try {
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Summarize the following text in 2 sentences: ${text.substring(0, 2000)}...`,
            },
          ],
        },
      ],
    };

    const response = await request<any>('gemini-2.5-flash:generateContent', payload);
    const summary = extractTextFromResponse(response);
    return summary || 'No summary available.';
  } catch (error) {
    console.error('Summary Error:', error);
    return 'Summary unavailable.';
  }
};