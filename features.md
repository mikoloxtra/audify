# Audify Features

## Core Features

### Document Processing
- [x] Image upload for document scanning
- [x] OCR text extraction via Gemini AI
- [x] Text-to-speech audio generation via Gemini TTS
- [x] Paragraph splitting and normalization
- [ ] Batch upload support (multiple images at once)
- [x] File size validation and limits (10MB per image)

### Data Persistence & Caching
- [x] Store uploaded images in Firebase Storage
- [x] Store document metadata in Firestore
- [x] Cache OCR text results in Firestore (avoid re-scanning)
- [x] Cache TTS audio in Firebase Storage (avoid re-generating)
- [ ] Batch API calls for multiple paragraphs

### Authentication
- [x] Email/password authentication
- [x] Google OAuth login
- [x] User session management

### Audio Playback
- [x] Audio player with play/pause controls
- [x] Progress tracking and resume
- [x] Voice commands (play, pause, next, previous)
- [x] Speed control
- [x] User notes per document

### User Interface
- [x] Dashboard with document list
- [x] Scanner view for uploads
- [x] Player view for listening
- [x] Settings management
- [x] Responsive design

## Performance Optimizations
- [x] Single OCR call per document (cache results)
- [x] Single TTS call per paragraph (cache audio)
- [ ] Batch processing for multiple images
- [x] File size limits to prevent large uploads (10MB)
- [ ] Progress indicators for batch operations

## Future Enhancements
- [ ] Support for 100+ image batch uploads
- [ ] Document editing and re-processing
- [ ] Export audio files
- [ ] Offline mode with cached content
- [ ] Multi-language support
