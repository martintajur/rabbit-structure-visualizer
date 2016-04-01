FROM node:5.9-slim

# Consul service configuration
ENV SERVICE_NAME rabbit-structure-visualizer
ENV SERVICE_55672_NAME rabbit-structure-visualizer
ENV NPM_CONFIG_LOGLEVEL warn

WORKDIR /app
CMD ["node", "index.js"]