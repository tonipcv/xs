# Multi-stage build for Xase Sidecar
FROM rust:1.75 as builder

WORKDIR /app

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Copy source code
COPY src ./src

# Build release binary
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

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
ENV SOCKET_PATH=/var/run/xase/sidecar.sock

# Run sidecar
CMD ["sidecar"]
