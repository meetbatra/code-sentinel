FROM node:21-slim

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
RUN npm install -g playwright

# Install Chromium browser with system dependencies
RUN npx playwright install chromium --with-deps

# Copy start script into image ROOT
COPY run.sh /run.sh
RUN chmod +x /run.sh

WORKDIR /home/user

CMD ["bash"]
