import React, { useState } from 'react';
import { loginWithEmail, registerWithEmail, loginWithGoogle } from '../services/authService';
import { User } from '../types';
import { Button } from './Button';
import { BookOpen, Lock, Mail, User as UserIcon, Loader2, Chrome } from 'lucide-react';

interface AuthProps {
  onLogin: (user: User) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    if (!email || !password) {
      setError('Email and password are required');
      setIsSubmitting(false);
      return;
    }

    try {
      let user: User;
      if (isRegistering) {
        user = await registerWithEmail(email, password, displayName);
      } else {
        user = await loginWithEmail(email, password);
      }
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const user = await loginWithGoogle();
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-indigo-600 p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-sm">
             <BookOpen className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Audify</h1>
          <p className="text-indigo-100">Turn documents into audiobooks instantly.</p>
        </div>

        <div className="p-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">
            {isRegistering ? 'Create an Account' : 'Welcome Back'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegistering && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    placeholder="John Doe"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="john@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <Button type="submit" className="w-full py-3 text-lg shadow-md shadow-indigo-200" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isRegistering ? 'Creating account...' : 'Signing in...'}
                </span>
              ) : (
                isRegistering ? 'Sign Up' : 'Log In'
              )}
            </Button>
          </form>

          <div className="mt-4">
            <Button
              variant="secondary"
              className="w-full flex items-center justify-center gap-2"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
              type="button"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Chrome className="w-5 h-5" />
              )}
              Continue with Google
            </Button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
            >
              {isRegistering ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
      <p className="mt-8 text-slate-400 text-xs text-center max-w-xs">
        By continuing, you agree to our Terms of Service and Privacy Policy. Your data is encrypted locally.
      </p>
    </div>
  );
};