FROM oven/bun:1

WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json .
RUN bun install

COPY src ./src
COPY public ./public
COPY tests ./tests
COPY tsconfig.json .
COPY components.json .
COPY bun-env.d.ts .
COPY bunfig.toml .
COPY build.ts .
COPY postbuild.ts .

EXPOSE 3000