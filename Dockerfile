# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
FROM caddy:2.11.7-builder-alpine@sha256:ef9b65adf9a224770c6d5f6d1ae1bf99bc3caaa78d8c4bae3ea949ee6984f301 AS caddy-builder
RUN xcaddy build v2.11.7 \
  --output /usr/bin/caddy \
  --replace golang.org/x/net@v0.59.0=golang.org/x/net@v0.60.0

FROM caddy:2.11.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f AS caddy-dev
COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy
RUN apk upgrade --no-cache

FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a

WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY public ./public
COPY tests ./tests
COPY e2e ./e2e
COPY scripts ./scripts
COPY tsconfig.json .
COPY components.json .
COPY bun-env.d.ts .
COPY bunfig.toml .
COPY build.ts .
COPY postbuild.ts .

USER bun
