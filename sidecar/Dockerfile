# Multi-stage build for Xase Sidecar
# Use a recent Rust that understands Cargo.lock v4
FROM rust:1.93 as builder

WORKDIR /app

# System deps for openssl/reqwest during build
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
  && rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Copy source code
COPY src ./src

# Build release binary
RUN cargo build --release

# Runtime stage
# Use trixie to match the builder's glibc version
FROM debian:trixie-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
  && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /app/target/release/xase-sidecar /usr/local/bin/sidecar

# Create socket directory
RUN mkdir -p /var/run/xase

# Set environment variables
ENV RUST_LOG=info
# Prefer a tmp location for default socket to avoid permission issues
ENV SOCKET_PATH=/tmp/xase.sock
ENV METRICS_BIND_ADDR=0.0.0.0:9090

# Expose Prometheus metrics port
EXPOSE 9090

# Run sidecar
CMD ["sidecar"]
