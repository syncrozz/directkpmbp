import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';
import { defineConfig } from 'vite';

function getGitRemarkVersion(): string {
  try {
    let msg = process.env.VERCEL_GIT_COMMIT_MESSAGE || '';
    if (!msg) {
      msg = execSync('git log -1 --pretty=%B', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    }
    if (!msg) return '';

    const regex1 = /adjustment\s+([0-9]{1,2}\.[0-9]{1,2}(?:\s+[vV][0-9]+)?)/i;
    const match1 = msg.match(regex1);
    if (match1 && match1[1]) {
      return match1[1].trim();
    }

    const regex2 = /(?:versi|version)\s+([0-9]{1,2}\.[0-9]{1,2}(?:\s+[vV][0-9]+)?)/i;
    const match2 = msg.match(regex2);
    if (match2 && match2[1]) {
      return match2[1].trim();
    }

    return '';
  } catch {
    return '';
  }
}

function getShortCommitHash(): string {
  try {
    const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
    if (vercelSha) return vercelSha;
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    return hash.trim();
  } catch {
    return '';
  }
}

export default defineConfig(() => {
  return {
    define: {
      __GIT_APP_VERSION__: JSON.stringify(getGitRemarkVersion()),
      __GIT_COMMIT_HASH__: JSON.stringify(getShortCommitHash()),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
