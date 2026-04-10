# Stage 1: Build the React/Vite app
FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /app

# Copy workspace config and lock file from repo root
COPY pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy frontend package.json
COPY server/frontend/package.json ./server/frontend/

# Install dependencies
RUN cd server/frontend && pnpm install --frozen-lockfile

# Copy frontend source
COPY server/frontend/ ./server/frontend/

# Build the app (output to server/frontend/dist/)
RUN cd server/frontend && pnpm build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY server/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files
COPY --from=build /app/server/frontend/dist /usr/share/nginx/html

EXPOSE 80
