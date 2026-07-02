FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# Build the production bundle. Local dev overrides the command in docker-compose
# to run `npm run dev` (hot reload) against a mounted volume, so this build layer
# is only used by production hosts like Railway.
RUN npm run build

EXPOSE 3000

# `next start` binds to $PORT (Railway injects it); defaults to 3000 locally.
CMD ["npm", "run", "start"]
