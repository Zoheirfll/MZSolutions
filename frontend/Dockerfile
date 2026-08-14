FROM node:20-slim

WORKDIR /app

ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

CMD ["sh", "-c", "rm -rf /output/* && cp -r /app/dist/* /output/"]
