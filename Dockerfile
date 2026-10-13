FROM node:22-alpine
WORKDIR /app
COPY server.js ./
COPY public ./public
ENV DATA_DIR=/data HOST=0.0.0.0 PORT=8787
EXPOSE 8787
USER node
CMD ["node", "server.js"]
