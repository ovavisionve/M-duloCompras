FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY src/ ./src/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
EXPOSE 8080
ENV PORT=8080 NODE_ENV=production
CMD ["node", "src/server.js"]
