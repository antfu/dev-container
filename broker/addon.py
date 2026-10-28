"""mitmproxy addon: swaps placeholders for real secrets, only towards their bound hosts."""

import json
import os

from mitmproxy import http

from rules import Rules, decide


def log(event, **fields):
    print(json.dumps({"event": event, **fields}), flush=True)


class Broker:
    def __init__(self):
        self.rules = Rules.from_json(json.loads(os.environ["DEV_CONTAINER_RULES"]), os.environ)
        log(
            "ready",
            policy=self.rules.policy,
            secrets=[s.name for s in self.rules.secrets if s.value],
            missing=[s.name for s in self.rules.secrets if not s.value],
        )

    def request(self, flow: http.HTTPFlow):
        req = flow.request
        decision = decide(
            self.rules,
            req.scheme,
            req.host,
            req.port,
            req.url,
            req.headers.items(multi=True),
        )
        if not decision.blocked and decision.injected:
            # Inside a CONNECT tunnel the upstream connection is fixed; refuse if it disagrees.
            address = flow.server_conn.address
            if address and (address[0].lower().rstrip("."), address[1]) != (req.host.lower().rstrip("."), req.port):
                decision.blocked = "upstream %s:%s does not match %s:%s" % (address[0], address[1], req.host, req.port)

        if decision.blocked:
            log("block", host=req.host, port=req.port, method=req.method, reason=decision.blocked)
            flow.response = http.Response.make(
                403,
                "dev-container broker blocked this request: %s\n" % decision.blocked,
                {"content-type": "text/plain"},
            )
            return

        if decision.injected:
            req.headers = http.Headers([(k.encode(), v.encode()) for k, v in decision.headers])
            log("inject", host=req.host, method=req.method, secrets=decision.injected)


addons = [Broker()]
