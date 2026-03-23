FROM mcr.microsoft.com/devcontainers/base:ubuntu

ENV DEBIAN_FRONTEND=noninteractive \
    PNPM_HOME=/usr/local/share/pnpm \
    PATH="${PNPM_HOME}:$PATH"

# Base utilities for datagrid development
RUN apt-get update && apt-get install -y \
    nano \
    unzip \
    zip \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20 + pnpm (via corepack)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /workspace
