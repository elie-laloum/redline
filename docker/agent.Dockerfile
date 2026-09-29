FROM node:24-bookworm-slim
ARG AGENT_UID=1000
ARG AGENT_GID=1000
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client ca-certificates curl procps util-linux python3 ripgrep && rm -rf /var/lib/apt/lists/*
RUN npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code@2.1.280
RUN groupmod -o -g "$AGENT_GID" node && usermod -o -u "$AGENT_UID" -g "$AGENT_GID" node
RUN mkdir -p /home/agent && chown "$AGENT_UID:$AGENT_GID" /home/agent && chmod 700 /home/agent
ENV HOME=/home/agent
USER $AGENT_UID:$AGENT_GID
WORKDIR /workspace
