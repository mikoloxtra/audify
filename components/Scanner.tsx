import React, { useState, useRef } from 'react';
import { extractTextFromImage } from '../services/geminiService';
import { User, Document } from '../types';
import { saveDocument, uploadSourceAsset, MAX_FILE_SIZE } from '../services/storageService';
import { Button } from './Button';
import { v4 as uuidv4 } from 'uuid';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        setError('Please select a valid image file (JPG, PNG).');
        return;
      }
      if (selectedFile.size > MAX_FILE_SIZE) {
        setError(`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit. Please choose a smaller image.`);
        return;
      }
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setTitle(selectedFile.name.split('.')[0]);
      setError('');
    }
  };

  const handleProcess = async () => {
    if (!file || !title) return;

    setIsProcessing(true);
    setError('');
    console.log('[Scanner] Starting OCR pipeline for', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    try {
      const base64Data = await fileToBase64(file);
      console.log('[Scanner] Converted file to base64 (length)', base64Data.length);
      const text = await extractTextFromImage(base64Data, file.type);
      console.log('[Scanner] OCR response received');

      if (!text || text.trim().length === 0) {
        throw new Error('No text identified in the document.');
      }

      let paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
      console.log('[Scanner] Initial paragraph count', paragraphs.length);

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

      console.log('[Scanner] Paragraph count after normalization', paragraphs.length);

      const { storagePath, downloadURL } = await uploadSourceAsset(user.id, file);
      console.log('[Scanner] File uploaded to storage', { storagePath, downloadURL });

      const newDoc: Document = {
        id: uuidv4(),
        userId: user.id,
        title: title,
        content: text,
        paragraphs: paragraphs,
        progressIndex: 0,
        createdAt: new Date().toISOString(),
        sourceImagePath: storagePath,
        sourceImageUrl: downloadURL,
        notes: [],
      };

      await saveDocument(newDoc);
      console.log('[Scanner] Document persisted to Firestore', { documentId: newDoc.id });
      onComplete();
    } catch (err: any) {
      console.error('[Scanner] Failed to process document', err);
      setError(err.message || 'Failed to process document.');
    } finally {
      setIsProcessing(false);
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
        {!preview ? (
          <div 
            className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center hover:bg-slate-50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">Upload a Document Image</h3>
            <p className="text-slate-500 text-sm mb-4">PNG, JPG up to 10MB</p>
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              Select File
            </Button>
            <input 
              ref={fileInputRef}
              type="file" 
              className="hidden" 
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
               <img src={preview} alt="Preview" className="w-24 h-32 object-cover rounded-lg border border-slate-200 shadow-sm" />
               <div className="flex-1">
                 <label className="block text-sm font-medium text-slate-700 mb-1">Document Title</label>
                 <input 
                   type="text" 
                   value={title}
                   onChange={(e) => setTitle(e.target.value)}
                   className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                 />
                 <p className="text-xs text-slate-500 mt-2 flex items-center">
                   <CheckCircle className="w-3 h-3 mr-1 text-green-500" /> 
                   Image loaded successfully
                 </p>
                 <button 
                   onClick={() => { setPreview(null); setFile(null); }}
                   className="text-xs text-red-500 mt-2 hover:underline"
                 >
                   Remove and Upload New
                 </button>
               </div>
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
              >
                {isProcessing ? 'Scanning with Gemini AI...' : 'Convert to Audiobook'}
              </Button>
            </div>
            
            {isProcessing && (
              <p className="text-center text-xs text-slate-400">
                Extracting text and analyzing structure...
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