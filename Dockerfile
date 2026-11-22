# Build the web app, then run the API server, which also serves web/dist. Same pattern as the other labs.
# Node 26 only (rulebook). Docker on OrbStack, never Docker Desktop.
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci
COPY web web
RUN npm run build -w web

FROM node:26-alpine
WORKDIR /app
# Real is never on by default in a container: the page opens in Mock unless the owner asks otherwise in .env. No secret is ever baked into this image:
# .env, secrets/ and key files are excluded by .dockerignore and reach the container only at run time (compose env_file and a read-only mount).
ENV NODE_ENV=production PORT=7835 SFPRIV_DEFAULT_SOURCE=mock
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY server/src server/src
COPY server/diagrams server/diagrams
COPY --from=build /app/web/dist web/dist
USER node
EXPOSE 7835
# Inside the container the server must listen on all interfaces, so SFPRIV_BIND is set here on purpose.
# The compose file publishes the port on 127.0.0.1 only; do not publish it more widely.
ENV SFPRIV_BIND=0.0.0.0
CMD ["node", "server/src/index.js"]
