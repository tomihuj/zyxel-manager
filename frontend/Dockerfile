FROM node:20-alpine AS base
WORKDIR /app

FROM base AS dev
COPY package*.json ./
RUN npm install
# source mounted as volume

FROM base AS prod
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.25-alpine AS prod-server
COPY --from=prod /app/dist /usr/share/nginx/html
