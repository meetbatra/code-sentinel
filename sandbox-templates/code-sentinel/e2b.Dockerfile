FROM node:22-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    bash \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright globally
RUN npm install -g playwright@1.58.2

# Install Chromium browser with system dependencies
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright-global
RUN npx playwright install chromium --with-deps

# Create symlink so user account can access the browsers
# E2B runs as 'user', so we ensure the cache path points to global install
RUN mkdir -p /home/user/.cache && \
    ln -s /ms-playwright-global /home/user/.cache/ms-playwright && \
    chown -R 1000:1000 /home/user/.cache

# Copy start script into image ROOT
COPY run.sh /run.sh
RUN chmod +x /run.sh

WORKDIR /home/user

# Copy package and client
COPY package.json package-lock.json /home/user/
RUN npm install
COPY browser-client.ts /home/user/

CMD ["bash"]
