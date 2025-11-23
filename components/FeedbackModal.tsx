import React, { useState } from 'react';
import { Button } from './Button';
import { X, MessageSquare } from 'lucide-react';

export const FeedbackModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [sent, setSent] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Simulate sending
        setTimeout(() => {
            setSent(true);
            setTimeout(onClose, 2000);
        }, 500);
    };

    if (sent) {
        return (
             <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <MessageSquare className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">Thank You!</h3>
                    <p className="text-slate-500">Your feedback helps us improve Audify.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                 <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                     <h3 className="font-bold text-slate-900">Send Feedback</h3>
                     <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-slate-600"/></button>
                 </div>
                 <form onSubmit={handleSubmit} className="p-6 space-y-4">
                     <div>
                         <label className="block text-sm font-medium text-slate-700 mb-2">Rating</label>
                         <div className="flex gap-2">
                             {[1,2,3,4,5].map(r => (
                                 <button 
                                    key={r}
                                    type="button"
                                    onClick={() => setRating(r)}
                                    className={`w-10 h-10 rounded-lg font-bold transition-all ${rating >= r ? 'bg-yellow-400 text-yellow-900' : 'bg-slate-100 text-slate-400'}`}
                                 >
                                     {r}
                                 </button>
                             ))}
                         </div>
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-slate-700 mb-2">Comments</label>
                         <textarea 
                            required
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full h-24 p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                            placeholder="Tell us what you think..."
                         />
                     </div>
                     <Button type="submit" className="w-full">Submit Feedback</Button>
                 </form>
            </div>
        </div>
    );
}