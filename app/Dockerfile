# Static web image: bun build → Caddy file server. Build context = app/.
#
#   docker build -t ghcr.io/miraiconcepts/hitome:latest app/
#
# CREDENTIAL-FREE by design, and now configuration-free too: the host Caddy
# injects Authorization on /dav/* (see docs/Deploy.md), and the web app derives
# that endpoint from the page's own origin at runtime. Nothing about the server
# is baked here, so one image works on any host.

# ---- build ----
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
# patchedDependencies (bun patch) must be present at install time
COPY patches ./patches
RUN bun install --frozen-lockfile
COPY . .

ENV CI=1
RUN bunx expo export --platform web
# Version stamp for the web app's silent-reload check (use-silent-reload.web.ts)
RUN bun --eval 'require("fs").writeFileSync("dist/version.json", JSON.stringify({ version: require("./app.json").expo.version }))'

# ---- serve ----
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
