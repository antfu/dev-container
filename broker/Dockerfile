ARG MITMPROXY_VERSION=12.3.1
FROM mitmproxy/mitmproxy:${MITMPROXY_VERSION}

ENV PYTHONPATH=/broker
COPY addon.py rules.py entrypoint.sh /broker/
RUN chmod +x /broker/entrypoint.sh && mkdir -p /etc/dev-container/ca

EXPOSE 8080
ENTRYPOINT ["/broker/entrypoint.sh"]
