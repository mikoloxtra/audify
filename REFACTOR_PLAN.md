# Audify Refactor Plan - New Architecture

## 🎯 Core Philosophy Change

**OLD**: Upload → Show in library → Scan on-demand during playback → Generate audio per paragraph  
**NEW**: Upload → Process everything upfront → Store fully processed audiobook → Instant playback

---

## 📋 High-Level Flow

```
1. User uploads image(s)
   ↓
2. Upload to Firebase Storage immediately
   ↓
3. OCR scan entire content (Gemini API)
   ↓
4. Parse into structured content (paragraphs/pages)
   ↓
5. Generate FULL audio for entire content (single audio file)
   ↓
6. Store audio in Firebase Storage
   ↓
7. Save document metadata to Firestore
   ↓
8. Redirect to Library (audiobook ready to play)
```

---

## 🗂️ New Data Model

### Document Structure
```typescript
interface Document {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  
  // Source images
  sourceImages: SourceImage[];
  
  // Processed content
  content: ProcessedContent;
  
  // Audio
  audio: AudioData;
  
  // Playback state
  playback: PlaybackState;
  
  // User annotations
  notes: Note[];
}

interface SourceImage {
  id: string;
  storagePath: string;
  downloadURL: string;
  uploadedAt: string;
  order: number; // For multi-image documents
}

interface ProcessedContent {
  fullText: string; // Raw OCR output
  paragraphs: Paragraph[];
  totalParagraphs: number;
  totalCharacters: number;
  language?: string;
  processedAt: string;
}

interface Paragraph {
  id: string;
  index: number;
  text: string;
  startTime: number; // Start time in audio (seconds)
  endTime: number;   // End time in audio (seconds)
  characterStart: number; // Character position in fullText
  characterEnd: number;
}

interface AudioData {
  storagePath: string;
  downloadURL: string;
  duration: number; // Total duration in seconds
  format: 'pcm' | 'mp3' | 'wav';
  sampleRate: number;
  generatedAt: string;
  voiceGender: VoiceGender;
}

interface PlaybackState {
  currentTime: number; // Current playback position in seconds
  currentParagraphIndex: number;
  lastPlayedAt: string;
  isCompleted: boolean;
  completionPercentage: number;
}

interface Note {
  id: string;
  timestamp: number; // Time in audio (seconds)
  paragraphIndex: number;
  content: string;
  createdAt: string;
  updatedAt?: string;
}
```

---

## 🔄 Component Refactor

### 1. **Scanner Component** (Upload & Processing)

**Responsibilities:**
- Accept single or multiple image uploads
- Show upload progress
- Trigger processing pipeline
- Show processing status (OCR → Audio Generation)
- Redirect to library when complete

**Processing Steps:**
```
1. Validate images (size, format)
2. Upload to Firebase Storage
3. Call OCR service (Gemini) for all images
4. Parse OCR output into paragraphs
5. Generate single audio file for entire content
6. Upload audio to Firebase Storage
7. Save document to Firestore
8. Navigate to Dashboard
```

**UI States:**
- Idle (file selection)
- Uploading images (progress bar)
- Processing OCR (spinner + status)
- Generating audio (progress indicator)
- Complete (success message → redirect)
- Error (error message + retry)

---

### 2. **Dashboard Component** (Library View)

**Responsibilities:**
- Display all user's audiobooks
- Show metadata (title, duration, progress)
- Allow deletion
- Navigate to Player

**Display Info:**
- Title
- Duration (from audio.duration)
- Progress percentage
- Last played date
- Thumbnail (first source image)

---

### 3. **Player Component** (Playback)

**Major Changes:**

