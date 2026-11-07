FROM node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53

ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1 \
    HOME=/tmp

WORKDIR /opt/stackshift
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/npm-cache \
    && rm -rf /tmp/npm-cache

COPY docker/validator/validate.sh /opt/stackshift/validate.sh
RUN chmod 0555 /opt/stackshift/validate.sh \
    && mkdir -p /workspace \
    && chown 10001:10001 /workspace

USER 10001:10001
WORKDIR /workspace
ENTRYPOINT ["/bin/sh", "/opt/stackshift/validate.sh"]
