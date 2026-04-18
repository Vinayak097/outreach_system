FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY prisma prisma
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm prisma generate
RUN pnpm --filter @outreach/web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3001
CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm --filter @outreach/api dev"]
