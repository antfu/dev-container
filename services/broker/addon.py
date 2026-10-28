"""mitmproxy addon: swaps placeholders for real secrets, only towards their bound hosts."""

import json
import os

from mitmproxy import http

from rules import Rules, allowed, decide, not_allowed


def log(event, **fields):
    print(json.dumps({"event": event, **fields}), flush=True)


def block(flow, blocked):
    log("block", code=blocked.code, host=flow.request.host, port=flow.request.port, method=flow.request.method, why=blocked.why)
    flow.response = http.Response.make(
        403,
        blocked.render(),
        {"content-type": "text/plain; charset=utf-8", "x-dev-container-diagnostic": blocked.code},
    )


class Broker:
    def __init__(self):
        self.rules = Rules.from_json(json.loads(os.environ["DEV_CONTAINER_RULES"]), os.environ)
        log(
            "ready",
            policy=self.rules.policy,
            secrets=[s.name for s in self.rules.secrets if s.value],
            missing=[s.name for s in self.rules.secrets if not s.value],
        )

    def http_connect(self, flow: http.HTTPFlow):
        # Tunnels that turn out not to carry HTTP are relayed as raw TCP without
        # reaching `request`, so the allowlist must also hold at CONNECT time.
        if not allowed(self.rules, flow.request.host, flow.request.port):
            block(flow, not_allowed(flow.request.host))

    def request(self, flow: http.HTTPFlow):
        req = flow.request
        # Inside a CONNECT tunnel mitmproxy sets host/port from the tunnel target,
        # not from the client-sent Host header.
        decision = decide(
            self.rules,
            req.scheme,
            req.host,
            req.port,
            req.url,
            req.headers.items(multi=True),
        )
        if decision.blocked:
            block(flow, decision.blocked)
        elif decision.injected:
            req.headers = http.Headers(
                [(k.encode("utf-8", "surrogateescape"), v.encode("utf-8", "surrogateescape")) for k, v in decision.headers]
            )
            log("inject", host=req.host, method=req.method, secrets=decision.injected)


addons = [Broker()]