#### Audio Playback
- Load SINGLE audio file (not paragraph-by-paragraph)
- Use HTML5 Audio or Web Audio API
- No buffering between paragraphs (it's one file!)
- Smooth seeking anywhere in the timeline

#### Paragraph Highlighting
- Calculate which paragraph is currently playing based on `currentTime`
- Use `paragraph.startTime` and `paragraph.endTime` to determine active paragraph
- Auto-scroll to active paragraph
- Highlight active paragraph

#### Timeline/Slider
- Shows full document duration
- Seeking updates `currentTime` and active paragraph
- Display current time / total duration

#### Paragraph Navigation
- Click paragraph → seek to `paragraph.startTime`
- Skip forward/backward buttons → jump to next/previous paragraph

#### Notes
- Add note at current timestamp
- Display notes with timestamp
- Click note → seek to that timestamp
- Notes stored in Firestore immediately

**Synchronization Logic:**
```javascript
// Update active paragraph based on audio time
function updateActiveParagraph(currentTime) {
  const activePara = paragraphs.find(p => 
    currentTime >= p.startTime && currentTime < p.endTime
  );
  setCurrentParagraphIndex(activePara?.index || 0);
  scrollToActiveParagraph(activePara);
}

// Called on audio timeupdate event
audioElement.ontimeupdate = () => {
  updateActiveParagraph(audioElement.currentTime);
  savePlaybackProgress(audioElement.currentTime);
};
```

---

## 🔧 Service Layer Refactor

### 1. **processingService.ts** (NEW)

```typescript
// Orchestrates the entire processing pipeline
export async function processDocument(
  userId: string,
  images: File[],
  title: string,
  onProgress: (status: ProcessingStatus) => void
): Promise<Document>

interface ProcessingStatus {
  stage: 'uploading' | 'ocr' | 'audio' | 'saving' | 'complete';
  progress: number; // 0-100
  message: string;
}
```

**Steps:**
1. Upload images to Storage
2. OCR all images (combine text if multiple)
3. Parse into paragraphs
4. Generate full audio with Gemini TTS
5. Upload audio to Storage
6. Create Document object
7. Save to Firestore

---

### 2. **geminiService.ts** (Updated)

```typescript
// OCR - unchanged
export async function extractTextFromImage(
  base64Data: string, 
  mimeType: string
): Promise<string>

// TTS - NEW: Generate full audio at once
export async function generateFullAudio(
  text: string,
  voiceGender: VoiceGender,
  onProgress?: (percent: number) => void
): Promise<ArrayBuffer>

// Alternative: Generate with paragraph timestamps
export async function generateAudioWithTimestamps(
  paragraphs: string[],
  voiceGender: VoiceGender
): Promise<{
  audioBuffer: ArrayBuffer;
  timestamps: { start: number; end: number }[];
}>
```

**Challenge:** Gemini TTS might not provide timestamp info for paragraphs.

**Solution Options:**
1. **Estimate timestamps**: Calculate based on character count and average speech rate
2. **Generate per paragraph, concatenate**: Generate audio for each paragraph, track durations, concatenate into single file
3. **Use speech-to-text alignment**: Generate audio, then use alignment algorithm (complex)

**Recommended: Option 2** - Generate per paragraph, track durations, concatenate

---

### 3. **storageService.ts** (Updated)

```typescript
// Upload source images
export async function uploadSourceImages(
  userId: string,
  files: File[]
): Promise<SourceImage[]>

// Upload processed audio
export async function uploadAudio(
  userId: string,
  documentId: string,
  audioBlob: Blob
): Promise<{ storagePath: string; downloadURL: string }>

// Save document
export async function saveDocument(doc: Document): Promise<void>

// Load document
export async function loadDocument(
  userId: string, 
  documentId: string
): Promise<Document>

// Update playback progress
export async function updatePlaybackProgress(
  documentId: string,
  currentTime: number,
  currentParagraphIndex: number
): Promise<void>

// Save note
export async function saveNote(
  documentId: string,
  note: Note
): Promise<void>

// Delete note
export async function deleteNote(
  documentId: string,
  noteId: string
): Promise<void>
```

---

## 🎨 UI/UX Improvements

### Scanner
- **Progress indicators** for each stage
- **Estimated time remaining** during audio generation
- **Cancel button** to abort processing
- **Preview** of uploaded images

### Dashboard
- **Thumbnail grid** view
- **Sort options** (recent, title, duration)
- **Search/filter** functionality
- **Progress rings** showing completion percentage

### Player
- **Waveform visualization** (optional, nice-to-have)
- **Smooth paragraph scrolling** with animation
- **Keyboard shortcuts** (space = play/pause, arrow keys = seek)
- **Speed control** (0.5x - 2x)
- **Note editor** with rich text (optional)

---

## 🔊 Audio Generation Strategy

### Approach: Paragraph-by-Paragraph with Concatenation

```typescript
async function generateFullAudioWithTimestamps(
  paragraphs: string[],
  voiceGender: VoiceGender,
  onProgress?: (percent: number) => void
): Promise<{
  audioBuffer: ArrayBuffer;
  paragraphTimestamps: { start: number; end: number }[];
}> {
  const audioBuffers: AudioBuffer[] = [];
  const timestamps: { start: number; end: number }[] = [];
  let cumulativeTime = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    // Generate audio for this paragraph
    const base64Audio = await generateSpeech(paragraphs[i], voiceGender);
    const pcmBytes = decode(base64Audio);
    const audioBuffer = await decodeAudioData(pcmBytes, audioContext, 24000, 1);
    
    // Track timestamp
    const duration = audioBuffer.duration;
    timestamps.push({
      start: cumulativeTime,
      end: cumulativeTime + duration
    });
    
    audioBuffers.push(audioBuffer);
    cumulativeTime += duration;
    
    // Report progress
    if (onProgress) {
      onProgress(((i + 1) / paragraphs.length) * 100);
    }
  }
  
  // Concatenate all audio buffers into one
  const concatenatedBuffer = concatenateAudioBuffers(audioBuffers, audioContext);
  
  // Convert to blob for storage
  const wavBlob = audioBufferToWav(concatenatedBuffer);
  
  return {
    audioBuffer: await wavBlob.arrayBuffer(),
    paragraphTimestamps: timestamps
  };
}
```

---

## 📦 New Utilities Needed

### audioUtils.ts
```typescript
// Concatenate multiple AudioBuffers into one
export function concatenateAudioBuffers(
  buffers: AudioBuffer[],
  context: AudioContext
): AudioBuffer

// Convert AudioBuffer to WAV blob
export function audioBufferToWav(
  buffer: AudioBuffer
): Blob

// Estimate paragraph timestamps based on text length
export function estimateTimestamps(
  paragraphs: string[],
  totalDuration: number
): { start: number; end: number }[]
```

### textUtils.ts
```typescript
// Parse OCR text into paragraphs
export function parseIntoParagraphs(
  text: string
): string[]

// Normalize paragraph text
export function normalizeParagraph(
  text: string,
  maxLength?: number
): string[]
```

---

## 🚀 Implementation Order

### Phase 1: Data Model & Storage (Day 1)
1. ✅ Update `types.ts` with new interfaces
2. ✅ Update `storageService.ts` with new functions
3. ✅ Create `processingService.ts`
4. ✅ Create `audioUtils.ts`

### Phase 2: Processing Pipeline (Day 2)
1. ✅ Implement audio concatenation logic
2. ✅ Implement paragraph timestamp tracking
3. ✅ Update `geminiService.ts` for full audio generation
4. ✅ Test processing pipeline end-to-end

### Phase 3: Scanner Refactor (Day 3)
1. ✅ Update Scanner UI for processing states
2. ✅ Integrate processing pipeline
3. ✅ Add progress indicators
4. ✅ Test upload → process → save flow

### Phase 4: Player Refactor (Day 4)
1. ✅ Implement single audio file playback
2. ✅ Implement paragraph highlighting logic
3. ✅ Implement auto-scroll
4. ✅ Update timeline/slider
5. ✅ Test playback synchronization

### Phase 5: Notes & Polish (Day 5)
1. ✅ Implement note CRUD with Firebase
2. ✅ Update Dashboard UI
3. ✅ Add keyboard shortcuts
4. ✅ Performance optimization
5. ✅ Testing & bug fixes

---

## 🎯 Key Benefits of New Architecture

1. **No Buffering**: Single audio file = smooth playback
2. **Faster UX**: Process once, play instantly
3. **Offline Capable**: Can cache audio file for offline playback
4. **Better Progress Tracking**: Know exactly where user is in document
5. **Easier Editing**: Content stored in DB, can be modified
6. **Better Notes**: Tied to specific timestamps in audio
7. **Scalability**: Can add features like bookmarks, highlights, sharing

---

## ⚠️ Challenges & Solutions

### Challenge 1: Large Audio Files
**Problem**: Full audiobook audio could be 50MB+  
**Solution**: 
- Use compressed format (MP3) instead of raw PCM
- Implement streaming if needed
- Show file size warning before processing

### Challenge 2: Paragraph Timestamp Accuracy
**Problem**: Gemini TTS doesn't provide word-level timestamps  
**Solution**: 
- Generate per-paragraph, track durations (accurate)
- Alternative: Estimate based on character count (less accurate)

### Challenge 3: Long Processing Time
**Problem**: Generating audio for 50 paragraphs takes time  
**Solution**:
- Show detailed progress (paragraph X of Y)
- Allow background processing (use service worker)
- Implement queue system for multiple documents

### Challenge 4: Audio Concatenation
**Problem**: Combining multiple audio buffers  
**Solution**:
- Use Web Audio API to concatenate
- Convert to WAV or MP3 format
- Test with various paragraph counts

---

## 🧪 Testing Checklist

- [ ] Upload single image → process → play
- [ ] Upload multiple images → process → play
- [ ] Paragraph highlighting accuracy
- [ ] Seeking to different positions
- [ ] Note creation at various timestamps
- [ ] Progress persistence across sessions
- [ ] Audio playback on mobile
- [ ] Large document (50+ paragraphs)
- [ ] Error handling (OCR fails, TTS fails, upload fails)
- [ ] Concurrent document processing

---

## 📝 Migration Strategy

Since this is a major refactor:

1. **New Branch**: ✅ Already on `refactor` branch
2. **Keep Old Code**: Don't delete old implementation yet
3. **Feature Flag**: Could add flag to switch between old/new
4. **Data Migration**: Old documents won't work with new structure
   - Option A: Wipe old data (acceptable for early stage)
   - Option B: Write migration script
5. **Testing**: Thoroughly test before merging to main

---

## 🎉 Future Enhancements (Post-Refactor)

- **PDF Support**: Extract text from PDFs
- **Multi-language**: Support multiple languages
- **Voice Selection**: Multiple voice options
- **Sharing**: Share audiobooks with other users
- **Bookmarks**: Quick jump points
- **Highlights**: Highlight important paragraphs
- **Export**: Export audio file
- **Playlists**: Group related audiobooks
- **Analytics**: Track listening habits

---

**Ready to implement?** Let me know and I'll start with Phase 1!
