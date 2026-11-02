/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — SINGLE-METHOD GOOGLE ADMIN LOGIN MODAL
 * SYNCROZZ ENGINEERING STANDARD
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, X, ShieldAlert, Loader2, Sparkles, ExternalLink, Copy, Check } from 'lucide-react';
import { verifyGoogleAdmin, MASTER_ADMIN_EMAIL } from '../utils/adminAuthService';
import { signInWithGoogle, signOutAdmin } from '../config/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { AuthorizedAdmin } from '../types';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (admin: AuthorizedAdmin) => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [errorMessage, setErrorMessage] = useState('');
  const [shake, setShake] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!isOpen) {
      setErrorMessage('');
      setShake(false);
      setIsGoogleLoading(false);
      setUnauthorizedDomain(null);
      setPopupBlocked(false);
      setCopied(false);
      return;
    }

    setErrorMessage('');
    setShake(false);
    setIsGoogleLoading(false);
    setUnauthorizedDomain(null);
    setPopupBlocked(false);
    setCopied(false);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const triggerError = (msg: string) => {
    setErrorMessage(msg);
    setShake(true);
    setTimeout(() => {
      setShake(false);
    }, 450);
  };

  // Google Authentication Handler: Strictly accepts only verified khaikerr@gmail.com
  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      setErrorMessage('');
      setUnauthorizedDomain(null);
      setPopupBlocked(false);

      const user = await signInWithGoogle();

      const result = verifyGoogleAdmin({
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        uid: user.uid,
        emailVerified: user.emailVerified,
      });

      if (result.isValid && result.admin) {
        setErrorMessage('');
        onSuccessRef.current(result.admin);
      } else {
        // Sign out unauthorized account immediately
        await signOutAdmin();
        triggerError(result.message || `Akaun tidak sah. Hanya ${MASTER_ADMIN_EMAIL} yang dibenarkan.`);
      }
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      const errStr = `${err?.code || ''} ${err?.message || ''} ${String(err)}`;

      if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMessage('Tetingkap log masuk Google ditutup sebelum selesai.');
      } else if (err?.code === 'auth/cancelled-popup-request') {
        // Multiple clicks
      } else if (err?.code === 'auth/popup-blocked') {
        setPopupBlocked(true);
        setErrorMessage('Pelayar anda menyekat pembukaan pop-up log masuk Google.');
      } else if (
        err?.code === 'auth/unauthorized-domain' ||
        errStr.includes('unauthorized-domain') ||
        errStr.includes('_validateOrigin')
      ) {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'domain semasa';
        setUnauthorizedDomain(host);
        setErrorMessage(`Domain aplikasi (${host}) belum dibenarkan dalam Firebase Authentication projek ${firebaseConfig.projectId}.`);
      } else if (err?.code === 'auth/api-key-not-valid' || errStr.includes('api-key-not-valid')) {
        triggerError('Kunci API Firebase tidak sah. Sila semak konfigurasi projek.');
      } else {
        triggerError(err?.message || 'Gagal log masuk dengan akaun Google. Sila cuba lagi.');
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className={`relative w-full max-w-md bg-white rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-100 text-center space-y-6 ${
            shake ? 'animate-shake' : ''
          }`}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header Icon */}
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 text-white rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-200">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Satu Kaedah Sahaja</span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Akses Master Administrator
            </h3>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Log masuk rasmi Kolej Profesional MARA Bandar Penawar
            </p>
          </div>

          {/* Identity Notification */}
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-left space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-600">Master Administrator Diiktiraf:</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Tunggal</span>
            </div>
            <p className="font-mono text-xs font-bold text-indigo-700 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 truncate select-all">
              {MASTER_ADMIN_EMAIL}
            </p>
            <p className="text-[10px] text-slate-500 leading-normal">
              Hanya akaun Google dengan emel di atas yang layak menguruskan direktori staf dan jawatankuasa.
            </p>
          </div>

          {/* Error Message Box */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 text-left flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          {/* Popup Blocked Guidance */}
          {popupBlocked && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-left text-xs text-amber-800 space-y-1">
              <p className="font-bold text-amber-900">Pop-up disekat oleh pelayar</p>
              <p className="text-[11px]">Sila benarkan tetingkap pop-up untuk laman ini pada bar alamat pelayar anda, kemudian klik butang log masuk sekali lagi.</p>
            </div>
          )}

          {/* Unauthorized Domain Guidance */}
          {unauthorizedDomain && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-left space-y-2 text-xs text-amber-900">
              <p className="font-bold">Domain Hos Belum Dibenarkan</p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Domain aplikasi hos perlu didaftarkan di <strong>Authorized Domains</strong> Firebase Authentication:
              </p>
              <div className="flex items-center gap-2 p-1.5 bg-white rounded-xl border border-amber-200">
                <code className="text-[10px] font-mono text-slate-700 flex-1 truncate px-1 select-all">
                  {unauthorizedDomain}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(unauthorizedDomain);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Disalin' : 'Salin'}</span>
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
            </div>
          )}

          {/* Single Action: Continue with Google */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
              className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 text-slate-900 active:scale-[0.98] rounded-2xl border-2 border-slate-200 hover:border-indigo-500 font-extrabold text-sm shadow-sm transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isGoogleLoading ? (
                <>
                  <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
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
                  <span>Teruskan dengan Google</span>
                </>
              )}
            </button>

            <p className="text-[11px] text-slate-400">
              Pengesahan identiti disahkan terus melalui Google Firebase Auth
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
