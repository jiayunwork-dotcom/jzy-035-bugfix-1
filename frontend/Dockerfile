FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV BACKEND_URL=http://backend:3001
COPY --from=build /app/dist ./dist
COPY server.cjs ./server.cjs
EXPOSE 8080
CMD ["node", "server.cjs"]
