# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_SELLER_NAME=""
ARG VITE_API_ORIGIN=""
ARG VITE_PUBLIC_ORIGIN=""
ENV VITE_SELLER_NAME=$VITE_SELLER_NAME VITE_API_ORIGIN=$VITE_API_ORIGIN VITE_PUBLIC_ORIGIN=$VITE_PUBLIC_ORIGIN
RUN pnpm exec vite build && node scripts/check-size.mjs

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
