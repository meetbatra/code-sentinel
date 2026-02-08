FROM node:21-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    bash \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy start script into image ROOT
COPY run.sh /run.sh
RUN chmod +x /run.sh

WORKDIR /home/user

CMD ["bash"]
