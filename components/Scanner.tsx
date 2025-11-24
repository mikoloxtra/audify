import React, { useState, useRef } from 'react';
import { extractTextFromImage } from '../services/geminiService';
import { User, Document, Page } from '../types';
import { saveDocument, uploadSourceAsset, MAX_FILE_SIZE } from '../services/storageService';
import { Button } from './Button';
import { v4 as uuidv4 } from 'uuid';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle, Plus, X as XIcon } from 'lucide-react';

interface ScannerProps {
  user: User;
  onComplete: () => void;
  onCancel: () => void;
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const [, base64Data] = result.split(',');
        resolve(base64Data ?? '');
      } else {
        reject(new Error('Unsupported file format'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
};

export const Scanner: React.FC<ScannerProps> = ({ user, onComplete, onCancel }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    
    const selectedFiles = Array.from(fileList);
    
    // Validate all files
    const validFiles: File[] = [];
    const newPreviews: string[] = [];
    
    for (const file of selectedFiles) {
      if (!file.type.startsWith('image/')) {
        setError('All files must be valid images (JPG, PNG).');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`File "${file.name}" exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit.`);
        return;
      }
      validFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    }
    
    // Append to existing files
    setFiles([...files, ...validFiles]);
    setPreviews([...previews, ...newPreviews]);
    if (validFiles.length > 0 && !title) {
      setTitle(validFiles[0].name.split('.')[0]);
    }
    setError('');
  };

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setFiles(newFiles);
    setPreviews(newPreviews);
  };

  const processParagraphs = (text: string): string[] => {
    let paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

    paragraphs = paragraphs.flatMap((p) => {
      if (p.length < 1000) return [p];

      const sentences = p.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [p];
      const chunks: string[] = [];
      let currentChunk = '';

      for (const s of sentences) {
        if ((currentChunk + s).length > 1000) {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = s;
        } else {
          currentChunk += s;
        }
      }
      if (currentChunk) chunks.push(currentChunk);

      return chunks.flatMap((c) => {
        if (c.length < 1500) return [c];
        return c.match(/.{1,1000}/g) || [c];
      });
    });

    return paragraphs;
  };

  const handleProcess = async () => {
    if (files.length === 0 || !title) return;

    setIsProcessing(true);
    setError('');
    setProcessingStatus(`Processing ${files.length} page(s)...`);
    console.log('[Scanner] Starting multi-page OCR pipeline', { pageCount: files.length });

    try {
      const pages: Page[] = [];

      // Process each file as a page
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProcessingStatus(`Processing page ${i + 1} of ${files.length}...`);
        console.log(`[Scanner] Processing page ${i + 1}`, {
          fileName: file.name,
          fileSize: file.size,
        });

        // Upload image to storage
        const { storagePath, downloadURL } = await uploadSourceAsset(user.id, file);
        console.log(`[Scanner] Page ${i + 1} uploaded to storage`);

        // Extract text via OCR
        const base64Data = await fileToBase64(file);
        const text = await extractTextFromImage(base64Data, file.type);
        console.log(`[Scanner] Page ${i + 1} OCR complete`);

        if (!text || text.trim().length === 0) {
          console.warn(`[Scanner] Page ${i + 1} has no text, skipping`);
          continue;
        }

        // Split into paragraphs
        const paragraphs = processParagraphs(text);
        console.log(`[Scanner] Page ${i + 1} has ${paragraphs.length} paragraphs`);

        // Create page object
        const page: Page = {
          pageNumber: i + 1,
          imageUrl: downloadURL,
          imagePath: storagePath,
          text: text,
          paragraphs: paragraphs,
          audioPaths: [],
          audioUrls: [],
        };

        pages.push(page);
      }

      if (pages.length === 0) {
        throw new Error('No text found in any of the uploaded images.');
      }

      setProcessingStatus('Saving document...');

      const newDoc: Document = {
        id: uuidv4(),
        userId: user.id,
        title: title,
        pages: pages,
        currentPage: 1,
        currentParagraph: 0,
        createdAt: new Date().toISOString(),
        notes: [],
      };

      await saveDocument(newDoc);
      console.log('[Scanner] Document persisted to Firestore', {
        documentId: newDoc.id,
        pageCount: pages.length,
      });
      onComplete();
    } catch (err: any) {
      console.error('[Scanner] Failed to process document', err);
      setError(err.message || 'Failed to process document.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Scan Document</h2>
        <button onClick={onCancel} className="text-slate-500 hover:text-slate-700">
          <XCircle className="w-6 h-6" />
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-8">
        {files.length === 0 ? (
          <div 
            className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center hover:bg-slate-50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">Upload Document Pages</h3>
            <p className="text-slate-500 text-sm mb-4">Select one or multiple images (PNG, JPG up to 10MB each)</p>
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              Select Files
            </Button>
            <input 
              ref={fileInputRef}
              type="file" 
              className="hidden" 
              accept="image/*"
              multiple
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">Document Title</label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Enter document title..."
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-slate-700">
                  Pages ({files.length})
                </label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add More
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                {previews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img 
                      src={preview} 
                      alt={`Page ${index + 1}`} 
                      className="w-full h-32 object-cover rounded-lg border border-slate-200 shadow-sm" 
                    />
                    <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                      {index + 1}
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              
              <input 
                ref={fileInputRef}
                type="file" 
                className="hidden" 
                accept="image/*"
                multiple
                onChange={handleFileChange}
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}
            
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={handleProcess} 
                isLoading={isProcessing} 
                className="flex-1"
                disabled={files.length === 0 || !title}
              >
                {isProcessing ? processingStatus || 'Processing...' : 'Convert to Audiobook'}
              </Button>
            </div>
            
            {isProcessing && processingStatus && (
              <p className="text-center text-xs text-slate-400">
                {processingStatus}
              </p>
            )}
          </div>
        )}
      </div>
      
      <div className="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
        <h4 className="text-sm font-semibold text-indigo-900 mb-2 flex items-center">
          <FileText className="w-4 h-4 mr-2" />
          Tips for best results
        </h4>
        <ul className="text-xs text-indigo-700 space-y-1 list-disc pl-4">
          <li>Ensure the image is well-lit and text is clear.</li>
          <li>Avoid shadows covering the text.</li>
          <li>Crop the image to the document edges if possible.</li>
        </ul>
      </div>
    </div>
  );
};