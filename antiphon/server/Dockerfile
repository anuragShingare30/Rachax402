# Rachax402 AgentB Services — Single Dockerfile
# Railway: set SERVICE_TYPE=analyzer OR SERVICE_TYPE=storage
# Local: docker build -t rachax402-server . && docker run -e SERVICE_TYPE=analyzer ...

FROM node:20-alpine

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install

# Copy all server files
COPY agentB-server.js .
COPY storacha-server.js .
COPY initStoracha.js .
COPY .env.example .

# Health check — both servers expose /health
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-8000}/health || exit 1

# Determine which server to run at startup
CMD ["sh", "-c", "\
  if [ \"$SERVICE_TYPE\" = \"storage\" ]; then \
    echo '🚀 Starting Storacha Storage Service...' && node storacha-server.js; \
  elif [ \"$SERVICE_TYPE\" = \"analyzer\" ]; then \
    echo '🚀 Starting Data Analyzer Service...' && node agentB-server.js; \
  else \
    echo '❌ SERVICE_TYPE must be analyzer or storage' && exit 1; \
  fi"]