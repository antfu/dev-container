ARG ALPINE_VERSION=3.24.3
FROM alpine:${ALPINE_VERSION}

RUN apk add --no-cache socat
COPY relay.sh /relay.sh

ENTRYPOINT ["/bin/sh", "/relay.sh"]
