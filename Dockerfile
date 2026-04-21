# Custom sandbox image matching the crosspoint-reader CI build environment
FROM docker.io/cloudflare/sandbox:0.7.0-python

# Install uv (fast Python package installer, used by CI)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Install the exact PlatformIO fork used by crosspoint-reader CI
# Use --system to install into the system Python, then ensure scripts are on PATH
RUN uv pip install --system -U https://github.com/pioarduino/platformio-core/archive/refs/tags/v6.1.19.zip
ENV PATH="/usr/local/python/bin:$PATH"

# Pre-install the ESP32 platform to avoid downloading ~500MB on every build
RUN pio pkg install -g -p "https://github.com/pioarduino/platform-espressif32/releases/download/55.03.37/platform-espressif32.zip"

# Git is already in the base image but ensure submodule support works
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
