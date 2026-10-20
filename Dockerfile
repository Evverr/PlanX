FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=1234 DATA_DIR=/app/data
EXPOSE 1234
VOLUME /app/data
CMD ["npx", "tsx", "server/index.ts"]
