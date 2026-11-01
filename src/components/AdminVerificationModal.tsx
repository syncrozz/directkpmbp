/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  X, 
  KeyRound, 
  Mail, 
  User, 
  CheckCircle2, 
  ShieldAlert, 
  Sparkles,
  Lock,
  ArrowRight
} from 'lucide-react';
import { getInvitationByToken, verifyAdminInvitationToken } from '../utils/adminAuthService';
import { AuthorizedAdmin, AdminInvitation } from '../types';

interface AdminVerificationModalProps {
  isOpen: boolean;
  token: string | null;
  onClose: () => void;
  onVerified: (admin: AuthorizedAdmin) => void;
}

export const AdminVerificationModal: React.FC<AdminVerificationModalProps> = ({
  isOpen,
  token,
  onClose,
  onVerified,
}) => {
  const [invite, setInvite] = useState<AdminInvitation | null>(null);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [verifiedAdmin, setVerifiedAdmin] = useState<AuthorizedAdmin | null>(null);

  useEffect(() => {
    if (isOpen && token) {
      const found = getInvitationByToken(token);
      setInvite(found);
      if (found) {
        setName(found.name || '');
      }
      setPin('');
      setConfirmPin('');
      setErrorMessage('');
      setIsSuccess(false);
    }
  }, [isOpen, token]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setErrorMessage('Token jemputan tidak ditemui.');
      return;
    }

    const cleanPin = pin.replace(/\D/g, '').slice(0, 4);
    const cleanConfirm = confirmPin.replace(/\D/g, '').slice(0, 4);

    if (cleanPin.length !== 4) {
      setErrorMessage('Sila tetapkan 4 digit PIN keselamatan.');
      return;
    }

    if (cleanPin !== cleanConfirm) {
      setErrorMessage('PIN dan Pengesahan PIN tidak sepadan.');
      return;
    }

    const res = verifyAdminInvitationToken(token, cleanPin, name);
    if (res.success && res.admin) {
      setIsSuccess(true);
      setVerifiedAdmin(res.admin);
      setErrorMessage('');
      // Bersihkan query param url ?invite=
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        window.history.replaceState({}, document.title, url.toString());
      }
    } else {
      setErrorMessage(res.message);
    }
  };

  const handleFinish = () => {
    if (verifiedAdmin) {
      onVerified(verifiedAdmin);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 text-left space-y-5"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Modal Header */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-1">
                <Sparkles className="w-3 h-3" />
                <span>Otorisasi Pegawai</span>
              </div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight leading-tight">
                Pengesahan Admin Level 2
              </h3>
            </div>
          </div>

          {/* Case 1: Token Not Found / Invalid */}
          {!invite && !isSuccess && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3 text-center">
              <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto" />
              <h4 className="font-extrabold text-sm text-rose-900">Pautan Jemputan Tidak Sah</h4>
              <p className="text-xs text-rose-700 leading-relaxed">
                Pautan pengesahan ini tidak dijumpai, telah digunakan, atau telah dibatalkan oleh Master Administrator. Sila hubungi Master Admin untuk mendapatkan pautan jemputan baharu.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-5 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 cursor-pointer"
              >
                Kembali ke Direktori
              </button>
            </div>
          )}

          {/* Case 2: Invitation Verified Successfully */}
          {isSuccess && verifiedAdmin && (
            <div className="space-y-4 text-center py-2">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-black text-slate-900">
                  Akaun Admin Level 2 Telah Aktif!
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Tahniah <strong>{verifiedAdmin.name}</strong> ({verifiedAdmin.email}). Anda kini mempunyai kuasa akses rasmi untuk menyemak maklumat terhad termasuk <strong>No. Kad Pengenalan (IC)</strong> kakitangan.
                </p>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-left space-y-1 text-xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                  <span>Peranan Anda:</span>
                  <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-md text-[10px] font-black uppercase">
                    Admin Level 2
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  PIN 4-digit anda telah disimpan. Anda boleh menggunakan PIN ini untuk log masuk pada bila-bila masa.
                </p>
              </div>

              <button
                type="button"
                onClick={handleFinish}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-700 hover:to-violet-800 text-white rounded-2xl text-xs font-black shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <span>Masuk ke Direktori (Mod Admin Aktif)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Case 3: Form to Verify & Set PIN */}
          {invite && !isSuccess && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Alamat Emel Dijemput:
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200">
                    Menunggu Pengesahan
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <Mail className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="font-mono">{invite.email}</span>
                </div>
                <p className="text-[10px] text-slate-500 pt-0.5">
                  Dijemput oleh: <strong>{invite.invitedBy || 'Master Administrator'}</strong>
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Nama Penuh Pegawai:</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama penuh anda"
                    required
                    className="w-full px-3.5 py-2.5 text-xs font-medium rounded-xl border border-slate-200 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Tetapkan PIN (4 Digit):</span>
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="••••"
                      required
                      className="w-full px-3 py-2.5 text-center text-sm font-extrabold tracking-widest rounded-xl border border-slate-200 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Sahkan PIN (4 Digit):</span>
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="••••"
                      required
                      className="w-full px-3 py-2.5 text-center text-sm font-extrabold tracking-widest rounded-xl border border-slate-200 bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {errorMessage && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="p-3 bg-blue-50/80 border border-blue-200/80 rounded-2xl text-[11px] text-blue-900 leading-relaxed font-medium">
                <strong>Akses Maklumat Terhad:</strong> Pengesahan akaun ini memberikan anda kebenaran rasmi sebagai Admin Level 2 untuk melihat maklumat terhad termasuk <strong>No. Kad Pengenalan (IC)</strong> kakitangan kolej.
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-700 hover:to-violet-800 text-white rounded-2xl text-xs font-black shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Sahkan & Aktifkan Akaun Admin Level 2</span>
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
