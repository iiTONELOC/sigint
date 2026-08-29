FROM oven/bun:1.4

WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

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

EXPOSE 5500
