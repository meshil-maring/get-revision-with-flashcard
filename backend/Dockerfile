# The StudyMe server (Railway builds this; it works the same on any host that runs containers).
FROM node:22-slim
WORKDIR /app

# All packages, dev ones too: tsx runs the server, and installing without dev packages trips over
# drizzle-kit (dev, but also an optional peer of a runtime package).
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
ENV NODE_ENV=production
# The host sets PORT (Railway does); 4000 when run by hand.
EXPOSE 4000
CMD ["npm", "start"]
