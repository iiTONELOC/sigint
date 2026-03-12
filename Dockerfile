FROM oven/bun:1

WORKDIR /app

COPY package.json .
RUN bun install

COPY src ./src
COPY styles ./styles
COPY tsconfig.json .
COPY components.json .
COPY bun-env.d.ts .
COPY bunfig.toml .
COPY build.ts .

EXPOSE 3000
