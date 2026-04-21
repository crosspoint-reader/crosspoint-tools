# Pre-baked build environment for crosspoint-reader firmware
# Everything is installed and a full build is done at image time,
# so runtime builds only need git pull + incremental compile.
FROM docker.io/cloudflare/sandbox:0.7.0-python

# Install uv (fast Python package installer)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:/usr/local/python/bin:$PATH"

# Install the exact PlatformIO fork used by crosspoint-reader CI
RUN uv pip install --system -U https://github.com/pioarduino/platformio-core/archive/refs/tags/v6.1.19.zip

# Ensure git is up to date
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Clone the repo with submodules
RUN git clone --recurse-submodules https://github.com/crosspoint-reader/crosspoint-reader.git /workspace/crosspoint-reader

# Do a full build to download+cache the entire toolchain and compile everything.
# This means runtime builds only recompile changed files (incremental).
WORKDIR /workspace/crosspoint-reader
RUN PLATFORMIO_SETTING_ENABLE_TELEMETRY=No pio run -e gh_release || true

# The build artifacts and toolchain are now cached in the image.
# Runtime: git pull + pio run = fast incremental build.
WORKDIR /workspace
