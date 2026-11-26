# The StudyMe server (Railway builds this; it works the same on any host that runs containers).
FROM node:22-slim
WORKDIR /app

# All packages, dev ones too: tsx runs the server, and installing without dev packages trips over
# drizzle-kit (dev, but also an optional peer of a runtime package).
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
# Railway passes the commit it is building; /health shows it, to confirm a deploy went out.
ARG RAILWAY_GIT_COMMIT_SHA=unknown
ENV GIT_COMMIT=$RAILWAY_GIT_COMMIT_SHA
ENV NODE_ENV=production
# The port the server listens on: the host's PORT (Railway sets it; set PORT=8080 there too).
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
