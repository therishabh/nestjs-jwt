# --- deps: install once, cached across builds as long as package*.json don't change ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build: compile TypeScript -> dist using the full dependency set (incl. devDependencies) ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- production deps: a second install with only runtime dependencies, discarded from the final image otherwise ---
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- runtime: the actual image that ships — no compiler, no devDependencies, no source ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Runs as a non-root user — a container compromised through the Node
# process shouldn't also hand the attacker root inside the container.
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER nestjs

EXPOSE 3000

# Uses the health endpoint (Step 14) so `docker ps` / orchestrators can see
# real application health, not just "the process is running".
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main.js"]
