# Custom sandbox image with PlatformIO pre-installed for ESP32-C3 builds
FROM docker.io/cloudflare/sandbox:0.7.0-python

# Install PlatformIO CLI
RUN pip install platformio==6.1.19

# Pre-install the ESP32 platform used by crosspoint-reader
# This avoids downloading ~500MB on every build
RUN pio pkg install -g -p "https://github.com/pioarduino/platform-espressif32/releases/download/55.03.37/platform-espressif32.zip"

# Pre-install the Arduino framework and ESP32-C3 toolchain
RUN pio pkg install -g -t "toolchain-esp32ulp" || true

# Install git (for cloning repos and reading commit history)
# Already included in base image, but ensure git-lfs is available
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
