FROM node:20-alpine
WORKDIR /app
COPY ws-server-package.json ./package.json
COPY ws-server.mjs ./
RUN npm install --omit=dev
ENV PORT=1234
EXPOSE 1234
CMD ["node", "ws-server.mjs"]
