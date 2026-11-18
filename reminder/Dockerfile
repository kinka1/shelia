FROM node:24-alpine
RUN mkdir /data && chown node:node /data
WORKDIR /app
COPY *.ts ./
USER node
EXPOSE 8080
CMD ["node", "--no-warnings=ExperimentalWarning", "main.ts"]
