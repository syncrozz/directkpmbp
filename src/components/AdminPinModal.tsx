/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, X, KeyRound, ShieldAlert, Mail, Hash, ShieldCheck } from 'lucide-react';
import { verifyAdminCredentials, MASTER_ADMIN_PIN } from '../utils/adminAuthService';
import { AuthorizedAdmin } from '../types';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (admin?: AuthorizedAdmin) => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [authTab, setAuthTab] = useState<'maraEmail' | 'masterPin'>('masterPin');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [masterPin, setMasterPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [shake, setShake] = useState(false);

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
      return;
    }

    setEmail('');
    setPin('');
    setMasterPin('');
    setErrorMessage('');
    setShake(false);
    setAuthTab('masterPin');

    const focusTimer = setTimeout(() => {
      if (authTab === 'masterPin') {
        masterPinInputRef.current?.focus();
      } else {
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

  // Submit via Master PIN
  const handleMasterPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (masterPin.length !== 4) return;

    if (masterPin === MASTER_ADMIN_PIN) {
      setErrorMessage('');
      onSuccessRef.current({
        id: 'master-admin',
        email: 'master@kpmbp.edu.my',
        pin: MASTER_ADMIN_PIN,
        name: 'Master Admin',
        role: 'Master Admin',
      });
    } else {
      triggerError('PIN Master Admin tidak sah!');
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
      if (val === MASTER_ADMIN_PIN) {
        onSuccessRef.current({
          id: 'master-admin',
          email: 'master@kpmbp.edu.my',
          pin: MASTER_ADMIN_PIN,
          name: 'Master Admin',
          role: 'Master Admin',
        });
      } else {
        triggerError('PIN Master Admin tidak sah!');
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
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-violet-700 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-200">
            <Lock className="w-7 h-7" />
          </div>

          <div>
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Akses Admin Mode
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
              Pilih kaedah pengesahan untuk melihat data sensitif (daerah asal, tahun lahir & no. plat kenderaan).
            </p>
          </div>

          {/* Auth Method Switcher Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setAuthTab('maraEmail');
                setErrorMessage('');
              }}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                authTab === 'maraEmail'
                  ? 'bg-white text-indigo-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail className="w-3.5 h-3.5 text-indigo-600" />
              <span>Emel MARA & PIN IC</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab('masterPin');
                setErrorMessage('');
              }}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                authTab === 'masterPin'
                  ? 'bg-white text-indigo-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
              <span>Master PIN</span>
            </button>
          </div>

          {/* Tab 1: MARA Email & IC PIN Login */}
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

          {/* Tab 2: Master PIN Login */}
          {authTab === 'masterPin' && (
            <form onSubmit={handleMasterPinSubmit} className="space-y-4 pt-1">
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
                className={`w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98] text-white rounded-2xl text-xs font-extrabold shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 ${
                  masterPin.length < 4 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <KeyRound className="w-4 h-4" />
                <span>Sahkan PIN Master</span>
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
