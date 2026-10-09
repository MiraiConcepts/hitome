# hitome web image: the exported app plus hitome's small server (app/server),
# which serves it, runs the login and passes /dav/ to the calendar server.
# Build context = app/.
#
#   docker buildx build -t ghcr.io/miraiconcepts/hitome:latest app/
#
# Needs BuildKit (buildx; on macOS `brew install docker-buildx`): the legacy
# builder does not set BUILDPLATFORM, which the build stage names.
#
# CREDENTIAL-FREE: no login is baked in or configured. People log in on the
# page; the server keeps each login in its data volume, never in the browser.
# The only setting is where the calendar lives (CALDAV_URL), so one image
# works for anyone. See docs/Deploy.md.

# ---- build ----
# On the build machine's own platform even when making an ARM image: the
# exported app is plain JavaScript and assets, the same on every machine, so
# only the small serve stage below is built per architecture.
FROM --platform=$BUILDPLATFORM oven/bun:1.4.2 AS build
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
FROM oven/bun:1.4.2-alpine
WORKDIR /app
COPY server ./server
COPY --from=build /app/dist /srv
# Sessions and their key live here: mount a volume so updates keep people
# logged in.
RUN mkdir -p /data && chown bun:bun /data
VOLUME /data
ENV NODE_ENV=production PORT=3000 STATIC_DIR=/srv DATA_DIR=/data
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["bun", "server/index.ts"]
