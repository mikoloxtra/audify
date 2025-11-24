import React, { useState, useRef } from 'react';
import { User, ProcessingStatus, VoiceGender } from '../types';
import { processDocument } from '../services/processingService';
import { Button } from './Button';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle, Loader2, Plus, X as XIcon } from 'lucide-react';
import { MAX_FILE_SIZE } from '../services/storageService';

interface ScannerProps {
  user: User;
  voiceGender: VoiceGender;
  onComplete: () => void;
  onCancel: () => void;
}

export const Scanner: React.FC<ScannerProps> = ({ user, voiceGender, onComplete, onCancel }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  
  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  
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
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    
    // Revoke object URL to free memory
    URL.revokeObjectURL(previews[index]);
    
    setFiles(newFiles);
    setPreviews(newPreviews);
  };

  const handleProcess = async () => {
    if (files.length === 0 || !title.trim()) {
      setError('Please select at least one image and enter a title.');
      return;
    }

    setIsProcessing(true);
    setError('');
    setProcessingStatus({
      stage: 'uploading',
      progress: 0,
      message: 'Starting...',
    });

    try {
      await processDocument(
        user.id,
        files,
        title.trim(),
        voiceGender,
        (status) => {
          setProcessingStatus(status);
        }
      );

      // Success! Clean up and redirect
      previews.forEach(url => URL.revokeObjectURL(url));
      onComplete();
    } catch (err: any) {
      console.error('[Scanner] Processing error:', err);
      setError(err.message || 'Failed to process document. Please try again.');
      setProcessingStatus({
        stage: 'error',
        progress: 0,
        message: err.message || 'Processing failed',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStageLabel = (stage: string): string => {
    switch (stage) {
      case 'uploading': return 'Uploading Images';
      case 'ocr': return 'Extracting Text (OCR)';
      case 'audio': return 'Generating Audio';
      case 'saving': return 'Saving Audiobook';
      case 'complete': return 'Complete';
      case 'error': return 'Error';
      default: return 'Processing';
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Create Audiobook</h2>
        <button 
          onClick={onCancel} 
          className="text-slate-500 hover:text-slate-700"
          disabled={isProcessing}
        >
          <XCircle className="w-6 h-6" />
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-8">
        {/* File Upload Section */}
        {!isProcessing && files.length === 0 && (
          <div 
            className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center hover:bg-slate-50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">Upload Document Images</h3>
            <p className="text-slate-500 text-sm mb-4">
              Select one or multiple images (PNG, JPG up to 10MB each)
            </p>
            <Button 
              size="sm" 
              variant="secondary" 
              onClick={(e) => { 
                e.stopPropagation(); 
                fileInputRef.current?.click(); 
              }}
            >
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
        )}

        {/* Files Selected - Show Preview & Title Input */}
        {!isProcessing && files.length > 0 && (
          <div className="space-y-6">
            {/* Title Input */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Audiobook Title
              </label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Enter audiobook title..."
                disabled={isProcessing}
              />
            </div>

            {/* Image Previews */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-slate-700">
                  Images ({files.length})
                </label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  disabled={isProcessing}
                >
                  <Plus className="w-3 h-3" /> Add More
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                {previews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img 
                      src={preview} 
                      alt={`Image ${index + 1}`} 
                      className="w-full h-32 object-cover rounded-lg border border-slate-200 shadow-sm" 
                    />
                    <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                      {index + 1}
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      disabled={isProcessing}
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

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}
            
            {/* Process Button */}
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={handleProcess} 
                isLoading={isProcessing} 
                className="flex-1"
                disabled={files.length === 0 || !title.trim() || isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Create Audiobook'}
              </Button>
            </div>
          </div>
        )}

        {/* Processing State */}
        {isProcessing && processingStatus && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                {processingStatus.stage === 'complete' ? (
                  <CheckCircle className="w-8 h-8 text-green-600" />
                ) : processingStatus.stage === 'error' ? (
                  <XCircle className="w-8 h-8 text-red-600" />
                ) : (
                  <Loader2 className="w-8 h-8 animate-spin" />
                )}
              </div>
              
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {getStageLabel(processingStatus.stage)}
              </h3>
              
              <p className="text-sm text-slate-600 mb-4">
                {processingStatus.message}
              </p>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200 rounded-full h-2 mb-2">
                <div 
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${processingStatus.progress}%` }}
                />
              </div>
              
              <p className="text-xs text-slate-500">
                {Math.round(processingStatus.progress)}%
                {processingStatus.currentStep && processingStatus.totalSteps && (
                  <span> • Step {processingStatus.currentStep} of {processingStatus.totalSteps}</span>
                )}
              </p>
            </div>

            {/* Image Grid (smaller during processing) */}
            <div className="grid grid-cols-4 gap-2">
              {previews.map((preview, index) => (
                <img 
                  key={index}
                  src={preview} 
                  alt={`Image ${index + 1}`} 
                  className="w-full h-20 object-cover rounded-lg border border-slate-200 opacity-50" 
                />
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Tips Section */}
      {!isProcessing && (
        <div className="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
          <h4 className="text-sm font-semibold text-indigo-900 mb-2 flex items-center">
            <FileText className="w-4 h-4 mr-2" />
            Tips for best results
          </h4>
          <ul className="text-xs text-indigo-700 space-y-1 list-disc pl-4">
            <li>Ensure images are well-lit and text is clear</li>
            <li>Avoid shadows covering the text</li>
            <li>Crop images to document edges if possible</li>
            <li>Upload pages in the correct order</li>
          </ul>
        </div>
      )}
    </div>
  );
};
