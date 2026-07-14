FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# Build the production bundle. Local dev overrides the command in docker-compose
# to run `npm run dev` (hot reload) against a mounted volume, so this build layer
# is only used by production hosts like Railway.
#
# BACKEND_URL and NEXT_PUBLIC_WS_ORIGIN are consumed at BUILD time: the /api
# proxy destination is baked into the routes manifest by `next build`, and
# NEXT_PUBLIC_* values are baked into the client bundle. Railway passes service
# variables as build args, but Docker ignores them unless declared with ARG.
ARG BACKEND_URL
ARG NEXT_PUBLIC_WS_ORIGIN
ENV BACKEND_URL=$BACKEND_URL
ENV NEXT_PUBLIC_WS_ORIGIN=$NEXT_PUBLIC_WS_ORIGIN
RUN npm run build

EXPOSE 3000

# `next start` binds to $PORT (Railway injects it); defaults to 3000 locally.
CMD ["npm", "run", "start"]
