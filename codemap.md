# Audify - Codebase & Feature Documentation

## Project Overview
Audify is an intelligent web application that converts physical document images into lifelike audiobooks using Google's Gemini AI. It features secure local user management, voice-controlled note-taking, and persistent progress tracking.

---

## Feature Set

1.  **User Account Management**: 
    - Secure registration and login system.
    - Data isolation per user using LocalStorage.
    
2.  **Document Scanning (OCR)**:
    - Upload images (PNG/JPG).
    - Utilizes **Gemini 2.5 Flash** for high-accuracy optical character recognition.
    - Preserves paragraph structure for natural reading flow.

3.  **AI Audiobook Player**:
    - **Text-to-Speech (TTS)**: Uses **Gemini 2.5 Flash TTS** model.
    - **Voice Selection**: Toggle between Male (Fenrir) and Female (Kore) voices.
    - **Speed Control**: Adjustable playback speed (0.5x - 2.0x).
    - **Auto-play**: Seamlessly transitions between paragraphs.

4.  **Smart Features**:
    - **Voice Commands**: Say "Pause" or "Stop" during playback to automatically pause audio and open the note-taking interface.
    - **Progress Tracking**: Automatically saves the last read paragraph.
    - **Notes**: Attach text notes to specific timestamps/paragraphs within the document.
    - **Social Sharing**: Share listening progress via system share sheet.

5.  **Feedback System**: Built-in modal for user ratings and bug reporting.

---

## AI Models & Configuration

### 1. Optical Character Recognition (OCR)
*   **Model**: `gemini-2.5-flash`
*   **Purpose**: Extracts text from uploaded document images.
*   **Configuration**:
    *   Input: Base64 encoded image data + MIME type.
    *   Prompt: "Extract all the legible text from this document image. Maintain the original paragraph structure..."

### 2. Text-to-Speech (TTS)
*   **Model**: `gemini-2.5-flash-preview-tts`
*   **Purpose**: Generates audio chunks for individual paragraphs.
*   **Configuration**:
    *   Voices: 'Fenrir' (Male), 'Kore' (Female).
    *   Modality: `AUDIO`.
    *   Output: Base64 encoded MP3 audio.

---

## File Structure & Documentation

### Root Files
*   `index.html`: Entry point. Imports Tailwind CSS and defines the root div.
*   `index.tsx`: React entry point. Mounts the `App` component to the DOM.
*   `metadata.json`: Defines app metadata and requests `microphone` permissions for voice commands.
*   `types.ts`: TypeScript definitions for `User`, `Document`, `Note`, `AppSettings`, and `ViewState`.

### Services (`/services`)
*   `geminiService.ts`: 
    *   **Role**: Handles all communication with the Google GenAI SDK.
    *   **Functions**:
        *   `extractTextFromImage()`: Calls Gemini Flash for OCR.
        *   `generateSpeech()`: Calls Gemini TTS for audio generation.
        *   `generateSummary()`: (Helper) Generates brief summaries of text.
*   `storageService.ts`:
    *   **Role**: Manages data persistence using the browser's LocalStorage.
    *   **Functions**: Handles CRUD operations for Users, Documents, and Settings. mocking a backend database.

### Components (`/components`)
*   `App.tsx`: 
    *   **Role**: Main application controller.
    *   **Logic**: Manages global state (`user`, `view`, `activeDoc`) and routes between Auth, Dashboard, Scanner, and Player views.
*   `Auth.tsx`:
    *   **Role**: User authentication form.
    *   **Logic**: Toggles between Login and Signup modes; validates input and calls storage service.
*   `Dashboard.tsx`:
    *   **Role**: Main landing view for logged-in users.
    *   **Logic**: Lists user documents, handles deletion, and provides entry points to Scanner and Player.
*   `Scanner.tsx`:
    *   **Role**: Document upload and processing interface.
    *   **Logic**: 
        1. Accepts file input.
        2. Converts file to Base64.
        3. Calls `geminiService.extractTextFromImage`.
        4. Parses result into paragraphs.
        5. Saves new Document object.
*   `Player.tsx`:
    *   **Role**: The core audiobook experience.
    *   **Logic**:
        *   **State**: Tracks `currentParaIndex`, `isPlaying`, `audioSrc`.
        *   **Effect**: When index changes, fetches new audio blob from Gemini TTS.
        *   **Voice Recognition**: Uses Web Speech API to listen for "Pause" command to trigger note modal.
*   `Button.tsx`: Reusable UI button component with variant styles.
*   `FeedbackModal.tsx`: Modal dialog for collecting user feedback.

---

## Key Algorithms & Pseudocode

### Document Processing Pipeline (Scanner.tsx)
```javascript
function processDocument(file):
   base64Data = convertFileToBase64(file)
   rawText = callGeminiOCR(base64Data) // Model: gemini-2.5-flash
   
   if (rawText is empty):
       throw Error
   
   // Split text into chunks for smoother TTS playback
   paragraphs = rawText.split(double_newline)
   
   newDocument = {
       id: UUID,
       content: rawText,
       paragraphs: paragraphs,
       progressIndex: 0
   }
   
   saveToLocalStorage(newDocument)
```

### Audio Playback & Voice Control (Player.tsx)
```javascript
function loadAudio(paragraphIndex):
   text = document.paragraphs[paragraphIndex]
   voice = settings.gender == 'MALE' ? 'Fenrir' : 'Kore'
   
   audioData = callGeminiTTS(text, voice) // Model: gemini-2.5-flash-preview-tts
   audioUrl = createBlobUrl(audioData)
   
   audioElement.src = audioUrl
   audioElement.play()

listener VoiceCommandListener:
   onResult(command):
      if (command contains "pause" OR "stop"):
          audioElement.pause()
          showNoteModal()
```
