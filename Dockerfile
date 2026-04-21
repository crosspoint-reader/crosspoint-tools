# Build environment for crosspoint-reader firmware
# Pre-installs PlatformIO + toolchain. Repo is cloned at runtime.
FROM docker.io/cloudflare/sandbox:0.7.0-python

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:/usr/local/python/bin:$PATH"

# Install PlatformIO (pioarduino fork matching CI)
RUN uv pip install --system -U https://github.com/pioarduino/platformio-core/archive/refs/tags/v6.1.19.zip

# Install ESP32 platform
RUN pio pkg install -g -p "https://github.com/pioarduino/platform-espressif32/releases/download/55.03.37/platform-espressif32.zip"

# Pre-install the RISC-V toolchain for ESP32-C3 by running pio's installer
# This downloads the compiler, framework, and all build tools (~500MB)
RUN pio pkg install -g -t "toolchain-riscv32-esp@~13" || true
RUN pio pkg install -g -t "framework-arduinoespressif32" || true

# Ensure toolchains are on PATH
ENV PATH="/root/.platformio/packages/toolchain-riscv32-esp/bin:$PATH"

# Clean caches to keep image smaller
RUN rm -rf /root/.platformio/.cache /tmp/*

# Git for cloning
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
