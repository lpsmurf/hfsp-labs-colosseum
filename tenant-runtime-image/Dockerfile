FROM ubuntu:24.04

ARG OPENCLAW_VERSION=2026.3.13

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg git openssh-client jq tini \
  && rm -rf /var/lib/apt/lists/*

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get update && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

# Install OpenClaw pinned
RUN npm i -g openclaw@${OPENCLAW_VERSION}

# Runtime user
RUN useradd -m -u 10001 -s /bin/bash clawd \
  && mkdir -p /home/clawd/.openclaw/secrets \
  && chown -R clawd:clawd /home/clawd

WORKDIR /home/clawd

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/usr/bin/tini","--","/entrypoint.sh"]
