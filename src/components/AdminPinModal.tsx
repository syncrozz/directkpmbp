/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, X, KeyRound, ShieldAlert, Mail, Hash, ShieldCheck, CheckCircle2, Loader2, Sparkles, Copy, ExternalLink, Check, RotateCcw } from 'lucide-react';
import { verifyAdminCredentials, verifyGoogleAdmin, isDevelopmentEnvironment, MASTER_ADMIN_PIN, MASTER_ADMIN_EMAILS } from '../utils/adminAuthService';
import { signInWithGoogle, signOutAdmin } from '../config/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { AuthorizedAdmin } from '../types';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (admin?: AuthorizedAdmin) => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [authTab, setAuthTab] = useState<'google' | 'maraEmail' | 'masterPin'>('google');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [masterPin, setMasterPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [shake, setShake] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [copied, setCopied] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const masterPinInputRef = useRef<HTMLInputElement>(null);

  // Keep latest callback references
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPin('');
      setMasterPin('');
      setErrorMessage('');
      setShake(false);
      setIsGoogleLoading(false);
      setUnauthorizedDomain(null);
      setPopupBlocked(false);
      setCopied(false);
      return;
    }

    setEmail('');
    setPin('');
    setMasterPin('');
    setErrorMessage('');
    setShake(false);
    setIsGoogleLoading(false);
    setUnauthorizedDomain(null);
    setPopupBlocked(false);
    setCopied(false);
    setAuthTab('google');

    const focusTimer = setTimeout(() => {
      if (authTab === 'masterPin') {
        masterPinInputRef.current?.focus();
      } else if (authTab === 'maraEmail') {
        emailInputRef.current?.focus();
      }
    }, 100);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, authTab]);

  if (!isOpen) return null;

  const triggerError = (msg: string) => {
    setErrorMessage(msg);
    setShake(true);
    setTimeout(() => {
      setShake(false);
    }, 450);
  };

  // Google Authentication Handler for Master Admin & Authorized Admins
  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      setErrorMessage('');
      const user = await signInWithGoogle();
      
      const result = verifyGoogleAdmin({
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        uid: user.uid,
      });

      if (result.isValid && result.admin) {
        setErrorMessage('');
        onSuccessRef.current(result.admin);
      } else {
        await signOutAdmin();
        triggerError(result.message || 'Akaun Google tidak mempunyai kebenaran sebagai Master Admin.');
      }
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMessage('Tetingkap log masuk Google ditutup sebelum selesai.');
      } else if (err?.code === 'auth/cancelled-popup-request') {
        // multiple popup clicks
      } else if (err?.code === 'auth/popup-blocked') {
        setPopupBlocked(true);
        setErrorMessage('Pelayar anda telah menyekat tetingkap timbul (pop-up) Google Sign-In.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'domain semasa';
        setUnauthorizedDomain(host);
        setErrorMessage(`Domain aplikasi (${host}) belum dibenarkan (authorized domain) dalam Firebase Authentication projek ${firebaseConfig.projectId}.`);
      } else {
        triggerError(err?.message || 'Gagal log masuk dengan akaun Google. Sila cuba lagi.');
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Submit via MARA Email & 4-digit IC PIN
  const handleMaraEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      triggerError('Sila masukkan alamat emel MARA anda.');
      emailInputRef.current?.focus();
      return;
    }

    const cleanPin = pin.replace(/\D/g, '').slice(-4);
    if (cleanPin.length !== 4) {
      triggerError('Sila masukkan 4 digit terakhir nombor IC anda.');
      return;
    }

    const result = verifyAdminCredentials(email, cleanPin);
    if (result.isValid) {
      setErrorMessage('');
      onSuccessRef.current(result.admin);
    } else {
      triggerError(result.message || 'Kombinasi emel MARA dan 4-digit PIN IC tidak sah!');
    }
  };

  // Submit via Development PIN
  const handleMasterPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (masterPin.length !== 4) return;

    const result = verifyAdminCredentials('', masterPin);
    if (result.isValid && result.admin) {
      setErrorMessage('');
      onSuccessRef.current(result.admin);
    } else {
      triggerError(result.message || 'PIN Pembangunan tidak sah!');
      setMasterPin('');
      setTimeout(() => {
        masterPinInputRef.current?.focus();
      }, 450);
    }
  };

  const handleMasterPinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
    setMasterPin(val);
    if (errorMessage) setErrorMessage('');

    if (val.length === 4) {
      const result = verifyAdminCredentials('', val);
      if (result.isValid && result.admin) {
        setErrorMessage('');
        onSuccessRef.current(result.admin);
      } else {
        triggerError(result.message || 'PIN Pembangunan tidak sah!');
        setMasterPin('');
      }
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className={`relative w-full max-w-md bg-white rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-100 text-center space-y-5 ${
            shake ? 'animate-shake' : ''
          }`}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal PIN"
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header Icon */}
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 via-violet-600 to-indigo-700 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-200">
            <Lock className="w-7 h-7" />
          </div>

          <div>
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Akses Master Admin
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
              Log masuk akaun Master Admin atau pilih kaedah pengesahan rasmi.
            </p>
          </div>

          {/* Auth Method Switcher Tabs */}
          <div className={`grid ${isDevelopmentEnvironment() ? 'grid-cols-3' : 'grid-cols-2'} gap-1 p-1 bg-slate-100 rounded-2xl text-[11px]`}>
            <button
              type="button"
              onClick={() => {
                setAuthTab('google');
                setErrorMessage('');
              }}
              className={`py-2 px-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                authTab === 'google'
                  ? 'bg-white text-indigo-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {/* Google G logo small */}
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Google</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthTab('maraEmail');
                setErrorMessage('');
              }}
              className={`py-2 px-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                authTab === 'maraEmail'
                  ? 'bg-white text-indigo-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>Emel MARA</span>
            </button>

            {isDevelopmentEnvironment() && (
              <button
                type="button"
                onClick={() => {
                  setAuthTab('masterPin');
                  setErrorMessage('');
                }}
                className={`py-2 px-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  authTab === 'masterPin'
                    ? 'bg-white text-indigo-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Dev PIN</span>
              </button>
            )}
          </div>

          {/* Tab 1: Google Auth (Primary / Master Admin) */}
          {authTab === 'google' && (
            <div className="space-y-4 pt-1">
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl text-left space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-600 text-white shadow-2xs">
                    <Sparkles className="w-3 h-3" /> Master Admin
                  </span>
                  <span className="text-xs font-bold text-slate-800">Google Authentication</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  Akaun Google master diiktiraf:{' '}
                  <span className="font-mono font-bold text-indigo-700 bg-white px-1.5 py-0.5 rounded border border-indigo-200">
                    khaikerr@gmail.com
                  </span>
                </p>
              </div>

              {errorMessage && !unauthorizedDomain && !popupBlocked && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 text-left flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span className="leading-snug">{errorMessage}</span>
                </div>
              )}

              {popupBlocked && (
                <div className="p-3.5 bg-amber-50/95 border border-amber-200 rounded-2xl text-left space-y-2.5">
                  <div className="flex items-center gap-1.5 text-amber-900 font-extrabold text-xs">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Tetingkap Pop-Up Disekat Oleh Pelayar</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                    Pelayar anda menyekat pembukaan pop-up Google Sign-In. Sila benarkan pop-up bagi laman ini pada bar alamat pelayar, kemudian klik Cuba Semula di bawah:
                  </p>

                  <div className="pt-2 border-t border-amber-200 space-y-2">
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={isGoogleLoading}
                      className="w-full py-2.5 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Cuba Semula Log Masuk Google</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('maraEmail');
                        setErrorMessage('');
                      }}
                      className="w-full py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Mail className="w-3 h-3 text-indigo-600" />
                      <span>Gunakan Pengesahan Emel MARA & PIN</span>
                    </button>
                  </div>
                </div>
              )}

              {unauthorizedDomain && (
                <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-2xl text-left space-y-2.5">
                  <div className="flex items-center gap-1.5 text-amber-900 font-extrabold text-xs">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Perlu Kebenaran Domain di Firebase Auth</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                    Google Auth memerlukan domain host ditambah ke <strong>Authorized Domains</strong> di Firebase Console:
                  </p>
                  
                  <div className="flex items-center gap-2 p-1.5 bg-white rounded-xl border border-amber-200/80 shadow-2xs">
                    <code className="text-[10px] font-mono text-slate-700 flex-1 truncate px-1 select-all">
                      {unauthorizedDomain}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        if (unauthorizedDomain) {
                          navigator.clipboard.writeText(unauthorizedDomain);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }
                      }}
                      className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Disalin!' : 'Salin Domain'}</span>
                    </button>
                  </div>

                  <a
                    href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-bold underline"
                  >
                    <span>Buka Tetapan Firebase Console</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <div className="pt-2 border-t border-amber-200">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('maraEmail');
                        setErrorMessage('');
                      }}
                      className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                    >
                      <Mail className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Log Masuk Menggunakan Emel MARA & PIN</span>
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
                className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 text-slate-800 active:scale-[0.98] rounded-2xl border-2 border-slate-200 hover:border-indigo-400 font-extrabold text-xs shadow-xs transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed group"
              >
                {isGoogleLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                    <span>Mengesahkan Akaun Google...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>Log Masuk dengan Google</span>
                  </>
                )}
              </button>

              <p className="text-[10px] text-slate-400">
                Log masuk selamat menggunakan Firebase Auth Google Provider
              </p>
            </div>
          )}

          {/* Tab 2: MARA Email & IC PIN Login */}
          {authTab === 'maraEmail' && (
            <form onSubmit={handleMaraEmailSubmit} className="space-y-3.5 text-left pt-1">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Alamat Emel MARA:</span>
                </label>
                <input
                  ref={emailInputRef}
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="emel@mara.gov.my"
                  className="w-full px-3.5 py-2.5 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5 text-indigo-600" />
                    <span>PIN Keselamatan (4 Digit Terakhir No. IC):</span>
                  </label>
                </div>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="••••"
                  className="w-full px-3.5 py-2.5 text-center text-base tracking-widest font-extrabold rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  required
                />
              </div>

              {errorMessage && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98] text-white rounded-xl text-xs font-extrabold shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Log Masuk Admin Mode</span>
              </button>
            </form>
          )}

          {/* Tab 3: Development PIN Login (Dev only) */}
          {authTab === 'masterPin' && isDevelopmentEnvironment() && (
            <form onSubmit={handleMasterPinSubmit} className="space-y-4 pt-1">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-900 font-medium text-left">
                <strong>Mod Pembangunan (Dev Only):</strong> PIN ini hanya aktif dalam persekitaran pembangunan tempatan dan tidak memberikan identiti Master Admin.
              </div>

              <div className="space-y-2.5">
                <input
                  ref={masterPinInputRef}
                  type="password"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={masterPin}
                  onChange={handleMasterPinChange}
                  placeholder="••••"
                  className={`w-full px-4 py-3.5 text-center text-lg tracking-widest font-extrabold rounded-2xl border-2 transition-all outline-hidden ${
                    errorMessage
                      ? 'border-rose-400 bg-rose-50/50 text-rose-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-200'
                      : 'border-slate-200 bg-slate-50/80 text-slate-900 placeholder:text-slate-400 placeholder:tracking-normal placeholder:font-semibold placeholder:text-xs focus:border-indigo-600 focus:bg-white focus:ring-3 focus:ring-indigo-100'
                  }`}
                />

                {errorMessage && (
                  <p className="text-xs font-bold text-rose-600 flex items-center justify-center gap-1.5 pt-1">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={masterPin.length < 4}
                className={`w-full py-3.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 active:scale-[0.98] text-white rounded-2xl text-xs font-extrabold shadow-md shadow-amber-200 transition-all flex items-center justify-center gap-2 ${
                  masterPin.length < 4 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <KeyRound className="w-4 h-4" />
                <span>Sahkan PIN Pembangunan</span>
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
