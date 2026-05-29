FROM mcr.microsoft.com/devcontainers/base:ubuntu

# Base utilities for datagrid development
RUN apt-get update && apt-get install -y \
    curl \
    nano \
    unzip \
    zip \
    git \
    ca-certificates \
    libpq-dev \
    build-essential \
    iputils-ping \
    netcat-openbsd \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 + pnpm (via corepack)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

# Open AI Codex 
RUN npm i -g @openai/codex

# Install uv for Python
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && mv /root/.local/bin/uv /usr/local/bin/uv

# Python virtual environment inside container
ENV UV_SYSTEM_PYTHON=1

WORKDIR /workspace
