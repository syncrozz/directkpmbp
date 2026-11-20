# DIRECTKPMBP — Homepage Visual Snapshot Engine (SES v4.5)
# Target Runtime: Google Cloud Run (Node.js 22 + Playwright Chromium + Sharp)

FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Install only the locked production dependency tree.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Install Playwright Chromium & headless shell plus required Debian system libraries
RUN npx playwright-core install chromium --with-deps \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /var/lib/apt/lists/*

# Copy minimal server runtime files
COPY firebase-applet-config.json server.ts ./
COPY src/services/serverCors.ts ./src/services/serverCors.ts
COPY src/services/serverMetadata.ts ./src/services/serverMetadata.ts
COPY src/services/serverFirebaseAuth.ts ./src/services/serverFirebaseAuth.ts
COPY src/services/serverSnapshot.ts ./src/services/serverSnapshot.ts
COPY public/favicon.svg ./public/favicon.svg

RUN chown -R node:node /app

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.ts"]
